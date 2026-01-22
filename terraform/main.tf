# =============================================================================
# PROGRESSIVE READER - TERRAFORM CONFIGURATION
# =============================================================================
# This configuration manages the Cloud Run deployment for Progressive Reader
# 
# Usage:
#   1. Initialize: terraform init
#   2. Preview:    terraform plan -var="project_id=YOUR_PROJECT" -var="container_image=YOUR_IMAGE"
#   3. Apply:      terraform apply -var="project_id=YOUR_PROJECT" -var="container_image=YOUR_IMAGE"
#   4. Destroy:    terraform destroy -var="project_id=YOUR_PROJECT" -var="container_image=YOUR_IMAGE"
# =============================================================================

# Configure the Google Cloud provider
provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# =============================================================================
# SERVICE ACCOUNT
# =============================================================================

resource "google_service_account" "progressive_reader" {
  account_id   = "progressive-reader-bvt-sa"
  display_name = "Progressive Reader BVT SA"
  description  = "Service account for Progressive Reader BVT and potentially runtime"
}

# =============================================================================
# SECRET MANAGER
# =============================================================================

resource "google_secret_manager_secret" "app_config" {
  secret_id = var.app_config_secret_name

  replication {
    auto {}
  }

  # CRITICAL: Never destroy the secrets - they contain sensitive config
  lifecycle {
    prevent_destroy = true
  }
}

# Grant the service account access to read the secret
resource "google_secret_manager_secret_iam_member" "secret_access" {
  secret_id = google_secret_manager_secret.app_config.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.progressive_reader.email}"
}

# =============================================================================
# VPC CONNECTOR
# =============================================================================

resource "google_vpc_access_connector" "connector" {
  name          = var.vpc_connector
  region        = var.region
  network       = "default"
  ip_cidr_range = "10.8.0.0/28"
  
  # Machine type and throughput settings
  machine_type   = "e2-micro"
  min_throughput = 200
  max_throughput = 1000
}

# =============================================================================
# ARTIFACT REGISTRY
# =============================================================================

resource "google_artifact_registry_repository" "progressive_reader" {
  repository_id = "progressive-reader"
  location      = var.region
  format        = "DOCKER"
  mode          = "STANDARD_REPOSITORY"
  description   = "Docker repository for Progressive Reader container images"

  # Automatic cleanup policies to manage storage costs
  # Policies are evaluated in order: KEEP rules first, then DELETE rules
  cleanup_policy_dry_run = false

  # KEEP RULE: Always keep the 5 most recent versions of each image
  # This ensures we never delete images that might be needed for rollback
  cleanup_policies {
    id     = "keep-recent-versions"
    action = "KEEP"
    most_recent_versions {
      keep_count = 5
    }
  }

  # DELETE RULE: Remove untagged images after 7 days
  # Untagged images are usually leftover layers from failed builds
  cleanup_policies {
    id     = "delete-untagged-7days"
    action = "DELETE"
    condition {
      tag_state  = "UNTAGGED"
      older_than = "604800s" # 7 days
    }
  }

  # DELETE RULE: Remove tagged images older than 30 days
  # Combined with keep-recent-versions, this means:
  # - Always keep 5 most recent (even if older than 30 days)
  # - Delete anything else older than 30 days
  cleanup_policies {
    id     = "delete-old-tagged-30days"
    action = "DELETE"
    condition {
      tag_state  = "TAGGED"
      older_than = "2592000s" # 30 days
    }
  }

  # DELETE RULE: Remove any image (tagged or not) older than 90 days
  # Final safety net to prevent unbounded storage growth
  cleanup_policies {
    id     = "delete-ancient-90days"
    action = "DELETE"
    condition {
      tag_state  = "ANY"
      older_than = "7776000s" # 90 days
    }
  }

  # Prevent accidental deletion of your image repository
  lifecycle {
    prevent_destroy = true
  }
}

# =============================================================================
# CLOUD RUN SERVICE
# =============================================================================

resource "google_cloud_run_v2_service" "progressive_reader" {
  name     = var.service_name
  location = var.region

  # Terraform/Spacelift is the source of truth for Cloud Run configuration

  template {
    # Service account for the Cloud Run service
    service_account = google_service_account.progressive_reader.email

    # Scaling configuration
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    # VPC networking configuration
    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = upper(replace(var.vpc_egress, "-", "_")) # Convert to PRIVATE_RANGES_ONLY format
    }

    # Execution environment (gen2 for better performance)
    execution_environment = "EXECUTION_ENVIRONMENT_GEN2"

    # Request timeout
    timeout = "${var.timeout_seconds}s"

    # Container configuration
    containers {
      image = var.container_image

      # Resource limits
      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
        cpu_idle = true # Allow CPU to be throttled when idle (cost savings)
      }

      # Environment variables
      env {
        name  = "APP_ENV"
        value = var.environment
      }

      # Mount the secret as a file at /secrets/env.json
      volume_mounts {
        name       = "app-secrets"
        mount_path = "/secrets"
      }
    }

    # Volume definition for secrets
    volumes {
      name = "app-secrets"
      secret {
        secret = google_secret_manager_secret.app_config.secret_id
        items {
          version = "latest"
          path    = "env.json"
        }
      }
    }
  }

  # Traffic configuration - 100% to latest revision
  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
}

# =============================================================================
# IAM - ALLOW UNAUTHENTICATED ACCESS
# =============================================================================

resource "google_cloud_run_v2_service_iam_member" "allow_unauthenticated" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.progressive_reader.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}


# =============================================================================
# DOMAIN MAPPINGS
# =============================================================================

# PROD: progressivereader.net
resource "google_cloud_run_domain_mapping" "main_domain" {
  count    = var.environment == "prod" ? 1 : 0
  location = var.region
  name     = "progressivereader.net"

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.progressive_reader.name
  }
}

# PROD: www.progressivereader.net
resource "google_cloud_run_domain_mapping" "www_domain" {
  count    = var.environment == "prod" ? 1 : 0
  location = var.region
  name     = "www.progressivereader.net"

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.progressive_reader.name
  }
}

# DEV: dev.progressivereader.net
resource "google_cloud_run_domain_mapping" "dev_domain" {
  count    = var.environment == "dev" ? 1 : 0
  location = var.region
  name     = "dev.progressivereader.net"

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.progressive_reader.name
  }
}



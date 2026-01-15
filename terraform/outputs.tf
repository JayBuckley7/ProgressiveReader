# =============================================================================
# OUTPUTS
# =============================================================================
# These values are displayed after terraform apply and can be used by other
# configurations or scripts.

output "service_url" {
  description = "The URL of the deployed Cloud Run service"
  value       = google_cloud_run_v2_service.progressive_reader.uri
}

output "service_name" {
  description = "The name of the Cloud Run service"
  value       = google_cloud_run_v2_service.progressive_reader.name
}

output "latest_revision" {
  description = "The latest revision of the Cloud Run service"
  value       = google_cloud_run_v2_service.progressive_reader.latest_ready_revision
}

output "service_location" {
  description = "The location/region of the Cloud Run service"
  value       = google_cloud_run_v2_service.progressive_reader.location
}

output "service_status" {
  description = "Comprehensive health report for the application and domains"
  value = {
    # Cloud Run Service Health (v2 API)
    app_health = {
      is_ready    = alltrue([for c in google_cloud_run_v2_service.progressive_reader.conditions : c.state == "CONDITION_SUCCEEDED"])
      reconciling = google_cloud_run_v2_service.progressive_reader.reconciling
      conditions  = { for c in google_cloud_run_v2_service.progressive_reader.conditions : c.type => c.state }
    }

    # Domain & SSL Health (v1 API)
    domain_health = {
      root = {
        domain = google_cloud_run_domain_mapping.main_domain.name
        ready  = google_cloud_run_domain_mapping.main_domain.status[0].conditions[0].status == "True" # Ready condition
        ssl    = google_cloud_run_domain_mapping.main_domain.status[0].conditions[1].status == "True" # CertificateProvisioned
      }
      www = {
        domain = google_cloud_run_domain_mapping.www_domain.name
        ready  = google_cloud_run_domain_mapping.www_domain.status[0].conditions[0].status == "True" # Ready condition
        ssl    = google_cloud_run_domain_mapping.www_domain.status[0].conditions[1].status == "True" # CertificateProvisioned
      }
    }
  }
}

output "website_urls" {
  description = "The public URLs for the website"
  value = [
    "https://${google_cloud_run_domain_mapping.main_domain.name}",
    "https://${google_cloud_run_domain_mapping.www_domain.name}",
    google_cloud_run_v2_service.progressive_reader.uri
  ]
}

output "artifact_registry_url" {
  description = "The URL of the Artifact Registry repository"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.progressive_reader.repository_id}"
}


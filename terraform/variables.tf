# =============================================================================
# PROJECT CONFIGURATION
# =============================================================================

variable "project_id" {
  description = "The GCP project ID where resources will be created"
  type        = string
}

variable "region" {
  description = "The GCP region for resources"
  type        = string
  default     = "us-central1"
}

# =============================================================================
# CLOUD RUN SERVICE CONFIGURATION
# =============================================================================

variable "service_name" {
  description = "Name of the Cloud Run service"
  type        = string
  default     = "progressive-reader"
}

variable "container_image" {
  description = "Full container image URL (e.g., us-central1-docker.pkg.dev/PROJECT/REPO/IMAGE:TAG)"
  type        = string
}

variable "service_account_email" {
  description = "Service account email for the Cloud Run service"
  type        = string
  default     = null # Will be constructed from project_id if not provided
}

# =============================================================================
# RESOURCE LIMITS
# =============================================================================

variable "memory" {
  description = "Memory allocation for the Cloud Run container"
  type        = string
  default     = "1Gi"
}

variable "cpu" {
  description = "CPU allocation for the Cloud Run container"
  type        = string
  default     = "1"
}

variable "timeout_seconds" {
  description = "Request timeout in seconds"
  type        = number
  default     = 300
}

variable "concurrency" {
  description = "Maximum concurrent requests per instance"
  type        = number
  default     = 80
}

variable "max_instances" {
  description = "Maximum number of instances"
  type        = number
  default     = 40
}

variable "min_instances" {
  description = "Minimum number of instances (0 for scale-to-zero)"
  type        = number
  default     = 0
}

# =============================================================================
# NETWORKING
# =============================================================================

variable "vpc_connector" {
  description = "VPC connector name for private networking"
  type        = string
  default     = "floof-connector"
}

variable "vpc_egress" {
  description = "VPC egress setting (all-traffic or private-ranges-only)"
  type        = string
  default     = "private-ranges-only"
}

# =============================================================================
# ENVIRONMENT CONFIGURATION
# =============================================================================

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  default     = "prod"
  
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

variable "app_config_secret_name" {
  description = "Name of the Secret Manager secret containing app configuration"
  type        = string
  default     = "PR-app-config"
}

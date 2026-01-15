# Terraform and Provider Version Constraints
# This ensures consistent behavior across different environments

terraform {
  required_version = ">= 1.0.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }

  # Remote state storage in GCS
  # This allows multiple machines/team members to share state
  backend "gcs" {
    bucket = "floofgg-terraform-state"
    prefix = "progressive-reader"
  }
}

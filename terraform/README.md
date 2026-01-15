# Progressive Reader - Terraform Configuration

This directory contains Terraform configuration for managing the Progressive Reader infrastructure on Google Cloud Platform.

## Prerequisites

1. **Terraform CLI** (v1.0.0 or later)
   ```powershell
   choco install terraform -y
   ```

2. **Google Cloud SDK** with authentication
   ```powershell
   gcloud auth application-default login
   ```

3. **Required GCP APIs enabled**:
   - Cloud Run API
   - Secret Manager API
   - VPC Access API
   - Artifact Registry API

## Quick Start (New Machine / New Clone)

State is stored remotely in GCS, so you just need to authenticate and initialize:

### 1. Authenticate to Google Cloud
```powershell
gcloud auth application-default login
```

### 2. Initialize Terraform (fetches remote state automatically)
```powershell
cd terraform
terraform init
```

That's it! Terraform will automatically connect to the remote state in `gs://floofgg-terraform-state/`.

### 3. Verify connection
```powershell
terraform output website_urls
```

You should see your website URLs, confirming the remote state is connected.

## Fresh Project Setup (New GCP Project)

If deploying to a completely new GCP project:

### 1. Initialize Terraform
```powershell
cd terraform
terraform init
```

### 2. Create your variables file
```powershell
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your new project values
```

### 3. Preview changes
```powershell
terraform plan
```

### 4. Apply changes
```powershell
terraform apply
```

## Common Commands

### Check Infrastructure Health
```powershell
terraform refresh
terraform output service_status
```

### View Website URLs
```powershell
terraform output website_urls
```

### View All Outputs
```powershell
terraform output
```

## Destroying Infrastructure

### ⚠️ Targeted Destroy (Recommended)
This destroys the site but keeps protected resources (images & secrets):

```powershell
terraform destroy `
  "-target=google_cloud_run_v2_service.progressive_reader" `
  "-target=google_cloud_run_v2_service_iam_member.allow_unauthenticated" `
  "-target=google_cloud_run_domain_mapping.main_domain" `
  "-target=google_cloud_run_domain_mapping.www_domain" `
  "-target=google_vpc_access_connector.connector" `
  "-target=google_service_account.progressive_reader" `
  "-target=google_secret_manager_secret_iam_member.secret_access"
```

**What gets destroyed:**
- ❌ Cloud Run Service (site goes down)
- ❌ Domain Mappings (progressivereader.net disconnected)
- ❌ VPC Connector
- ❌ Service Account
- ❌ Secret IAM binding

**What stays protected:**
- 🛡️ Artifact Registry (your Docker images)
- 🛡️ Secret Manager Secret (your config values)

### ☢️ Full Destroy
If you really want to destroy everything (including protected resources), you must first edit `main.tf` and change `prevent_destroy = true` to `prevent_destroy = false` for both protected resources.

## Managed Resources

| Resource | Type | Protected |
|----------|------|-----------|
| `google_service_account.progressive_reader` | Service Account | No |
| `google_secret_manager_secret.app_config` | Secret (shell) | 🛡️ Yes |
| `google_secret_manager_secret_iam_member.secret_access` | Secret IAM | No |
| `google_vpc_access_connector.connector` | VPC Connector | No |
| `google_artifact_registry_repository.progressive_reader` | Image Registry | 🛡️ Yes |
| `google_cloud_run_v2_service.progressive_reader` | Cloud Run | No |
| `google_cloud_run_v2_service_iam_member.allow_unauthenticated` | Public Access | No |
| `google_cloud_run_domain_mapping.main_domain` | progressivereader.net | No |
| `google_cloud_run_domain_mapping.www_domain` | www.progressivereader.net | No |

## Importing Existing Resources

If you already have resources deployed, import them into Terraform:

```powershell
# Service Account
terraform import google_service_account.progressive_reader projects/YOUR_PROJECT/serviceAccounts/progressive-reader-bvt-sa@YOUR_PROJECT.iam.gserviceaccount.com

# Secret Manager
terraform import google_secret_manager_secret.app_config projects/YOUR_PROJECT/secrets/PR-app-config

# Secret IAM
terraform import "google_secret_manager_secret_iam_member.secret_access" "projects/YOUR_PROJECT/secrets/PR-app-config roles/secretmanager.secretAccessor serviceAccount:progressive-reader-bvt-sa@YOUR_PROJECT.iam.gserviceaccount.com"

# VPC Connector
terraform import google_vpc_access_connector.connector projects/YOUR_PROJECT/locations/us-central1/connectors/floof-connector

# Artifact Registry
terraform import google_artifact_registry_repository.progressive_reader projects/YOUR_PROJECT/locations/us-central1/repositories/progressive-reader

# Cloud Run Service
terraform import google_cloud_run_v2_service.progressive_reader projects/YOUR_PROJECT/locations/us-central1/services/progressive-reader

# Cloud Run IAM
terraform import google_cloud_run_v2_service_iam_member.allow_unauthenticated "projects/YOUR_PROJECT/locations/us-central1/services/progressive-reader roles/run.invoker allUsers"

# Domain Mappings
terraform import google_cloud_run_domain_mapping.main_domain locations/us-central1/namespaces/YOUR_PROJECT/domainmappings/progressivereader.net
terraform import google_cloud_run_domain_mapping.www_domain locations/us-central1/namespaces/YOUR_PROJECT/domainmappings/www.progressivereader.net
```

## File Structure

| File | Purpose |
|------|---------|
| `main.tf` | All resource definitions |
| `variables.tf` | Input variable definitions |
| `outputs.tf` | Output value definitions |
| `versions.tf` | Terraform and provider version constraints |
| `terraform.tfvars` | Your project-specific values (gitignored) |
| `terraform.tfvars.example` | Example variable values |
| `terraform.tfstate` | Current state (gitignored, sensitive) |

## Configuration Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `project_id` | Yes | - | GCP project ID |
| `container_image` | Yes | - | Container image URL |
| `region` | No | `us-central1` | GCP region |
| `environment` | No | `prod` | Environment (dev/staging/prod) |
| `memory` | No | `1Gi` | Container memory |
| `max_instances` | No | `40` | Maximum scaling instances |

## Disaster Recovery

To recreate infrastructure on a fresh GCP project:

1. Update `project_id` in `terraform.tfvars`
2. Run `terraform apply`
3. Manually populate secret values in Secret Manager
4. Build and push a Docker image via Cloud Build

## Remote State

This project uses **Google Cloud Storage (GCS)** for remote state management. This ensures that the infrastructure state is:
1. Shared across all machines you work from.
2. Protected by state locking (prevents concurrent changes).
3. Backed up with versioning.

The configuration is located in `versions.tf`:

```hcl
backend "gcs" {
  bucket = "floofgg-terraform-state"
  prefix = "progressive-reader"
}
```

To connect a new environment to this state, simply run:
```powershell
terraform init
```


## Troubleshooting

### "GOOGLE_APPLICATION_CREDENTIALS" conflict
If you have this environment variable set, Terraform may use the wrong credentials. Clear it:
```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = $null
terraform plan
```

### VPC Connector takes long to delete
VPC connectors can take 2-3 minutes to fully delete. If `terraform apply` fails with "Failed to prepare VPC connector", wait and try again.

### Protected resources block destroy
Resources with `lifecycle { prevent_destroy = true }` will block a full destroy. Use targeted destroy (see above) or temporarily edit the lifecycle block.

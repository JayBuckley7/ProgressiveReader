# Progressive Reader

"Your Digital Bookshelf, Reimagined."

##  Deployment

The site is hosted on **Google Cloud Run** and managed via **Terraform** (infrastructure) and **Cloud Build** (app deployment).

### Option 1: Automated Deployment (Recommended)
Simply push to the `main` branch. This triggers a Google Cloud Build pipeline that:
1. Builds the Docker image (Frontend + Backend).
2. Pushes it to Artifact Registry.
3. Deploys the new revision to Cloud Run.

```bash
git push origin main
```

### Option 2: Manual Deployment (From Local)
If you want to trigger a deployment purely from your local machine (bypassing GitHub):

```powershell
gcloud builds submit --config=cloudbuild.yaml --project=floofgg --substitutions=_SERVICE_NAME="progressive-reader",_ENVIRONMENT="prod" .
```

### Infrastructure Management
Infrastructure (Service Account, IAM, Secret Manager, etc.) is managed by Terraform.
See `terraform/README.md` for details on how to change memory, scaling, or add new resources.

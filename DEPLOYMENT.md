# Google Cloud Run Deployment Guide

This guide covers deploying the Progressive Reader application to Google Cloud Run using Cloud Build and GitHub Actions.

## Prerequisites

### Google Cloud Setup
1. **Google Cloud Project** with billing enabled
2. **Required APIs** enabled:
   - Cloud Build API
   - Cloud Run API
   - Artifact Registry API
   - Secret Manager API
   - VPC Access API (for VPC connector)

3. **Artifact Registry Repository**:
   ```bash
   gcloud artifacts repositories create progressive-reader \
     --repository-format=docker \
     --location=us-central1 \
     --description="Progressive Reader Docker images"
   ```

4. **VPC Connector** (`floof-connector`) - should already exist
5. **Service Account** (`progressive-reader-bvt-sa`) with required permissions

### Secrets Setup

The application requires server-side secrets to be stored in Google Cloud Secret Manager:

1. **Run the setup script** (from project root):
   ```bash
   # Set your actual values as environment variables
   export SECRET_KEY="$(openssl rand -hex 32)"
   
   # Run the setup script
   ./scripts/setup-secrets.sh floofgg
   ```

2. **Or create secrets manually**:
   ```bash
   # Create server secret
   printf "your-strong-secret-key" | gcloud secrets create secret-key --data-file=-
   ```

**Note**: OPENAI_API_KEY and JPDB_API_KEY are user-specific settings that should be configured by individual users within the application interface, not as server-wide secrets.

## Deployment Methods

### Method 1: GitHub Actions (Recommended)

The repository includes a GitHub Actions workflow that automatically deploys:
- **Main branch** → Production (`progressive-reader`)
- **Other branches** → Development (`progressive-reader-dev`) via manual trigger

#### Setup GitHub Actions:
1. **Workload Identity** should already be configured
2. **Service Account** permissions should be set
3. **Push to main** branch for automatic deployment
4. **Manual deployment** from other branches using "Run workflow" button

### Method 2: Manual Cloud Build

Deploy directly using Cloud Build:

```bash
# Deploy to production
gcloud builds submit \
  --project=floofgg \
  --config=cloudbuild.yaml \
  --substitutions=COMMIT_SHA=$(git rev-parse HEAD),_SERVICE_NAME=progressive-reader,_ENVIRONMENT=prod \
  --gcs-log-dir=gs://floofgg_cloudbuild/logs \
  .

# Deploy to development
gcloud builds submit \
  --project=floofgg \
  --config=cloudbuild.yaml \
  --substitutions=COMMIT_SHA=$(git rev-parse HEAD),_SERVICE_NAME=progressive-reader-dev,_ENVIRONMENT=dev \
  --gcs-log-dir=gs://floofgg_cloudbuild/logs \
  .
```

## Cloud Build Process

The `cloudbuild.yaml` configuration performs these steps:

1. **Build Docker Image** - Multi-stage build (frontend + backend)
2. **Push to Artifact Registry** - Stores images with commit SHA and latest tags
3. **Deploy to Cloud Run** - Deploys with VPC access and secret management
4. **Build Verification Tests** - Tests the `/health` endpoint

### Key Configuration:
- **Image Registry**: `us-central1-docker.pkg.dev/floofgg/progressive-reader/`
- **Service Account**: `progressive-reader-bvt-sa@floofgg.iam.gserviceaccount.com`
- **VPC Connector**: `floof-connector`
- **Region**: `us-central1`
- **Resources**: 1 vCPU, 1GB memory, max 10 instances

## Environment Variables & Secrets

### Environment Variables:
- `APP_ENV`: Set to `prod` or `dev` based on deployment

### Secrets (from Secret Manager):
- `SECRET_KEY`: Flask secret key for sessions

### User Settings (configured per-user in the app):
- `OPENAI_API_KEY`: OpenAI API key for AI features (user-specific)
- `JPDB_API_KEY`: Japanese language learning API key (user-specific)

## Troubleshooting

### Common Issues:

1. **Build Verification Test (BVT) Fails**:
   - Check if the service is properly deployed
   - Verify the `/health` endpoint returns 200 status
   - Check Cloud Run logs for startup errors

2. **Secret Access Issues**:
   - Verify server secrets exist in Secret Manager (only SECRET_KEY is needed)
   - Check service account has `Secret Manager Secret Accessor` role
   - Ensure secret names match exactly in cloudbuild.yaml

3. **VPC Connector Issues**:
   - Verify `floof-connector` exists and is active
   - Check that the connector has proper subnet configuration

4. **Image Build Failures**:
   - Check that `frontend/package.json` has a `build` script
   - Verify all dependencies are properly specified
   - Check Docker build logs for specific errors

### Useful Commands:

```bash
# Check service status
gcloud run services describe progressive-reader --region=us-central1

# View logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=progressive-reader" --limit=50

# Check secrets
gcloud secrets list

# Test health endpoint
curl -I https://your-service-url/health
```

## Service Accounts & Permissions

The deployment uses the service account `progressive-reader-bvt-sa@floofgg.iam.gserviceaccount.com` which should have:

- Cloud Run Developer
- Secret Manager Secret Accessor
- Artifact Registry Reader
- VPC Access User

## Monitoring & Logs

- **Cloud Run Logs**: Available in Google Cloud Console
- **Build Logs**: Stored in `gs://floofgg_cloudbuild/logs`
- **Health Checks**: BVT runs after each deployment
- **Metrics**: Available in Cloud Monitoring

## Rolling Back

To rollback to a previous deployment:

```bash
# List revisions
gcloud run revisions list --service=progressive-reader --region=us-central1

# Route traffic to specific revision
gcloud run services update-traffic progressive-reader \
  --to-revisions=REVISION_NAME=100 \
  --region=us-central1
``` 
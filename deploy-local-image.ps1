# Build locally, then push and deploy to Cloud Run (no Cloud Build pipeline)

# First, build locally (see test-local-docker.ps1 for build command)

# Tag and push your local image
docker tag progressive-reader:local us-central1-docker.pkg.dev/floofgg/progressive-reader/progressive-reader:test-local

gcloud auth configure-docker us-central1-docker.pkg.dev

docker push us-central1-docker.pkg.dev/floofgg/progressive-reader/progressive-reader:test-local

# Deploy to Cloud Run (no traffic initially)
# Step A: Clear all existing secrets to avoid conflicts
# This must complete before Step B starts
Write-Host "🗑️ Clearing any existing secrets..."
$serviceExists = gcloud run services describe progressive-reader --region us-central1 --platform managed --project floofgg 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host "Service exists, clearing secrets..."
  gcloud run services update progressive-reader `
    --region us-central1 --platform managed `
    --clear-secrets `
    --project floofgg
  if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Secrets cleared"
  } else {
    Write-Host "⚠️ Failed to clear secrets, but continuing..."
  }
} else {
  Write-Host "ℹ️ Service doesn't exist yet, skipping clear-secrets"
}

# Step B: Deploy with exact secret mounts we want
Write-Host "🔐 Deploying with secrets..."

gcloud run deploy progressive-reader `
  --image us-central1-docker.pkg.dev/floofgg/progressive-reader/progressive-reader:test-local `
  --region us-central1 --platform managed --allow-unauthenticated `
  --set-secrets /secrets/env.json=PR-app-config:latest,/secrets/pdf-ocr-credentials.json=pdf-ocr-credentials:latest `
  --set-env-vars APP_ENV=dev,GOOGLE_APPLICATION_CREDENTIALS=/secrets/pdf-ocr-credentials.json `
  --service-account progressive-reader-bvt-sa@floofgg.iam.gserviceaccount.com `
  --vpc-connector floof-connector `
  --vpc-egress private-ranges-only `
  --memory 1Gi `
  --concurrency 80 `
  --max-instances 40 `
  --timeout 300 `
  --execution-environment gen2 `
  --no-traffic

# Promote to serve traffic when ready
gcloud run services update-traffic progressive-reader `
  --region us-central1 --to-latest


# Build locally, then push and deploy to Cloud Run (no Cloud Build pipeline)

# First, build locally (see test-local-docker.ps1 for build command)

# Tag and push your local image
docker tag progressive-reader:local us-central1-docker.pkg.dev/floofgg/progressive-reader/progressive-reader:test-local

gcloud auth configure-docker us-central1-docker.pkg.dev

docker push us-central1-docker.pkg.dev/floofgg/progressive-reader/progressive-reader:test-local

# Deploy to Cloud Run (no traffic initially)
# Remove any existing secrets first to avoid conflicts
gcloud run services update progressive-reader `
  --remove-secrets /secrets/env.json,/secrets/pdf-ocr-credentials.json `
  --region us-central1 --platform managed `
  --project floofgg `
  2>$null; if ($LASTEXITCODE -ne 0) { Write-Host "⚠️ No existing secrets to remove (or service doesn't exist yet)" }

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


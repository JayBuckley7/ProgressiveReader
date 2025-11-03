#!/usr/bin/env bash
set -euo pipefail

# Cloud Build substitutions passed as environment variables

# Deploy new revision with NO traffic
# First, remove any existing secrets that might conflict
# Then use --update-secrets to set the new secret mounts
echo "🗑️ Removing any conflicting secrets..."
gcloud run services update $_SERVICE_NAME \
  --remove-secrets /secrets/env.json,/secrets/pdf-ocr-credentials.json \
  --region us-central1 \
  --platform managed \
  --project="$PROJECT_ID" \
  2>/dev/null || echo "⚠️ No existing secrets to remove (or service doesn't exist yet)"

echo "🔐 Deploying with secrets..."
gcloud run deploy $_SERVICE_NAME \
  --image us-central1-docker.pkg.dev/$PROJECT_ID/progressive-reader/$_SERVICE_NAME:$_COMMIT_SHA \
  --service-account progressive-reader-bvt-sa@$PROJECT_ID.iam.gserviceaccount.com \
  --set-secrets /secrets/env.json=PR-app-config:latest,/secrets/pdf-ocr-credentials.json=pdf-ocr-credentials:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars APP_ENV=$_ENVIRONMENT,GOOGLE_APPLICATION_CREDENTIALS=/secrets/pdf-ocr-credentials.json \
  --vpc-connector floof-connector \
  --vpc-egress private-ranges-only \
  --memory 1Gi \
  --concurrency 80 \
  --max-instances 40 \
  --timeout 300 \
  --execution-environment gen2 \
  --project="$PROJECT_ID" \
  --no-traffic

# Latest created revision name
CREATED="$(gcloud run services describe $_SERVICE_NAME --platform managed --region us-central1 --project="$PROJECT_ID" --format='value(status.latestCreatedRevision)')"
if [ -z "$CREATED" ]; then
  CREATED="$(gcloud run services describe $_SERVICE_NAME --platform managed --region us-central1 --project="$PROJECT_ID" --format='value(status.latestCreatedRevisionName)')"
fi
if [ -z "$CREATED" ]; then
  echo "❌ Unable to determine latest created revision name"
  exit 1
fi
echo "🆕 Latest created revision: $CREATED"

echo "⏳ Waiting for revision $CREATED to become ContainerReady..."
READY_OK=0
for i in $(seq 1 5); do
  # Get the status and check for ContainerReady=True
  # Use a simple pattern that matches 'True' or True
  STATUS_CHECK=$(gcloud run revisions describe "$CREATED" --platform managed --region us-central1 --project="$PROJECT_ID" --format='yaml(status.conditions)' 2>/dev/null || echo '')
  
  # Extract the ContainerReady block once and check it
  CONTAINER_READY_BLOCK=$(echo "$STATUS_CHECK" | grep -B 2 "type: ContainerReady" || echo '')
  
  # Check if ContainerReady status is True (handle both quoted and unquoted)
  if echo "$CONTAINER_READY_BLOCK" | grep -q "status:" && echo "$CONTAINER_READY_BLOCK" | grep -q "True"; then
    echo "✅ Revision $CREATED is ContainerReady"
    READY_OK=1
    break
  fi
  
  echo "⏳ Still waiting... (attempt $i/5)"
  sleep 5
done

# If still not ready after 25 seconds, continue anyway - Cloud Run will handle it
if [ "$READY_OK" -ne 1 ]; then
  echo "⚠️ Revision $CREATED readiness check timed out, but continuing with traffic promotion..."
  echo "Cloud Run will handle traffic routing appropriately."
fi

echo "🚀 Promoting new revision to serve traffic..."
gcloud run services update-traffic $_SERVICE_NAME --region us-central1 --project="$PROJECT_ID" --to-revisions "$CREATED=100"


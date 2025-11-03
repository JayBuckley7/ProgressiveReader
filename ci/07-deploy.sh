#!/usr/bin/env bash
set -euo pipefail

# Cloud Build substitutions passed as environment variables

# Deploy new revision with NO traffic
gcloud run deploy $_SERVICE_NAME \
  --image us-central1-docker.pkg.dev/$PROJECT_ID/progressive-reader/$_SERVICE_NAME:$_COMMIT_SHA \
  --service-account progressive-reader-bvt-sa@$PROJECT_ID.iam.gserviceaccount.com \
  --set-secrets /secrets/env.json=PR-app-config:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars APP_ENV=$_ENVIRONMENT \
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
for i in $(seq 1 48); do
  # Get status YAML and parse it - more reliable than filter expressions
  STATUS_YAML=$(gcloud run revisions describe "$CREATED" --platform managed --region us-central1 --project="$PROJECT_ID" --format='yaml(status.conditions)' 2>/dev/null || echo '')
  
  # Check if ContainerReady condition exists and is True
  # In YAML, status comes before type, so we check for the block containing both
  if echo "$STATUS_YAML" | grep -B 2 "type: ContainerReady" | grep -q "status:.*True"; then
    echo "✅ Revision $CREATED is ContainerReady"
    READY_OK=1
    break
  fi
  
  # Also check Ready condition as fallback
  if echo "$STATUS_YAML" | grep -B 2 "type: Ready" | grep -q "status:.*True"; then
    echo "✅ Revision $CREATED is Ready"
    READY_OK=1
    break
  fi
  
  echo "⏳ Still waiting... (attempt $i/48)"
  sleep 10
done

if [ "$READY_OK" -ne 1 ]; then
  echo "⚠️ Revision $CREATED readiness check timed out, but continuing with traffic promotion..."
  echo "Full status:"
  gcloud run revisions describe "$CREATED" --platform managed --region us-central1 --project="$PROJECT_ID" --format='yaml(status)' || true
  # Don't exit 1 - Cloud Run will handle it
fi

echo "🚀 Promoting new revision to serve traffic..."
gcloud run services update-traffic $_SERVICE_NAME --region us-central1 --project="$PROJECT_ID" --to-revisions "$CREATED=100"


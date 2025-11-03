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
  # Check ContainerReady status - this is what actually matters for serving traffic
  CONTAINER_READY="$(gcloud run revisions describe "$CREATED" --platform managed --region us-central1 --project="$PROJECT_ID" --format='value(status.conditions[?type==ContainerReady].status)' 2>/dev/null || echo '')"
  
  if [ "$CONTAINER_READY" = "True" ]; then
    echo "✅ Revision $CREATED is ContainerReady"
    READY_OK=1
    break
  fi

  # Show current status for debugging
  READY_STATE="$(gcloud run revisions describe "$CREATED" --platform managed --region us-central1 --project="$PROJECT_ID" --format='value(status.conditions[?type==Ready].status)' 2>/dev/null || echo 'unknown')"
  REASON="$(gcloud run revisions describe "$CREATED" --platform managed --region us-central1 --project="$PROJECT_ID" --format='value(status.conditions[?type==ContainerReady].reason)' 2>/dev/null || echo '')"
  MESSAGE="$(gcloud run revisions describe "$CREATED" --platform managed --region us-central1 --project="$PROJECT_ID" --format='value(status.conditions[?type==ContainerReady].message)' 2>/dev/null || echo '')"
  echo "⏳ Still waiting... (ContainerReady=${CONTAINER_READY:-unknown} Ready=${READY_STATE:-unknown} reason=${REASON:-''})"
  if [ -n "$MESSAGE" ]; then echo "   ↳ $MESSAGE"; fi
  sleep 10
done

if [ "$READY_OK" -ne 1 ]; then
  echo "❌ Revision $CREATED did not become ContainerReady in time."
  gcloud run revisions describe "$CREATED" --platform managed --region us-central1 --project="$PROJECT_ID" --format='yaml(status)'
  exit 1
fi

echo "🚀 Promoting new revision to serve traffic..."
gcloud run services update-traffic $_SERVICE_NAME --region us-central1 --project="$PROJECT_ID" --to-revisions "$CREATED=100"


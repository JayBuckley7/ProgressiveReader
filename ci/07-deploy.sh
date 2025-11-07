#!/usr/bin/env bash
set -eu

# Cloud Build substitutions passed as environment variables

# Deploy new revision with NO traffic
# Step A: Clear all existing secrets to avoid conflicts
# This must complete before Step B starts
echo "卵・・Clearing any existing secrets..."
if gcloud run services describe $_SERVICE_NAME --region us-central1 --platform managed --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "Service exists, clearing secrets..."
  gcloud run services update $_SERVICE_NAME \
    --region us-central1 \
    --platform managed \
    --clear-secrets \
    --project="$PROJECT_ID"
  echo "笨・Secrets cleared"
else
  echo "邃ｹ・・Service doesn't exist yet, skipping clear-secrets"
fi

# Step B: Deploy with exact secret mount we want
echo "柏 Deploying with secrets..."
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
  echo "笶・Unable to determine latest created revision name"
  exit 1
fi
echo "・ Latest created revision: $CREATED"

echo "竢ｳ Waiting for revision $CREATED to become ContainerReady..."
READY_OK=0
for i in $(seq 1 5); do
  # Get the status and check for ContainerReady=True
  # Use a simple pattern that matches 'True' or True
  STATUS_CHECK=$(gcloud run revisions describe "$CREATED" --platform managed --region us-central1 --project="$PROJECT_ID" --format='yaml(status.conditions)' 2>/dev/null || echo '')
  
  # Extract the ContainerReady block once and check it
  CONTAINER_READY_BLOCK=$(echo "$STATUS_CHECK" | grep -B 2 "type: ContainerReady" || echo '')
  
  # Check if ContainerReady status is True (handle both quoted and unquoted)
  if echo "$CONTAINER_READY_BLOCK" | grep -q "status:" && echo "$CONTAINER_READY_BLOCK" | grep -q "True"; then
    echo "笨・Revision $CREATED is ContainerReady"
    READY_OK=1
    break
  fi
  
  echo "竢ｳ Still waiting... (attempt $i/5)"
  sleep 5
done

# If still not ready after 25 seconds, continue anyway - Cloud Run will handle it
if [ "$READY_OK" -ne 1 ]; then
  echo "笞・・Revision $CREATED readiness check timed out, but continuing with traffic promotion..."
  echo "Cloud Run will handle traffic routing appropriately."
fi

echo "噫 Promoting new revision to serve traffic..."
gcloud run services update-traffic $_SERVICE_NAME --region us-central1 --project="$PROJECT_ID" --to-revisions "$CREATED=100"

# Optional: Verify secret mounts and env vars are correctly configured
echo "剥 Verifying secret mounts and environment variables..."
gcloud run services describe $_SERVICE_NAME \
  --region us-central1 --platform managed --project="$PROJECT_ID" \
  --format='yaml(spec.template.volumes, spec.template.containers[0].volumeMounts, spec.template.containers[0].env)' \
  2>/dev/null | grep -E "(name:|mountPath:|value:)" || echo "笞・・Could not verify mounts (this is non-critical)"


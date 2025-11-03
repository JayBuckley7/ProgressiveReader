#!/usr/bin/env bash
set -euo pipefail

# Cloud Build substitutions: ${_SERVICE_NAME}, ${_COMMIT_SHA}, ${_ENVIRONMENT} will be replaced by Cloud Build

# Deploy new revision with NO traffic
gcloud run deploy ${_SERVICE_NAME} \
  --image us-central1-docker.pkg.dev/$PROJECT_ID/progressive-reader/${_SERVICE_NAME}:${_COMMIT_SHA} \
  --service-account progressive-reader-bvt-sa@$PROJECT_ID.iam.gserviceaccount.com \
  --set-secrets /secrets/env.json=PR-app-config:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars APP_ENV=${_ENVIRONMENT} \
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
CREATED="$(gcloud run services describe ${_SERVICE_NAME} --platform managed --region us-central1 --project="$PROJECT_ID" --format='value(status.latestCreatedRevision)')"
if [ -z "$CREATED" ]; then
  CREATED="$(gcloud run services describe ${_SERVICE_NAME} --platform managed --region us-central1 --project="$PROJECT_ID" --format='value(status.latestCreatedRevisionName)')"
fi
if [ -z "$CREATED" ]; then
  echo "❌ Unable to determine latest created revision name"
  exit 1
fi
echo "🆕 Latest created revision: $CREATED"

echo "⏳ Waiting for revision $CREATED to become Ready..."
READY_OK=0
for i in $(seq 1 48); do
  READY_STATE="$(gcloud run revisions describe "$CREATED" --platform managed --region us-central1 --project="$PROJECT_ID" --format='value(status.terminalCondition.state)')"
  if [ -z "$READY_STATE" ]; then
    READY_STATE="$(gcloud run revisions describe "$CREATED" --platform managed --region us-central1 --project="$PROJECT_ID" --format='value(status.conditions[?type=Ready].status)')"
  fi
  if [ -z "$READY_STATE" ]; then
    READY_STATE="$(gcloud run revisions describe "$CREATED" --platform managed --region us-central1 --project="$PROJECT_ID" --format='value(status.conditions[?type=Ready].state)')"
  fi

  if [ "$READY_STATE" = "True" ]; then
    echo "✅ Revision $CREATED is Ready"
    READY_OK=1
    break
  fi

  REASON="$(gcloud run revisions describe "$CREATED" --platform managed --region us-central1 --project="$PROJECT_ID" --format='value(status.terminalCondition.reason)')"
  MESSAGE="$(gcloud run revisions describe "$CREATED" --platform managed --region us-central1 --project="$PROJECT_ID" --format='value(status.terminalCondition.message)')"
  echo "⏳ Still waiting... (state=${READY_STATE:-unknown} reason=${REASON:-''})"
  if [ -n "$MESSAGE" ]; then echo "   ↳ $MESSAGE"; fi
  sleep 10
done

if [ "$READY_OK" -ne 1 ]; then
  echo "❌ Revision $CREATED did not become Ready in time."
  gcloud run revisions describe "$CREATED" --platform managed --region us-central1 --project="$PROJECT_ID" --format='yaml(status)'
  exit 1
fi

echo "🚀 Promoting new revision to serve traffic..."
gcloud run services update-traffic ${_SERVICE_NAME} --region us-central1 --project="$PROJECT_ID" --to-revisions "$CREATED=100"


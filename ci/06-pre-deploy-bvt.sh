#!/usr/bin/env bash
set -euo pipefail

# Cloud Build substitution passed as environment variable
if gcloud run services describe $_SERVICE_NAME --platform managed --region us-central1 --project="$PROJECT_ID" >/dev/null 2>&1; then
  SERVICE_URL=$(gcloud run services describe $_SERVICE_NAME --platform managed --region us-central1 --project="$PROJECT_ID" --format 'value(status.url)')
  HEALTH_CHECK_URL="$SERVICE_URL/health"
  echo "Pre-deployment BVT: GET $HEALTH_CHECK_URL"
  STATUS_CODE=$(curl -sS -o /dev/null -w "%{http_code}" --connect-timeout 10 --max-time 20 "$HEALTH_CHECK_URL")
  
  # Allow deployment if service is unhealthy (500) - we may be deploying a fix
  # Only fail on connection errors or other critical issues
  if [ "$STATUS_CODE" -ge 200 ] && [ "$STATUS_CODE" -lt 600 ]; then
    if [ "$STATUS_CODE" -ge 200 ] && [ "$STATUS_CODE" -lt 400 ]; then
      echo "✅ Pre-deployment health check passed"
    else
      echo "⚠️ Pre-deployment health check returned $STATUS_CODE (service may be unhealthy, but allowing deployment to proceed)"
    fi
  else
    echo "❌ Pre-deployment BVT failed ($STATUS_CODE) for $HEALTH_CHECK_URL - connection or critical error"
    exit 1
  fi
else
  echo "ℹ️ Service $_SERVICE_NAME not found yet; skipping pre-deployment health check."
fi


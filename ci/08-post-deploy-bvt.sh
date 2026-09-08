#!/usr/bin/env bash
set -euo pipefail
if [ "${_DEPLOY:-false}" != true ]; then
  echo 'Deployment not requested; skipping post-deploy checks.'
  exit 0
fi
SERVICE_URL=$(gcloud run services describe "$_SERVICE_NAME" --platform managed --region us-central1 --project="$PROJECT_ID" --format='value(status.url)')
curl --fail --silent --show-error --connect-timeout 10 --max-time 30 "$SERVICE_URL/ready"
status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --connect-timeout 10 --max-time 30 "$SERVICE_URL/api/vocabulary")
test "$status" = 401
# Funding is intentionally disabled, even if a server secret is configured.
curl --fail --silent --show-error --connect-timeout 10 --max-time 30 "$SERVICE_URL/api/openai-key-configured" | python3 -c 'import json,sys; assert json.load(sys.stdin)["server_funded_enabled"] is False'

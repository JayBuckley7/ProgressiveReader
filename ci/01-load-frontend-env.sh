#!/usr/bin/env bash
set -euo pipefail

echo "📦 Loading frontend environment variables from PR-app-config..."

apt-get update -y >/dev/null && apt-get install -y jq >/dev/null

# Cloud Build substitution: ${PROJECT_ID} is a built-in Cloud Build variable
SECRET_CONTENT="$(gcloud secrets versions access latest --secret=PR-app-config --project="${PROJECT_ID}")"

VITE_CLERK_PUBLISHABLE_KEY="$(printf %s "$SECRET_CONTENT" | jq -r '.VITE_CLERK_PUBLISHABLE_KEY // empty')"
VITE_GDRIVE_CLIENT_ID="$(printf %s "$SECRET_CONTENT" | jq -r '.VITE_GDRIVE_CLIENT_ID // empty')"
VITE_GAPI_KEY="$(printf %s "$SECRET_CONTENT" | jq -r '.VITE_GAPI_KEY // empty')"

[ -n "$VITE_CLERK_PUBLISHABLE_KEY" ] || { echo "❌ Missing VITE_CLERK_PUBLISHABLE_KEY"; exit 1; }
[ -n "$VITE_GDRIVE_CLIENT_ID" ]      || { echo "❌ Missing VITE_GDRIVE_CLIENT_ID"; exit 1; }
[ -n "$VITE_GAPI_KEY" ]              || { echo "❌ Missing VITE_GAPI_KEY"; exit 1; }

printf %s "$VITE_CLERK_PUBLISHABLE_KEY" > /workspace/vite_clerk_key.txt
printf %s "$VITE_GDRIVE_CLIENT_ID"     > /workspace/vite_gdrive_client.txt
printf %s "$VITE_GAPI_KEY"             > /workspace/vite_gapi_key.txt

echo "✅ Frontend environment variables extracted"


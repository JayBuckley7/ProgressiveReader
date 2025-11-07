#!/usr/bin/env bash
set -eu

VITE_CLERK_PUBLISHABLE_KEY="$(tr -d '\r\n' < /workspace/vite_clerk_key.txt)"
VITE_GDRIVE_CLIENT_ID="$(tr -d '\r\n' < /workspace/vite_gdrive_client.txt)"
VITE_GAPI_KEY="$(tr -d '\r\n' < /workspace/vite_gapi_key.txt)"

echo "畑 Building Docker image (frontend build args only)..."

# Cloud Build substitutions passed as environment variables
docker build \
  --build-arg VITE_CLERK_PUBLISHABLE_KEY="$VITE_CLERK_PUBLISHABLE_KEY" \
  --build-arg VITE_GDRIVE_CLIENT_ID="$VITE_GDRIVE_CLIENT_ID" \
  --build-arg VITE_GAPI_KEY="$VITE_GAPI_KEY" \
  -t us-central1-docker.pkg.dev/$PROJECT_ID/progressive-reader/$_SERVICE_NAME:$_COMMIT_SHA \
  -t us-central1-docker.pkg.dev/$PROJECT_ID/progressive-reader/$_SERVICE_NAME:latest \
  .


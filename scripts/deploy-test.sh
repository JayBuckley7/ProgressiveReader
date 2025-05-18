#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="progressive-reader-dev"
REGION="us-central1"

echo "Deploying $SERVICE_NAME to $REGION"
gcloud run deploy "$SERVICE_NAME" --source . --region "$REGION" --allow-unauthenticated

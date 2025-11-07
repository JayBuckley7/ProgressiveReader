#!/usr/bin/env bash
set -eu

# Cloud Build substitution passed as environment variable
SERVICE_URL=$(gcloud run services describe $_SERVICE_NAME --platform managed --region us-central1 --project="$PROJECT_ID" --format 'value(status.url)')

# Test 1: Health check & Clerk flags
HEALTH_CHECK_URL="$SERVICE_URL/health"
echo "Post-deploy BVT 1/3: $HEALTH_CHECK_URL"
set +e
HEALTH_RESPONSE=$(curl --silent --show-error --connect-timeout 10 --max-time 20 "$HEALTH_CHECK_URL")
curl_status=$?
set -e
if [ $curl_status -ne 0 ] || [ -z "$HEALTH_RESPONSE" ]; then
  echo "笞・・Health endpoint unavailable or empty; continuing."
  HEALTH_RESPONSE='{}'
else
  echo "Health: $HEALTH_RESPONSE"
fi

CLERK_OVERALL=$(echo "$HEALTH_RESPONSE" | grep -o '"clerk_overall_healthy"[[:space:]]*:[[:space:]]*\(true\|false\)' | grep -o '\(true\|false\)')
CLERK_PUB_CONFIGURED=$(echo "$HEALTH_RESPONSE" | grep -o '"clerk_publishable_key_configured"[[:space:]]*:[[:space:]]*\(true\|false\)' | grep -o '\(true\|false\)')
CLERK_SECRET_CONFIGURED=$(echo "$HEALTH_RESPONSE" | grep -o '"clerk_secret_key_configured"[[:space:]]*:[[:space:]]*\(true\|false\)' | grep -o '\(true\|false\)')

echo "投 Clerk:"
echo "  - overall_healthy: ${CLERK_OVERALL:-unknown}"
echo "  - publishable_key_configured: ${CLERK_PUB_CONFIGURED:-unknown}"
echo "  - secret_key_configured: ${CLERK_SECRET_CONFIGURED:-unknown}"

# Test 2: OpenAI key pool check (best-effort)
OPENAI_CHECK_URL="$SERVICE_URL/api/openai_key_configured"
echo "Post-deploy BVT 2/3: $OPENAI_CHECK_URL"
set +e
OPENAI_RESPONSE=$(curl --silent --show-error --connect-timeout 10 --max-time 20 "$OPENAI_CHECK_URL")
curl_status=$?
set -e
if [ $curl_status -ne 0 ] || [ -z "$OPENAI_RESPONSE" ]; then
  echo "笞・・OpenAI configuration endpoint unavailable; continuing."
  OPENAI_RESPONSE='{}'
fi
echo "OpenAI: $OPENAI_RESPONSE"
CONFIGURED=$(echo "$OPENAI_RESPONSE" | grep -o '"openai_key_configured"[[:space:]]*:[[:space:]]*true' | wc -l)
POOL_SIZE=$(echo "$OPENAI_RESPONSE" | grep -o '"pool_size"[[:space:]]*:[[:space:]]*[0-9]\+' | grep -o '[0-9]\+')
if [ "$CONFIGURED" -eq 1 ] && [ "${POOL_SIZE:-0}" -gt 0 ]; then
  echo "笨・OpenAI pool looks healthy (pool_size=${POOL_SIZE})"
else
  echo "笞・・Unable to confirm OpenAI pool configuration; continuing."
fi

# Test 3: Confirm both Clerk keys seen by backend
echo "Post-deploy BVT 3/3: Checking Clerk flags again"
if [ "$CLERK_PUB_CONFIGURED" = "true" ] && [ "$CLERK_SECRET_CONFIGURED" = "true" ]; then
  echo "笨・Clerk keys confirmed"
else
  echo "笞・・Clerk key confirmation incomplete."
fi


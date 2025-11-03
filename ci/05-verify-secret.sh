#!/usr/bin/env bash
set -euo pipefail

echo "🔍 Verifying PR-app-config secret exists and contents..."

if gcloud secrets describe PR-app-config --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "✅ PR-app-config secret found"
  SECRET_CONTENT="$(gcloud secrets versions access latest --secret=PR-app-config --project="$PROJECT_ID")"

  echo "$SECRET_CONTENT" | grep -q '"OPENAI_API_KEYS"'            && echo "✅ OPENAI_API_KEYS found" || (echo "❌ OPENAI_API_KEYS missing" && exit 1)
  echo "$SECRET_CONTENT" | grep -q '"CLERK_SECRET_KEY"'           && echo "✅ CLERK_SECRET_KEY found" || (echo "❌ CLERK_SECRET_KEY missing" && exit 1)
  echo "$SECRET_CONTENT" | grep -q '"VITE_CLERK_PUBLISHABLE_KEY"' && echo "✅ VITE_CLERK_PUBLISHABLE_KEY found" || (echo "❌ VITE_CLERK_PUBLISHABLE_KEY missing" && exit 1)
  echo "✅ PR-app-config secret verification complete"
else
  echo "❌ PR-app-config secret not found. Please create it first."
  exit 1
fi


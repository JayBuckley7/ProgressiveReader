#!/usr/bin/env bash
set -eu

echo "剥 Verifying PR-app-config secret exists and contents..."

if gcloud secrets describe PR-app-config --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "笨・PR-app-config secret found"
  SECRET_CONTENT="$(gcloud secrets versions access latest --secret=PR-app-config --project="$PROJECT_ID")"

  echo "$SECRET_CONTENT" | grep -q '"OPENAI_API_KEYS"'                     && echo "笨・OPENAI_API_KEYS found" || (echo "笶・OPENAI_API_KEYS missing" && exit 1)
  echo "$SECRET_CONTENT" | grep -q '"CLERK_SECRET_KEY"'                  && echo "笨・CLERK_SECRET_KEY found" || (echo "笶・CLERK_SECRET_KEY missing" && exit 1)
  echo "$SECRET_CONTENT" | grep -q '"VITE_CLERK_PUBLISHABLE_KEY"'        && echo "笨・VITE_CLERK_PUBLISHABLE_KEY found" || (echo "笶・VITE_CLERK_PUBLISHABLE_KEY missing" && exit 1)
  echo "$SECRET_CONTENT" | grep -q '"GOOGLE_APPLICATION_CREDENTIALS_JSON"' && echo "笨・GOOGLE_APPLICATION_CREDENTIALS_JSON found" || (echo "笶・GOOGLE_APPLICATION_CREDENTIALS_JSON missing" && exit 1)
  echo "笨・PR-app-config secret verification complete"
else
  echo "笶・PR-app-config secret not found. Please create it first."
  exit 1
fi


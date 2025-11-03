# Build Docker image locally with frontend build args
# Reads values from env_dev.json

# Read from env_dev.json (you may need to adjust path)
$envData = Get-Content env_dev.json -Raw | ConvertFrom-Json

$env:VITE_CLERK_PUBLISHABLE_KEY = $envData.VITE_CLERK_PUBLISHABLE_KEY
$env:VITE_GDRIVE_CLIENT_ID = $envData.VITE_GDRIVE_CLIENT_ID
$env:VITE_GAPI_KEY = $envData.VITE_GAPI_KEY

docker build `
  --build-arg VITE_CLERK_PUBLISHABLE_KEY="$env:VITE_CLERK_PUBLISHABLE_KEY" `
  --build-arg VITE_GDRIVE_CLIENT_ID="$env:VITE_GDRIVE_CLIENT_ID" `
  --build-arg VITE_GAPI_KEY="$env:VITE_GAPI_KEY" `
  -t progressive-reader:local .

# Create local test secret file (backend secrets only)
# Frontend secrets are baked into the image via build args
# NOTE: Replace with your actual secrets from env_dev.json
@"
{
  "CLERK_SECRET_KEY": "YOUR_CLERK_SECRET_KEY_FROM_ENV_DEV_JSON",
  "OPENAI_API_KEYS": [
    "YOUR_OPENAI_KEY_1_FROM_ENV_DEV_JSON",
    "YOUR_OPENAI_KEY_2_FROM_ENV_DEV_JSON",
    "YOUR_OPENAI_KEY_3_FROM_ENV_DEV_JSON"
  ]
}
"@ | Out-File -FilePath env.json -Encoding utf8

# Run locally
docker run --rm -p 8080:8080 `
  -v "${PWD}\env.json:/secrets/env.json:ro" `
  -e APP_ENV=dev `
  progressive-reader:local

# After running, test these endpoints:
# http://localhost:8080/health
# http://localhost:8080/api/openai_key_configured

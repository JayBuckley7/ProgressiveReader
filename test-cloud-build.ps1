# Test Cloud Build locally without committing
# This uploads your current working directory and runs the full pipeline

gcloud config set project floofgg

gcloud builds submit `
  --config=cloudbuild.yaml `
  --substitutions=_SERVICE_NAME=progressive-reader,_ENVIRONMENT=prod


#!/usr/bin/env bash
set -euo pipefail

if [ "${_DEPLOY:-false}" != true ]; then
  echo 'Image build only. Deployment requires explicit _DEPLOY=true after release gates pass.'
  exit 0
fi

# Stage one candidate without mutating the serving revision's secrets or traffic.
REVISION_SUFFIX="r$(date +%s)-$RANDOM"
CREATED="$_SERVICE_NAME-$REVISION_SUFFIX"
gcloud run deploy "$_SERVICE_NAME" \
  --revision-suffix "$REVISION_SUFFIX" \
  --image "us-central1-docker.pkg.dev/$PROJECT_ID/progressive-reader/$_SERVICE_NAME:$_COMMIT_SHA" \
  --service-account "progressive-reader-bvt-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --update-secrets /secrets/env.json=PR-app-config:latest \
  --region us-central1 --platform managed --allow-unauthenticated \
  --update-env-vars "APP_ENV=$_ENVIRONMENT" \
  --vpc-connector floof-connector --vpc-egress private-ranges-only \
  --memory 1Gi --concurrency 1 --max-instances 40 --timeout 300 \
  --execution-environment gen2 --project="$PROJECT_ID" --no-traffic --tag candidate

test -n "$CREATED"
ready=false
for attempt in $(seq 1 60); do
  state=$(gcloud run revisions describe "$CREATED" --region us-central1 --project="$PROJECT_ID" --format=json)
  if printf '%s' "$state" | python3 -c 'import json,sys; s=json.load(sys.stdin); sys.exit(0 if any(c.get("type")=="Ready" and c.get("status")=="True" for c in s.get("status",{}).get("conditions",[])) else 1)'; then
    ready=true
    break
  fi
  sleep 5
done
if [ "$ready" != true ]; then
  echo 'Candidate readiness failed. Serving traffic remains unchanged.' >&2
  exit 1
fi

service=$(gcloud run services describe "$_SERVICE_NAME" --region us-central1 --project="$PROJECT_ID" --format=json)
CANDIDATE_URL=$(printf '%s' "$service" | python3 -c 'import json,sys; s=json.load(sys.stdin); revision=sys.argv[1]; print(next(t["url"] for t in s["status"]["traffic"] if t.get("tag")=="candidate" and t.get("revisionName")==revision))' "$CREATED")
curl --fail --silent --show-error --connect-timeout 10 --max-time 30 "$CANDIDATE_URL/ready"
curl --fail --silent --show-error --connect-timeout 10 --max-time 30 "$CANDIDATE_URL/" >/dev/null
for path in '/api/vocabulary' '/api/bookmarks?bookId=deployment-check'; do
  status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --connect-timeout 10 --max-time 30 "$CANDIDATE_URL$path")
  test "$status" = 401 || { echo 'Candidate access-control smoke check failed.' >&2; exit 1; }
done

gcloud run services update-traffic "$_SERVICE_NAME" --region us-central1 --project="$PROJECT_ID" --to-revisions "$CREATED=100"

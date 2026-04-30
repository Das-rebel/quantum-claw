# Twitter Bookmark Sync - Cloud Function Deployment
# Deploys to GCP Cloud Functions - fully automated!

## Deploy

```bash
cd infrastructure/cloud-functions/twitter-sync-function

# Deploy as HTTP Cloud Function
gcloud functions deploy twitter-sync \
  --runtime python39 \
  --trigger-http \
  --allow-unauthenticated \
  --region asia-south1 \
  --memory 256MB \
  --timeout 60s \
  --max-instances 3 \
  --source . \
  --entry-point fetch_twitter_bookmarks \
  --project omniclaw-personal-assistant
```

## Test

```bash
# Test the function
curl -X POST \
  "https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/twitter-sync" \
  -H "Content-Type: application/json"
```

## Schedule (Optional)

```bash
# Create Cloud Scheduler job
gcloud scheduler jobs create http twitter-sync-daily \
  --schedule="0 3 * * *" \
  --time-zone="UTC" \
  --uri="https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/twitter-sync" \
  --description="Daily Twitter bookmark sync at 8:30 AM IST" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --project omniclaw-personal-assistant
```

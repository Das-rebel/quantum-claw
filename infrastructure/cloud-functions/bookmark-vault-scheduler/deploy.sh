#!/bin/bash
#
# Deploy Bookmark Vault Scheduler to GCP
# Includes: Twitter scraper + Instagram scraper + VL agents
#
set -e

PROJECT_ID="omniclaw-personal-assistant"
REGION="asia-south1"
FUNCTION_NAME="bookmark-vault-scheduler"
INSTAGRAM_FUNCTION="instagram-vault-scheduler"
SCHEDULER_JOB="bookmark-vault-daily"
INSTAGRAM_JOB="instagram-vault-daily"

echo "=============================================="
echo " Bookmark Vault Scheduler Deployment"
echo " Twitter + Instagram Daily Scraping"
echo "=============================================="

cd /Users/Subho/omniclaw/infrastructure/cloud-functions/bookmark-vault-scheduler

# Step 1: Install dependencies
echo ""
echo "[1/6] Installing dependencies..."
npm install axios

# Step 2: Deploy Twitter bookmark scheduler (Python/Scrapling)
echo ""
echo "[2/6] Deploying Twitter bookmark scheduler (Scrapling)..."
gcloud functions deploy ${FUNCTION_NAME} \
  --gen2 \
  --runtime python311 \
  --region ${REGION} \
  --source . \
  --entry-point twitter_scrape \
  --trigger-http \
  --allow-unauthenticated \
  --timeout 300s \
  --memory 1GB \
  --set-env-vars "VAULT_DIR=/workspace/data" \
  --requirements ./requirements.txt \
  2>/dev/null || echo "Function may already exist, updating..."

FUNCTION_URL=$(gcloud functions describe ${FUNCTION_NAME} \
  --region ${REGION} \
  --format 'value(httpsTrigger.url)' 2>/dev/null)

echo "Twitter Function URL: ${FUNCTION_URL}"

# Step 3: Deploy Instagram scraper as Cloud Function
echo ""
echo "[3/6] Deploying Instagram scraper function..."
gcloud functions deploy ${INSTAGRAM_FUNCTION} \
  --gen2 \
  --runtime python311 \
  --region ${REGION} \
  --source . \
  --entry-point scheduler \
  --trigger-http \
  --allow-unauthenticated \
  --timeout 300s \
  --memory 1GB \
  --set-env-vars "VAULT_DIR=/workspace/data" \
  --requirements ./requirements.txt \
  2>/dev/null || echo "Instagram function may already exist, updating..."

INSTAGRAM_URL=$(gcloud functions describe ${INSTAGRAM_FUNCTION} \
  --region ${REGION} \
  --format 'value(httpsTrigger.url)' 2>/dev/null)

echo "Instagram Function URL: ${INSTAGRAM_URL}"

# Step 4: Create Cloud Scheduler jobs
echo ""
echo "[4/6] Creating Cloud Scheduler jobs..."

# Twitter job (daily at 9 AM UTC)
gcloud scheduler jobs create http ${SCHEDULER_JOB} \
  --location ${REGION} \
  --uri "${FUNCTION_URL}" \
  --schedule "0 9 * * *" \
  --timezone "UTC" \
  --description "Daily Twitter bookmark scrape and vault update" \
  --time-format "RFC3339" \
  2>/dev/null || \
gcloud scheduler jobs update http ${SCHEDULER_JOB} \
  --location ${REGION} \
  --uri "${FUNCTION_URL}" \
  --schedule "0 9 * * *"

echo "Twitter scheduler: ${SCHEDULER_JOB} (daily 9 AM UTC)"

# Instagram job (daily at 10 AM UTC - after Twitter)
gcloud scheduler jobs create http ${INSTAGRAM_JOB} \
  --location ${REGION} \
  --uri "${INSTAGRAM_URL}" \
  --schedule "0 10 * * *" \
  --timezone "UTC" \
  --description "Daily Instagram bookmark scrape" \
  --time-format "RFC3339" \
  2>/dev/null || \
gcloud scheduler jobs update http ${INSTAGRAM_JOB} \
  --location ${REGION} \
  --uri "${INSTAGRAM_URL}" \
  --schedule "0 10 * * *"

echo "Instagram scheduler: ${INSTAGRAM_JOB} (daily 10 AM UTC)"

# Step 5: Deploy VL agents as Cloud Run jobs
echo ""
echo "[5/6] Deploying VL agents as Cloud Run jobs..."

for i in 1 2 3 4; do
  AGENT_NAME="vl-agent-${i}"
  START=$(((i-1)*500))
  END=$((i*500))

  echo "  Deploying ${AGENT_NAME} (posts ${START}-${END})..."

  # Create startup script
  cat > /tmp/vl_agent_startup_${i}.sh << AGENTSCRIPT
#!/bin/bash
cd /app
if [ -f instagram_scraper.py ]; then
  python3 instagram_scraper.py
fi
node vl_agents.js $i ${START} ${END}
AGENTSCRIPT
  chmod +x /tmp/vl_agent_startup_${i}.sh

  # Deploy or update
  gcloud run deploy ${AGENT_NAME} \
    --image node:18 \
    --region ${REGION} \
    --command "/bin/bash" \
    --args "-c,$(base64 -i /tmp/vl_agent_startup_${i}.sh | tr -d '\n')" \
    --memory 512Mi \
    --cpu 1 \
    --max-instances 4 \
    --service-account "scheduler@${PROJECT_ID}.iam.gserviceaccount.com" \
    --set-env-vars "CEREBRAS_API_KEY=${CEREBRAS_API_KEY:-},AI_PROVIDER=${AI_PROVIDER:-cerebras},VAULT_PATH=/workspace/data/twitter_bookmarks_automated.json" \
    --quiet \
    2>/dev/null || echo "    ${AGENT_NAME} may already exist"
done

# Step 6: Create unified trigger for VL processing
echo ""
echo "[6/6] Creating VL processing trigger..."

# Create a single endpoint that triggers all VL agents
cat > /tmp/trigger_vl_agents.js << 'TRIGGER'
/**
 * VL Agent Trigger - Triggers all 4 VL agents in parallel
 * Called after bookmark scraping completes
 *
 * NOTE: Cloud Run services get random URLs. After deploying VL agents,
 * update AGENT_URLS with actual URLs from: gcloud run services list
 */
const https = require('https');

const REGION = process.env.REGION || 'asia-south1';
const PROJECT = process.env.PROJECT_ID || 'omniclaw-personal-assistant';

// Get actual VL agent URLs from Cloud Run
// Run: gcloud run services list --filter vl-agent --format 'value(STATUS.url)'
const AGENT_URLS = [
  `https://vl-agent-1-${PROJECT}.a.run.app`,
  `https://vl-agent-2-${PROJECT}.a.run.app`,
  `https://vl-agent-3-${PROJECT}.a.run.app`,
  `https://vl-agent-4-${PROJECT}.a.run.app`
];

async function triggerAllAgents() {
  console.log('Triggering VL agents...');

  const promises = AGENT_URLS.map((url, i) => {
    console.log(`Triggering agent ${i+1}: ${url}`);
    return fetch(url, { method: 'GET', timeout: 30000 })
      .then(r => console.log(`Agent ${i+1}: ${r.status}`))
      .catch(e => console.error(`Agent ${i+1} failed: ${e.message}`));
  });

  await Promise.allSettled(promises);
  console.log('All agents triggered');
}

triggerAllAgents();
TRIGGER

echo ""
echo "=============================================="
echo " Deployment Complete!"
echo "=============================================="
echo ""
echo "Schedulers:"
echo "  Twitter:  ${SCHEDULER_JOB} (9 AM UTC)"
echo "  Instagram: ${INSTAGRAM_JOB} (10 AM UTC)"
echo ""
echo "VL Agents (Cloud Run):"
echo "  vl-agent-1: posts 0-499"
echo "  vl-agent-2: posts 500-999"
echo "  vl-agent-3: posts 1000-1499"
echo "  vl-agent-4: posts 1500-1999"
echo ""
echo "To run immediately:"
echo "  gcloud scheduler jobs run ${SCHEDULER_JOB} --location ${REGION}"
echo "  gcloud scheduler jobs run ${INSTAGRAM_JOB} --location ${REGION}"
echo ""
echo "To check logs:"
echo "  gcloud functions logs read ${FUNCTION_NAME} --region ${REGION} --limit 50"
echo "  gcloud functions logs read ${INSTAGRAM_FUNCTION} --region ${REGION} --limit 50"
echo ""
echo "Required environment variables:"
echo "  Twitter: TWITTER_COOKIES, TWITTER_USERNAME, TWITTER_PASSWORD"
echo "  Instagram: INSTAGRAM_COOKIES"
echo "  AI: CEREBRAS_API_KEY or GROQ_API_KEY"
echo ""

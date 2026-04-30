"""
Processing Function - Orchestrates VL agents and combines results
GCP Cloud Function for processing scraped bookmarks
"""

import os
import json
import functions_framework
from datetime import datetime
import subprocess
import tempfile

# Configuration
PROJECT_ID = "omniclaw-personal-assistant"
REGION = "asia-south1"
BUCKET_NAME = "omniclaw-knowledge-graph"

def log(msg):
    print(f"[PROCESSING] {datetime.now().isoformat()} {msg}", flush=True)

@functions_framework.http
def process_bookmarks(request):
    """
    HTTP Cloud Function to process bookmarks with VL agents
    """
    # CORS headers
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        }
        return ('', 204, headers)

    headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
    }

    if request.method == 'GET':
        return json.dumps({
            "service": "bookmark-processor",
            "status": "ready",
            "timestamp": datetime.now().isoformat()
        }), 200, headers

    try:
        log("=== Bookmark Processing Started ===")

        # Trigger VL agents (they run as Cloud Run services)
        agent_results = trigger_vl_agents()

        # Combine results from all agents
        combined_results = combine_agent_results(agent_results)

        # Upload combined results to GCS
        upload_to_gcs('vault/processed_bookmarks_combined.json', combined_results)

        log(f"=== Processing completed: {len(combined_results)} total items ===")

        return json.dumps({
            "success": True,
            "processedItems": len(combined_results),
            "agentResults": agent_results,
            "timestamp": datetime.now().isoformat()
        }), 200, headers

    except Exception as e:
        log(f"Processing error: {e}")
        import traceback
        traceback.print_exc()

        return json.dumps({
            "success": False,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }), 500, headers

def trigger_vl_agents():
    """Trigger all VL agents and collect results"""
    import requests

    agent_urls = [
        f"https://bookmark-vault-scheduler-twitter-o36e7noe5a-el.a.run.app",
        f"https://bookmark-vault-scheduler-instagram-o36e7noe5a-el.a.run.app"
    ]

    results = []

    for url in agent_urls:
        try:
            log(f"Triggering: {url}")
            response = requests.post(url, timeout=300)  # 5 minute timeout

            if response.status_code == 200:
                data = response.json()
                results.append({
                    "url": url,
                    "status": "success",
                    "data": data
                })
                log(f"✅ Success: {url}")
            else:
                results.append({
                    "url": url,
                    "status": "error",
                    "error": f"HTTP {response.status_code}"
                })
                log(f"❌ Error: {url} - {response.status_code}")

        except Exception as e:
            results.append({
                "url": url,
                "status": "error",
                "error": str(e)
            })
            log(f"❌ Exception: {url} - {e}")

    return results

def combine_agent_results(agent_results):
    """Combine results from all agents"""
    combined = []

    for result in agent_results:
        if result.get("status") == "success":
            data = result.get("data", {})
            if isinstance(data, list):
                combined.extend(data)
            elif isinstance(data, dict):
                # Extract items from dict response
                items = data.get("items", data.get("results", []))
                combined.extend(items if isinstance(items, list) else [items])

    return combined

def upload_to_gcs(filename, data):
    """Upload data to GCS"""
    try:
        from google.cloud import storage

        client = storage.Client()
        bucket = client.bucket(BUCKET_NAME)
        blob = bucket.blob(filename)

        blob.upload_from_string(
            json.dumps(data, indent=2),
            content_type='application/json'
        )

        blob.make_public()
        log(f"✅ Uploaded to GCS: {filename}")

    except Exception as e:
        log(f"❌ GCS upload failed: {e}")
        # Don't fail the whole process if GCS upload fails

@functions_framework.http
def health_check(request):
    """Health check endpoint"""
    return json.dumps({
        "service": "bookmark-processor",
        "status": "healthy",
        "timestamp": datetime.now().isoformat()
    })
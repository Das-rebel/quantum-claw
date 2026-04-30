#!/usr/bin/env python3
"""
OmniCloud Fresh - Complete API with Queue Management
- Handles service failures
- Queues queries during outages
- Replays with timestamp when service resumes
"""

import subprocess
import json
import urllib.request
import urllib.parse
import time
import os
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading
import sys
sys.path.insert(0, os.path.expanduser("~/omniclaw-fresh/db"))
from resilience_db import *

# Config
PORT = 3000
QUEUE_PORT = 3001
CLOUD_AI_URL = "https://alexa-handler-338789220059.asia-south1.run.app/alexa"
CLIENT_PHONE = "+917977110915"

# Queue files
QUEUE_FILE = "/tmp/omniclaw_pending_queue.json"
ARCHIVE_FILE = "/tmp/omniclaw_queue_archive.json"

# Service state
service_available = True
last_failure = None
failure_recovery_mode = False

class QueueManager:
    def __init__(self):
        self.queue = self._load(QUEUE_FILE, [])
        self.archive = self._load(ARCHIVE_FILE, [])
    
    def _load(self, path, default):
        if os.path.exists(path):
            try:
                with open(path) as f:
                    return json.load(f)
            except:
                pass
        return default
    
    def _save(self, path, data):
        with open(path, 'w') as f:
            json.dump(data, f, indent=2)
    
    def add(self, query, user_jid, channel="whatsapp", group_jid=None):
        entry = {
            "id": f"q_{int(time.time() * 1000)}",
            "query": query,
            "user_jid": user_jid,
            "channel": channel,
            "group_jid": group_jid,
            "timestamp": datetime.now().isoformat(),
            "status": "pending",
            "retry_count": 0
        }
        self.queue.append(entry)
        self._save(QUEUE_FILE, self.queue)
        queue_add(text, from_jid, from_jid, group_jid, "whatsapp", datetime.now().isoformat())
        return entry
    
    def get_pending(self):
        return self.queue
    
    def complete(self, query_id, response=None):
        for entry in self.queue:
            if entry["id"] == query_id:
                entry["status"] = "completed"
                entry["completed_at"] = datetime.now().isoformat()
                entry["response"] = response
                self.archive.append(entry)
                self.queue.remove(entry)
                self._save(QUEUE_FILE, self.queue)
                self._save(ARCHIVE_FILE, self.archive)
                return True
        return False
    
    def get_summary(self):
        return {
            "pending": len(self.queue),
            "archived": len(self.archive)
        }
    
    def generate_delay_message(self, entry):
        ts = datetime.fromisoformat(entry["timestamp"])
        now = datetime.now()
        delay = now - ts
        
        hours = int(delay.total_seconds() // 3600)
        minutes = int((delay.total_seconds() % 3600) // 60)
        delay_str = f"{hours}h {minutes}m" if hours > 0 else f"{minutes}m"
        
        return (
            f"⏰ *Delayed Response*\n\n"
            f"Your query from *{delay_str} ago* is now processed:\n\n"
            f"📝 *Query:*\n{entry['query'][:200]}{'...' if len(entry['query']) > 200 else ''}\n\n"
            f"⏱️ *Original time:* {ts.strftime('%I:%M %p')}\n"
            f"✅ *Processed at:* {datetime.now().strftime('%I:%M %p')}"
        )
    
    def generate_recovery_message(self):
        if not self.queue:
            return None
        msg = f"📬 *Recovered Queries*\n\n"
        msg += f"Found *{len(self.queue)}* pending queries from outage.\n\n"
        for entry in sorted(self.queue, key=lambda x: x["timestamp"])[:5]:
            ts = datetime.fromisoformat(entry["timestamp"])
            msg += f"• [{ts.strftime('%I:%M %p')}] {entry['query'][:60]}...\n"
        return msg

# Global queue
queue = QueueManager()

def send_whatsapp(target, message):
    """Send WhatsApp message via OpenClaw"""
    global service_available, last_failure
    
    if not message:
        return {"success": False, "error": "Empty message"}
    
    try:
        safe_msg = message.replace('"', '\\"')
        cmd = f'openclaw message send --target {target} --message "{safe_msg}" --channel whatsapp'
        
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            service_available = True
            log_interaction("outbound", "919003349852@s.whatsapp.net", target, message[:100], status="sent")
            return {"success": True, "target": target}
        else:
            raise Exception(result.stderr)
    
    except Exception as e:
        service_available = False
        last_failure = datetime.now().isoformat()
        return {"success": False, "error": str(e)}

def call_cloud_ai(text):
    """Call Cloud Run AI"""
    global service_available
    
    try:
        data = json.dumps({"text": text}).encode()
        req = urllib.request.Request(
            CLOUD_AI_URL,
            data=data,
            headers={'Content-Type': 'application/json'}
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
            service_available = True
            return result.get('response', {}).get('outputSpeech', {}).get('text', 'OK')
    except Exception as e:
        service_available = False
        return f"Cloud AI error: {e}"

def process_queue():
    """Process all pending queries when service resumes"""
    global service_available
    
    pending = queue.get_pending()
    if not pending:
        return 0
    
    # Check if service is available
    if not service_available:
        return 0
    
    processed = 0
    for entry in list(pending):
        # Get AI response
        response_text = call_cloud_ai(entry['query'])
        
        if not response_text.startswith("Cloud AI error"):
            # Send reply with delay message
            delay_msg = queue.generate_delay_message(entry)
            full_msg = f"{delay_msg}\n\n*Answer:*\n{response_text}"
            
            result = send_whatsapp(entry['user_jid'], full_msg)
            
            if result.get('success'):
                queue.complete(entry['id'], response_text)
                processed += 1
    
    return processed

def check_and_recover():
    """Background task to check for recovery"""
    while True:
        time.sleep(30)
        if service_available:
            processed = process_queue()
            if processed > 0:
                print(f"[Queue] Recovered {processed} queries")

class OmniHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {fmt % args}")
    
    def send_json(self, data, code=200):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    
    def do_GET(self):
        if self.path == '/health':
            self.send_json({
                "status": "ok",
                "service": "omniclaw-fresh",
                "service_available": service_available,
                "last_failure": last_failure,
                "queue": queue.get_summary(),
                "db_summary": {
                    "contacts": len(list_contacts()),
                    "groups": len(list_groups()),
                    "interactions": len(get_recent_interactions(9999))
                }
            })
        elif self.path == '/queue/summary':
            self.send_json(queue.get_summary())
        elif self.path == '/db/contacts':
            self.send_json({"contacts": list_contacts()})
        elif self.path == '/db/groups':
            self.send_json({"groups": list_groups()})
        elif self.path == '/db/summary':
            self.send_json({"summary": export_all()})
        elif self.path == '/queue/pending':
            self.send_json({"pending": queue.get_pending()})
        else:
            self.send_json({
                "service": "OmniCloud API",
                "version": "2.0",
                "queue_manager": True,
                "service_available": service_available
            })
    
    def do_POST(self):
        global service_available, failure_recovery_mode
        
        try:
            length = int(self.headers.get('Content-Length', 0))
            data = json.loads(self.rfile.read(length))
        except:
            return self.send_json({"error": "Invalid JSON"}, 400)
        
        if self.path == '/send':
            result = send_whatsapp(data.get('to', CLIENT_PHONE), data.get('message', ''))
            self.send_json(result)
        
        elif self.path == '/process':
            text = data.get('text', '')
            from_jid = data.get('from', CLIENT_PHONE)
            group_jid = data.get('group_jid')
            
            # If service unavailable, queue the query
            if not service_available:
                entry = queue.add(text, from_jid, "whatsapp", group_jid)
                delay_msg = queue.generate_delay_message(entry)
                return self.send_json({
                    "queued": True,
                    "queued_id": entry["id"],
                    "delay_message": delay_msg,
                    "original_timestamp": entry["timestamp"]
                })
            
            # Get AI response
            ai_response = call_cloud_ai(text)
            send_result = send_whatsapp(from_jid, ai_response)
            
            self.send_json({
                "success": send_result.get('success'),
                "ai_response": ai_response,
                "sent": send_result.get('success'),
                "service_available": service_available
            })
        
        elif self.path == '/queue/add':
            entry = queue.add(
                query=data.get('query'),
                user_jid=data.get('user_jid'),
                channel=data.get('channel', 'whatsapp'),
                group_jid=data.get('group_jid')
            )
            self.send_json({"queued": True, "id": entry["id"]})
        
        elif self.path == '/queue/recover':
            # Trigger manual recovery
            processed = process_queue()
            self.send_json({
                "recovered": processed,
                "remaining": len(queue.get_pending())
            })
        
        elif self.path == '/status':
            self.send_json({
                "service_available": service_available,
                "last_failure": last_failure,
                "queue_size": len(queue.get_pending()),
                "recovered_mode": failure_recovery_mode
            })
        
        else:
            self.send_json({"error": "Unknown endpoint"}, 404)

if __name__ == '__main__':
    print(f"""
╔══════════════════════════════════════════════════════════════╗
║               OMNICLOUD FRESH v2.0                            ║
║            WITH QUEUE MANAGEMENT                             ║
╠══════════════════════════════════════════════════════════════╣
║  Port: {PORT}                                                     ║
║  Queue: {QUEUE_FILE}                              ║
║  Cloud AI: {CLOUD_AI_URL[:40]}...              ║
╠══════════════════════════════════════════════════════════════╣
║  Endpoints:                                                   ║
║    GET  /health         - Health + queue status              ║
║    POST /send           - Send WhatsApp                      ║
║    POST /process        - Process with auto-queue            ║
║    POST /queue/add      - Manual queue add                   ║
║    POST /queue/recover  - Trigger recovery                   ║
╚══════════════════════════════════════════════════════════════╝
    """)
    
    # Start recovery checker
    threading.Thread(target=check_and_recover, daemon=True).start()
    
    server = HTTPServer(('', PORT), OmniHandler)
    print(f"Server running on port {PORT}")
    server.serve_forever()

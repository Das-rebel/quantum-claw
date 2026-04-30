#!/usr/bin/env python3
"""
Group Message Monitor
- Monitors OpenClaw for group @mentions
- Queues missed messages
- Sends delayed replies with timestamps
"""

import subprocess
import json
import time
import os
from datetime import datetime
from pathlib import Path

# Config
GROUP_JID = "120363358972347979@g.us"  # Your group JID
ALEXA_URL = "https://alexa-handler-338789220059.asia-south1.run.app/alexa"

# Queue file
QUEUE_FILE = "/tmp/omniclaw_group_queue.json"

class GroupQueueManager:
    def __init__(self):
        self.queue = self._load()
    
    def _load(self):
        if Path(QUEUE_FILE).exists():
            with open(QUEUE_FILE) as f:
                return json.load(f)
        return []
    
    def _save(self):
        with open(QUEUE_FILE, 'w') as f:
            json.dump(self.queue, f, indent=2)
    
    def add(self, query, from_jid, from_name, timestamp):
        entry = {
            "id": f"gm_{int(time.time() * 1000)}",
            "query": query,
            "from_jid": from_jid,
            "from_name": from_name,
            "group_jid": GROUP_JID,
            "timestamp": timestamp or datetime.now().isoformat(),
            "status": "pending"
        }
        self.queue.append(entry)
        self._save()
        return entry
    
    def get_pending(self):
        return self.queue
    
    def mark_sent(self, entry_id):
        for entry in self.queue:
            if entry["id"] == entry_id:
                entry["status"] = "sent"
                self._save()
                return True
        return False

def send_whatsapp(target, message):
    """Send via OpenClaw"""
    try:
        safe_msg = message.replace('"', '\\"')
        cmd = f'openclaw message send --target {target} --message "{safe_msg}" --channel whatsapp'
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
        return result.returncode == 0
    except:
        return False

def get_ai_response(text):
    """Get AI response from Cloud Run"""
    try:
        import urllib.request
        data = json.dumps({"text": text}).encode()
        req = urllib.request.Request(
            ALEXA_URL,
            data=data,
            headers={'Content-Type': 'application/json'}
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
            return result.get('response', {}).get('outputSpeech', {}).get('text', 'OK')
    except:
        return "Sorry, I'm having trouble connecting to the AI service."

def generate_delay_reply(entry):
    """Generate reply with original timestamp"""
    ts = datetime.fromisoformat(entry["timestamp"])
    now = datetime.now()
    delay = now - ts
    
    hours = int(delay.total_seconds() // 3600)
    minutes = int((delay.total_seconds() % 3600) // 60)
    delay_str = f"{hours}h {minutes}m" if hours > 0 else f"{minutes}m"
    
    return (
        f"📬 *Delayed Reply*\n\n"
        f"⚠️ Sorry for the delay! Your message from *{delay_str} ago* is now being addressed.\n\n"
        f"📝 *Original message:*\n_{entry['query'][:200]}_\n\n"
        f"⏱️ _Sent at: {ts.strftime('%I:%M %p')}_"
    )

def process_queue():
    """Process pending group messages"""
    queue = GroupQueueManager()
    pending = queue.get_pending()
    
    processed = 0
    for entry in list(pending):
        # Get AI response
        response = get_ai_response(entry['query'])
        
        # Send delay message + response
        delay_msg = generate_delay_reply(entry)
        full_msg = f"{delay_msg}\n\n💬 *Response:*\n{response}"
        
        # Send to group (or DM based on config)
        success = send_whatsapp(entry['group_jid'], full_msg)
        
        if success:
            queue.mark_sent(entry['id'])
            processed += 1
            print(f"[Monitor] Sent reply to: {entry['from_name']}")
    
    return processed

def add_to_queue(query, from_jid, from_name, timestamp=None):
    """Manually add a missed message"""
    queue = GroupQueueManager()
    return queue.add(query, from_jid, from_name, timestamp)

def main():
    print("""
╔══════════════════════════════════════════════════════════════╗
║          GROUP MESSAGE MONITOR ACTIVE                        ║
╠══════════════════════════════════════════════════════════════╣
║  Monitors and queues missed group @mentions                  ║
║  Processes delayed replies with timestamps                    ║
╠══════════════════════════════════════════════════════════════╣
║  Commands:                                                   ║
║    python3 group_monitor.py add "<query>" <from_jid> <name>  ║
║    python3 group_monitor.py process                          ║
║    python3 group_monitor.py status                           ║
╚══════════════════════════════════════════════════════════════╝
    """)
    
    import sys
    if len(sys.argv) > 1:
        if sys.argv[1] == "add" and len(sys.argv) >= 5:
            query = sys.argv[2]
            from_jid = sys.argv[3]
            from_name = sys.argv[4]
            ts = sys.argv[5] if len(sys.argv) > 5 else None
            entry = add_to_queue(query, from_jid, from_name, ts)
            print(f"Added to queue: {entry['id']}")
        
        elif sys.argv[1] == "process":
            count = process_queue()
            print(f"Processed {count} messages")
        
        elif sys.argv[1] == "status":
            queue = GroupQueueManager()
            pending = queue.get_pending()
            print(f"Pending: {len(pending)}")
            for e in pending:
                print(f"  - {e['from_name']}: {e['query'][:50]}...")
        
        elif sys.argv[1] == "server":
            # Simple API server
            from http.server import HTTPServer, BaseHTTPRequestHandler
            
            class Handler(BaseHTTPRequestHandler):
                def do_GET(self):
                    if self.path == '/health':
                        queue = GroupQueueManager()
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps({
                            "status": "ok",
                            "pending": len(GroupQueueManager().get_pending())
                        }).encode())
                    elif self.path == '/pending':
                        queue = GroupQueueManager()
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps({"pending": queue.get_pending()}).encode())
                
                def do_POST(self):
                    length = int(self.headers.get('Content-Length', 0))
                    data = json.loads(self.rfile.read(length))
                    
                    if self.path == '/add':
                        entry = add_to_queue(
                            data['query'],
                            data['from_jid'],
                            data['from_name'],
                            data.get('timestamp')
                        )
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps({"queued": True, "id": entry['id']}).encode())
                    
                    elif self.path == '/process':
                        count = process_queue()
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps({"processed": count}).encode())
            
            print("Starting monitor API on port 3002...")
            server = HTTPServer(('', 3002), Handler)
            server.serve_forever()
    else:
        # Auto-process pending
        while True:
            count = process_queue()
            if count > 0:
                print(f"Processed {count} delayed messages")
            time.sleep(60)

if __name__ == '__main__':
    main()

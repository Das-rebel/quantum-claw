#!/usr/bin/env python3
"""
OmniCloud Queue Manager
- Queues failed queries during service outages
- Replays when service resumes
- Notifies users of delays with timestamps
"""

import json
import time
import os
from datetime import datetime
from pathlib import Path

QUEUE_FILE = "/tmp/omniclaw_pending_queue.json"
ARCHIVE_FILE = "/tmp/omniclaw_queue_archive.json"

class QueueManager:
    def __init__(self):
        self.queue_file = Path(QUEUE_FILE)
        self.archive_file = Path(ARCHIVE_FILE)
        self.queue = self._load_queue()
        self.archive = self._load_archive()
    
    def _load_queue(self):
        if self.queue_file.exists():
            with open(self.queue_file, 'r') as f:
                return json.load(f)
        return []
    
    def _save_queue(self):
        with open(self.queue_file, 'w') as f:
            json.dump(self.queue, f, indent=2)
    
    def _load_archive(self):
        if self.archive_file.exists():
            with open(self.archive_file, 'r') as f:
                return json.load(f)
        return []
    
    def _save_archive(self):
        with open(self.archive_file, 'w') as f:
            json.dump(self.archive, f, indent=2)
    
    def add(self, query, user_jid, channel="whatsapp", group_jid=None):
        """Add a pending query to queue"""
        entry = {
            "id": f"q_{int(time.time() * 1000)}",
            "query": query,
            "user_jid": user_jid,
            "channel": channel,
            "group_jid": group_jid,
            "timestamp": datetime.now().isoformat(),
            "queued_at": datetime.now().isoformat(),
            "status": "pending",
            "retry_count": 0
        }
        self.queue.append(entry)
        self._save_queue()
        return entry
    
    def get_pending(self):
        """Get all pending queries"""
        return self.queue
    
    def mark_processing(self, query_id):
        """Mark query as being processed"""
        for entry in self.queue:
            if entry["id"] == query_id:
                entry["status"] = "processing"
                entry["processing_since"] = datetime.now().isoformat()
        self._save_queue()
    
    def mark_completed(self, query_id, response=None):
        """Mark query as completed and archive"""
        for entry in self.queue:
            if entry["id"] == query_id:
                entry["status"] = "completed"
                entry["completed_at"] = datetime.now().isoformat()
                entry["response"] = response
                entry["total_time"] = self._calc_delay(entry)
                self.archive.append(entry)
                self.queue.remove(entry)
        self._save_queue()
        self._save_archive()
    
    def mark_failed(self, query_id, error):
        """Mark query as failed"""
        for entry in self.queue:
            if entry["id"] == query_id:
                entry["status"] = "failed"
                entry["last_error"] = error
                entry["retry_count"] += 1
                entry["last_retry"] = datetime.now().isoformat()
        self._save_queue()
    
    def _calc_delay(self, entry):
        """Calculate total delay"""
        ts = datetime.fromisoformat(entry["timestamp"])
        completed = datetime.fromisoformat(entry["completed_at"])
        return str(completed - ts)
    
    def get_queue_summary(self):
        """Get queue status summary"""
        pending = len([e for e in self.queue if e["status"] == "pending"])
        processing = len([e for e in self.queue if e["status"] == "processing"])
        failed = len([e for e in self.queue if e["status"] == "failed"])
        return {
            "pending": pending,
            "processing": processing,
            "failed": failed,
            "total": len(self.queue),
            "archived": len(self.archive)
        }
    
    def generate_delay_message(self, entry):
        """Generate message about delayed query"""
        ts = datetime.fromisoformat(entry["timestamp"])
        now = datetime.now()
        delay = now - ts
        
        hours = int(delay.total_seconds() // 3600)
        minutes = int((delay.total_seconds() % 3600) // 60)
        
        delay_str = f"{hours}h {minutes}m ago" if hours > 0 else f"{minutes}m ago"
        
        return (
            f"⏰ *Delayed Response*\n\n"
            f"Your query from *{delay_str}* is now being processed:\n\n"
            f"📝 *Query:*\n{entry['query'][:200]}{'...' if len(entry['query']) > 200 else ''}\n\n"
            f"⏱️ *Original time:* {ts.strftime('%I:%M %p')}"
        )
    
    def generate_batch_recovery_message(self):
        """Generate message for batch recovery"""
        if not self.queue:
            return None
        
        summary = self.get_queue_summary()
        entries = sorted(self.queue, key=lambda x: x["timestamp"])[:5]  # First 5
        
        msg = f"📬 *Delayed Queries Recovered*\n\n"
        msg += f"Found *{summary['total']}* pending queries from service outage.\n\n"
        
        for entry in entries:
            ts = datetime.fromisoformat(entry["timestamp"])
            msg += f"• [{ts.strftime('%I:%M %p')}] {entry['query'][:50]}...\n"
        
        if summary['total'] > 5:
            msg += f"\n_+{summary['total'] - 5} more queries_"
        
        return msg

# Simple HTTP API for queue
from http.server import HTTPServer, BaseHTTPRequestHandler

class QueueHandler(BaseHTTPRequestHandler):
    queue = QueueManager()
    
    def log_message(self, fmt, *args):
        print(f"[Queue] {fmt % args}")
    
    def send_json(self, data, code=200):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    
    def do_GET(self):
        if self.path == '/queue/health':
            self.send_json({"status": "ok", "queue_size": len(self.queue.queue)})
        elif self.path == '/queue/summary':
            self.send_json(self.queue.get_queue_summary())
        elif self.path == '/queue/pending':
            self.send_json({"pending": self.queue.get_pending()})
        elif self.path == '/queue/next':
            pending = self.queue.get_pending()
            if pending:
                self.send_json(pending[0])
            else:
                self.send_json({"message": "No pending queries"})
        else:
            self.send_json({"message": "Queue Manager API"})
    
    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            data = json.loads(self.rfile.read(length))
        except:
            return self.send_json({"error": "Invalid JSON"}, 400)
        
        if self.path == '/queue/add':
            entry = self.queue.add(
                query=data.get('query'),
                user_jid=data.get('user_jid'),
                channel=data.get('channel', 'whatsapp'),
                group_jid=data.get('group_jid')
            )
            self.send_json({"queued": True, "id": entry["id"]})
        
        elif self.path == '/queue/complete':
            self.queue.mark_completed(data.get('id'), data.get('response'))
            self.send_json({"completed": True})
        
        elif self.path == '/queue/recover':
            # Generate recovery message
            msg = self.queue.generate_batch_recovery_message()
            self.send_json({"recovery_message": msg, "pending_count": len(self.queue.get_pending())})
        
        elif self.path == '/queue/delay-message':
            # Generate delay message for specific query
            pending = self.queue.get_pending()
            entry = next((e for e in pending if e['id'] == data.get('id')), None)
            if entry:
                self.send_json({"message": self.queue.generate_delay_message(entry)})
            else:
                self.send_json({"error": "Query not found"}, 404)
        
        else:
            self.send_json({"error": "Unknown endpoint"}, 404)

if __name__ == '__main__':
    port = 3001
    print(f"OmniCloud Queue Manager on port {port}")
    server = HTTPServer(('', port), QueueHandler)
    print(f"Queue API: http://localhost:{port}/queue/*")
    print(f"  GET  /queue/health   - Health check")
    print(f"  GET  /queue/pending  - List pending")
    print(f"  POST /queue/add      - Add query")
    print(f"  POST /queue/complete - Mark complete")
    print(f"  POST /queue/recover  - Get recovery message")
    server.serve_forever()

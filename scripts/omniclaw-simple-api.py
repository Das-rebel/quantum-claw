#!/usr/bin/env python3
"""Simple WhatsApp API using OpenClaw CLI"""

import subprocess
import json
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.request
import urllib.parse

PORT = 3000
CLOUD_AI_URL = 'https://alexa-handler-338789220059.asia-south1.run.app/alexa'

def call_openclaw(target, message):
    """Send message via OpenClaw"""
    cmd = f'openclaw message send --target {target} --message "{message}" --channel whatsapp'
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return result.returncode == 0

def call_cloud_ai(text):
    """Call cloud AI"""
    try:
        data = json.dumps({'text': text}).encode()
        req = urllib.request.Request(
            CLOUD_AI_URL,
            data=data,
            headers={'Content-Type': 'application/json'}
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
            return result.get('response', {}).get('outputSpeech', {}).get('text', 'OK')
    except Exception as e:
        return f'Error: {e}'

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/health':
            self.send_json({'status': 'ok', 'service': 'omniclaw'})
        elif self.path == '/status':
            self.send_json({'status': 'openclaw_running'})
        else:
            self.send_json({'message': 'OmniCloud API'})
    
    def do_POST(self):
        content = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        data = json.loads(content)
        
        if self.path == '/send':
            success = call_openclaw(data.get('to'), data.get('message', ''))
            self.send_json({'success': success})
        
        elif self.path == '/process':
            text = data.get('text', '')
            response = call_cloud_ai(text)
            success = call_openclaw(data.get('from', ''), response)
            self.send_json({'success': success, 'response': response})
        
        else:
            self.send_json({'error': 'Unknown endpoint'})
    
    def send_json(self, data):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

if __name__ == '__main__':
    print(f'OmniCloud API on port {PORT}')
    server = HTTPServer(('', PORT), Handler)
    print('Running...')
    server.serve_forever()

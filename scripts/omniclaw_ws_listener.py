#!/usr/bin/env python3
"""
OmniClaw WebSocket Listener
Connects to OpenClaw gateway via WebSocket and listens for WhatsApp inbound messages
"""

import asyncio
import json
import websockets
import subprocess
import re

GATEWAY_URL = "ws://127.0.0.1:18789"
TOKEN = "mysecrettoken"
LOG_FILE = "/tmp/omniclaw-ws-listener.log"

def log(msg):
    """Log to file and print"""
    timestamp = asyncio.get_event_loop().time()
    line = f"[{timestamp}] {msg}"
    print(line)
    with open(LOG_FILE, 'a') as f:
        f.write(line + "\n")

async def call_agent(message, sender):
    """Call OpenClaw agent to generate response"""
    log(f"🤖 Calling agent for message from {sender}")
    
    try:
        result = subprocess.run(
            ['openclaw', 'agent', '--local', '--agent', 'main', 
             '--message', f'WhatsApp message from {sender}: {message}\n\nProvide a brief, helpful response.'],
            capture_output=True, text=True, timeout=60
        )
        
        if result.returncode == 0:
            # Clean response
            lines = [l for l in result.stdout.split('\n') 
                     if l.strip() and not l.startswith('│') and not l.startswith('◇')]
            response = '\n'.join(lines)[:500]
            return response if response.strip() else "Message received!"
        else:
            log(f"❌ Agent error: {result.stderr[:100]}")
            return "Sorry, I had trouble with that."
    except subprocess.TimeoutExpired:
        log("⏱️ Agent timed out")
        return "That took too long."
    except Exception as e:
        log(f"❌ Agent exception: {e}")
        return "Error processing message."

async def send_whatsapp_reply(jid, text):
    """Send reply via openclaw"""
    try:
        result = subprocess.run(
            ['openclaw', 'message', 'send', '--channel', 'whatsapp', 
             '--target', jid, '--message', text],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0:
            log(f"✅ Sent to {jid}")
        else:
            log(f"❌ Send failed: {result.stderr[:100]}")
    except Exception as e:
        log(f"❌ Send exception: {e}")

async def listen():
    """Connect to OpenClaw gateway and listen for events"""
    log("🚀 Starting OmniClaw WebSocket Listener")
    
    headers = {"Authorization": f"Bearer {TOKEN}"}
    
    while True:
        try:
            async with websockets.connect(GATEWAY_URL, extra_headers=headers) as ws:
                log("✅ Connected to OpenClaw gateway")
                
                async for message in ws:
                    try:
                        data = json.loads(message)
                        await process_message(data)
                    except json.JSONDecodeError:
                        continue
                    except Exception as e:
                        log(f"❌ Error processing: {e}")
                        
        except websockets.exceptions.ConnectionClosed as e:
            log(f"⚠️ Connection closed: {e}, reconnecting in 5s...")
            await asyncio.sleep(5)
        except Exception as e:
            log(f"❌ Connection error: {e}, reconnecting in 5s...")
            await asyncio.sleep(5)

async def process_message(data):
    """Process incoming WebSocket message"""
    # Check if this is a WhatsApp inbound message
    msg_type = data.get('type', '')
    
    # Different possible structures
    content = json.dumps(data)
    
    # Look for WhatsApp inbound indicators
    if 'whatsapp' in content.lower() and 'inbound' in content.lower():
        log(f"📩 WhatsApp inbound detected: {content[:200]}")
        
        # Try to extract message content
        # Common patterns in OpenClaw messages
        sender_match = re.search(r'(\+\d+)@s\.whatsapp\.net', content)
        body_match = re.search(r'"body"\s*:\s*"([^"]+)"', content)
        
        if sender_match and body_match:
            sender = sender_match.group(1)
            message = body_match.group(1)
            
            log(f"📩 From {sender}: {message[:50]}...")
            
            # Generate response
            response = await call_agent(message, sender)
            
            # Send reply
            await send_whatsapp_reply(sender, response)

if __name__ == "__main__":
    asyncio.run(listen())

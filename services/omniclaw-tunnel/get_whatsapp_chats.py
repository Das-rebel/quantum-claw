#!/usr/bin/env python3
"""
Get WhatsApp Chats via OpenClaw
"""

import subprocess
import json

# Query OpenClaw for WhatsApp chats
cmd = 'openclaw channels --json 2>/dev/null'
result = subprocess.run(cmd, shell=True, capture_output=True, text=True)

print("OpenClaw Channels Output:")
print(result.stdout[:2000] if result.stdout else "No output")
print(result.stderr[:500] if result.stderr else "")

# Try to get WhatsApp contacts via the gateway API
print("\n\nChecking WhatsApp via OpenClaw gateway...")

# Use the OpenClaw config to find what's available
with open('/Users/Subho/.openclaw/openclaw.json', 'r') as f:
    config = json.load(f)
    print("\nWhatsApp Config:")
    print(json.dumps(config.get('channels', {}).get('whatsapp', {}), indent=2))

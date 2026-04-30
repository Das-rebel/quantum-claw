#!/bin/bash
# Start OmniClaw WhatsApp Auto-Reply

SCRIPT_DIR="/tmp/omniclaw_baileys"

if pgrep -f "omniclaw.js" > /dev/null; then
    echo "OmniClaw is already running (PID: $(pgrep -f omniclaw.js))"
    exit 0
fi

cd "$SCRIPT_DIR"
nohup node omniclaw.js > /tmp/omniclaw.log 2>&1 &
sleep 3

if pgrep -f "omniclaw.js" > /dev/null; then
    echo "✓ OmniClaw started (PID: $(pgrep -f omniclaw.js))"
    echo "  Logs: tail -f /tmp/omniclaw.log"
else
    echo "✗ Failed to start OmniClaw"
    tail -5 /tmp/omniclaw.log
fi

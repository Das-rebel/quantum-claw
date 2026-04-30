#!/bin/bash
# Quick test script

cd ~/omniclaw-fresh

echo "Testing OmniCloud..."
echo ""

echo "1. Local health:"
curl -s http://localhost:3000/health
echo ""

echo "2. Tunnel health:"
TUNNEL=$(cat tunnel_url.txt 2>/dev/null)
if [ -n "$TUNNEL" ]; then
    curl -s "$TUNNEL/health"
else
    echo "No tunnel URL"
fi
echo ""

echo "3. Send test:"
curl -s -X POST http://localhost:3000/send \
    -H "Content-Type: application/json" \
    -d '{"to": "+917977110915", "message": "OmniCloud test! ☁️"}'
echo ""

#!/bin/bash
# Start Cloudflare Tunnel for OmniCloud

TUNNEL_LOG="/tmp/omniclaw_tunnel.log"

echo "🚀 Starting Cloudflare Tunnel..."

# Kill existing
pkill -f "cloudflared tunnel" 2>/dev/null
sleep 2

# Start tunnel
/opt/homebrew/bin/cloudflared tunnel \
    --url http://localhost:3000 \
    --logfile $TUNNEL_LOG \
    --metrics localhost:4040 \
    2>&1 &

# Wait for URL
sleep 10

# Get URL
TUNNEL_URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' $TUNNEL_LOG 2>/dev/null | head -1)

if [ -z "$TUNNEL_URL" ]; then
    echo "❌ Tunnel URL not found yet"
    sleep 5
    TUNNEL_URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' $TUNNEL_LOG 2>/dev/null | head -1)
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "🌐 TUNNEL URL: $TUNNEL_URL"
echo "════════════════════════════════════════════════════════════"
echo ""

# Save
echo "$TUNNEL_URL" > tunnel_url.txt

# Test
echo "Testing tunnel..."
curl -s "$TUNNEL_URL/health" 2>/dev/null && echo "✅ Tunnel working!" || echo "❌ Tunnel test failed"

echo ""
echo "To use from Cloud Run, call:"
echo "  POST $TUNNEL_URL/process"
echo "  POST $TUNNEL_URL/send"

#!/bin/bash
# OmniCloud Fresh v2.0 - With Queue Management

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║               OMNICLOUD FRESH v2.0                            ║"
echo "║            WITH QUEUE MANAGEMENT                             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Kill existing
echo "🧹 Cleaning up..."
pkill -f "omniclaw" 2>/dev/null
pkill -f "cloudflared" 2>/dev/null
sleep 2

# Start API server with queue management
echo "🚀 Starting OmniCloud API server..."
cd ~/omniclaw-fresh
python3 server.py &
sleep 2

# Check server
if curl -s http://localhost:3000/health > /dev/null; then
    echo "✅ API server running on port 3000"
else
    echo "❌ API server failed"
    exit 1
fi

# Start tunnel
echo "🌐 Starting Cloudflare Tunnel..."
./start_tunnel.sh

echo ""
TUNNEL=$(cat tunnel_url.txt 2>/dev/null)
echo "════════════════════════════════════════════════════════════"
echo "🎉 OMNICLOUD FRESH v2.0 READY!"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Local:   http://localhost:3000"
echo "Tunnel:  $TUNNEL"
echo ""
echo "Features:"
echo "  ✓ Queue Management - queries queued during outages"
echo "  ✓ Auto-recovery - processes queued queries when service resumes"
echo "  ✓ Delay notifications - users notified with original timestamps"
echo ""

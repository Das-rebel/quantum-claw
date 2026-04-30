#!/bin/bash
# Start OmniClaw WhatsApp Auto-Reply with Outbox Support

SCRIPT_DIR="/tmp/omniclaw_baileys"
BOT_SCRIPT="omniclaw_v3.js"
LOG_FILE="/tmp/omniclaw_baileys/bot.log"

# Ensure outbox dirs exist
mkdir -p "${SCRIPT_DIR}/outbox" "${SCRIPT_DIR}/outbox/sent"

if pgrep -f "${BOT_SCRIPT}" > /dev/null; then
    echo "OmniClaw is already running (PID: $(pgrep -f "${BOT_SCRIPT}"))"
    exit 0
fi

cd "$SCRIPT_DIR"
nohup node "${BOT_SCRIPT}" > "${LOG_FILE}" 2>&1 &
sleep 5

if pgrep -f "${BOT_SCRIPT}" > /dev/null; then
    echo "OmniClaw started (PID: $(pgrep -f "${BOT_SCRIPT}"))"
    echo "  Logs: tail -f ${LOG_FILE}"
    echo "  Outbox: ${SCRIPT_DIR}/outbox/"
else
    echo "Failed to start OmniClaw"
    tail -10 "${LOG_FILE}"
fi

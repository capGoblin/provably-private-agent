#!/bin/bash
# One-command demo starter for Provably Private Agent.
# Starts the demo server + opens the browser.
# Use before recording the demo video.

set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Source project env (PATH + XDG_CONFIG_HOME for stellar CLI)
if [ -f "$ROOT/.envrc" ]; then
  source "$ROOT/.envrc"
fi

# Check local Soroban is running
if ! curl -sf -X POST "$RPC_URL/getHealth" -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' > /dev/null 2>&1; then
  echo "❌ Soroban RPC at $RPC_URL not reachable."
  echo "Start local Stellar first: docker start stellar-stellar-local"
  echo "Or update RPC_URL in .env"
  exit 1
fi

# Make sure the executor contract is reachable
EXECUTOR_ID=$(grep -E '^EXECUTOR_ID=' .env | head -1 | cut -d= -f2)
if [ -z "$EXECUTOR_ID" ]; then
  echo "❌ EXECUTOR_ID not set in .env"
  exit 1
fi

# Fresh agent DB (so cycle 0 fires a clean BUY shock)
echo "→ Resetting agent DB for clean demo run..."
rm -f agent/.data/agent.db

# Start demo server
echo "→ Starting demo server on http://localhost:3000..."
cd "$ROOT/demo"
node server.js > /tmp/demo_server.log 2>&1 &
DEMO_PID=$!
cd "$ROOT"
sleep 2

# Open browser
echo "→ Opening browser..."
open http://localhost:3000 2>/dev/null || xdg-open http://localhost:3000 2>/dev/null || echo "  (open http://localhost:3000 manually)"

echo ""
echo "✅ Demo ready."
echo "   • Click '🚀 Run Agent (Submit Trade)' for a real trade"
echo "   • Click '🔒 Tamper Proof Byte' for the negative test"
echo "   • Click '⚠️ Generate Proof Violating Rate Limit' for negative test #2"
echo ""
echo "Demo server PID: $DEMO_PID (logs at /tmp/demo_server.log)"
echo "Stop with: kill $DEMO_PID"
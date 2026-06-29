#!/usr/bin/env bash
# Setup script for Provably Private Agent
# Installs all project-local dependencies (no global installs)
# Usage: bash bin/install.sh

set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Provably Private Agent setup"
echo

# 1. Docker (system dep)
if ! command -v docker >/dev/null; then
  echo "❌ Docker not found. Install Docker Desktop first."
  exit 1
fi

# 2. Node.js (system dep)
if ! command -v node >/dev/null; then
  echo "❌ Node.js not found. Install Node 20+ first."
  exit 1
fi

# 3. Rust + wasm target
if ! command -v rustup >/dev/null; then
  echo "==> Installing Rust via rustup..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile minimal --no-modify-path
  export RUSTUP_HOME="$ROOT/.rustup"
  export CARGO_HOME="$ROOT/.cargo"
  . "$ROOT/.cargo/env"
fi
rustup target add wasm32v1-none --toolchain stable
rustup target add wasm32-unknown-unknown --toolchain stable

# 4. stellar-cli
if ! [ -x "$ROOT/.cargo/bin/stellar" ]; then
  echo "==> Installing stellar-cli..."
  cargo install --locked stellar-cli --root "$ROOT/.cargo"
fi

# 5. Noir (noirup + nargo)
if ! [ -x "$ROOT/.nargo/bin/nargo" ]; then
  echo "==> Installing noirup + nargo..."
  mkdir -p "$ROOT/.nargo/bin"
  curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install -o "$ROOT/bin/noirup"
  chmod +x "$ROOT/bin/noirup"
  NARGO_HOME="$ROOT/.nargo" "$ROOT/bin/noirup" -v 1.0.0-beta.9
  # Move binaries from default install path to project
  mkdir -p ~/.nargo/bin 2>/dev/null || true
  mv ~/.nargo/bin/* "$ROOT/.nargo/bin/" 2>/dev/null || true
  rmdir ~/.nargo/bin ~/.nargo 2>/dev/null || true
fi

# 6. Barretenberg (bb)
if ! [ -x "$ROOT/.bb/bb" ]; then
  echo "==> Installing bb (Barretenberg 0.87.0)..."
  mkdir -p "$ROOT/.bb"
  BB_HOME="$ROOT/.bb" "$ROOT/bin/bbup" -v 0.87.0
fi

# 7. npm deps
echo "==> Installing npm dependencies..."
npm install --save-dev

# 8. Stellar Quickstart (Docker)
if ! docker ps --format '{{.Names}}' | grep -q stellar; then
  echo "==> Starting Stellar Quickstart..."
  export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"
  stellar container start -t future --name stellar-local --limits unlimited -p 8130:8000 || \
  stellar container start -t future --name stellar-local --limits unlimited
  echo "Waiting for friendbot..."
  for i in {1..30}; do
    sleep 5
    if curl -s "http://localhost:8130/friendbot?addr=GAHA2ALO53N5WN6NYBZQSJUPKZ3TWNCME2WPRR66YVP5AIOY23IXLYRT" | grep -q successful; then
      echo "✓ Friendbot ready"
      break
    fi
  done
fi

# 9. Network config
echo "==> Configuring local network..."
stellar network add local \
  --rpc-url http://localhost:8130/soroban/rpc \
  --network-passphrase "Standalone Network ; February 2017" || true
stellar network use local

# 10. Identity + funding
stellar keys generate deployer --network local || true
stellar keys fund deployer --network local || true
stellar keys generate agent-owner --network local || true
stellar keys fund agent-owner --network local || true

# 11. Build circuit
echo "==> Building circuit..."
cd "$ROOT/circuits/strategy_policy"
export PATH="$ROOT/.nargo/bin:$PATH"
nargo execute
"$ROOT/.bb/bb" prove \
  --scheme ultra_honk --oracle_hash keccak \
  --bytecode_path ./target/strategy_policy.json \
  --witness_path ./target/strategy_policy.gz \
  --output_path ./target --output_format bytes_and_fields
"$ROOT/.bb/bb" write_vk \
  --scheme ultra_honk --oracle_hash keccak \
  --bytecode_path ./target/strategy_policy.json \
  --output_path ./target --output_format bytes_and_fields

# 12. Build contracts
echo "==> Building contracts..."
cd "$ROOT/contracts/policy"
"$ROOT/.cargo/bin/stellar" contract build
cd "$ROOT/contracts/executor"
"$ROOT/.cargo/bin/stellar" contract build

# 13. Generate ed25519 verifier keypair (demo)
if [ ! -f /tmp/verifier_priv.hex ]; then
  echo "==> Generating demo verifier keypair..."
  node -e "
    const crypto = require('crypto');
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const privRaw = privateKey.export({ type: 'pkcs8', format: 'der' }).slice(-32);
    const pubRaw = publicKey.export({ type: 'spki', format: 'der' }).slice(-32);
    require('fs').writeFileSync('/tmp/verifier_priv.hex', privRaw.toString('hex'));
    require('fs').writeFileSync('/tmp/verifier_pub.hex', pubRaw.toString('hex'));
  "
fi

# 14. Deploy executor
echo "==> Deploying executor..."
cd "$ROOT"
export PATH="$ROOT/.cargo/bin:$ROOT/.nargo/bin:$ROOT/.bb:$PATH"
export XDG_CONFIG_HOME="$ROOT/.config"
PUBKEY=$(cat /tmp/verifier_pub.hex)
RESPONSE=$("$ROOT/.cargo/bin/stellar" contract deploy \
  --wasm "$ROOT/contracts/executor/target/wasm32v1-none/release/executor.wasm" \
  --source deployer \
  --network local \
  -- \
  --verifier_pubkey "$PUBKEY" \
  --vk_bytes-file-path "$ROOT/circuits/strategy_policy/target/vk" 2>&1)
EXECUTOR_ID=$(echo "$RESPONSE" | grep -oE 'C[A-Z0-9]{55}' | tail -1)
echo "EXECUTOR_ID=$EXECUTOR_ID" > "$ROOT/.env"

# 15. Done
echo ""
echo "==> ✅ Setup complete!"
echo ""
echo "Executor ID: $EXECUTOR_ID"
echo ""
echo "Next: cd $ROOT/demo && node server.js"
echo "Then open http://localhost:3000"
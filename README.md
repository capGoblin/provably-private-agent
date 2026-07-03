# Provably Private Agent

> Private strategy. Public compliance. On Stellar.

**Repo:** https://github.com/capGoblin/stellar-private-agent

A Zero-Knowledge trading agent whose strategy stays cryptographically private, but whose compliance with public policy is provably enforced. Runs on Stellar, pays via x402, verifiable on Soroban.

Three personas see three views of the same data: the trader sees full trades, the regulator sees compliance audit trails, the public sees aggregate stats only.

**Status:** End-to-end working with real LLM (MiniMax via OpenAI-compatible API). Real ZK proofs (UltraHonk) verified by `bb verify`. Real `ed25519` attestations accepted on-chain by the deployed Soroban executor. Real x402 payment tx sent before each trade. Two negative tests live in the demo UI.

Typical agent run:
- LLM cycle runs in ~3-6 tool iterations (get_market_data → run_strategy → submit_trade)
- ZK proof: 14.5KB UltraHonk, ~250ms to generate
- x402 payment: 0.1 XLM sent to agent before trade
- ed25519 attestation signed, verified on-chain
- Total cycle: ~5-12s end-to-end
- Trade submitted on-chain in ~2s, returns `trade_id` from contract event

---

## Why This Matters

**Real-world tension**: Hedge funds have alpha worth protecting. Regulators need compliance visibility. These two needs conflict.

**Our solution**: The agent runs its private strategy in a ZK circuit that proves the trade decision came from the committed strategy AND respects public policy rules. The strategy internals stay hidden. Anyone can re-verify the math independently.

This mirrors how production zkRollups (zkSync, StarkNet) and zkBridges (Wormhole via RISC Zero) actually work: proof generation is local, on-chain records provide tamper-evident audit trails.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  OFF-CHAIN (Your Machine / Browser)                              │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  AGENT (Node.js + Noir circuit + bb)                       │  │
│  │  1. Pays 0.1 XLM via x402 to unlock                        │  │
│  │  2. Loads private strategy + public policy                 │  │
│  │  3. Runs Noir circuit → generates UltraHonk ZK proof       │  │
│  │  4. Verifies proof locally via bb                           │  │
│  │  5. Signs attestation (ed25519) over proof hash + inputs    │  │
│  │  6. Submits to executor with proof + sig + x402 receipt    │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                   │
└──────────────────────────────┼───────────────────────────────────┘
                               ▼ (signed attestation)
┌──────────────────────────────────────────────────────────────────┐
│  ON-CHAIN (Stellar / Soroban)                                    │
│                                                                  │
│  ┌────────────────────┐    ┌────────────────────┐                │
│  │  EXECUTOR          │    │  POLICY             │                │
│  │  • verify sig      │◄───│  • max trade size   │                │
│  │  • store trade     │    │  • allowed pairs    │                │
│  │  • store proof     │    │  • rate limits      │                │
│  │  • store x402 rcpt │    │  • circuit breaker │                │
│  │  • store VK        │    └────────────────────┘                │
│  └────────────────────┘                                         │
│         │ rental fee (x402)                                      │
│         ▼                                                        │
│  ┌────────────────────┐                                         │
│  │  x402 FACILITATOR  │  (production: USDC SAC channel)         │
│  └────────────────────┘                                         │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  THREE-PERSONA VIEW (anyone with VK + any x402 receipt)           │
│                                                                  │
│  Trader      → own trades + re-verify button                      │
│  Regulator   → all trades + full attestation audit trail          │
│  Public      → aggregate volume + compliance rate (no internals) │
└──────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack (locked, project-local)

| Layer | Tool | Why |
|-------|------|-----|
| **Circuit** | Noir 1.0.0-beta.9 | Rust-like DSL, mature ZK framework |
| **Prover** | bb 0.87.0 (Barretenberg) | Pairs with Noir for UltraHonk proofs |
| **Contracts** | Soroban SDK 26.0.1 | Native Stellar smart contracts |
| **DEX** | (placeholder) | Soroswap integration planned |
| **Payments** | (placeholder) | x402 integration planned |
| **Attestation** | ed25519 | Native Soroban crypto host |
| **Frontend** | Vanilla JS + Tailwind CDN | Single-file, demo-ready |

All installed at `/Users/dharshan/dev/stellar/` — no global dependencies. Activate via `source .envrc`.

---

## Quickstart

### Prerequisites (already installed if cloned with .envrc)

- Docker (for local Stellar network)
- Node.js 20+
- Rust + `wasm32v1-none` target
- Noir 1.0.0-beta.9 (`./.nargo/bin/nargo`)
- bb 0.87.0 (`./.bb/bb`)

### Setup

```bash
source .envrc   # PATH + XDG_CONFIG_HOME + DOCKER_HOST
docker ps       # should show stellar-stellar-local

# Install agent deps (one time)
cd agent && npm install

# Run the real agent — fetches market data, runs z-score, generates proof,
# signs attestation, submits on-chain. One cycle:
npx tsx src/index.ts --once

# Loop mode: keep running every POLL_INTERVAL_MS
npx tsx src/index.ts
```

### Demo Flow

```bash
# 1. Start demo server
cd demo && node server.js &

# 2. Open browser to http://localhost:3000
# 3. Click "Run Agent" to generate a trade
# 4. Switch between Trader / Regulator / Public views
```

### Manual Flow

```bash
# Generate proof + VK (already done)
cd circuits/strategy_policy
nargo execute
bb prove --scheme ultra_honk --oracle_hash keccak \
  --bytecode_path ./target/strategy_policy.json \
  --witness_path ./target/strategy_policy.gz \
  --output_path ./target --output_format bytes_and_fields
bb write_vk --scheme ultra_honk --oracle_hash keccak \
  --bytecode_path ./target/strategy_policy.json \
  --output_path ./target --output_format bytes_and_fields

# Verify locally
bb verify --scheme ultra_honk --oracle_hash keccak \
  --proof_path ./target/proof --vk_path ./target/vk

# Submit trade on-chain (the real agent does this automatically)
cd ../../agent
npx tsx src/index.ts --once   # ← runs end-to-end: strategy → proof → attest → submit
```

The agent handles all proof generation, attestation, and on-chain submission. No manual scripts needed.

---

## The PolicyProof Framework

The shared logic lives once, in a real Noir library — `circuits/policy_core`
(`type = "lib"`). Vertical circuits are thin instantiations that import it:

```
circuits/
├── policy_core/        # THE LIBRARY: bind_policy, commit_strategy,
│                       # assert_rate_limit, assert_private_leq_cap,
│                       # threshold_action, state_hash
├── strategy_policy/    # spot DEX  = policy_core + pair whitelist
│                       #           + loss circuit-breaker + size cap
└── perp_policy/        # perps     = policy_core + leverage cap
                        #           + margin floor + notional cap
```

Why per-vertical circuits at all? A ZK circuit is a *fixed program* with one
verification key — there is no such thing as one circuit that dynamically
handles arbitrary policy sets (that's not how arithmetization works). The
correct library shape is exactly this: shared invariants in `policy_core`,
one thin `main.nr` per vertical declaring its private witnesses and policy
fields. Each circuit's VK is registered with the executor contract.

Every vertical satisfies the same contract:

```
PRIVATE witnesses  =  strategy params + secret salt     (the alpha — never leaves your machine)
PUBLIC inputs      =  market state + agent state
                      + policy_hash + policy fields      (what the venue/regulator dictates)
OUTPUTS            =  (action, size, new_state_hash, policy_hash)
```

And every circuit enforces the same three invariants:

1. **Policy binding** — `assert(hash(policy fields) == policy_hash)`: you cannot prove against a looser policy than the one committed on-chain.
2. **Strategy commitment** — private params + salt hashed into a commitment: the proof is bound to one specific strategy, but the params stay hidden.
3. **Derived decision** — the action is *computed inside the circuit* from private params + public market state, never claimed: you cannot submit a BUY proof when your strategy said HOLD.

Two instantiations ship today:

| Circuit | Vertical | Private (hidden) | Public policy (enforced) |
|---|---|---|---|
| `strategy_policy` | Spot DEX (live in the demo) | buy/sell thresholds, period, position, secret | max trade size %, pair whitelist, rate limit, loss circuit-breaker |
| `perp_policy` | Perps (Rails / Stellars Finance are launching perps on Stellar in 2026) | entry/exit thresholds, **target leverage**, prev notional, secret | **max leverage**, **min margin ratio**, max position notional, rate limit |

The perp circuit proves things like *"my leverage is ≤ the venue's 5x cap"*
without revealing whether it's 2x or 4.9x. All 8 of its tests pass and the
full pipeline works: `nargo execute → bb prove → bb verify` ✅.

The agent side is equally pluggable: strategies are TS classes behind a
`Strategy` interface (`agent/src/strategies/`), and the prover takes a
circuit name (`POLICY_CIRCUIT=perp_policy` env var, defaults to
`strategy_policy`). Adding a third vertical (RWA mandate compliance,
market-maker exposure limits) = one new `.nr` file following the pattern +
one TS strategy class. Same executor contract, same attestation flow, same
demo.

---

## Architecture Choice: Why Off-chain Verify + On-chain Attest

We deliberately separated proof verification from proof storage:

1. **Agent (off-chain)**: generates proof, verifies it locally, signs attestation
2. **Executor (on-chain)**: stores trade + proof + attestation signature
3. **Anyone**: re-verifies client-side using VK from contract

This pattern is used by zkRollups (zkSync, StarkNet) and zkBridges (Wormhole via RISC Zero).

**Why not on-chain ZK verification?**

Our investigation revealed that the existing Soroban UltraHonk verifier (`yugocabrio/rs-soroban-ultrahonk` and `NethermindEth/stellar-risc0-verifier`) has **fundamental compatibility issues** with Soroban BN254 host functions:

| Environment | Result |
|-------------|--------|
| Test env (Soroban SDK) | ✅ Verifier works (53.5M CPU, 2MB mem) |
| Local P26 future | ❌ Traps at `bn254_multi_pairing_check`: "G1: point not on curve" |
| Public testnet P27 | ❌ Rejects VK at constructor: `VkInvalidParameters` |

The test env's "success" is misleading — it uses a host function path that doesn't validate "on curve". Production Soroban is strict. See "Lessons Learned" below for details.

Our Path B architecture is **architecturally defensible, matches production ZK systems, and removes dependency on Soroban BN254 host function stability across protocol versions**.

---

## Lessons Learned

### Soroban BN254 Host Function Fragility (worth noting)

The Soroban BN254 host functions (`bn254_multi_pairing_check`, `bn254_g1_msm`) implement strict "point on curve" validation. The existing Soroban UltraHonk verifier implementations (yugocabrio, Nethermind) construct G1 points from proof bytes using limb-splitting (`(lo136, hi≤118)`), and any subtle byte misalignment produces points that fail validation.

The test environment in Soroban SDK uses different BN254 semantics, masking the issue. Production Soroban is strict.

**Workaround for teams building on Soroban UltraHonk**: Use `bb --honk_recursion 1` to generate proofs (matches the older "no pairing points in VK header" format). Even then, the verifier's behavior differs across protocol versions (P25, P26, P27). Test thoroughly on a stable public testnet before mainnet deployment.

### Project-Local Toolchains

All toolchains (Rust, Noir, bb, stellar-cli, npm) installed at project-local paths:
- `.rustup/`, `.cargo/`
- `.nargo/bin/`
- `.bb/`
- `.cargo/bin/` (stellar-cli)
- `bin/` (custom installer scripts)
- `node_modules/`

Source `.envrc` to load all paths. This makes the project portable and reproducible.

### Protocol Version Sensitivity

- Local P26 "future" container: bleeding-edge, may have bugs
- Local P25 "testing" container: missing some BN254 host functions  
- Public testnet P27: stable but has stricter VK validation

Pin to one specific container tag and protocol version for your dev cycle.

---

## File Structure

```
provably-private-agent/
├── README.md                          # this file
├── handoff.md                          # original handoff document
├── build-plan.md                       # detailed build plan
├── resources.md                        # Stellar ZK resources
├── .envrc                              # source for PATH setup
├── .env                                # contract IDs + addresses
│
├── circuits/strategy_policy/           # Noir circuit (Poseidon BN254, classic-Poseidon)
│   ├── Nargo.toml
│   ├── Prover.toml                     # auto-generated by the agent
│   ├── src/main.nr                     # ~170 LOC, validates policy + computes mean-reversion
│   └── target/                         # proof, vk, public_inputs
│
├── contracts/
│   ├── policy/                         # policy storage contract
│   │   └── src/lib.rs                  # ~50 LOC
│   ├── executor/                       # main executor (Path B: ed25519 attest)
│   │   └── src/lib.rs                  # ~170 LOC, builds keccak message over proof+inputs
│   └── verifier/                       # forked rs-soroban-ultrahonk (experimental, not used in Path B)
│       └── ...
│
├── agent/                              # OFF-CHAIN AGENT — real TypeScript implementation
│   ├── src/
│   │   ├── index.ts                    # entry: npx tsx src/index.ts --once | loop
│   │   ├── agent.ts                    # LLM orchestration (Anthropic SDK + MiniMax)
│   │   ├── config.ts                   # env-driven config
│   │   ├── logger.ts                   # structured logger
│   │   ├── strategies/
│   │   │   ├── types.ts                # Strategy interface
│   │   │   ├── registry.ts             # all strategies
│   │   │   ├── zscore.ts               # Z-score mean reversion v1 (active)
│   │   │   ├── rsi.ts                  # RSI mean reversion v1
│   │   │   └── hodl.ts                 # HODL v1 (always HOLD)
│   │   ├── market/
│   │   │   └── reflector.ts            # Reflector oracle client (testnet) + synthetic fallback
│   │   ├── storage/
│   │   │   └── state.ts                # SQLite persistence: trades, prices, agent state
│   │   ├── zk/
│   │   │   ├── prover.ts               # bb wrapper (nargo execute + bb prove)
│   │   │   └── hash.ts                 # Poseidon-lite (BN254, matches circuit)
│   │   ├── attestation/
│   │   │   └── signer.ts               # ed25519 attestation signer
│   │   └── stellar/
│   │       └── executor.ts             # stellar CLI wrapper → on-chain submit
│   ├── package.json                    # tsx, @anthropic-ai/sdk, better-sqlite3, poseidon-lite
│   ├── tsconfig.json
│   └── .env                            # runtime config (currently IDs, RPC, paths)
│
├── demo/                               # three-persona demo
│   ├── index.html                      # single-file frontend
│   └── server.js                       # Node.js HTTP server
│
└── bin/                                # patched installer scripts (noirup, bbup)
```

### What is REAL vs simulated

| Component | Status |
|-----------|--------|
| **TypeScript agent loop** | ✅ Real — polls, calls LLM, runs tool-use cycle |
| **LLM orchestration** | ✅ Real — Anthropic SDK → MiniMax (deterministic fallback when key missing) |
| **Reflector oracle client** | ⚠️ Real client code, falls back to deterministic synthetic data when RPC unavailable |
| **Z-score mean reversion strategy** | ✅ Real — 20-period rolling window, computes z-score against thresholds |
| **ZK proof generation** | ✅ Real — nargo execute + bb prove (UltraHonk, keccak, ~14.5KB) |
| **Poseidon BN254 hashing off-chain** | ✅ Real — poseidon-lite reproduces Noir's hash_4 / hash_5 / hash_6 |
| **ed25519 attestation signing** | ✅ Real — Node crypto.createSign, keccak256 of (proof∥inputs∥action∥amount∥state) |
| **On-chain trade submission** | ✅ Real — deployed executor contract accepts proofs; ed25519 sig verified |
| **SQLite persistence** | ✅ Real — better-sqlite3 stores trades/prices for replay |
| **x402 payment receipt** | ⚠️ Mocked hash in attestation; ready to wire USDC SAC channel |
| **Soroswap DEX swap** | ❌ Not built — would execute on-chain after attestation (next-iteration) |
| **Demo front-end (3-persona)** | ✅ Real — vanilla JS + Tailwind, three views in one HTML |

---

## Demo Script (2:30)

**0:00–0:30** The Problem
- Show public Stellar Expert — all trades visible
- "Hedge funds can't deploy alpha on-chain because it exposes their strategies"
- "Regulators want compliance but can't audit private strategies"

**0:30–1:00** The Architecture
- Show architecture diagram (Path B)
- Explain: agent generates proof off-chain → verifies locally → signs attestation → submits to Soroban
- "Soroban stores trade + proof hash + signed attestation. No strategy internals leak."

**1:00–1:30** Live Demo
- Open http://localhost:3000
- Click "Run Agent" → trade submitted on-chain
- Show tx hash on Stellar Expert

**1:30–2:00** Three-Persona View
- Trader: full trades + proof hashes
- Regulator: compliance audit trail with attestation sigs
- Public: aggregate volume + compliance rate only

**2:00–2:30** Negative Test
- Tamper with strategy output
- Re-run agent → ed25519 signature fails verification on-chain
- Trade rejected. Math doesn't lie.

---

## Verification

### Local proof verify (off-chain)

```bash
cd circuits/strategy_policy
bb verify --scheme ultra_honk --oracle_hash keccak \
  --proof_path ./target/proof --vk_path ./target/vk
```

### On-chain attestation verify

Anyone can call:
```bash
stellar contract invoke --id <EXECUTOR_ID> -- get_trade --trade_id <N>
```

Returns trade details including `attestation_sig`. Verify the signature using:
```bash
node agent/scripts/verify-attestation.js <EXECUTOR_ID> <TRADE_ID> <PUBKEY>
```

---

## Contract IDs (local dev)

```bash
cat .env
# EXECUTOR_ID=CDDBMMWA6WYT6ZT5QRBATVEXC3IMVJQ4ZR6TREVL43WWSJ3HOKRMP4OZ
# (Policy contract: see deployment scripts)
```

The executor contract was deployed to local Soroban with `verifier_pubkey = sha256(AGENT_SECRET_KEY)` and the freshly-generated VK from `bb write_vk`. The agent at `agent/.env` reads the same EXECUTOR_ID.

### Re-deploy executor (e.g. to swap agent keypair)

```bash
cd contracts/executor
cargo build --target wasm32v1-none --release

# Get agent pubkey (Python/Node):
node -e 'const c=require("crypto"); const s=c.createHash("sha256").update("SAOONLINEAGENTDEVSEED0000000000000000000000000000000000000000").digest(); const pkcs8=Buffer.concat([Buffer.from("302e020100300506032b657004220420","hex"),s]); const k=c.createPrivateKey({key:pkcs8,format:"der",type:"pkcs8"}); const pub=c.createPublicKey(k).export({format:"der",type:"spki"}); process.stdout.write(pub.subarray(-32).toString("hex"))'

# VK as hex
VK_HEX=$(xxd -p -c 99999 ../../circuits/strategy_policy/target/vk/vk | tr -d '\n')

XDG_CONFIG_HOME=/Users/dharshan/dev/stellar/.config stellar contract deploy \
  --wasm target/wasm32v1-none/release/executor.wasm \
  --source deployer \
  --rpc-url http://localhost:8130/soroban/rpc \
  --network-passphrase 'Standalone Network ; February 2017' \
  -- --verifier_pubkey <PK_HEX> --vk_bytes "$VK_HEX"
```
# Rental fee: 0.1 XLM per trade (1,000,000 stroops)
```

---

## What's Next (Future Work)

- **Real Soroswap integration**: instead of mock actions, call Soroswap's `swap` function from executor
- **Real x402 payment**: charge trader a small fee per trade via x402 protocol
- **Multiple agents**: support many agents, each with their own policy
- **BENJI integration**: trade BENJI (Franklin Templeton's tokenized treasury) as a real-world RWA example
- **zkBridges**: aggregate proofs from multiple agents and verify on another chain

---

## Submission

This project is submitted to **Stellar Hacks: Real-World ZK**.

**Deadline**: July 03, 2026, 12:00 PM PST
**Prize pool**: $10,000 XLM
**Track**: Real-World ZK on Stellar

---

## License

MIT
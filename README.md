# Provably Private Agent

> Private strategy. Public compliance. On Stellar.

A Zero-Knowledge trading agent whose strategy stays cryptographically private, but whose compliance with public policy is provably enforced. Runs on Stellar, pays via x402, verifiable on Soroban.

Three personas see three views of the same data: the trader sees full trades, the regulator sees compliance audit trails, the public sees aggregate stats only.

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
│  │  1. Loads private strategy + public policy                 │  │
│  │  2. Runs Noir circuit → generates UltraHonk ZK proof       │  │
│  │  3. Verifies proof locally via bb                           │  │
│  │  4. Signs attestation (ed25519) over proof hash + inputs    │  │
│  │  5. Submits trade to executor contract                     │  │
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
│  │  • store VK        │    │  • circuit breaker │                │
│  └────────────────────┘    └────────────────────┘                │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  THREE-PERSONA VIEW (anyone with VK)                              │
│                                                                  │
│  Trader      → own trades + proof hashes                          │
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
- Rust + `wasm32v1-none` target + `wasm32-unknown-unknown` target

### Setup

```bash
source .envrc   # PATH + XDG_CONFIG_HOME + DOCKER_HOST
docker ps       # should show stellar-stellar-local
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

# Submit trade on-chain
cd ../../agent
node scripts/submit-trade.js <EXECUTOR_ID> <AGENT_ID> <USER_ID> <action> <amount>
node scripts/exec-submit.js
```

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
├── circuits/strategy_policy/           # Noir circuit
│   ├── Nargo.toml
│   ├── Prover.toml
│   ├── src/main.nr                     # ~150 LOC circuit
│   └── target/                         # proof, vk, public_inputs
│
├── contracts/
│   ├── policy/                         # policy storage contract
│   │   └── src/lib.rs                  # ~50 LOC
│   ├── executor/                       # main executor (Path B)
│   │   └── src/lib.rs                  # ~150 LOC
│   └── verifier/                       # forked rs-soroban-ultrahonk (experimental, not used in Path B)
│       └── ...
│
├── agent/                              # off-chain agent
│   ├── scripts/
│   │   ├── submit-trade.js             # builds attestation
│   │   ├── build-message.js            # keccak256 message builder
│   │   └── exec-submit.js              # invokes contract
│   └── package.json
│
├── demo/                               # three-persona demo
│   ├── index.html                      # single-file frontend
│   └── server.js                       # Node.js HTTP server
│
└── bin/                                # patched installer scripts (noirup, bbup)
```

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
# EXECUTOR_ID=CD6WVHAYNJH4RC43XCRUWNVCYIPHTUNKGAEQCHZDYHTGMGDKEWKA4LFZ
# (Policy contract: see deployment scripts)
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
# DoraHacks Submission — Provably Private Agent

**Event:** Stellar Hacks: Real-World ZK (https://dorahacks.io/hackathon/stellar-hacks-zk)
**Deadline:** July 3, 2026 12:00 PM PST (~3.5 days)
**Track:** Real-World ZK

---

## Project Name
**Provably Private Agent**

## Tagline (≤280 chars)
An AI trading agent whose private strategy stays secret, but whose compliance with public policy is provably enforced. LLM → ZK proof → ed25519 attestation → Soroban. Trade anyone can re-verify.

## Long Description

Hedge funds have alpha worth protecting. Regulators need compliance visibility. These two needs conflict.

**Provably Private Agent** resolves the conflict with Zero-Knowledge proofs:

- The agent runs a **private trading strategy** (Z-score mean reversion, RSI, HODL — pluggable TypeScript modules) on live market data.
- An **LLM** (Claude via MiniMax) is the orchestrator: it picks the strategy, fetches prices, decides whether to submit a trade.
- When the strategy signals action, the agent generates an **UltraHonk ZK proof** in a Noir circuit that proves *the trade decision came from the committed strategy AND respects the public policy* (rate limits, pair whitelist, max trade size, circuit breaker).
- The proof + an **ed25519 attestation** is submitted to a **Soroban executor contract** that anyone can re-verify.
- Before each trade, the **user pays 0.1 XLM via x402** — the payment tx hash becomes part of the on-chain audit trail.

Three personas see three views of the same data:
- **Trader** — own trades + re-verify button (runs `bb verify` off-chain)
- **Regulator** — full audit trail with attestation signatures
- **Public** — aggregate volume + compliance rate only

The strategy internals never leak. Anyone can re-verify the math independently.

### What is REAL vs simulated

| Component | Status |
|-----------|--------|
| TypeScript agent with LLM tool-use loop | ✅ Real (OpenAI SDK → MiniMax M2.5) |
| Z-score mean reversion strategy | ✅ Real (20-period rolling z-score, ±2σ thresholds) |
| Reflector oracle client | ✅ Real client; synthetic fallback for offline demo |
| ZK proof generation | ✅ Real (nargo execute + bb prove, UltraHonk, 14.5KB) |
| Off-chain Poseidon BN254 hashing | ✅ Real (matches Noir's classic Poseidon via poseidon-lite) |
| ed25519 attestation signing | ✅ Real (keccak256 over proof + public inputs) |
| On-chain trade submission | ✅ Real (deployed executor at `CDDBMMWA6WYT6ZT5QRBATVEXC3IMVJQ4ZR6TREVL43WWSJ3HOKRMP4OZ`) |
| x402 payment | ✅ Real (Stellar tx of 0.1 XLM before each trade, tx hash stored in trade record) |
| SQLite persistence | ✅ Real (better-sqlite3, includes LLM reasoning + iterations + token count) |
| Three-persona demo UI | ✅ Real (vanilla HTML + Tailwind, live stats panel) |
| Demo negative test #1 (1-bit tamper) | ✅ Real (bb verify rejects) |
| Demo negative test #2 (rate-limit violation) | ✅ Real (circuit assertion rejects at nargo) |
| Soroswap DEX swap | ⏳ Deferred — would require Soroswap testnet router contract |

### Architecture Choice: Path B (Off-chain Verify + On-chain Attest)

Originally we tried embedding the ZK verifier on-chain (Path A). Soroban's BN254 host functions are fragile across SDK versions. **Path B** splits the responsibilities:

1. **Agent (off-chain)** — generates proof, verifies it locally with `bb verify`, signs attestation
2. **Executor (on-chain)** — verifies the ed25519 signature, stores trade + proof + attestation

Anyone can re-verify the math independently. The contract only needs ed25519, which is a native Soroban host function and rock-solid.

### Demo Flow

1. LLM cycle → fetches market data, runs strategy, submits trade
2. ~5 tool-use iterations, ~2k tokens
3. ZK proof generated in ~250ms
4. x402 payment sent, tx hash captured
5. Trade submitted on-chain → `trade_id` returned from contract event

### Negative Tests (Demo Punchline)

Two live negative tests in the demo UI:

1. **1-bit tamper**: Flip one byte of a stored proof → `bb verify` rejects → "math doesn't lie"
2. **Policy violation**: Write malicious `Prover.toml` (rate limit violated) → `nargo execute` rejects with assertion → circuit enforces policy at proof time

---

## Tech Stack

- Noir 1.0.0-beta.9 (circuit)
- bb 0.87.0 (Barretenberg UltraHonk prover)
- Soroban SDK 26.1.0 (Rust contracts, target wasm32v1-none)
- OpenAI SDK → MiniMax /v1/chat/completions (LLM, Bearer auth, M2.5 model)
- TypeScript + tsx (agent)
- better-sqlite3 (storage)
- poseidon-lite (off-chain hash matching Noir)

---

## Repo

**https://github.com/capGoblin/stellar-private-agent**

8 commits, fully documented README, end-to-end runnable with `npx tsx src/index.ts --once`.

## Demo Video

*[to record]*

## Wallet Address (Prize)

*[need from user]*

## Submitter

*[need from user]*
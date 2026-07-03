# DoraHacks Submission Fields — Provably Private Agent

Copy each section directly into the corresponding DoraHacks BUIDL form field.

---

## BUIDL (project) name

```
Provably Private Agent
```

---

## Logo

`showcase/assets/logo.png` (512×512, also `logo.svg` if the form accepts vector).

Design: an indigo shield (the public policy boundary) with a closed eye at its
core (the private strategy, hidden) and a checkmark (the ZK proof that
compliance was verified) — faint circuit-node lines in the background nod to
the proof graph. Local path:
`/Users/dharshan/dev/stellar/showcase/assets/logo.png`

---

## Vision (≤256 characters)

```
An AI trading agent whose private strategy stays secret, but whose compliance with public policy is provably enforced via ZK proofs — verified on Stellar's Soroban.
```

(166 characters — fits with room to spare.)

---

## GitHub URL

```
https://github.com/capGoblin/stellar-private-agent
```

---

## Details of the project (for judges)

```markdown
# Provably Private Agent

**Private strategy. Public compliance. On Stellar.**

An AI trading agent whose strategy stays cryptographically private, but
whose compliance with public policy is *provably enforced* — via Zero-
Knowledge proofs, an on-chain ed25519 attestation, and a real x402 payment,
all verified against a deployed Soroban contract.

> Stellar Hacks: Real-World ZK — Track: Real-World ZK

---

## 🚀 TL;DR

Hedge funds have alpha worth protecting. Regulators need compliance
visibility. These two needs conflict — until now.

The agent runs a private trading strategy, and when it decides to trade, it
generates an UltraHonk ZK proof (Noir circuit) proving: *"this decision came
from the committed strategy AND respects the public policy (rate limits,
pair whitelist, size caps, circuit breakers)."* The strategy's actual
thresholds never leave the private witness. Anyone — trader, regulator, or
the public — can re-verify the math independently.

**This is a framework, not a single app.** The `policy_core` Noir library
implements three shared invariants (policy binding, strategy commitment,
derived decision) that any trading vertical composes. Two verticals ship
today:

| Circuit | Vertical | Hidden (private) | Enforced (public policy) |
|---|---|---|---|
| `strategy_policy` | Spot DEX (live end-to-end) | buy/sell thresholds, period, secret | max trade size, pair whitelist, rate limit, loss breaker |
| `perp_policy` | Perps | entry/exit thresholds, **leverage**, secret | **max leverage**, **margin floor**, notional cap, rate limit |

`perp_policy` proves *"my leverage ≤ the venue's 5x cap"* without revealing
whether it's 2x or 4.9x — full `nargo test` (8/8 passing) → `bb prove` →
`bb verify` pipeline confirmed.

---

## 🎯 Why Stellar, why now

Stellar's real trading activity is stablecoin FX (XLM/USDC, USDC/EURC) made
almost entirely by market-making bots — the historical Kelp/Aquarius
culture. Meanwhile institutional capital is arriving fast: Stellar's RWA
market cap (ex-stablecoins) grew from $796M to $1.52B in a single quarter
(+91% QoQ) — Franklin Templeton's BENJI, Ondo, WisdomTree. And leveraged
perps are launching on Stellar for the first time in 2026 (Rails, Stellars
Finance) — meaning no incumbent privacy/compliance tooling exists yet for
that vertical either.

Three real audiences, one proof pattern:
- **Market makers today** — prove exposure/risk limits without revealing
  the spread model.
- **RWA fund operators next** — prove mandate compliance (position limits,
  allowed assets) without disclosing the strategy to competitors.
- **Perp traders soon** — prove leverage stays under a venue's cap without
  revealing the actual leverage used.

---

## 🔍 What's REAL (not mocked)

| Component | Status |
|---|---|
| TypeScript agent, real LLM tool-use loop | ✅ OpenAI SDK → MiniMax M2.5 (`/v1/chat/completions`) |
| Z-score mean-reversion strategy | ✅ 20-period rolling z-score, ±2σ thresholds |
| ZK proof generation | ✅ `nargo execute` + `bb prove`, UltraHonk, ~14.5KB proof |
| Off-chain Poseidon BN254 hashing | ✅ Matches Noir's classic Poseidon via `poseidon-lite` |
| ed25519 attestation signing | ✅ keccak256 over proof + public inputs |
| On-chain trade submission | ✅ Deployed executor `CDDBMMWA6WYT6ZT5QRBATVEXC3IMVJQ4ZR6TREVL43WWSJ3HOKRMP4OZ` |
| x402 payment | ✅ Real 0.1 XLM Stellar tx before each trade, hash stored in the audit trail |
| SQLite persistence | ✅ Trades + full LLM reasoning + iteration/token counts |
| Three-persona demo UI | ✅ Trader / Regulator / Public views, live stats panel |
| Negative test #1 — 1-bit proof tamper | ✅ `bb verify` rejects the mutated proof |
| Negative test #2 — policy violation | ✅ `nargo execute` rejects at proof-generation time |
| `policy_core` Noir library + 2 circuit verticals | ✅ Spot DEX + Perps, both fully proven |
| Soroswap/Aquarius live DEX execution | ⏳ In progress (testnet Aquarius swap integration) |

---

## 🏗️ Architecture — Path B (Off-chain Verify, On-chain Attest)

We first tried verifying the ZK proof directly inside a Soroban contract
(Path A) — Soroban's BN254 host functions proved fragile across SDK
versions. **Path B** splits responsibilities instead:

1. **Agent (off-chain)** — generates the proof, verifies it locally with
   `bb verify`, signs an ed25519 attestation over it.
2. **Executor (on-chain, Soroban)** — verifies only the ed25519 signature
   (a native, rock-solid Soroban host function), stores the trade + proof +
   attestation, emits an audit event.
3. **Anyone** — pulls the proof + VK from the contract and re-runs
   `bb verify` independently. The math is the source of truth, not trust in
   the executor.

---

## 🎬 Demo flow

1. LLM cycle: fetches market data → runs the strategy → decides to trade
   (~3–6 tool-use iterations, ~1.5–3k tokens)
2. ZK proof generated in ~250ms (UltraHonk, 14.5KB)
3. Real x402 payment (0.1 XLM) sent, tx hash captured
4. ed25519 attestation signed
5. Trade submitted on-chain → `trade_id` returned from the contract event
6. **Negative test #1**: flip one bit in the stored proof → `bb verify`
   rejects it — "math doesn't lie" even though the contract already
   accepted the original trade.
7. **Negative test #2**: attempt a policy-violating trade (e.g. rate limit
   broken) → `nargo execute` refuses to even generate a witness — you
   cannot fake compliance, the circuit enforces it at proof time.

Run it yourself: `npx tsx src/index.ts --once` (agent) or `bin/demo.sh`
(full demo UI + local Soroban network).

---

## 🧰 Tech Stack

- Noir 1.0.0-beta.9 (circuit language, `policy_core` lib + 2 circuits)
- bb 0.87.0 (Barretenberg, UltraHonk prover, keccak oracle)
- Soroban SDK 26.1.0 (Rust, `wasm32v1-none` target)
- OpenAI SDK → MiniMax `/v1/chat/completions` (LLM orchestrator, M2.5)
- TypeScript + tsx (agent runtime)
- better-sqlite3 (local persistence)
- poseidon-lite (off-chain Poseidon matching the Noir circuit exactly)

---

## 📦 Repo

**https://github.com/capGoblin/stellar-private-agent**

20+ commits, fully documented README (architecture diagram, PolicyProof
pattern writeup, quickstart), end-to-end runnable locally.

## 🔗 Live static showcase

**https://showcase-lyart-one.vercel.app** — frozen replay of a real captured
run (genuine proof hashes, ed25519 sigs, x402 tx hashes — nothing
fabricated) for judges who don't want to spin up the local Soroban network.
```

---

## Wallet Address (Prize)

*[fill in your Stellar address for the prize payout]*

## Submitter name / email

*[fill in]*

## Track

Real-World ZK

## Demo video

*[record and link once ready — see DEMO_SCRIPT.md]*

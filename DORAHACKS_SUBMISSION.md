# DoraHacks Submission Fields — Provably Private Agent

Copy each section directly into the corresponding DoraHacks BUIDL form field.

---

## BUIDL (project) name

```
Provably Private Agent
```

---

## Logo

`showcase/assets/logo.png` (512×512 PNG; `logo.svg` also available if the form accepts vector).

An indigo shield — the public policy boundary — with a closed eye at its core (the private strategy, hidden) and a checkmark cutting through it (the proof that compliance holds). Faint circuit-node lines in the background nod to the proof graph.

Local path: `/Users/dharshan/dev/stellar/showcase/assets/logo.png`

---

## Vision (≤256 characters)

```
An AI trading agent whose private strategy stays secret, but whose compliance with public policy is provably enforced via ZK proofs — verified on Stellar's Soroban.
```

166 characters.

---

## GitHub URL

```
https://github.com/capGoblin/stellar-private-agent
```

---

## Details of the project (for judges)

```markdown
# Provably Private Agent

**Private strategy. Public compliance. Both provable.**
Stellar Hacks: Real-World ZK

---

## The problem in one sentence

A trading strategy's edge is the thing worth hiding; a regulator's job is
confirming the trade obeyed the rules. On a public ledger, proving the
second usually means leaking the first. This project makes both true at
once, with a ZK proof instead of a promise.

## What it does

An LLM agent runs a private strategy, and every time it decides to trade,
it generates a Noir/UltraHonk proof showing: *this decision came from one
specific committed strategy, and that strategy respected a public policy
(rate limits, size caps, leverage caps, circuit breakers)*. The strategy's
actual thresholds never leave the private witness. The proof plus an
ed25519 attestation goes to a Soroban executor contract; a real 0.1 XLM
x402 payment gates the cycle. Anyone can pull the proof back off-chain and
re-verify the math themselves — no need to trust the executor.

## Numbers that are checkable, not claimed

| | |
|---|---|
| Proof scheme | UltraHonk (Barretenberg `bb` 0.87.0) |
| Proof size | 14,564 bytes, 11 public inputs |
| Proof generation time | ~250ms |
| Circuit tests passing | 5/5 (spot) + 8/8 (perps) |
| On-chain executor | `CDDBMMWA6WYT6ZT5QRBATVEXC3IMVJQ4ZR6TREVL43WWSJ3HOKRMP4OZ` |
| x402 payment | 0.1 XLM, real signed Stellar tx per cycle |
| Repo | 22 commits, fully documented |
| Negative tests (live in the demo) | 2 |

## This is a framework, not one app

The shared logic lives once, in a Noir library (`policy_core`): policy
binding (you can't prove against a looser policy than the one committed
on-chain), strategy commitment (the proof is bound to one hidden
strategy), and derived decision (the action is computed inside the
circuit, never claimed by the prover). Two verticals compose it today:

| Circuit | Vertical | Hidden | Enforced |
|---|---|---|---|
| `strategy_policy` | Spot DEX — live end-to-end | buy/sell thresholds, period, secret | max trade size, pair whitelist, rate limit, loss breaker |
| `perp_policy` | Perps | entry/exit thresholds, **leverage**, secret | **max leverage**, **margin floor**, notional cap, rate limit |

`perp_policy` proves *"my leverage ≤ the venue's 5x cap"* without revealing
whether it's 2x or 4.9x. Adding a third vertical (RWA mandate compliance,
market-maker exposure limits) is one Noir file plus one TypeScript
strategy class — same executor, same attestation flow.

## Why Stellar, why now

Stellar's actual trading volume today is stablecoin FX (XLM/USDC,
USDC/EURC), made almost entirely by market-making bots — the long-running
Kelp/Aquarius culture. At the same time, institutional capital is arriving
fast: Stellar's RWA market cap (ex-stablecoins) went from $796M to $1.52B
in one quarter (+91% QoQ) via Franklin Templeton's BENJI, Ondo, WisdomTree.
And leveraged perps are launching on Stellar for the first time in 2026
(Rails, Stellars Finance) — so no incumbent privacy/compliance tooling
exists yet for that vertical either. Three real audiences, one proof
pattern: market makers proving exposure limits without revealing spread
models, RWA operators proving mandate compliance without disclosing
strategy, perp traders proving leverage caps without revealing position
size.

## What's real vs. not yet wired

| Component | Status |
|---|---|
| LLM tool-use loop (OpenAI SDK → MiniMax M2.5) | real |
| Z-score mean-reversion strategy (20-period, ±2σ) | real |
| ZK proof generation (`nargo execute` + `bb prove`) | real |
| Off-chain Poseidon BN254 hashing (`poseidon-lite`, matches the circuit) | real |
| ed25519 attestation (keccak256 over proof + public inputs) | real |
| On-chain trade submission to the deployed executor | real |
| x402 payment (0.1 XLM Stellar tx, hash in the audit trail) | real |
| SQLite persistence (trades, LLM reasoning, token counts) | real |
| Three-persona demo UI (trader / regulator / public) | real |
| Negative test — 1-bit proof tamper → `bb verify` rejects | real |
| Negative test — policy violation → `nargo execute` rejects | real |
| `policy_core` library + 2 circuit verticals, both fully proven | real |
| Aquarius/Soroswap live swap execution | in progress |

## Architecture: off-chain verify, on-chain attest

We first tried verifying the ZK proof inside a Soroban contract directly —
Soroban's BN254 host functions were fragile across SDK versions. So the
architecture splits the job instead: the agent generates the proof and
verifies it locally with `bb verify`, signs an ed25519 attestation over it,
and the Soroban executor only has to check that signature — a native,
solid Soroban host function — before storing the trade, proof, and
attestation on-chain. Anyone can then pull the proof back and re-run
`bb verify` themselves. The math is the source of truth, not trust in the
contract.

## Demo flow

1. LLM cycle fetches market data, runs the strategy, decides to trade
   (3–6 tool-use iterations, ~1.5–3k tokens)
2. ZK proof generated (~250ms, 14.5KB)
3. Real x402 payment sent, tx hash captured
4. ed25519 attestation signed
5. Trade submitted on-chain, `trade_id` returned from the contract event
6. Negative test #1: flip one bit in the stored proof → `bb verify`
   rejects it, even though the contract already accepted the original
   trade — anyone can catch the tamper independently
7. Negative test #2: attempt a policy-violating trade → `nargo execute`
   refuses to generate a witness at all — you cannot fake compliance

## Try it

```
git clone https://github.com/capGoblin/stellar-private-agent
cd stellar-private-agent/agent && npx tsx src/index.ts --once   # run the real agent
cd .. && bin/demo.sh                                             # full demo UI + local Soroban network
```

Static showcase (no setup, frozen replay of a real captured run — every
hash and signature is genuine): https://provably-private-agent.vercel.app

## Tech stack

Noir 1.0.0-beta.9 · bb 0.87.0 (UltraHonk, keccak oracle) · Soroban SDK
26.1.0 (`wasm32v1-none`) · OpenAI SDK → MiniMax `/v1/chat/completions` ·
TypeScript + tsx · better-sqlite3 · poseidon-lite
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

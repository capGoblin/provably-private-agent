# Provably Private Agent — Complete Handoff Document

*Project handoff for Stellar Hacks: Real-World ZK hackathon*
*Date locked: June 25, 2026*
*Deadline: July 03, 2026 (12:00 PM PST)*

---

## 0. TL;DR — The Project In One Paragraph

**Provably Private Agent** is an AI trading agent whose strategy stays cryptographically private, but whose compliance with public policy is provably enforced — running on Stellar, paying via x402, verifiable on Soroban.

A user pays a small rental fee via x402. The agent runs its private strategy in a way that generates a zero-knowledge proof. The proof attests: "this trade decision came from my committed private strategy, and the resulting trade respects the public policy rules." The strategy internals stay hidden. Anyone can verify the proof on Stellar.

**Three personas see three different views of the same data:** the trader sees their full trades, the regulator sees audit trails with compliance proofs, the public sees only aggregate stats.

---

## 1. Conversation Arc — How We Got Here

### 1.1 Phase 1: Hackathon Discovery

The user shared the **Stellar Hacks: Real-World ZK** announcement:
- Prize pool: $10,000 XLM (1st: $5K, 2nd: $2K, 3rd: $1.25K, 4th: $1K, 5th: $750)
- Submissions: June 15 → July 03, 12PM PST
- Theme: Anything ZK on Stellar. Privacy pools, private payments, confidential tokens, identity proofs, verifiable computation.
- Three proven ZK stacks: RISC Zero, Noir, Circom
- Stellar Protocol 25 (X-Ray) + Protocol 26 (Yardstick) added BN254 + Poseidon host functions for cheap on-chain ZK verification.

### 1.2 Phase 2: Landscape Research

I fetched all 6 recent Stellar hackathon reports (DoraHacks):
1. **ZK Gaming** (Feb 2026) — 215 participants, 99 projects, $10K. Winners: Chickenz.io (multiplayer ZK), xray.games (arcade), Stellar Poker (coSNARKs), Cosmic Coders (ZK leaderboard), Oppia zkArcade.
2. **Build Better** (Apr 2025) — 220 devs, 84 projects, $25K. Winners: PayZoll_Stellar, StellarFinance, Soroban to MCP Server.
3. **Swaps & Vaults with PaltaLabs** (Aug 2025) — 124 devs, 27 projects, $6K. Winners: DeFi Quest, Verbex, Soroswap Pro Trader.
4. **Scaffold Stellar** (Nov 2025) — 275 devs, 63 projects, $10K. Winners: Splicers, No Loss Lottery, Streamr, SAMPLED, Secureflow.
5. **KALE x Reflector** (date unclear) — 161 devs, 47 projects, $12K. Winners: xbid.ai (multi-LLM agent trading), Kale Farmers Market, Not Circle of Trust, etc.
6. **Agents** (March 2026) — 600 hackers, 260+ projects. Winners: Cards402.com, clevercon, RenderGate, x402-mcp-stellar-template, TollPay.

**Key patterns observed:**
- Working products win (Chickenz.io had real users, not just specs)
- Stellar-specificity matters
- x402 is hot (live on Stellar since Jan 2026)
- AI agent space is crowded
- Privacy + compliance + Stellar primitives = open gap

### 1.3 Phase 3: Initial Research Document

Wrote `/workspace/zk-hackathon-research.md` with initial landscape analysis:
- Identified existing tooling: `stellar-zk-ultrahonk` (3 backends: Groth16, UltraHonk, RISC Zero), `xcapit/openzktool`, `NethermindEth/stellar-risc0-verifier`, Circom Groth16 verifier, circom2soroban CLI.
- Identified macro tailwinds: GENIUS Act (US, July 2025), HK Stablecoins Ordinance (Aug 2025), MiCA (EU), EU AI Act — all demanding verifiable compliance.
- Identified BENJI (Franklin Templeton $828M tokenized Treasury on Stellar) as a major real-world asset.
- Identified x402 volume skepticism (a16z partner Noah Levine called out wash trading; real volume ~$1.6M/month).

**Initial Top 3:**
1. ZK Confidential BENJI — wrap BENJI in privacy layer
2. ZK-Compliant x402 AI Agents — compliance layer for AI agent payments
3. ZK Proof of Reserves for Stablecoins — regulatory-facing proofs

### 1.4 Phase 4: First Stress Test — Confidential BENJI Rejected

User challenged: *"isn't this becomes a normal application layer on top what they have?"*

I researched and discovered:
- **Stellar Confidential Token Standard** exists (SDF + Nethermind + OpenZeppelin collaboration at confidentialtoken.org)
- **OpenZeppelin ERC-7984** port coming to Soroban
- **NethermindEth/stellar-private-payments** reference implementation using ASP Merkle trees
- **Native host functions:** BN254, Poseidon/Poseidon2 for circuits

**Verdict:** Confidential BENJI is just calling their SDK with a different token. That's not a hackathon winner. Idea demoted.

### 1.5 Phase 5: Multi-Agent Trading + Private Compliance Stress Test

User asked to stress-test "Verifiable Multi-Agent Trading System" and "Private Strategy + Verifiable Compliance."

Initial findings — competitors exist:
- **Giza Agents** (`gizatechxyz/giza-agents`): "Verifiable AI and smart contracts interoperability" framework, live on Arbitrum.
- **Haven AI + LinkLayerAI** (May 2026): Partnership for verifiable trading agents.
- **EY Nightfall + StarkWare** (Feb 2026): Private + compliant DeFi for enterprises on Ethereum.
- **Railway.xyz**: Private Proofs of Innocence for compliance, live.
- **Brevis + Aster DEX** (Dec 2025): ZK verifiable perpetual DEX.
- **xbid.ai**: Already won 1st on Stellar for multi-LLM trading (without ZK).

**My initial verdict:** Both ideas were saturated.

### 1.6 Phase 6: User Pushback — Calibration Correction

User: *"dont be tooo skeptical man! some your claims not make sense"*

I owned the over-correction. The flaw: I was conflating "category exists somewhere in crypto" with "you're late on Stellar." Reality:
- EY Nightfall is on Ethereum, not Stellar
- Giza is on Arbitrum, not Stellar
- None compose Stellar-specific primitives (x402 + BENJI + Confidential Token Standard + Anchor network)

The actual gap on Stellar is real. The combination of private strategy + verifiable execution + Stellar-native payments is novel.

### 1.7 Phase 7: Other Agent's Dump Analysis

User shared research from another agent pushing "Private Strategy + Verifiable Compliance" with high enthusiasm. I provided balanced analysis:
- Tooling call (RISC Zero) was right
- Negative test demo idea was good
- But the dump didn't address EY Nightfall, Giza, Railway, Brevis, xbid.ai, Multicoin's skepticism, ZKML cost reality ($40K-$250K per project), or demo visibility issues

User pushed back again on my skepticism. I acknowledged the over-rotation and confirmed the direction.

### 1.8 Phase 8: Lock-in — "Provably Private Agent"

User committed. The framing locked in:
- **Concept:** Private strategy + Verifiable compliance + x402 rental
- **Name:** Provably Private Agent
- **Differentiation:** Composing Stellar-specific primitives (x402 + Soroswap + Soroban verifier + Confidential Token Standard) — not available on Ethereum L2s

### 1.9 Phase 9: Architecture Deep Dive

User constraints:
- Solo developer
- Below-beginner Rust level
- Starting immediately
- Self-recording demo

**Key pivot:** Switched from RISC Zero (Rust zkVM, steep learning) to **Noir (UltraHonk)** — Rust-like DSL, simpler syntax, still uses Stellar verifier contracts.

---

## 2. The Locked Architecture

### 2.1 High-Level Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│  OFF-CHAIN (Your Machine / Browser)                              │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  AGENT EXECUTOR (Node.js)                                  │  │
│  │  1. Receives market data                                   │  │
│  │  2. Receives strategy commitment                           │  │
│  │  3. Loads public policy (from Stellar)                    │  │
│  │  4. Runs Noir circuit                                     │  │
│  │  5. Generates ZK proof                                    │  │
│  │  Output: { decision, proof, public_inputs }                │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  NOIR CIRCUIT                                              │  │
│  │  PRIVATE: strategy_state, strategy_params                  │  │
│  │  PUBLIC:  policy_hash, market_data, balance, etc.         │  │
│  │  PROVES: decision came from strategy AND respects policy   │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (submit tx with proof)
┌──────────────────────────────────────────────────────────────────┐
│  ON-CHAIN (Stellar / Soroban)                                    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  PROOF VERIFIER CONTRACT                                   │  │
│  │  • UltraHonk verification (rs-soroban-ultrahonk)           │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  POLICY CONTRACT                                           │  │
│  │  • Stores public policy per agent                          │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  EXECUTOR CONTRACT                                         │  │
│  │  • Verifies x402 receipt                                   │  │
│  │  • Verifies proof                                          │  │
│  │  • Cross-checks policy                                     │  │
│  │  • Records trade, emits event                              │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  STELLAR SETTLEMENT                                              │
│  • x402 payment (USDC)                                           │
│  • Soroswap trade execution (testnet)                            │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  THREE-PERSONA VIEW                                             │
│  Trader | Regulator | Public                                     │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 Locked Tech Stack

| Layer | Tool | Source | Justification |
|-------|------|--------|---------------|
| **Circuit language** | Noir (UltraHonk) | noir-lang.org/docs | Rust-like but simpler DSL. Better for below-beginner Rust. |
| **Verifier** | rs-soroban-ultrahonk | github.com/yugocabrio/rs-soroban-ultrahonk | UltraHonk verifier for Soroban, ready to fork |
| **Prover** | bb.js (Barretenberg) | Aztec | Browser-friendly proof generation |
| **Smart contracts** | Soroban SDK | developers.stellar.org/docs/tools/sdks | Native Stellar |
| **Dev framework** | Scaffold Stellar | scaffoldstellar.org | Full lifecycle CLI, used by past winners |
| **AI assist** | Stellar Skills | skills.stellar.org | Agent context for code generation |
| **Audited contracts** | OpenZeppelin Stellar | openzeppelin.com/networks/stellar | MCP server + security patterns |
| **DEX** | Soroswap (testnet) | soroswap.finance | Real Stellar DEX, stablecoin pairs |
| **Payments** | x402 (Stellar) | developers.stellar.org/docs/build/agentic-payments | Native agent payment protocol |
| **Privacy layer** | Confidential Token Standard | confidentialtoken.org | Composable privacy primitives |
| **Local dev** | Stellar Quickstart (Docker) | developers.stellar.org/docs/tools/quickstart | Local network |
| **Oracle** | Reflector (or mock) | reflector.network | Price feeds on Stellar |

### 2.3 Locked Strategy + Policy

**Private Strategy (RSI mean-reversion, ~200 LOC):**
- Buy when RSI < 30
- Sell when RSI > 70
- 20-period RSI on USDC/EURC pair

**Public Policy (visible to all):**
- `max_trade_size_pct = 5` (% of balance)
- `allowed_pairs = [USDC/EURC, USDC/XLM]`
- `min_time_between_trades = 600` seconds (10 min)
- `max_consecutive_losses = 3`

### 2.4 The Proof Structure

**Public inputs (visible on-chain):**
```
policy_hash         : Field    // ties proof to policy
market_price        : Field    // price at decision time
market_timestamp    : Field    // when decision was made
pair                : Field    // encoded pair
balance             : Field    // agent balance
last_trade_ts       : Field    // for rate limit
consecutive_losses  : Field    // for circuit breaker
```

**Private witnesses (never revealed):**
```
strategy_code_hash  : Field    // commitment to strategy
strategy_state      : [Field]  // position, signals, etc.
strategy_params     : [Field]  // RSI threshold, etc.
```

**What proof attests:**
"There exists strategy with `strategy_code_hash` such that running it on `market_data` produces `decision, amount`, AND that output respects all policy constraints."

---

## 3. The Build Plan (14 Days)

### Days 1–2: Foundation
- [ ] `npm install -g @stellar/cli` or scaffold-stellar install
- [ ] Clone `rs-soroban-ultrahonk` — understand structure
- [ ] Set up local Stellar network via Docker
- [ ] Install Noir toolchain (`noirup`)
- [ ] Install Barretenberg (`bbup`)
- [ ] Deploy existing verifier contract on testnet
- [ ] Skill install: `stellar-dev-skill` for AI assistance

### Days 3–5: Agent + Circuit
- [ ] Write private strategy in Noir/TS (RSI mean-reversion, ~200 LOC)
- [ ] Write public policy checker in Noir
- [ ] Compose both into Noir circuit (`main.nr`)
- [ ] Generate first proof locally with `nargo prove`
- [ ] Test proof with `bb verify`

### Days 6–8: Soroban Verifier
- [ ] Fork `rs-soroban-ultrahonk`
- [ ] Adapt Groth16 verifier for our proof structure
- [ ] Add policy-decoding logic
- [ ] Add x402 payment receipt handler in Executor
- [ ] Deploy to Stellar testnet
- [ ] Test: invalid proof rejected, valid proof accepted

### Days 9–11: Trade Execution + x402
- [ ] Integrate x402 payment flow (use existing Stellar template)
- [ ] Connect Soroswap testnet (or mock) for trade execution
- [ ] Wire up: pay → unlock agent → generate proof → submit → verify → execute
- [ ] Test full happy path + rejection path (policy violation)

### Days 12–14: Demo + Polish
- [ ] Build minimal frontend: 3 personas (trader, regulator, public)
- [ ] Single HTML file, vanilla JS, Tailwind CDN
- [ ] Record 2–3 min demo video
- [ ] Write README with architecture diagram
- [ ] Submit
- [ ] **Buffer day:** anything that breaks

---

## 4. The Demo Script (2:30 minutes)

**0:00–0:30** The problem: "Hedge funds want to deploy alpha on-chain but can't expose their strategies. Regulators want compliance visibility. Provably Private Agent solves both."

**0:30–1:00** Show the architecture diagram. Explain: "Strategy runs as circuit, only proof is public. Policy is verified on Stellar. x402 handles payment."

**1:00–1:30** Live demo: Trader pays 0.1 USDC via x402 → agent runs → proof generated → submitted → verified → trade executes on Soroswap testnet. Show tx hash on Stellar Expert.

**1:30–2:00** Switch to **regulator view**: shows compliance trail, every trade + proof hash, policy status. Shows **public view**: anonymized stats only.

**2:00–2:30** Negative test: tamper with strategy output → proof FAILS → trade rejected. Close with: "Real-world ZK for real-world finance."

---

## 5. File Structure

```
provably-private-agent/
├── circuits/
│   └── strategy_policy/
│       ├── src/main.nr              # Noir circuit
│       ├── Nargo.toml
│       └── Prover.toml
├── contracts/
│   ├── verifier/                    # UltraHonk verifier (forked)
│   │   └── src/lib.rs
│   ├── policy/                      # Policy storage
│   │   └── src/lib.rs
│   └── executor/                    # Main orchestrator
│       └── src/lib.rs
├── agent/
│   ├── src/
│   │   ├── index.ts                 # Main agent executor
│   │   ├── prover.ts                # Proof generation
│   │   ├── strategy.ts              # Private strategy (off-chain)
│   │   └── market.ts                # Reflector integration
│   └── package.json
├── demo/
│   ├── index.html                   # 3-persona view
│   ├── app.js
│   └── styles.css
├── scripts/
│   ├── deploy.sh
│   ├── setup.ts
│   └── demo.sh
├── tests/
│   ├── circuit.test.ts
│   ├── executor.test.ts
│   └── e2e.test.ts
└── README.md
```

**Estimated LOC: ~1100**
- Noir circuit: ~150
- Soroban contracts: ~250
- Agent executor: ~300
- Demo frontend: ~200
- Tests + scripts: ~200

---

## 6. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Noir learning curve | Medium | 1-2 days. Noir syntax is forgiving. Use their tutorials. |
| Soroban contract writing | Medium | Copy verifier from rs-soroban-ultrahonk. Minimal new contract code. |
| Proof generation in JS | Medium | Use bb.js from Aztec. They have browser examples. |
| x402 integration | Low-Medium | Use existing Stellar x402 template (modify for our flow). |
| Soroswap call | Low | Test on testnet. Have mock fallback ready. |
| Time crunch | High | Day 11 checkpoint. If behind, cut Soroswap and use mock. |
| Strategy too simple | Medium | Make demo focus on PROOF, not strategy cleverness. |
| Frontend polish | Low | Single HTML file. Use Tailwind CDN for quick styling. |

---

## 7. Complete Resource List

### 7.1 Official Stellar Docs
- ZK Proofs on Stellar: https://developers.stellar.org/docs/build/apps/zk
- Privacy on Stellar: https://developers.stellar.org/docs/build/apps/privacy
- Stellar X-Ray (Protocol 25): https://stellar.org/blog/developers/announcing-stellar-x-ray-protocol-25
- Yardstick (Protocol 26): https://stellar.org/blog/foundation-news/stellar-yardstick-protocol-26-upgrade-guide
- Building with AI: https://developers.stellar.org/docs/build/building-with-ai
- llms.txt (for LLM context): https://developers.stellar.org/llms.txt

### 7.2 AI Development Skills
- Stellar Skills hub: https://skills.stellar.org/
- ZK Proofs skill: https://skills.stellar.org/skills/zk-proofs/SKILL.md
- stellar-dev-skill (GitHub): https://github.com/stellar/stellar-dev-skill
- stellar-build (42 skills, 6 agents): https://github.com/kaankacar/stellar-build
- OpenZeppelin Skills: https://github.com/OpenZeppelin/openzeppelin-skills

### 7.3 On-Chain ZK Verifiers (Reference)
- RISC Zero verifier: https://github.com/NethermindEth/stellar-risc0-verifier
- UltraHonk verifier (yugocabrio): https://github.com/yugocabrio/rs-soroban-ultrahonk
- UltraHonk verifier (indextree): https://github.com/indextree/ultrahonk_soroban_contract
- Stellar Private Payments (Privacy Pools PoC): https://github.com/NethermindEth/stellar-private-payments

### 7.4 ZK Circuit Tooling
- Noir docs: https://noir-lang.org/docs/
- RISC Zero docs: https://dev.risczero.com/
- Soroban SDK BN254: https://docs.rs/soroban-sdk/latest/soroban_sdk/_migrating/v25_bn254/index.html
- Soroban SDK Poseidon: https://docs.rs/soroban-sdk/latest/soroban_sdk/_migrating/v25_poseidon/index.html
- Protocol CAPs: BN254 (CAP-0074), Poseidon (CAP-0075), BLS12-381 (CAP-0059)
- Soroban P25 preview examples: https://github.com/jayz22/soroban-examples/tree/p25-preview/p25-preview

### 7.5 Privacy Standards
- Confidential Token Association: https://www.confidentialtoken.org/
- Privacy Pools whitepaper: https://privacypools.com/whitepaper.pdf

### 7.6 Core Stellar Dev Tools
- Stellar Docs: https://developers.stellar.org/
- SDKs: https://developers.stellar.org/docs/tools/sdks
- Stellar CLI: https://developers.stellar.org/docs/tools/cli
- Lab (browser playground): https://developers.stellar.org/docs/tools/lab
- Quickstart (Docker): https://developers.stellar.org/docs/tools/quickstart
- Scaffold Stellar: https://scaffoldstellar.org
- Stellar Wallets Kit: https://stellarwalletskit.dev/
- OpenZeppelin on Stellar: https://www.openzeppelin.com/networks/stellar

### 7.7 Smart Contract Building Blocks
- Smart Contracts Getting Started: https://developers.stellar.org/docs/build/smart-contracts/getting-started
- Contract Authorization: https://developers.stellar.org/docs/build/guides/auth
- Contract Storage: https://developers.stellar.org/docs/build/guides/storage
- Contract Testing: https://developers.stellar.org/docs/build/guides/testing

### 7.8 Specific Application Resources
- Soroswap DEX: https://soroswap.finance/
- x402 on Stellar (Stellar blog): https://stellar.org/blog/foundation-news/x402-on-stellar
- HTTP-Native Payment Protocols (docs): https://developers.stellar.org/docs/build/agentic-payments
- Reflector Oracle: https://reflector.network

### 7.9 Community Resources
- Stellar Ecosystem Resources: https://github.com/stellar/ecosystem-resources/
- Stellar Hackathon FAQ: https://github.com/briwylde08/stellar-hackathon-faq
- Stellar Ecosystem DB: https://github.com/lumenloop/stellar-ecosystem-db

---

## 8. Hackathon Context & Calendar

**Event:** Stellar Hacks: Real-World ZK
**Platform:** DoraHacks
**URL:** https://dorahacks.io/hackathon/stellar-hacks-zk

**Timeline:**
- Submissions Open: June 15, 2026 (12:00 AM PST) — OPEN NOW
- Submission Deadline: July 03, 2026 (12:00 PM PST)

**Prize Pool:** $10,000 XLM
- 1st: $5,000
- 2nd: $2,000
- 3rd: $1,250
- 4th: $1,000
- 5th: $750

**Support Channels:**
- Stellar Dev Discord — #zk-chat: https://discord.gg/stellardev
- Stellar Hacks Telegram: https://t.me/+e898qibDUVExODkx

---

## 9. Key Insights From Research

### 9.1 Saturation Map (What NOT to Build)

| Idea | Why Crowded |
|------|-------------|
| Privacy Pools on Stellar | SDF already prototyped (their blog), Nethermind has reference impl |
| x402 wrapper | Stellar Hacks: Agents (March 2026) had 5 winners doing this |
| ZK Gaming | ZK Gaming hackathon (Feb 2026) had 99 projects |
| Pure verifiable computation | a16z critique (March 2026): "ZK should be for privacy, not just succinctness" |
| Confidential token standard | SDF + Nethermind + OpenZeppelin ship this; wrapping = SDK call |
| Multi-agent trading | Giza Agents (live), Haven AI + LinkLayerAI (May 2026), xbid.ai (already won) |
| Private + compliant DeFi | EY Nightfall + StarkWare (Feb 2026) for Ethereum |

### 9.2 The Real Gap

**Nothing on Stellar composes:**
1. Private strategy execution (ZK)
2. Public policy enforcement (ZK)
3. x402 payment protocol (native to Stellar since Jan 2026)
4. Confidential Token Standard (SDF + Nethermind + OpenZeppelin)
5. Real institutional RWA (BENJI $828M)

**Provably Private Agent is the first to compose these.**

### 9.3 Why This Wins

- **Real-world relevance:** GENIUS Act + MiCA + EU AI Act all demand verifiable AI compliance
- **Real money:** Hedge funds have alpha worth protecting. BENJI is $828M. x402 is processing real transactions.
- **Stellar-specific:** No other chain has x402 + BENJI + Confidential Token Standard + Soroswap + cheap BN254 verification
- **Demo impact:** Three-persona view (trader, regulator, public) is visually striking, judges grok it in 5 seconds
- **Technical depth:** ZK circuit (not just ZK calls), real Soroban contracts, x402 integration

---

## 10. Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Circuit language | Noir (UltraHonk) | Simpler than RISC Zero for below-beginner Rust |
| Verifier | rs-soroban-ultrahonk | Ready to fork, UltraHonk |
| Strategy | RSI mean-reversion | Simple, ZK-friendly, real |
| Policy | 4 simple rules | Clear, demoable |
| Trade execution | Real Soroswap testnet | More impressive, fallback to mock |
| Payment | x402 | Native to Stellar, agent-friendly |
| Frontend | Single HTML file | Fast, demoable |
| Multi-agent? | No | Solo + 14 days = single agent |
| BENJI in scope? | Bonus only | Time permitting |
| ML strategy? | No | RSI/MA is enough |

---

## 11. Open Questions to Resolve

These were identified but not fully decided. Resolve as you build:

1. **Real Soroswap or mock?** Default: real testnet with small wallet. Fallback: mock.
2. **CLI demo or web frontend?** Default: minimal web frontend (single HTML).
3. **Strategy complexity?** Default: simple RSI mean-reversion.
4. **Working directory?** TBD with user.

---

## 12. Files Generated This Session

1. `/workspace/stellar-hackathons-report.md` — All 6 Stellar hackathons compiled
2. `/workspace/zk-hackathon-research.md` — Full research document for ZK ideas
3. `/workspace/handoff.md` — This document

---

## 13. Next Steps (To Be Done)

User has confirmed:
- Solo developer
- Below-beginner Rust level
- Starting immediately (June 25, 2026)
- Self-recording demo

**Immediate next actions:**
1. **Day 1:** Install toolchain
   - Scaffold Stellar
   - Noir toolchain (`noirup`)
   - Barretenberg (`bbup`)
   - Stellar CLI
   - Local Docker network
2. **Day 2:** Fork and deploy existing verifier on testnet
3. **Day 3:** Start writing Noir circuit

**Then proceed with the 14-day plan in Section 3.**

---

## 14. Contact & Continuity

This document is the complete handoff. Future agents or the user can pick up from Section 3 (Build Plan) with full context from Sections 1-13.

The project is locked in. The architecture is clear. The tools are chosen. The timeline is set.

**Time to build.**

---

*Document version: 1.1*
*Locked: June 25, 2026, 00:12 IST*
*Deadline: July 03, 2026, 12:00 PM PST*
*Days remaining: 6*
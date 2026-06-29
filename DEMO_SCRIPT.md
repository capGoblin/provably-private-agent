# Demo Script — Provably Private Agent (2:30)

**Recorded by:** *[user]*
**Capture:** macOS QuickTime Player → File → New Screen Recording (Cmd+Shift+5). Pick "Selected Portion" of your terminal + browser.

**Suggested layout:**
- 0:00–0:30 — Slide / README (problem statement)
- 0:30–1:00 — Architecture diagram (README.md) + terminal demo flow
- 1:00–1:30 — Demo UI (three personas + run agent)
- 1:30–1:50 — Live re-verify (tamper button)
- 1:50–2:10 — Live policy-violation (negative test #2)
- 2:10–2:30 — Recap + repo link

---

## NARRATION

### [0:00–0:30] The Problem
> "Hedge funds have alpha worth millions. They can't deploy it on-chain because every transaction leaks the strategy. Regulators need compliance — but private strategies can't be audited. We have a fundamental conflict."

### [0:30–1:00] The Solution
> "Provably Private Agent resolves this with ZK proofs. The agent's strategy runs inside a Noir circuit. The proof says: 'this specific strategy, with this specific secret, produced this trade, and it complies with public policy.' The strategy internals never leak. The math is verifiable by anyone."

### [1:00–1:30] Live Demo — Run Agent
> "Let's run the real agent. An LLM orchestrator picks the strategy, generates the proof, signs an ed25519 attestation, pays 0.1 XLM via x402, and submits to the Soroban executor contract."

[Show terminal running:]
```
cd /Users/dharshan/dev/stellar/agent
npx tsx src/index.ts --once
```

[Show the LLM tool-use loop in logs, ZK proof generation, x402 payment, on-chain tx hash]

> "Trade executed on-chain. trade_id: 7."

### [1:30–1:50] Three-Persona View
[Open browser → http://localhost:3000]
> "Now look at this from three angles. As a Trader, I see my own trades and a re-verify button. As a Regulator, I see the full audit trail — every attestation signature, every policy hash. As a member of the Public, I see aggregate volume only — no internals."

### [1:50–2:10] Negative Test #1 — 1-bit Tamper
[Click the "🔒 Tamper Proof Byte (flip 1 bit) → Re-verify" button]
> "Watch this. The trade was already accepted on-chain. But anyone can re-verify and detect tampering. We flip one bit in the stored proof, run bb verify — and the math says NO. Tamper detected. The contract accepted it because it only checks signatures, but you can always re-verify the math."

### [2:10–2:20] Negative Test #2 — Policy Violation
[Click the "⚠️ Generate Proof Violating Rate Limit" button]
> "What about trying to fake a compliant trade that actually violates policy? We write a malicious Prover.toml that violates the rate limit. nargo execute rejects the witness generation. The policy is enforced by the circuit itself — you can't fake compliance."

### [2:20–2:30] Recap
> "Three real components: an LLM agent, an UltraHonk ZK proof, and a Soroban executor. The strategy is provably private. The compliance is provably public. Both verified by the same math. Repo: github.com/capGoblin/stellar-private-agent. Thanks."

---

## WHAT TO CAPTURE (rough order)

1. README.md on screen (architecture diagram)
2. Terminal running `npx tsx src/index.ts --once` showing full flow
3. Browser at http://localhost:3000 — three persona tabs
4. Click "Run Agent (Submit Trade)" — show new trade appears
5. Click "🔒 Tamper Proof Byte" — show "Math detected the tamper"
6. Click "⚠️ Generate Proof Violating Rate Limit" — show "Circuit rejected"
7. End with repo URL overlay

## PRE-RECORDING CHECKLIST

```bash
# In one terminal: local Soroban must be running
docker ps  # should show stellar-stellar-local or similar

# In another terminal: 
cd /Users/dharshan/dev/stellar/demo && node server.js

# In a browser tab:
open http://localhost:3000

# Verify the agent works:
cd /Users/dharshan/dev/stellar/agent
rm -f .data/agent.db   # fresh start
npx tsx src/index.ts --once  # should print LLM-driven flow + trade_id
```

If everything works, start recording.
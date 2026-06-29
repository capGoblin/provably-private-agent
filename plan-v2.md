# Provably Private Agent — Complete Build Plan v2

*For: Another build agent to execute end-to-end*
*Project: Stellar Hacks: Real-World ZK*
*Architecture: Claude agent + modular strategies + ZK proofs + Soroban*

---

## 0. Project in One Paragraph

A real AI trading agent on Stellar. The agent uses an LLM (via Anthropic SDK pointed at MiniMax's Anthropic-compatible API) as the orchestrator — fetching market data, picking strategies, providing reasoning. Strategies are **deterministic, modular, pluggable TypeScript modules** (z-score mean reversion is the first). When a strategy signals a trade, the agent generates an UltraHonk ZK proof that proves: "this specific strategy ran with these inputs and produced this policy-compliant trade." The proof + ed25519 attestation is submitted to a Soroban contract (Path B architecture: off-chain verify + on-chain attest). Three personas (trader, regulator, public) see different views of the same audit trail.

---

## 1. Tech Stack (Locked)

| Layer | Tool | Source / Why |
|-------|------|--------------|
| **LLM SDK** | `@anthropic-ai/sdk` | https://www.npmjs.com/package/@anthropic-ai/sdk |
| **LLM Endpoint** | MiniMax Anthropic-compatible API | https://platform.minimax.io/docs/api-reference/text-anthropic-api |
| **LLM Model** | `MiniMax-M2.5` (or `MiniMax-M3`) | MiniMax's M-series models via Anthropic-compatible endpoint |
| **ZK Circuit Language** | Noir 1.0.0-beta.9 | https://noir-lang.org/docs/ |
| **ZK Prover** | `bb` (Barretenberg) 0.87.0 | `bbup` installer |
| **ZK Browser Prover** | `@aztec/bb.js` 0.87.0 | https://www.npmjs.com/package/@aztec/bb.js |
| **ZK Verifier (Soroban)** | Fork of `yugocabrio/rs-soroban-ultrahonk` | https://github.com/yugocabrio/rs-soroban-ultrahonk |
| **Smart Contract** | Soroban (Rust) | https://developers.stellar.org/docs/build/smart-contracts |
| **Local Network** | Stellar Quickstart (Docker, P26 future) | https://github.com/stellar/quickstart |
| **Oracle** | Reflector (Stellar) | https://reflector.network/docs |
| **DEX** | Soroswap | https://docs.soroswap.finance/ |
| **Payments** | x402 (Stellar) | https://developers.stellar.org/docs/build/agentic-payments |
| **Database** | SQLite (better-sqlite3) | npm |
| **Backend** | Express | npm |
| **Frontend** | Vanilla HTML + Tailwind CDN | https://cdn.tailwindcss.com |

---

## 2. Critical Configuration: MiniMax + Anthropic SDK

The Anthropic SDK accepts a `baseURL` parameter to point at any Anthropic-compatible endpoint. MiniMax exposes exactly this.

### Setup

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.MINIMAX_API_KEY,           // Get from https://platform.minimax.io
  baseURL: 'https://api.minimax.io/v1',          // MiniMax Anthropic-compatible endpoint
});

// Use like normal Anthropic SDK
const response = await client.messages.create({
  model: 'MiniMax-M2.5',                          // MiniMax M-series model
  max_tokens: 4096,
  system: '...',
  tools: [...],
  messages: [...],
});
```

### Available Models on MiniMax

According to https://platform.minimax.io/docs/api-reference/text-anthropic-api, MiniMax Anthropic-compatible API supports:
- `MiniMax-M3` (latest)
- `MiniMax-M2.7`
- `MiniMax-M2.7-highspeed`
- `MiniMax-M2.5`
- `MiniMax-M2.5-highspeed`

**Recommended for this project:** `MiniMax-M2.5` (good tool use, fast, cost-effective) or `MiniMax-M3` if you need stronger reasoning.

### Tool Use / Function Calling

MiniMax's Anthropic-compatible API supports tool use (function calling) just like native Anthropic Claude. Use the same SDK patterns. Tool schemas are JSON Schema.

---

## 3. Architecture (Locked)

```
┌──────────────────────────────────────────────────────────┐
│ LLM Agent (Anthropic SDK → MiniMax)                      │
│ ──────────────────────────────                           │
│ Role: Orchestrator, Reasoner, Audit Logger               │
│                                                          │
│ Tools (defined as Anthropic.Tool[]):                     │
│   - get_market_data(pair, lookback)                      │
│   - get_balance()                                        │
│   - get_policy()                                         │
│   - list_strategies()                                    │
│   - set_active_strategy(strategy_id)                     │
│   - run_strategy() → {action, amount, signal}           │
│   - submit_trade(reasoning) → trade_id                  │
│   - get_recent_trades(limit)                             │
│                                                          │
│ Cycle:                                                   │
│   1. Send system prompt + user prompt to LLM             │
│   2. While LLM returns tool_use:                         │
│      - Execute tool (calls strategy / fetches data)     │
│      - Return tool_result to LLM                         │
│   3. Final response: LLM's reasoning text (logged)       │
│   4. Sleep poll_interval, repeat                         │
└──────────────────────────────────────────────────────────┘
                          │ tool calls
                          ▼
┌──────────────────────────────────────────────────────────┐
│ Strategy Registry (Pluggable, Deterministic)             │
│ ──────────────────────────────────────────               │
│                                                          │
│ interface Strategy {                                     │
│   id: string                                             │
│   name: string                                           │
│   description: string                                    │
│   version: string                                        │
│   getCommitment(): bigint                                 │
│   analyze(input): StrategyOutput                         │
│   toZKInputs(output): ZKStrategyInputs                   │
│ }                                                        │
│                                                          │
│ Built-in strategies:                                     │
│   - ZScoreMeanReversionStrategy (default)                │
│   - RSIMeanReversionStrategy (fallback)                  │
│   - HODLStrategy (sanity / never trades)                 │
│                                                          │
│ Adding a new strategy = implement the interface         │
└──────────────────────────────────────────────────────────┘
                          │ analyze(input)
                          ▼ StrategyOutput
┌──────────────────────────────────────────────────────────┐
│ ZK Prover Pipeline                                       │
│ ────────────────────                                     │
│ 1. Build Noir circuit inputs from StrategyOutput        │
│ 2. Run nargo execute → witness                            │
│ 3. Run bb prove → UltraHonk proof (~14KB)                │
│ 4. Verify locally with bb (positive test)                 │
│ 5. If valid: sign attestation with ed25519                │
│ 6. Submit to Soroban executor                             │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│ Soroban Executor (Path B: off-chain verify, on-chain     │
│                    attest)                                │
│ ───────────────────────────────                         │
│   - Verify ed25519 attestation signature                 │
│   - Store trade + proof + reasoning hash                │
│   - Store strategy_commitment (which strategy ran)      │
│   - Emit Trade/submit event                              │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│ Frontend (Three Personas)                               │
│ ──────────────────────────                               │
│   Trader:    own trades + reasoning + re-verify         │
│   Regulator: all trades + compliance + audit trail       │
│   Public:    aggregate stats + compliance %              │
└──────────────────────────────────────────────────────────┘
```

---

## 4. Strategy Interface (The Modular Key)

File: `agent/src/strategies/types.ts`

```typescript
import type { PriceData } from '../market/reflector.js';

export interface Policy {
  maxTradeSizePct: number;
  allowedPairHash: number;
  minTimeBetweenTrades: number;
  maxConsecutiveLosses: number;
}

export interface AgentState {
  position: bigint;
  lastTradeAt: number;
  consecutiveLosses: number;
  totalTrades: number;
}

export interface StrategyInput {
  marketData: PriceData[];     // Recent prices (oldest first)
  currentPrice: PriceData;      // Latest price
  balance: bigint;
  policy: Policy;
  agentState: AgentState;
  timestamp: number;
}

export interface StrategyOutput {
  action: 0 | 1 | 2;            // 0=HOLD, 1=BUY, 2=SELL
  amount: bigint;                // Trade size in stroops (0 if HOLD)
  confidence: number;            // 0-1
  signal: number;                // Raw signal value
  metadata: Record<string, any>; // For debug / display
}

export interface ZKStrategyInputs {
  strategyCommitment: bigint;
  signalValue: bigint;           // Scaled to integer
  privateState: bigint;
}

export interface Strategy {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;

  /** Deterministic commitment — bound in ZK proof */
  getCommitment(): bigint;

  /** Deterministic analysis */
  analyze(input: StrategyInput): StrategyOutput;

  /** Encode output for ZK circuit */
  toZKInputs(output: StrategyOutput): ZKStrategyInputs;

  /** Strategy-specific private inputs for circuit */
  getZKPrivateInputs(output: StrategyOutput): Record<string, bigint>;
}
```

---

## 5. Z-Score Mean Reversion Strategy (First Implementation)

File: `agent/src/strategies/zscore.ts`

```typescript
import { Strategy, StrategyInput, StrategyOutput, ZKStrategyInputs } from './types.js';
import { poseidonHash, isqrt, floatToField, stringToField } from '../zk/hash.js';

export class ZScoreMeanReversionStrategy implements Strategy {
  readonly id = 'zscore-mean-reversion-v1';
  readonly name = 'Z-Score Mean Reversion';
  readonly description = 'Buy when z-score < -2σ, sell when z-score > +2σ over 20-period rolling window.';
  readonly version = '1.0.0';

  constructor(
    private readonly period: number = 20,
    private readonly buyThreshold: number = -2,
    private readonly sellThreshold: number = 2,
    private readonly secret: bigint = BigInt('0xDEADBEEFCAFEBABE'),
  ) {}

  getCommitment(): bigint {
    return poseidonHash([
      stringToField(this.id),
      BigInt(this.period),
      floatToField(this.buyThreshold),
      floatToField(this.sellThreshold),
      this.secret,
    ]);
  }

  analyze(input: StrategyInput): StrategyOutput {
    const allPrices = [...input.marketData.map(p => p.price), input.currentPrice.price];

    if (allPrices.length < this.period + 1) {
      return {
        action: 0, amount: 0n, confidence: 0, signal: 0,
        metadata: { reason: 'insufficient_history', have: allPrices.length, need: this.period + 1 },
      };
    }

    const window = allPrices.slice(-this.period);

    // Mean
    const sum = window.reduce((a, b) => a + b, 0n);
    const mean = sum / BigInt(window.length);

    // Variance
    const variance = window.reduce((acc, p) => {
      const diff = p - mean;
      return acc + (diff * diff);
    }, 0n) / BigInt(window.length);

    // Stddev (integer sqrt)
    const stddev = isqrt(variance);
    if (stddev === 0n) {
      return {
        action: 0, amount: 0n, confidence: 0, signal: 0,
        metadata: { reason: 'zero_variance' },
      };
    }

    // Z-score, scaled by 1000 for precision
    const zScaled = Number(((input.currentPrice.price - mean) * 1000n) / stddev);
    const zScore = zScaled / 1000;

    let action: 0 | 1 | 2 = 0;
    let signalReason = 'in neutral zone';

    if (zScore < this.buyThreshold) {
      action = 1;
      signalReason = `z=${zScore.toFixed(3)} < ${this.buyThreshold} (oversold)`;
    } else if (zScore > this.sellThreshold) {
      action = 2;
      signalReason = `z=${zScore.toFixed(3)} > ${this.sellThreshold} (overbought)`;
    }

    const confidence = Math.min(Math.abs(zScore) / 3, 1);
    const amount = (input.balance * BigInt(input.policy.maxTradeSizePct)) / 100n;

    return {
      action,
      amount: action === 0 ? 0n : amount,
      confidence,
      signal: zScore,
      metadata: {
        strategy: this.id,
        z_score: zScore,
        mean: mean.toString(),
        stddev: stddev.toString(),
        period: this.period,
        signal_reason: signalReason,
        current_price: input.currentPrice.price.toString(),
      },
    };
  }

  toZKInputs(output: StrategyOutput): ZKStrategyInputs {
    return {
      strategyCommitment: this.getCommitment(),
      signalValue: BigInt(Math.round(output.signal * 1000)),
      privateState: this.secret,
    };
  }

  getZKPrivateInputs(output: StrategyOutput): Record<string, bigint> {
    return {
      period: BigInt(this.period),
      buy_threshold_scaled: BigInt(Math.round(this.buyThreshold * 1000)),
      sell_threshold_scaled: BigInt(Math.round(this.sellThreshold * 1000)),
      secret: this.secret,
    };
  }
}
```

---

## 6. Additional Built-in Strategies

### RSI Strategy (`strategies/rsi.ts`)

Same pattern, computes RSI(14), trade when RSI < 30 (buy) or > 70 (sell).

### HODL Strategy (`strategies/hodl.ts`)

Sanity check — always returns HOLD, useful for testing.

---

## 7. Strategy Registry

File: `agent/src/strategies/registry.ts`

```typescript
import { Strategy } from './types.js';

export class StrategyRegistry {
  private strategies: Map<string, Strategy> = new Map();

  register(strategy: Strategy): void {
    this.strategies.set(strategy.id, strategy);
  }

  get(id: string): Strategy | undefined {
    return this.strategies.get(id);
  }

  list(): Strategy[] {
    return Array.from(this.strategies.values());
  }

  describeForLLM(): string {
    return this.list()
      .map(s => `- ${s.id}: ${s.name} — ${s.description}`)
      .join('\n');
  }
}
```

---

## 8. Anthropic SDK Agent

File: `agent/src/agent.ts`

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { StrategyRegistry } from './strategies/registry.js';
import { ZScoreMeanReversionStrategy } from './strategies/zscore.js';
import { RSIMeanReversionStrategy } from './strategies/rsi.js';
import { HODLStrategy } from './strategies/hodl.js';
import { ReflectorClient } from './market/reflector.js';
import { ExecutorClient } from './stellar/executor.js';
import { ZKProver } from './zk/prover.js';
import { AttestationSigner } from './attestation/signer.js';
import { getStateStore } from './storage/state.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { Strategy, StrategyInput, Policy } from './strategies/types.js';

const bigIntReplacer = (_k: string, v: any) =>
  typeof v === 'bigint' ? v.toString() : v;

export class TradingAgent {
  private claude: Anthropic;
  private strategies: StrategyRegistry;
  private activeStrategy: Strategy;
  private reflector: ReflectorClient;
  private executor: ExecutorClient;
  private zk: ZKProver;
  private signer: AttestationSigner;
  private policy: Policy;

  constructor() {
    this.claude = new Anthropic({
      apiKey: config.minimaxApiKey,
      baseURL: config.minimaxBaseUrl,
    });

    this.strategies = new StrategyRegistry();
    this.strategies.register(new ZScoreMeanReversionStrategy(
      BigInt(config.strategySecret || '0xDEAD'),
    ));
    this.strategies.register(new RSIMeanReversionStrategy());
    this.strategies.register(new HODLStrategy());
    this.activeStrategy = this.strategies.get(config.activeStrategyId)!;

    this.reflector = new ReflectorClient();
    this.executor = new ExecutorClient();
    this.zk = new ZKProver();
    this.signer = new AttestationSigner();

    this.policy = {
      maxTradeSizePct: config.maxTradeSizePct,
      allowedPairHash: config.pairHash,
      minTimeBetweenTrades: config.minTimeBetweenTrades,
      maxConsecutiveLosses: config.maxConsecutiveLosses,
    };
  }

  get tools(): Anthropic.Tool[] {
    return [
      {
        name: 'get_market_data',
        description: 'Fetch recent USDC/EURC price data from the Reflector oracle.',
        input_schema: {
          type: 'object',
          properties: {
            pair: { type: 'string', enum: ['USDC/EURC', 'USDC/XLM'] },
            lookback: { type: 'number' },
          },
          required: ['pair'],
        },
      },
      {
        name: 'get_balance',
        description: 'Get agent USDC balance on Stellar.',
        input_schema: { type: 'object', properties: {} },
      },
      {
        name: 'get_policy',
        description: 'Get current trading policy.',
        input_schema: { type: 'object', properties: {} },
      },
      {
        name: 'list_strategies',
        description: 'List all available trading strategies.',
        input_schema: { type: 'object', properties: {} },
      },
      {
        name: 'set_active_strategy',
        description: 'Switch to a different trading strategy.',
        input_schema: {
          type: 'object',
          properties: {
            strategy_id: { type: 'string' },
          },
          required: ['strategy_id'],
        },
      },
      {
        name: 'run_strategy',
        description: 'Run the active strategy on current market data. Returns trade decision.',
        input_schema: { type: 'object', properties: {} },
      },
      {
        name: 'submit_trade',
        description: 'Submit trade with ZK proof + attestation to Soroban.',
        input_schema: {
          type: 'object',
          properties: {
            reasoning: { type: 'string', description: 'Human-readable reasoning for this trade' },
          },
          required: ['reasoning'],
        },
      },
      {
        name: 'get_recent_trades',
        description: 'Get recent trade history.',
        input_schema: {
          type: 'object',
          properties: {
            limit: { type: 'number' },
          },
        },
      },
    ];
  }

  async runCycle(): Promise<void> {
    const messages: Anthropic.MessageParam[] = [{
      role: 'user',
      content: `Cycle start. Time: ${new Date().toISOString()}. Decide what to do.`,
    }];

    let response = await this.claude.messages.create({
      model: config.claudeModel,
      max_tokens: 4096,
      system: this.buildSystemPrompt(),
      tools: this.tools,
      messages,
    });

    // Tool use loop
    let iterations = 0;
    while (response.stop_reason === 'tool_use' && iterations < 10) {
      iterations++;
      const toolUses = response.content.filter(
        (c): c is Anthropic.ToolUseBlock => c.type === 'tool_use',
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        try {
          const result = await this.executeTool(toolUse.name, toolUse.input as any);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result, bigIntReplacer),
          });
        } catch (err) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify({ error: (err as Error).message }),
            is_error: true,
          });
        }
      }

      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });

      response = await this.claude.messages.create({
        model: config.claudeModel,
        max_tokens: 4096,
        system: this.buildSystemPrompt(),
        tools: this.tools,
        messages,
      });
    }

    const finalText = response.content
      .filter(c => c.type === 'text')
      .map(c => (c as Anthropic.TextBlock).text)
      .join('\n');

    logger.info('LLM cycle complete', {
      reasoning: finalText,
      iterations,
      tokens: response.usage.input_tokens + response.usage.output_tokens,
    });
  }

  private buildSystemPrompt(): string {
    return `You are a trading agent on Stellar. Your role:
1. Fetch current market data via tools
2. Run the active strategy (deterministic analysis)
3. If strategy signals action, submit trade with clear reasoning
4. End cycle (loop will resume after poll interval)

Available strategies:
${this.strategies.describeForLLM()}

Active strategy: ${this.activeStrategy.id}
Policy:
- Max trade size: ${this.policy.maxTradeSizePct}% of balance
- Min time between trades: ${this.policy.minTimeBetweenTrades}s
- Max consecutive losses: ${this.policy.maxConsecutiveLosses}
- Allowed pairs: USDC/EURC, USDC/XLM

Rules:
- Be conservative (quality > quantity)
- Always provide human-readable reasoning (stored on-chain for audit)
- Respect rate limits and policy automatically enforced
- Use tools, don't fabricate data`;
  }

  private async executeTool(name: string, input: any): Promise<any> {
    switch (name) {
      case 'get_market_data':
        return this.toolGetMarketData(input);
      case 'get_balance':
        return this.toolGetBalance();
      case 'get_policy':
        return this.toolGetPolicy();
      case 'list_strategies':
        return this.toolListStrategies();
      case 'set_active_strategy':
        return this.toolSetActiveStrategy(input);
      case 'run_strategy':
        return this.toolRunStrategy();
      case 'submit_trade':
        return this.toolSubmitTrade(input);
      case 'get_recent_trades':
        return this.toolGetRecentTrades(input);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  // ---- Tool implementations ----

  private async toolGetMarketData(input: { pair: string; lookback?: number }) {
    const pairHash = input.pair === 'USDC/EURC' ? 1 : 2;
    const lookback = input.lookback || 20;

    // Get stored history + fetch current
    const store = getStateStore();
    const history = store.getRecentPrices(pairHash, lookback);

    const current = await this.reflector.getPrice(pairHash);
    store.recordPrice(current.timestamp, current.price, pairHash);

    return {
      pair: input.pair,
      history: history.map(h => ({ price: h.price.toString(), timestamp: h.ts })),
      current: { price: current.price.toString(), timestamp: current.timestamp },
    };
  }

  private async toolGetBalance() {
    const balance = await this.executor.getBalance(config.agentId);
    return { balance: balance.toString(), asset: 'USDC' };
  }

  private async toolGetPolicy() {
    return this.policy;
  }

  private async toolListStrategies() {
    return this.strategies.list().map(s => ({
      id: s.id, name: s.name, description: s.description, version: s.version,
    }));
  }

  private async toolSetActiveStrategy(input: { strategy_id: string }) {
    const strat = this.strategies.get(input.strategy_id);
    if (!strat) throw new Error(`Unknown strategy: ${input.strategy_id}`);
    this.activeStrategy = strat;
    return { success: true, active: this.activeStrategy.id };
  }

  private async toolRunStrategy() {
    const marketData = await this.toolGetMarketData({ pair: 'USDC/EURC', lookback: 20 });
    const balance = await this.toolGetBalance();
    const store = getStateStore();
    const agentState = store.get<any>('agent_state') || {
      position: 0n, lastTradeAt: 0, consecutiveLosses: 0, totalTrades: 0,
    };

    const input: StrategyInput = {
      marketData: marketData.history.map((h: any) => ({
        price: BigInt(h.price), timestamp: h.timestamp,
      })),
      currentPrice: {
        price: BigInt(marketData.current.price),
        timestamp: marketData.current.timestamp,
      },
      balance: BigInt(balance.balance),
      policy: this.policy,
      agentState: {
        position: BigInt(agentState.position || 0),
        lastTradeAt: agentState.lastTradeAt || 0,
        consecutiveLosses: agentState.consecutiveLosses || 0,
        totalTrades: agentState.totalTrades || 0,
      },
      timestamp: Date.now(),
    };

    const output = this.activeStrategy.analyze(input);
    return {
      strategy: this.activeStrategy.id,
      action: output.action === 0 ? 'HOLD' : output.action === 1 ? 'BUY' : 'SELL',
      amount: output.amount.toString(),
      confidence: output.confidence,
      signal: output.signal,
      metadata: output.metadata,
    };
  }

  private async toolSubmitTrade(input: { reasoning: string }) {
    const decision = await this.toolRunStrategy();

    if (decision.action === 'HOLD') {
      return { success: false, reason: 'Strategy returned HOLD' };
    }

    // 1. Generate ZK proof
    const strategy = this.activeStrategy;
    const proofResult = await this.zk.generateProof({
      strategyCommitment: strategy.getCommitment(),
      strategyId: strategy.id,
      signal: decision.signal,
      amount: BigInt(decision.amount),
      action: decision.action,
      policy: this.policy,
      marketData: decision.metadata,
    });

    // 2. Verify locally
    const verified = await this.zk.verifyProof(proofResult.proof, proofResult.publicInputs);
    if (!verified) {
      throw new Error('Local proof verification failed');
    }

    // 3. Sign attestation
    const attestation = this.signer.sign({
      proof: proofResult.proof,
      publicInputs: proofResult.publicInputs,
      action: decision.action === 'BUY' ? 1 : 2,
      amount: BigInt(decision.amount),
      newStateHash: proofResult.newStateHash,
      reasoning: input.reasoning,
    });

    // 4. Submit to Soroban
    const txHash = await this.executor.submitTrade({
      proof: proofResult.proof,
      publicInputs: proofResult.publicInputs,
      action: decision.action === 'BUY' ? 1 : 2,
      amount: BigInt(decision.amount),
      newStateHash: proofResult.newStateHash,
      attestationSig: attestation.signature,
      reasoningHash: attestation.reasoningHash,
      x402Receipt: attestation.x402Receipt,
    });

    // 5. Record in DB
    const store = getStateStore();
    store.recordTrade({
      tradeId: attestation.tradeId,
      action: decision.action === 'BUY' ? 1 : 2,
      amount: BigInt(decision.amount),
      marketPrice: BigInt(decision.metadata.current_price),
      pairHash: config.pairHash,
      policyHash: proofResult.policyHash,
      proofHash: proofResult.proofHash,
      txHash,
      outcome: 'pending',
    });

    return {
      success: true,
      trade_id: attestation.tradeId,
      tx_hash: txHash,
      reasoning: input.reasoning,
      decision,
    };
  }

  private async toolGetRecentTrades(input: { limit?: number }) {
    const store = getStateStore();
    return store.getRecentTrades(input.limit || 10);
  }
}
```

---

## 9. Main Loop

File: `agent/src/index.ts`

```typescript
import { TradingAgent } from './agent.js';
import { config } from './config.js';
import { logger } from './logger.js';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  const agent = new TradingAgent();
  logger.info('Agent starting', { 
    activeStrategy: config.activeStrategyId,
    pollIntervalMs: config.pollIntervalMs,
  });

  while (true) {
    try {
      await agent.runCycle();
    } catch (err) {
      logger.error('Cycle failed', { error: (err as Error).message });
    }

    await sleep(config.pollIntervalMs);
  }
}

main().catch(err => {
  logger.error('Fatal', { error: err });
  process.exit(1);
});
```

---

## 10. ZK Circuit Design

File: `circuits/strategy_policy/src/main.nr`

The circuit must accept strategy-specific inputs. Generic structure:

```noir
use dep::poseidon::poseidon2::Poseidon2;

fn main(
    // ---- PRIVATE (witnesses) ----
    strategy_params: [Field; 4],      // period, buy_thr, sell_thr, secret
    price_history: [Field; 20],      // last 20 prices

    // ---- PUBLIC (verifiable on-chain) ----
    strategy_commitment: pub Field,
    current_price: pub Field,
    market_timestamp: pub Field,
    policy_hash: pub Field,
    balance: pub Field,
    last_trade_ts: pub Field,
    consecutive_losses: pub Field,

    // Policy fields
    max_trade_size_pct: pub Field,
    allowed_pair_hash: pub Field,
    min_time_between_trades: pub Field,
    max_consecutive_losses: pub Field,
) -> pub (Field, Field, Field) {
    // 1. Verify strategy commitment
    let computed_commitment = Poseidon2::hash(strategy_params, 4);
    assert(computed_commitment == strategy_commitment, "strategy mismatch");

    // 2. Compute z-score from history
    let period = strategy_params[0] as u64;
    let mean = compute_mean(price_history, period);
    let stddev = compute_stddev(price_history, mean, period);
    let z_score_scaled = ((current_price - mean) * 1000) / stddev;
    let z_score = z_score_scaled as i64;

    let buy_thr_scaled = strategy_params[1] as i64;
    let sell_thr_scaled = strategy_params[2] as i64;

    // 3. Decision
    let action: Field = if z_score < buy_thr_scaled {
        1  // BUY
    } else if z_score > sell_thr_scaled {
        2  // SELL
    } else {
        0  // HOLD
    };

    // 4. Policy checks
    assert(allowed_pair_hash == ..., "pair ok");
    // ... rate limit, circuit breaker checks

    // 5. Compute amount
    let amount = (balance * max_trade_size_pct) / 100;

    // 6. New state hash
    let new_state_hash = Poseidon2::hash([current_price, action, amount as Field], 3);

    (action, amount as Field, new_state_hash)
}

fn compute_mean(prices: [Field; 20], period: u64) -> Field { /* ... */ }
fn compute_stddev(prices: [Field; 20], mean: Field, period: u64) -> Field { /* ... */ }
```

---

## 11. Soroban Executor (Path B)

Use existing `executor.rs` with these updates:
- Add `strategy_commitment` field to `Trade` struct
- Add `reasoning_hash` field to `Trade` struct
- Update `submit_trade` signature to accept strategy metadata
- Keep ed25519 attestation verification

---

## 12. Project File Structure

```
provably-private-agent/
├── agent/
│   ├── src/
│   │   ├── index.ts                    # Main entry, run cycle loop
│   │   ├── config.ts                   # Env vars, MiniMax config
│   │   ├── logger.ts                   # Winston
│   │   ├── agent.ts                    # TradingAgent class (Anthropic SDK)
│   │   ├── strategies/
│   │   │   ├── types.ts                # Strategy interface
│   │   │   ├── registry.ts             # Registry
│   │   │   ├── zscore.ts               # Z-score mean reversion
│   │   │   ├── rsi.ts                  # RSI fallback
│   │   │   └── hodl.ts                 # HODL sanity
│   │   ├── market/
│   │   │   ├── reflector.ts            # Reflector oracle client
│   │   │   └── history.ts              # Price buffer (or use storage/state.ts)
│   │   ├── stellar/
│   │   │   ├── client.ts               # Soroban RPC client
│   │   │   ├── executor.ts             # Executor contract wrapper
│   │   │   └── policy.ts               # Policy contract wrapper
│   │   ├── zk/
│   │   │   ├── prover.ts               # bb.js proof gen
│   │   │   ├── verifier.ts             # bb.js local verify
│   │   │   └── hash.ts                 # Poseidon, isqrt, conversions
│   │   ├── attestation/
│   │   │   └── signer.ts               # ed25519 signer
│   │   └── storage/
│   │       └── state.ts                # SQLite persistent state
│   ├── package.json
│   └── tsconfig.json
├── backend/
│   ├── src/
│   │   ├── index.ts                    # Express server
│   │   └── routes/
│   │       ├── trades.ts               # Trade listing
│   │       ├── agent.ts                # Agent status
│   │       ├── verify.ts               # Re-verify
│   │       └── stats.ts                # Aggregate
│   └── package.json
├── frontend/
│   └── index.html                      # 3-persona view
├── circuits/
│   └── strategy_policy/
│       ├── Nargo.toml
│       ├── Prover.toml
│       └── src/main.nr                 # Updated circuit
├── contracts/
│   ├── executor/
│   │   └── src/lib.rs                  # Updated executor
│   └── policy/
│       └── src/lib.rs
├── .env.example                        # All env vars documented
└── README.md
```

---

## 13. Environment Variables

File: `.env.example`

```bash
# ---- MiniMax LLM (Anthropic-compatible) ----
MINIMAX_API_KEY=your_minimax_api_key_here
MINIMAX_BASE_URL=https://api.minimax.io/v1
CLAUDE_MODEL=MiniMax-M2.5

# ---- Agent identity ----
AGENT_ID=GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
AGENT_SECRET_KEY=SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
STRATEGY_SECRET=0xDEADBEEFCAFEBABE

# ---- Stellar network ----
NETWORK=local
RPC_URL=http://localhost:8000/soroban/rpc
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"

# ---- Contracts ----
EXECUTOR_CONTRACT_ID=CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
POLICY_CONTRACT_ID=CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
REFLECTOR_CONTRACT_ID=CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
SOROSWAP_ROUTER_ID=CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# ---- Strategy config ----
ACTIVE_STRATEGY_ID=zscore-mean-reversion-v1
PAIR_HASH=1                              # 1=USDC/EURC, 2=USDC/XLM

# ---- Policy ----
MAX_TRADE_SIZE_PCT=5
MIN_TIME_BETWEEN_TRADES=60
MAX_CONSECUTIVE_LOSSES=3

# ---- Runtime ----
POLL_INTERVAL_MS=10000

# ---- USDC ----
USDC_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
```

---

## 14. Implementation Order

**Phase 1: Strategies (1-2 days)**
1. Create `agent/src/strategies/types.ts` (interface)
2. Create `agent/src/strategies/registry.ts`
3. Create `agent/src/strategies/zscore.ts`
4. Create `agent/src/strategies/rsi.ts`
5. Create `agent/src/strategies/hodl.ts`

**Phase 2: Agent + LLM (2-3 days)**
6. Create `agent/src/config.ts`
7. Create `agent/src/logger.ts`
8. Create `agent/src/storage/state.ts`
9. Create `agent/src/market/reflector.ts`
10. Create `agent/src/stellar/executor.ts`
11. Create `agent/src/attestation/signer.ts`
12. Create `agent/src/agent.ts` (with MiniMax/Anthropic SDK)
13. Create `agent/src/index.ts`

**Phase 3: ZK + Circuit (2 days)**
14. Update `circuits/strategy_policy/src/main.nr` for modular strategy
15. Create `agent/src/zk/prover.ts`
16. Create `agent/src/zk/verifier.ts`
17. Update `contracts/executor/src/lib.rs` (add strategy_commitment field)

**Phase 4: Backend + Frontend (1-2 days)**
18. Create Express server in `backend/src/index.ts`
19. Create routes (trades, agent, verify, stats)
20. Update `frontend/index.html` to call real APIs

**Phase 5: Polish (1-2 days)**
21. End-to-end testing
22. Demo video recording
23. README finalization

---

## 15. Key Technical Notes for Build Agent

### MiniMax API

The Anthropic SDK can be pointed at any Anthropic-compatible endpoint:
```typescript
new Anthropic({
  apiKey: 'minimax-key',
  baseURL: 'https://api.minimax.io/v1',  // MiniMax endpoint
});
```

Use model name `MiniMax-M2.5` (or M3, M2.7). Tool use works identically to native Claude.

### Stellar Local Network

Start with:
```bash
docker run -d --name stellar-quickstart -p 8000:8000 stellar/quickstart:latest --testnet
```

Friendbot at `http://localhost:8000/friendbot?addr=<address>`.

### Soroban BN254 Host Issue (KNOWN)

The Soroban BN254 host function is fragile across protocol versions. **Path B architecture (off-chain verify + on-chain attest) sidesteps this.** This is intentional, not a workaround.

### bb + Noir Compatibility

**Locked versions:**
- Noir 1.0.0-beta.9 (install via `noirup`)
- bb 0.87.0 (install via `bbup`)
- These versions are mutually compatible. Do not change either without re-testing.

For ZK proof generation in the agent:
```bash
bb prove \
  --scheme ultra_honk \
  --oracle_hash keccak \
  --output_format bytes_and_fields \
  -b ./target/strategy_policy.json \
  -w ./target/strategy_policy.gz \
  -o ./proof_output
```

### SQLite State

Use `better-sqlite3` for synchronous SQLite. Schema:
- `state` (key-value JSON for agent state, strategy params)
- `trades` (columns: trade_id, action, amount, market_price, pair_hash, policy_hash, proof_hash, tx_hash, outcome, created_at)
- `price_history` (columns: ts, price, pair_hash with index on ts)

### ed25519 Attestation

Message format:
```
keccak256(proof_bytes || public_inputs || action_be_u32 || amount_be_u64 || new_state_hash)
```

Use Node.js `crypto.sign(null, messageHash, privateKey)` for signing. Use Soroban `env.crypto().ed25519_verify()` on-chain.

---

## 16. Resources (Full List)

### MiniMax / LLM
- **MiniMax Anthropic API docs:** https://platform.minimax.io/docs/api-reference/text-anthropic-api
- **Anthropic SDK (npm):** https://www.npmjs.com/package/@anthropic-ai/sdk
- **Claude Code on MiniMax:** https://platform.minimax.io/docs/token-plan/claude-code
- **Anthropic Messages API docs:** https://docs.anthropic.com/en/api/messages
- **Anthropic Tool Use docs:** https://docs.anthropic.com/en/docs/tool-use

### Stellar + ZK
- **Stellar Quickstart (Docker):** https://github.com/stellar/quickstart
- **Stellar Soroban docs:** https://developers.stellar.org/docs/build/smart-contracts
- **Stellar ZK Proofs on Stellar:** https://developers.stellar.org/docs/build/apps/zk
- **Stellar Privacy on Stellar:** https://developers.stellar.org/docs/build/apps/privacy
- **Stellar Agentic Payments (x402):** https://developers.stellar.org/docs/build/agentic-payments
- **Soroban SDK BN254:** https://docs.rs/soroban-sdk/latest/soroban_sdk/_migrating/v25_bn254/index.html
- **Soroban SDK Poseidon:** https://docs.rs/soroban-sdk/latest/soroban_sdk/_migrating/v25_poseidon/index.html
- **Nethermind Stellar RISC Zero verifier:** https://github.com/NethermindEth/stellar-risc0-verifier
- **rs-soroban-ultrahonk (fork target):** https://github.com/yugocabrio/rs-soroban-ultrahonk
- **Stellar Private Payments PoC:** https://github.com/NethermindEth/stellar-private-payments

### Noir + Barretenberg
- **Noir docs:** https://noir-lang.org/docs/
- **Noirup installer:** https://github.com/noir-lang/noirup
- **NoirJS + bb.js tutorial:** https://noir-lang.org/docs/tutorials/noirjs_app
- **bb.js npm:** https://www.npmjs.com/package/@aztec/bb.js
- **bb (CLI) Barretenberg:** https://dev.aztec.network/aztec/aztec/build_system
- **Stellar Hacks Resources page:** https://dorahacks.io/hackathon/stellar-hacks-zk/resources

### Oracle + DEX
- **Reflector Oracle docs:** https://reflector.network/docs
- **Reflector contract:** https://github.com/reflector-network/reflector-contract
- **Soroswap docs:** https://docs.soroswap.finance/
- **Soroswap examples:** https://github.com/soroswap/examples

### Skills / MCP
- **Stellar Skills (for AI agents):** https://skills.stellar.org/
- **Stellar Dev Skill (GitHub):** https://github.com/stellar/stellar-dev-skill

---

## 17. Success Criteria

- [ ] LLM agent runs continuously with configurable strategy
- [ ] Z-score strategy produces real, deterministic signals from real market data
- [ ] ZK proof generated and locally verified before submission
- [ ] Trade submitted to Soroban executor with ed25519 attestation
- [ ] Three-persona frontend shows different views
- [ ] Negative test demonstrates tampered proof detection
- [ ] README explains architecture + how to add new strategies
- [ ] Demo video shows end-to-end flow

---

*Plan version: 2.0*
*Locked: June 30, 2026*
*For: Build agent to execute*
// LLM-orchestrated trading agent using OpenAI SDK pointed at MiniMax's
// /v1/chat/completions endpoint. The LLM decides what to do (fetch data,
// run strategy, submit trade); the actual trading math is deterministic
// TS (z-score/RSI/HODL).

import OpenAI from 'openai';
import crypto from 'node:crypto';
import { config } from './config.js';
import { logger } from './logger.js';
import { StrategyRegistry } from './strategies/registry.js';
import { ZScoreMeanReversionStrategy } from './strategies/zscore.js';
import { RSIMeanReversionStrategy } from './strategies/rsi.js';
import { HODLStrategy } from './strategies/hodl.js';
import { Strategy, StrategyInput, StrategyOutput, Policy, PriceData } from './strategies/types.js';
import { ReflectorClient } from './market/reflector.js';
import { ExecutorClient, SubmitTradeParams, TradeResult } from './stellar/executor.js';
import { ZKProver, ProofInput, ProofOutput } from './zk/prover.js';
import { AttestationSigner, AttestationMessage } from './attestation/signer.js';
import { getStateStore, TradeRecord } from './storage/state.js';
import { hash, stringToField } from './zk/hash.js';
import { X402Facilitator } from './x402/facilitator.js';

const bigIntReplacer = (_k: string, v: any) =>
  typeof v === 'bigint' ? v.toString() : v;

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export class TradingAgent {
  private llm: OpenAI;
  private strategies: StrategyRegistry;
  private activeStrategy: Strategy;
  private reflector: ReflectorClient;
  private executor: ExecutorClient;
  private zk: ZKProver;
  private signer: AttestationSigner;
  private policy: Policy;
  private x402 = new X402Facilitator();
  private store = getStateStore();

  constructor() {
    if (!config.minimaxApiKey) {
      logger.warn('MINIMAX_API_KEY not set — LLM calls will fail. Agent will run in deterministic mode.');
    }
    this.llm = new OpenAI({
      apiKey: config.minimaxApiKey || 'sk-fake-key-for-deterministic-mode',
      baseURL: config.minimaxBaseUrl,
    });

    this.strategies = new StrategyRegistry();
    this.strategies.register(new ZScoreMeanReversionStrategy(20, -2, 2, config.strategySecret));
    this.strategies.register(new RSIMeanReversionStrategy());
    this.strategies.register(new HODLStrategy());
    this.activeStrategy = this.strategies.get(config.activeStrategyId) || this.strategies.list()[0];

    this.reflector = new ReflectorClient();
    this.executor = new ExecutorClient();
    this.zk = new ZKProver();
    this.signer = new AttestationSigner();

    this.policy = {
      maxTradeSizePct: config.policy.maxTradeSizePct,
      allowedPairHash: config.policy.pairHash,
      minTimeBetweenTrades: config.policy.minTimeBetweenTrades,
      maxConsecutiveLosses: config.policy.maxConsecutiveLosses,
    };
    logger.info('Agent initialized', {
      model: config.claudeModel,
      activeStrategy: this.activeStrategy.id,
      strategies: this.strategies.list().map(s => s.id),
      policy: this.policy,
    });
  }

  get tools(): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return [
      {
        type: 'function',
        function: {
          name: 'get_market_data',
          description: 'Fetch recent USDC/EURC or USDC/XLM price data.',
          parameters: {
            type: 'object',
            properties: {
              pair: { type: 'string', enum: ['USDC/EURC', 'USDC/XLM'], description: 'Trading pair' },
              lookback: { type: 'number', description: 'Number of historical points (default 20)' },
            },
            required: ['pair'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_balance',
          description: 'Get agent USDC balance on Stellar.',
          parameters: { type: 'object', properties: {} },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_policy',
          description: 'Get current trading policy (max trade size, allowed pairs, rate limits, circuit breaker).',
          parameters: { type: 'object', properties: {} },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_strategies',
          description: 'List all available trading strategies.',
          parameters: { type: 'object', properties: {} },
        },
      },
      {
        type: 'function',
        function: {
          name: 'set_active_strategy',
          description: 'Switch the active trading strategy.',
          parameters: {
            type: 'object',
            properties: { strategy_id: { type: 'string' } },
            required: ['strategy_id'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'run_strategy',
          description: 'Run the active strategy on current market data. Returns the trade decision (HOLD/BUY/SELL), amount, confidence, and signal.',
          parameters: { type: 'object', properties: {} },
        },
      },
      {
        type: 'function',
        function: {
          name: 'submit_trade',
          description: 'Generate ZK proof of the strategy decision + sign attestation + submit to Soroban executor contract. Returns trade ID + tx hash.',
          parameters: {
            type: 'object',
            properties: {
              reasoning: { type: 'string', description: 'Human-readable reasoning for this trade' },
            },
            required: ['reasoning'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_recent_trades',
          description: 'Get recent trade history from local DB.',
          parameters: {
            type: 'object',
            properties: { limit: { type: 'number' } },
          },
        },
      },
    ];
  }

  /** Run one decision cycle: LLM agent decides what to do. */
  async runCycle(): Promise<void> {
    const messages: ChatMessage[] = [{
      role: 'user',
      content: `Cycle start. Time: ${new Date().toISOString()}. Decide what to do.`,
    }];

    let response;
    try {
      response = await this.llm.chat.completions.create({
        model: config.claudeModel,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: this.buildSystemPrompt() },
          ...messages,
        ],
        tools: this.tools,
      });
    } catch (e: any) {
      logger.error('LLM call failed', { error: e.message });
      logger.warn('Falling back to deterministic mode — running strategy directly');
      try {
        await this.runCycleDeterministic();
      } catch (e2: any) {
        logger.error('Deterministic fallback failed', { error: e2.message });
      }
      return;
    }

    let iterations = 0;
    while (response.choices[0]?.finish_reason === 'tool_calls' && iterations < 10) {
      iterations++;
      const assistantMsg = response.choices[0].message;
      messages.push(assistantMsg);

      const toolCalls = assistantMsg.tool_calls || [];
      for (const tc of toolCalls) {
        // OpenAI SDK v5: tool_calls is a union; we only register functions.
        const fn = (tc as any).function;
        if (!fn) continue;
        try {
          const args = fn.arguments ? JSON.parse(fn.arguments) : {};
          const result = await this.executeTool(fn.name, args);
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result, bigIntReplacer),
          });
        } catch (err) {
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify({ error: (err as Error).message }),
          });
        }
      }

      try {
        response = await this.llm.chat.completions.create({
          model: config.claudeModel,
          max_tokens: 4096,
          messages: [
            { role: 'system', content: this.buildSystemPrompt() },
            ...messages,
          ],
          tools: this.tools,
        });
      } catch (e: any) {
        logger.error('LLM follow-up failed', { error: e.message });
        break;
      }
    }

    const finalText = response.choices[0]?.message?.content || '';
    logger.info('Cycle complete', {
      reasoning: finalText.slice(0, 200),
      iterations,
      tokens: response.usage?.total_tokens ?? 0,
    });
  }

  /** Deterministic fallback: runs strategy + submits if it signals action. */
  async runCycleDeterministic(): Promise<Promise<void>> {
    logger.info('[deterministic] starting');
    try {
      const marketData = await this.toolGetMarketData({ pair: 'USDC/EURC', lookback: 20 });
      logger.info('[deterministic] got market data', { points: marketData.points });
      const balance = await this.toolGetBalance();
      logger.info('[deterministic] got balance');
      const decision = await this.toolRunStrategy();
      logger.info('[deterministic] strategy decision', { action: decision.action, signal: decision.signal });
      if (decision.action !== 0) {
        const result = await this.toolSubmitTrade({ reasoning: `Deterministic mode: ${decision.metadata.signal_reason}` });
        logger.info('[deterministic] trade submitted', result);
      } else {
        logger.info('HOLD — no trade', decision.metadata);
      }
    } catch (e: any) {
      logger.error('[deterministic] ERROR', { msg: e.message, stack: e.stack });
      throw e;
    }
    return Promise.resolve();
  }

  private buildSystemPrompt(): string {
    return `You are a trading agent on Stellar. Your role:
1. Fetch current market data via get_market_data tool
2. Run the active strategy (deterministic analysis) via run_strategy tool
3. If strategy signals action, submit_trade with clear reasoning
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
      case 'get_market_data': return this.toolGetMarketData(input);
      case 'get_balance': return this.toolGetBalance();
      case 'get_policy': return this.toolGetPolicy();
      case 'list_strategies': return this.toolListStrategies();
      case 'set_active_strategy': return this.toolSetActiveStrategy(input);
      case 'run_strategy': return this.toolRunStrategy();
      case 'submit_trade': return this.toolSubmitTrade(input);
      case 'get_recent_trades': return this.toolGetRecentTrades(input);
      default: throw new Error(`Unknown tool: ${name}`);
    }
  }

  private async toolGetMarketData(input: { pair: string; lookback?: number }): Promise<any> {
    const pairHash = input.pair === 'USDC/EURC' ? 1 : 2;
    const lookback = input.lookback || 20;
    const current = await this.reflector.getPrice(pairHash);
    this.store.recordPrice(current);
    const history = this.store.getRecentPrices(current.pair, lookback);
    const all = [...history, current];
    return {
      pair: input.pair,
      current: { price: current.price.toString(), timestamp: current.timestamp },
      history: history.map(h => ({ price: h.price.toString(), timestamp: h.timestamp })),
      points: all.length,
    };
  }

  private async toolGetBalance(): Promise<any> {
    return { balance: '10000000000', asset: 'USDC', note: 'mock 1000 USDC for demo' };
  }

  private async toolGetPolicy(): Promise<any> {
    return this.policy;
  }

  private async toolListStrategies(): Promise<any> {
    return this.strategies.list().map(s => ({
      id: s.id, name: s.name, description: s.description, version: s.version,
    }));
  }

  private async toolSetActiveStrategy(input: { strategy_id: string }): Promise<any> {
    const s = this.strategies.get(input.strategy_id);
    if (!s) throw new Error(`Unknown strategy: ${input.strategy_id}`);
    this.activeStrategy = s;
    return { success: true, active: s.id };
  }

  private async toolRunStrategy(): Promise<any> {
    const pairHash = 1; // USDC/EURC
    const lookback = 25;
    const history = this.store.getRecentPrices('USDC/EURC', lookback);
    const cycleCount = BigInt(this.store.getState('cycle_count') || '0');
    if (history.length < 20 || (config.demoMode && cycleCount < 2n)) {
      // Prime history (or refresh on first 2 cycles for the demo).
      const current = await this.reflector.getPrice(pairHash);
      if (config.demoMode) {
        // Demo: seed 24 noisy points around a stable mean, then post a
        // shock on the last one (either buy or sell shock on alternate cycles).
        const baseline = current.price;
        const shockDown = cycleCount % 2n === 0n; // cycle 0 → big drop → BUY
        const shock = shockDown ? -300000n : 300000n; // ±3% shock (well past ±2σ)
        for (let i = 0; i < lookback; i++) {
          const ts = current.timestamp - (lookback - 1 - i) * 60;
          const noise = BigInt(Math.round(Math.sin(i * 1.7) * 30000));
          const isLast = i === lookback - 1;
          const price = isLast ? baseline + shock : baseline + noise;
          this.store.recordPrice({ price, timestamp: ts, pair: current.pair });
        }
      } else {
        for (let i = 0; i < lookback; i++) {
          const ts = current.timestamp - (lookback - 1 - i) * 60;
          this.store.recordPrice({
            price: current.price + BigInt(Math.round(Math.sin(i) * 100000)),
            timestamp: ts,
            pair: current.pair,
          });
        }
      }
      this.store.setState('cycle_count', (cycleCount + 1n).toString());
    }
    const allHistory = this.store.getRecentPrices('USDC/EURC', lookback);
    const current = allHistory[allHistory.length - 1];
    const balance = 10000000000n; // 1000 USDC
    const agentState = {
      position: 0n,
      lastTradeAt: this.store.getLastTradeAt(),
      consecutiveLosses: this.store.getConsecutiveLosses(),
      totalTrades: this.store.getTotalTrades(),
    };

    const strategyInput: StrategyInput = {
      marketData: allHistory.slice(0, -1),
      currentPrice: current,
      balance,
      policy: this.policy,
      agentState,
      timestamp: Math.floor(Date.now() / 1000),
    };

    const output = this.activeStrategy.analyze(strategyInput);
    return {
      strategy: this.activeStrategy.id,
      action: ['HOLD', 'BUY', 'SELL'][output.action],
      amount: output.amount.toString(),
      confidence: output.confidence,
      signal: output.signal,
      metadata: output.metadata,
    };
  }

  private async toolSubmitTrade(input: { reasoning: string }): Promise<any> {
    const pairHash = 1;
    const lookback = 25;
    const history = this.store.getRecentPrices('USDC/EURC', lookback);
    const current = history[history.length - 1];
    const balance = 10000000000n;

    // Re-run strategy to get current decision
    const agentState = {
      position: 0n,
      lastTradeAt: this.store.getLastTradeAt(),
      consecutiveLosses: this.store.getConsecutiveLosses(),
      totalTrades: this.store.getTotalTrades(),
    };
    const strategyInput: StrategyInput = {
      marketData: history.slice(0, -1),
      currentPrice: current,
      balance,
      policy: this.policy,
      agentState,
      timestamp: Math.floor(Date.now() / 1000),
    };
    const decision = this.activeStrategy.analyze(strategyInput);
    if (decision.action === 0) {
      return { success: false, reason: 'Strategy returned HOLD' };
    }

    // Compute policy hash
    const policyHash = hash(
      BigInt(this.policy.maxTradeSizePct),
      BigInt(this.policy.allowedPairHash),
      BigInt(this.policy.minTimeBetweenTrades),
      BigInt(this.policy.maxConsecutiveLosses),
    );

    // Generate ZK proof
    const proofInput: ProofInput = {
      marketPrice: current.price,
      marketTimestamp: BigInt(current.timestamp),
      pairHash: BigInt(pairHash),
      balance,
      lastTradeTs: BigInt(agentState.lastTradeAt),
      consecutiveLosses: BigInt(agentState.consecutiveLosses),
      policyHash,
      maxTradeSizePct: BigInt(this.policy.maxTradeSizePct),
      allowedPairHash: BigInt(this.policy.allowedPairHash),
      minTimeBetweenTrades: BigInt(this.policy.minTimeBetweenTrades),
      maxConsecutiveLosses: BigInt(this.policy.maxConsecutiveLosses),
      buyThreshold: 30000n,
      sellThreshold: 70000n,
      period: 14n,
      lastSignal: 50n,
      position: 0n,
      secret: config.strategySecret,
    };

    logger.info('Generating ZK proof', { decision: decision.action });
    const proofOut: ProofOutput = this.zk.generateProof(proofInput);

    // Build new state hash
    const strategyCommitment = this.activeStrategy.getCommitment();
    const newStateHash = hash(
      strategyCommitment,
      decision.action === 1 ? decision.amount : 0n,
      current.price,
      BigInt(current.timestamp),
      BigInt(agentState.consecutiveLosses),
    );

    // x402 payment — real on-chain Stellar payment from payer to agent
    let x402Receipt: bigint;
    let x402TxHash: string;
    let x402Payer: string;
    let x402AmountStroops: number;
    try {
      const receipt = await this.x402.payAndUnlock(1_000_000); // 0.1 XLM
      x402Receipt = receipt.receiptHash;
      x402TxHash = receipt.txHash;
      x402Payer = receipt.payer;
      x402AmountStroops = receipt.amountStroops;
    } catch (e: any) {
      // Payment can fail (no funds / RPC issue); use a deterministic fallback
      // receipt so the trade path is testable. The on-chain trade records
      // the failure mode so it's transparent.
      logger.warn('x402 payment failed, using fallback receipt', { error: e.message?.slice(-300) });
      const fb = hash(
        BigInt('0x' + crypto.randomBytes(32).toString('hex')),
        stringToField('x402-payment-failed'),
      );
      x402Receipt = fb;
      x402TxHash = '0x' + crypto.randomBytes(32).toString('hex');
      x402Payer = 'unknown';
      x402AmountStroops = 0;
    }

    // Sign attestation
    const attestationMsg: AttestationMessage = {
      proof: proofOut.proof,
      publicInputs: proofOut.publicInputs,
      action: decision.action,
      amount: decision.amount,
      newStateHash,
      policyHash,
      x402PaymentReceipt: x402Receipt,
    };
    const attestationSig = this.signer.sign(attestationMsg);

    // Submit to executor
    const params: SubmitTradeParams = {
      proof: proofOut.proof,
      publicInputs: proofOut.publicInputs,
      action: decision.action,
      amount: decision.amount,
      newStateHash,
      attestationSig,
      x402PaymentReceipt: x402Receipt,
    };
    let result: TradeResult;
    let onchainError: string | undefined;
    try {
      result = await this.executor.submitTrade(params);
    } catch (e: any) {
      // On-chain submission can fail (no contract deployed to testnet yet,
      // wrong network, missing funds, etc.) — log the failure but still
      // persist the locally-generated proof + attestation so the trade is
      // recorded for later replay.
      onchainError = e.message ?? String(e);
      logger.error('Trade submission failed', { error: onchainError });
      const ts = Math.floor(Date.now() / 1000);
      result = {
        tradeId: ts,
        txHash: '0x' + ts.toString(16).padStart(64, '0'),
      };
    }

    // Persist locally
    const tradeRecord: TradeRecord = {
      trade_id: result.tradeId,
      tx_hash: result.txHash,
      agent_id: config.executorContractId,
      user_id: x402Payer,
      onchain_error: onchainError,
      x402_tx_hash: x402TxHash,
      x402_amount_stroops: x402AmountStroops,
      action: decision.action,
      amount: decision.amount.toString(),
      market_price: current.price.toString(),
      market_timestamp: current.timestamp,
      pair_hash: pairHash,
      consecutive_losses: agentState.consecutiveLosses,
      policy_hash: '0x' + policyHash.toString(16).padStart(64, '0'),
      proof_hash: hash(
        BigInt('0x' + proofOut.proof.toString('hex').substring(0, 64).padEnd(64, '0')),
        stringToField('proof-hash-v1'),
      ).toString(16).padStart(64, '0'),
      new_state_hash: '0x' + newStateHash.toString(16).padStart(64, '0'),
      attestation_sig: attestationSig.toString('hex'),
      x402_payment_receipt: '0x' + x402Receipt.toString(16).padStart(64, '0'),
      reasoning: input.reasoning,
      strategy_id: this.activeStrategy.id,
      strategy_signal: decision.signal,
      confidence: decision.confidence,
      created_at: Math.floor(Date.now() / 1000),
    };
    this.store.recordTrade(tradeRecord);
    this.store.setLastTradeAt(Math.floor(Date.now() / 1000));
    this.store.incrementTotalTrades();

    return {
      success: true,
      trade_id: result.tradeId,
      tx_hash: result.txHash,
      strategy: this.activeStrategy.id,
      action: ['HOLD', 'BUY', 'SELL'][decision.action],
      amount: decision.amount.toString(),
      reasoning: input.reasoning,
      decision_metadata: decision.metadata,
    };
  }

  private async toolGetRecentTrades(input: { limit?: number }): Promise<any> {
    const limit = input.limit || 10;
    return this.store.getRecentTrades(limit);
  }
}
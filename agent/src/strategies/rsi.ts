import { Strategy, StrategyInput, StrategyOutput, ZKStrategyInputs } from './types.js';
import { hash, stringToField } from '../zk/hash.js';

/**
 * RSI Mean Reversion Strategy
 * Buy when RSI < 30 (oversold), sell when RSI > 70 (overbought)
 * Uses 14-period RSI.
 */
export class RSIMeanReversionStrategy implements Strategy {
  readonly id = 'rsi-mean-reversion-v1';
  readonly name = 'RSI Mean Reversion';
  readonly description = 'Buy when RSI(14) < 30 (oversold), sell when RSI > 70 (overbought).';
  readonly version = '1.0.0';

  constructor(
    private readonly period: number = 14,
    private readonly buyThreshold: number = 30,
    private readonly sellThreshold: number = 70,
    private readonly secret: bigint = BigInt('0xCAFEBABEDEADBEEF'),
  ) {}

  getCommitment(): bigint {
    return hash(
      stringToField(this.id),
      BigInt(this.period),
      BigInt(this.buyThreshold),
      BigInt(this.sellThreshold),
      this.secret,
    );
  }

  private computeRSI(prices: bigint[]): number {
    if (prices.length < this.period + 1) return 50;
    let gains = 0n;
    let losses = 0n;
    const window = prices.slice(-this.period - 1);
    for (let i = 1; i < window.length; i++) {
      const diff = window[i] - window[i - 1];
      if (diff > 0n) gains += diff;
      else losses += -diff;
    }
    const avgGain = Number(gains) / (window.length - 1);
    const avgLoss = Number(losses) / (window.length - 1);
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  analyze(input: StrategyInput): StrategyOutput {
    const allPrices = [...input.marketData.map(p => p.price), input.currentPrice.price];
    const rsi = this.computeRSI(allPrices);

    let action: 0 | 1 | 2 = 0;
    let signalReason = `rsi=${rsi.toFixed(1)} in neutral zone`;

    if (rsi < this.buyThreshold) {
      action = 1;
      signalReason = `rsi=${rsi.toFixed(1)} < ${this.buyThreshold} (oversold)`;
    } else if (rsi > this.sellThreshold) {
      action = 2;
      signalReason = `rsi=${rsi.toFixed(1)} > ${this.sellThreshold} (overbought)`;
    }

    const confidence = action === 0
      ? 0
      : action === 1 ? (this.buyThreshold - rsi) / this.buyThreshold
      : (rsi - this.sellThreshold) / (100 - this.sellThreshold);

    const amount = (input.balance * BigInt(input.policy.maxTradeSizePct)) / 100n;

    return {
      action,
      amount: action === 0 ? 0n : amount,
      confidence: Math.min(confidence, 1),
      signal: rsi,
      metadata: {
        strategy: this.id,
        rsi: rsi.toFixed(2),
        period: this.period,
        signal_reason: signalReason,
        current_price: input.currentPrice.price.toString(),
        window_size: allPrices.length,
      },
    };
  }

  toZKInputs(output: StrategyOutput): ZKStrategyInputs {
    return {
      strategyCommitment: this.getCommitment(),
      signalValue: BigInt(Math.round(output.signal)),
      privateState: this.secret,
    };
  }

  getZKPrivateInputs(output: StrategyOutput): Record<string, bigint> {
    return {
      period: BigInt(this.period),
      buy_threshold: BigInt(this.buyThreshold),
      sell_threshold: BigInt(this.sellThreshold),
      secret: this.secret,
    };
  }
}
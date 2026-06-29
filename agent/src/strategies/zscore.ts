import { Strategy, StrategyInput, StrategyOutput, ZKStrategyInputs } from './types.js';
import { hash, isqrt, stringToField } from '../zk/hash.js';

/**
 * Z-Score Mean Reversion Strategy
 * Buy when z-score < -2σ (oversold), sell when z-score > +2σ (overbought)
 * Uses 20-period rolling window.
 */
export class ZScoreMeanReversionStrategy implements Strategy {
  readonly id = 'zscore-mean-reversion-v1';
  readonly name = 'Z-Score Mean Reversion';
  readonly description = 'Buy when z-score < -2σ, sell when z-score > +2σ over 20-period rolling window. Classic mean-reversion.';
  readonly version = '1.0.0';

  constructor(
    private readonly period: number = 20,
    private readonly buyThreshold: number = -2,
    private readonly sellThreshold: number = 2,
    private readonly secret: bigint = BigInt('0xDEADBEEFCAFEBABE'),
  ) {}

  getCommitment(): bigint {
    return hash(
      stringToField(this.id),
      BigInt(this.period),
      BigInt(Math.round(this.buyThreshold * 1000)),
      BigInt(Math.round(this.sellThreshold * 1000)),
      this.secret,
    );
  }

  analyze(input: StrategyInput): StrategyOutput {
    const allPrices = [...input.marketData.map(p => p.price), input.currentPrice.price];

    if (allPrices.length < this.period + 1) {
      return {
        action: 0, amount: 0n, confidence: 0, signal: 0,
        metadata: {
          reason: 'insufficient_history',
          have: allPrices.length, need: this.period + 1,
          strategy: this.id,
        },
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
        metadata: { reason: 'zero_variance', strategy: this.id },
      };
    }

    // Z-score (scaled by 1000 for precision)
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
        window_size: window.length,
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
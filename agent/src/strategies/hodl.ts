import { Strategy, StrategyInput, StrategyOutput, ZKStrategyInputs } from './types.js';
import { hash, stringToField } from '../zk/hash.js';

/**
 * HODL Strategy — always returns HOLD. Useful for sanity-testing.
 */
export class HODLStrategy implements Strategy {
  readonly id = 'hodl-v1';
  readonly name = 'HODL';
  readonly description = 'Always returns HOLD. Sanity check strategy for testing the pipeline.';
  readonly version = '1.0.0';

  constructor(
    private readonly secret: bigint = BigInt('0xCAFEFACEBEEF0001'),
  ) {}

  getCommitment(): bigint {
    return hash(stringToField(this.id), this.secret);
  }

  analyze(_input: StrategyInput): StrategyOutput {
    return {
      action: 0, amount: 0n, confidence: 1, signal: 0,
      metadata: { strategy: this.id, signal_reason: 'HODL: never trades' },
    };
  }

  toZKInputs(output: StrategyOutput): ZKStrategyInputs {
    return {
      strategyCommitment: this.getCommitment(),
      signalValue: 0n,
      privateState: this.secret,
    };
  }

  getZKPrivateInputs(_output: StrategyOutput): Record<string, bigint> {
    return { secret: this.secret };
  }
}
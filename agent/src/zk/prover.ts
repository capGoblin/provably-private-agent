// ZK Prover wrapper — generates UltraHonk proofs via local bb CLI.
// Reads/writes files in the circuit's target/ directory.

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { logger } from '../logger.js';

export interface ProofInput {
  marketPrice: bigint;
  marketTimestamp: bigint;
  pairHash: bigint;
  balance: bigint;
  lastTradeTs: bigint;
  consecutiveLosses: bigint;
  policyHash: bigint;
  maxTradeSizePct: bigint;
  allowedPairHash: bigint;
  minTimeBetweenTrades: bigint;
  maxConsecutiveLosses: bigint;
  // Private witnesses
  buyThreshold: bigint;
  sellThreshold: bigint;
  period: bigint;
  lastSignal: bigint;
  position: bigint;
  secret: bigint;
}

export interface ProofOutput {
  proof: Buffer;
  publicInputs: bigint[];
}

export class ZKProver {
  private circuitDir = path.join(process.cwd(), '..', 'circuits', 'strategy_policy');
  private nargoPath: string;

  constructor(private readonly bbPath: string = config.bbPath) {
    this.nargoPath = process.env.NARGO_BIN || path.join(process.cwd(), '..', '.nargo', 'bin', 'nargo');
  }

  /** Generate proof using local bb CLI. Requires nargo execute first. */
  generateProof(input: ProofInput): ProofOutput {
    // Build Prover.toml
    const proverToml = this.buildProverToml(input);
    const proverPath = path.join(this.circuitDir, 'Prover.toml');
    fs.writeFileSync(proverPath, proverToml);

    // Run nargo execute
    logger.debug('Running nargo execute', { nargo: this.nargoPath });
    execSync(`"${this.nargoPath}" execute`, { cwd: this.circuitDir, encoding: 'utf8' });

    // Run bb prove
    logger.debug('Running bb prove');
    execSync(
      `${this.bbPath} prove \
  --scheme ultra_honk --oracle_hash keccak \
  --bytecode_path ./target/strategy_policy.json \
  --witness_path ./target/strategy_policy.gz \
  --output_path ./target \
  --output_format bytes_and_fields`,
      { cwd: this.circuitDir, encoding: 'utf8' },
    );

    // Read proof bytes
    const proofPath = path.join(this.circuitDir, 'target', 'proof');
    const proof = fs.readFileSync(proofPath);

    // Read public inputs from proof_fields.json (first 11 fields after the proof)
    // In bb's output, proof_fields starts with the public inputs (we observed this)
    const fieldsPath = path.join(this.circuitDir, 'target', 'proof_fields.json');
    const fieldsData = JSON.parse(fs.readFileSync(fieldsPath, 'utf8'));
    const publicInputs = fieldsData.slice(0, 11).map((h: string) => BigInt(h));

    logger.info('Proof generated', { proofBytes: proof.length, publicInputs: publicInputs.length });
    return { proof, publicInputs };
  }

  /** Verify a proof locally (sanity check before submitting). */
  verifyProof(proofPath: string, publicInputsPath: string, vkPath: string): boolean {
    try {
      const out = execSync(
        `${this.bbPath} verify --scheme ultra_honk --oracle_hash keccak \
  --proof_path "${proofPath}" --vk_path "${vkPath}"`,
        { encoding: 'utf8' },
      );
      return out.includes('Proof verified successfully');
    } catch {
      return false;
    }
  }

  private buildProverToml(input: ProofInput): string {
    return `# Public inputs
market_price = "${input.marketPrice}"
market_timestamp = "${input.marketTimestamp}"
pair_hash = "${input.pairHash}"
balance = "${input.balance}"
last_trade_ts = "${input.lastTradeTs}"
consecutive_losses = "${input.consecutiveLosses}"
policy_hash = "${input.policyHash}"
max_trade_size_pct = "${input.maxTradeSizePct}"
allowed_pair_hash = "${input.allowedPairHash}"
min_time_between_trades = "${input.minTimeBetweenTrades}"
max_consecutive_losses = "${input.maxConsecutiveLosses}"

# Private witnesses
buy_threshold = "${input.buyThreshold}"
sell_threshold = "${input.sellThreshold}"
period = "${input.period}"
last_signal = "${input.lastSignal}"
position = "${input.position}"
secret = "${input.secret}"
`;
  }
}
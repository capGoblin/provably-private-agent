// Soroban Executor client — invokes submit_trade on the executor contract.

import { execSync } from 'node:child_process';
import { config } from '../config.js';
import { logger } from '../logger.js';
import type { PriceData } from '../strategies/types.js';

export interface SubmitTradeParams {
  proof: Buffer;
  publicInputs: bigint[];
  action: number;
  amount: bigint;
  newStateHash: bigint;
  attestationSig: Buffer;
  x402PaymentReceipt: bigint;
}

export interface TradeResult {
  tradeId: number;
  txHash: string;
}

export class ExecutorClient {
  constructor(private readonly contractId: string = config.executorContractId) {
    if (!contractId) {
      throw new Error('EXECUTOR_CONTRACT_ID not set. Deploy executor first.');
    }
  }

  /** Submit trade to executor. Returns trade ID + tx hash. */
  async submitTrade(params: SubmitTradeParams): Promise<TradeResult> {
    // Write proof to temp file
    const fs = await import('node:fs');
    const proofPath = '/tmp/agent_proof.bin';
    fs.writeFileSync(proofPath, params.proof);

    // Write public_inputs to JSON file (no 0x prefix for Soroban CLI)
    const piHex = params.publicInputs.map(p => p.toString(16).padStart(64, '0'));
    const piPath = '/tmp/agent_public_inputs.json';
    fs.writeFileSync(piPath, JSON.stringify(piHex));

    // Build CLI command
    const actionHex = params.action.toString(16).padStart(8, '0');
    const amountHex = params.amount.toString(16).padStart(16, '0');
    const nshHex = params.newStateHash.toString(16).padStart(64, '0');
    const attSigHex = params.attestationSig.toString('hex');
    const x402Hex = params.x402PaymentReceipt.toString(16).padStart(64, '0');

    const agentId = process.env.AGENT_ID || 'GAHA2ALO53N5WN6NYBZQSJUPKZ3TWNCME2WPRR66YVP5AIOY23IXLYRT';
    const cmd = `${config.stellarCli} contract invoke \
  --id ${this.contractId} \
  --source deployer \
  --rpc-url ${config.rpcUrl} \
  --network-passphrase "${config.networkPassphrase}" \
  --send=yes \
  -- \
  submit_trade \
  --user ${agentId} \
  --agent_id ${agentId} \
  --proof-file-path ${proofPath} \
  --public_inputs-file-path ${piPath} \
  --action ${params.action} \
  --amount ${params.amount.toString()} \
  --new_state_hash ${nshHex} \
  --attestation_sig ${attSigHex} \
  --x402_payment_receipt ${x402Hex}`;

    try {
      const out = execSync(cmd, {
        encoding: 'utf8',
        timeout: 60000,
        env: { ...process.env, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || '/Users/dharshan/dev/stellar/.config' },
      });
      const tradeIdMatch = out.match(/📅.*- Success.*vec.*?"u64":"(\d+)"/s) || out.match(/(\d+)\s*$/m);
      const txMatch = out.match(/([a-f0-9]{64})/);
      const tradeId = tradeIdMatch ? parseInt(tradeIdMatch[1]) : 0;
      const txHash = txMatch ? txMatch[1] : '';
      logger.info(`Trade submitted`, { tradeId, txHash });
      return { tradeId, txHash };
    } catch (e: any) {
      logger.error('Trade submission failed', { error: e.message, stderr: e.stderr?.toString() });
      throw new Error(`submitTrade failed: ${e.message}`);
    }
  }

  /** Get recent trades from the executor (reads contract storage). */
  async getRecentTrades(limit: number = 10): Promise<unknown[]> {
    try {
      const countOut = execSync(
        `${config.stellarCli} contract invoke --id ${this.contractId} --source deployer --rpc-url ${config.rpcUrl} --network-passphrase "${config.networkPassphrase}" --send=no -- get_trade_count`,
        { encoding: 'utf8' }
      );
      const count = parseInt(countOut.trim().split('\n').pop() || '0', 10);
      const trades: unknown[] = [];
      for (let i = 0; i < Math.min(count, limit); i++) {
        try {
          const tradeOut = execSync(
            `${config.stellarCli} contract invoke --id ${this.contractId} --source deployer --rpc-url ${config.rpcUrl} --network-passphrase "${config.networkPassphrase}" --send=no -- get_trade --trade_id ${i}`,
            { encoding: 'utf8' }
          );
          const jsonStart = tradeOut.indexOf('{');
          const jsonEnd = tradeOut.lastIndexOf('}');
          if (jsonStart >= 0 && jsonEnd >= 0) {
            trades.push(JSON.parse(tradeOut.substring(jsonStart, jsonEnd + 1)));
          }
        } catch {}
      }
      return trades;
    } catch (e: any) {
      logger.warn('getRecentTrades failed', { error: e.message });
      return [];
    }
  }

  async getVK(): Promise<Buffer> {
    const out = execSync(
      `${config.stellarCli} contract invoke --id ${this.contractId} --source deployer --rpc-url ${config.rpcUrl} --network-passphrase "${config.networkPassphrase}" --send=no -- get_vk`,
      { encoding: 'utf8' }
    );
    let hex = out.trim();
    if (hex.startsWith('"') && hex.endsWith('"')) hex = hex.slice(1, -1);
    return Buffer.from(hex, 'hex');
  }
}
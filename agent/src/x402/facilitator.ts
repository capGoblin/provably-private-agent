// Minimal x402 payment facilitator — sends a real XLM payment before each
// trade and returns a receipt hash derived from the on-chain tx hash.
//
// In production x402 would involve:
//   - challenge/nonce from the server
//   - signed PaymentRequired from facilitator
//   - posted back via x402 extension header
//
// For demo, we use a direct payment tx on the same Stellar network
// the trade executes on. The receipt is keccak256(tx_hash || amount ||
// token || nonce). The on-chain trade stores this receipt so anyone can
// verify "this trade was paid for".

import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { keccak_256 } from '@noble/hashes/sha3.js';

const PASSPHRASE = 'Standalone Network ; February 2017';
const RPC_URL = 'http://localhost:8130/soroban/rpc';

export interface X402Receipt {
  /** Stellar tx hash of the payment */
  txHash: string;
  /** Payer Stellar address */
  payer: string;
  /** Payee (agent) Stellar address */
  payee: string;
  /** Amount in stroops (1 XLM = 10_000_000) */
  amountStroops: number;
  /** keccak256(txHash || amount || token || nonce) reduced mod p for circuit */
  receiptHash: bigint;
  /** Original nonce */
  nonce: string;
}

export class X402Facilitator {
  constructor(
    private readonly payerSecret = process.env.X402_PAYER_SECRET || 'user',
    private readonly payee = process.env.X402_PAYEE || 'GAHA2ALO53N5WN6NYBZQSJUPKZ3TWNCME2WPRR66YVP5AIOY23IXLYRT',
    private readonly rpcUrl: string = RPC_URL,
  ) {}

  /** Build a payment tx, submit it, return the receipt. */
  async payAndUnlock(amountStroops = 1_000_000): Promise<X402Receipt> {
    const xdgConfig = '/Users/dharshan/dev/stellar/.config';
    const env = { ...process.env, XDG_CONFIG_HOME: xdgConfig, PATH: `/Users/dharshan/dev/stellar/.cargo/bin:${process.env.PATH}` };
    const stellarCli = config.stellarCli;

    const nonce = crypto.randomBytes(8).toString('hex');
    logger.info('x402: sending payment', { payer: this.payerSecret, payee: this.payee, amountStroops });

// Build + submit classic payment tx. Output is just
//   "ℹ️  Signing transaction: <64-hex-txhash>"
// because the CLI builds+signs+submits by default.
    const cmd = `${stellarCli} tx new payment \
  --source ${this.payerSecret} \
  --destination ${this.payee} \
  --amount ${amountStroops} \
  --rpc-url ${this.rpcUrl} \
  --network-passphrase '${PASSPHRASE}' 2>&1`;
    let out: string;
    try {
      out = execSync(cmd, { env, encoding: 'utf8', timeout: 30000 });
    } catch (e: any) {
      throw new Error(`x402 payment failed: ${(e.stderr || e.message || '').toString().slice(-800)}`);
    }

    // Extract tx hash from "Signing transaction: <hash>"
    const txHashMatch = out.match(/Signing transaction:\s*([a-f0-9]{64})/i);
    if (!txHashMatch) {
      throw new Error(`x402 payment did not return a tx hash. Output:\n${out}`);
    }
    const txHash = txHashMatch[1];
    const BN254_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

    // Receipt hash: keccak256(txHash || amount || token || nonce || payer) mod p
    const payerAddr = this.getAddressForSecret(this.payerSecret, env);
    const buf = Buffer.concat([
      Buffer.from(txHash, 'hex'),
      this.u64be(amountStroops),
      Buffer.from('XLM'),
      Buffer.from(nonce, 'hex'),
      Buffer.from(payerAddr),
    ]);
    const receiptHash = BigInt('0x' + Buffer.from(keccak_256(new Uint8Array(buf))).toString('hex')) % BN254_MODULUS;

    logger.info('x402: payment confirmed', {
      txHash,
      payer: payerAddr,
      amountStroops,
      receiptHash: '0x' + receiptHash.toString(16).slice(0, 16) + '…',
    });

    return {
      txHash,
      payer: payerAddr,
      payee: this.payee,
      amountStroops,
      receiptHash,
      nonce,
    };
  }

  private getAddressForSecret(secretOrName: string, env: any): string {
    try {
      return execSync(`${config.stellarCli} keys address ${secretOrName}`, { env, encoding: 'utf8' }).trim();
    } catch {
      return secretOrName;
    }
  }

  private u64be(n: number): Uint8Array {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(BigInt(n));
    return buf;
  }
}
// Ed25519 attestation signer for proof-of-validity messages.

import crypto from 'node:crypto';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

export interface AttestationMessage {
  proof: Buffer;
  publicInputs: bigint[];
  action: number;
  amount: bigint;
  newStateHash: bigint;
  policyHash: bigint;
  x402PaymentReceipt: bigint;
}

export class AttestationSigner {
  private privKeyObj: crypto.KeyObject;

  constructor() {
    // Derive deterministic ed25519 key from agent secret
    // In production: load from secure storage
    const seed = crypto.createHash('sha256').update(config.agentSecret).digest();
    const pkcs8Prefix = Buffer.from('302e020100300506032b657004220420', 'hex');
    const pkcs8 = Buffer.concat([pkcs8Prefix, seed]);
    this.privKeyObj = crypto.createPrivateKey({
      key: pkcs8,
      format: 'der',
      type: 'pkcs8',
    });
    logger.debug('AttestationSigner initialized (deterministic from agent secret)');
  }

  /** Compute keccak256 message hash from attestation inputs.
   *  Must match the on-chain message in contracts/executor/src/lib.rs exactly:
   *    keccak256(proof || public_inputs || action_be4 || amount_be8 || new_state_hash_be32)
   */
  hashMessage(msg: AttestationMessage): Buffer {
    const parts: Buffer[] = [];
    parts.push(msg.proof);

    for (const pi of msg.publicInputs) {
      parts.push(Buffer.from(pi.toString(16).padStart(64, '0'), 'hex'));
    }

    const actionBuf = Buffer.alloc(4);
    actionBuf.writeUInt32BE(msg.action);
    parts.push(actionBuf);

    const amountBuf = Buffer.alloc(8);
    amountBuf.writeBigUInt64BE(BigInt(msg.amount));
    parts.push(amountBuf);

    const nshBuf = Buffer.from(msg.newStateHash.toString(16).padStart(64, '0'), 'hex');
    parts.push(nshBuf);

    const fullBuf = Buffer.concat(parts);
    // keccak256 (Ethereum-compatible, matches Soroban env.crypto().keccak256)
    return Buffer.from(keccak_256(new Uint8Array(fullBuf)));
  }

  /** Sign the attestation message. Returns 64-byte signature. */
  sign(msg: AttestationMessage): Buffer {
    const messageHash = this.hashMessage(msg);
    const sig = crypto.sign(null, messageHash, this.privKeyObj);
    return sig;
  }

  /** Get the public key as 32 raw bytes. */
  getPublicKeyRaw(): Buffer {
    const pubKeyDer = this.privKeyObj.export({ format: 'der', type: 'spki' });
    // Ed25519 SPKI is 44 bytes: 12 bytes prefix + 32 bytes key
    return pubKeyDer.subarray(-32);
  }

  /** Get the full SPKI-encoded public key for the contract. */
  getPublicKeySpki(): Buffer {
    return this.privKeyObj.export({ format: 'der', type: 'spki' });
  }
}

let _signer: AttestationSigner | undefined;
export function getSigner(): AttestationSigner {
  if (!_signer) _signer = new AttestationSigner();
  return _signer;
}
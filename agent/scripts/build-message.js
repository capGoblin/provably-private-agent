// Build attestation message hash.
// message = keccak256(proof_bytes || public_inputs_bytes || action_be || amount_be || new_state_hash_bytes)
// All inputs are hex strings.
const crypto = require('crypto');

function hexToBuf(hex) {
  hex = hex.startsWith('0x') ? hex.slice(2) : hex;
  // Pad to even length
  if (hex.length % 2 !== 0) hex = '0' + hex;
  return Buffer.from(hex, 'hex');
}

function buildMessage(proofBuf, publicInputsHexArr, action, amount, newStateHashHex) {
  // Build a buffer concatenating all parts
  const parts = [];

  // 1. proof bytes
  parts.push(proofBuf);

  // 2. public inputs: each is 32 bytes
  for (const pi of publicInputsHexArr) {
    parts.push(hexToBuf(pi));
  }

  // 3. action: 4 bytes big-endian
  const actionBuf = Buffer.alloc(4);
  actionBuf.writeUInt32BE(action);
  parts.push(actionBuf);

  // 4. amount: 8 bytes big-endian (treat as u64; may be negative but for demo positive)
  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigUInt64BE(BigInt(amount));
  parts.push(amountBuf);

  // 5. new_state_hash: 32 bytes
  parts.push(hexToBuf(newStateHashHex));

  const fullBuf = Buffer.concat(parts);

  // Use keccak256 (Ethereum-compatible, matches Soroban env.crypto().keccak256())
  const { keccak_256 } = require('@noble/hashes/sha3.js');
  const hashBytes = keccak_256(new Uint8Array(fullBuf));
  return Buffer.from(hashBytes);
}

module.exports = { buildMessage };
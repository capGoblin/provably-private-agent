#!/usr/bin/env node
// Verify the ed25519 attestation on a stored trade.
// Usage: node verify-attestation.js <executor_id> <trade_id> <verifier_pubkey_hex>

const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');

const [executorId, tradeIdStr, pubkeyHex] = process.argv.slice(2);
const tradeId = parseInt(tradeIdStr);

const ENV = {
  ...process.env,
  PATH: `/Users/dharshan/dev/stellar/.cargo/bin:${process.env.PATH}`,
  XDG_CONFIG_HOME: '/Users/dharshan/dev/stellar/.config',
};

function exec(cmd) {
  return execSync(cmd, { env: ENV, encoding: 'utf8' });
}

function readJSON(s) {
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(s.substring(start, end + 1)); } catch { return null; }
}

// Get trade
const tradeOut = exec(`stellar contract invoke --id ${executorId} --source deployer --network local --send=no -- get_trade --trade_id ${tradeId}`);
console.log('Raw get_trade output:', tradeOut.slice(0, 200));
const trade = readJSON(tradeOut);
if (!trade) { console.error('Could not fetch trade'); process.exit(1); }
console.log('Trade keys:', Object.keys(trade));
console.log('attestation_sig:', trade.attestation_sig ? trade.attestation_sig.slice(0, 20) : 'UNDEFINED');

// Get proof (hex from contract, convert to bytes)
const proofHex = exec(`stellar contract invoke --id ${executorId} --source deployer --network local --send=no -- get_proof --trade_id ${tradeId}`).trim();
// proofHex might have quotes - strip them
let proofHexClean = proofHex.replace(/^"|"$/g, '');

const proofBuf = Buffer.from(proofHexClean, 'hex');

// Reconstruct message: proof || public_inputs || action_be || amount_be || new_state_hash
// We need public_inputs - for demo, recompute from circuit output
// (In production, store public_inputs in trade record)

// For verification demo: assume we have public_inputs from circuit execution
// In our demo, the executor doesn't store public_inputs separately
// Let me check if they're in the proof file output

// Get proof_fields.json to extract public inputs
const proofFields = JSON.parse(fs.readFileSync('/Users/dharshan/dev/stellar/circuits/strategy_policy/target/proof_fields.json', 'utf8'));
const publicInputs = proofFields.slice(0, 11); // first 11 are public inputs

// Build message
function hexToBuf(hex) {
  hex = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (hex.length % 2 !== 0) hex = '0' + hex;
  return Buffer.from(hex, 'hex');
}

const parts = [proofBuf];
for (const pi of publicInputs) parts.push(hexToBuf(pi));

const actionBuf = Buffer.alloc(4);
actionBuf.writeUInt32BE(trade.action);
parts.push(actionBuf);

const amountBuf = Buffer.alloc(8);
amountBuf.writeBigUInt64BE(BigInt(trade.amount));
parts.push(amountBuf);

parts.push(hexToBuf(trade.new_state_hash));

const fullBuf = Buffer.concat(parts);

// Compute keccak256 message hash
const { keccak_256 } = require('@noble/hashes/sha3.js');
const messageHash = Buffer.from(keccak_256(new Uint8Array(fullBuf)));
console.log('Message hash:', messageHash.toString('hex'));

// Verify ed25519 signature
const sig = Buffer.from(trade.attestation_sig, 'hex');
const pubKeyBuf = Buffer.from(pubkeyHex, 'hex');

// Build full SubjectPublicKeyInfo DER for ed25519
const spki = Buffer.concat([
  Buffer.from('302a300506032b6570032100', 'hex'),
  pubKeyBuf,
]);

const pubKeyObj = crypto.createPublicKey({
  key: spki,
  format: 'der',
  type: 'spki',
});

const valid = crypto.verify(null, messageHash, pubKeyObj, sig);

console.log(`Trade #${tradeId}:`);
console.log(`  proof_hash: ${trade.proof_hash}`);
console.log(`  policy_hash: ${trade.policy_hash}`);
console.log(`  attestation_sig: ${trade.attestation_sig.slice(0, 32)}…`);
console.log(`  Ed25519 verification: ${valid ? '✅ VALID' : '❌ INVALID'}`);

if (!valid) process.exit(1);
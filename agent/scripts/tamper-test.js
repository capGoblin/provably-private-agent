#!/usr/bin/env node
// Negative test: tamper with proof bytes, re-sign, see if it gets accepted
// (Spoiler: ed25519 will reject because message changed → sig invalid)

const fs = require('fs');
const { execSync } = require('child_process');
const crypto = require('crypto');
const { keccak_256 } = require('@noble/hashes/sha3.js');

const ROOT = '/Users/dharshan/dev/stellar';
const PRIV_HEX = fs.readFileSync('/tmp/verifier_priv.hex', 'utf8').trim();
const PRIV_KEY_PKCS8 = Buffer.concat([
  Buffer.from('302e020100300506032b657004220420', 'hex'),
  Buffer.from(PRIV_HEX, 'hex'),
]);
const PRIV_KEY_OBJ = crypto.createPrivateKey({
  key: PRIV_KEY_PKCS8,
  format: 'der',
  type: 'pkcs8',
});

// Load original proof
const originalProof = fs.readFileSync(`${ROOT}/circuits/strategy_policy/target/proof`);

// Tamper with proof (flip byte 100)
const tamperedProof = Buffer.from(originalProof);
tamperedProof[100] ^= 0x01;

console.log('Original proof byte 100:', originalProof[100].toString(16));
console.log('Tampered proof byte 100:', tamperedProof[100].toString(16));

// Public inputs (from proof_fields.json)
const proofFields = JSON.parse(fs.readFileSync(`${ROOT}/circuits/strategy_policy/target/proof_fields.json`, 'utf8'));
const publicInputs = proofFields.slice(0, 11);
const action = 1;
const amount = 500000000;
const newStateHash = crypto.createHash('sha256').update('tamper-state').digest('hex').slice(0, 64);

// Build message with TAMPERED proof
const parts = [tamperedProof];
for (const pi of publicInputs) {
  parts.push(Buffer.from(pi.replace(/^0x/, ''), 'hex'));
}
const actionBuf = Buffer.alloc(4);
actionBuf.writeUInt32BE(action);
parts.push(actionBuf);
const amountBuf = Buffer.alloc(8);
amountBuf.writeBigUInt64BE(BigInt(amount));
parts.push(amountBuf);
parts.push(Buffer.from(newStateHash, 'hex'));

const fullBuf = Buffer.concat(parts);
const messageHash = Buffer.from(keccak_256(new Uint8Array(fullBuf)));

// Sign with same key (signature is valid FOR the tampered message)
const sig = crypto.sign(null, messageHash, PRIV_KEY_OBJ);

console.log('\nSigned tampered message. Submitting to contract...');

// Now submit to contract - it should accept (sig is valid) but proof doesn't match
const data = {
  executor_id: 'CD6WVHAYNJH4RC43XCRUWNVCYIPHTUNKGAEQCHZDYHTGMGDKEWKA4LFZ',
  agent_id: 'GAHA2ALO53N5WN6NYBZQSJUPKZ3TWNCME2WPRR66YVP5AIOY23IXLYRT',
  user_id: 'GAHA2ALO53N5WN6NYBZQSJUPKZ3TWNCME2WPRR66YVP5AIOY23IXLYRT',
  proof_file: '/tmp/tampered_proof.bin',
  public_inputs: publicInputs,
  action,
  amount,
  new_state_hash: newStateHash,
  attestation_sig: sig.toString('hex'),
};

// Save tampered proof to /tmp
fs.writeFileSync('/tmp/tampered_proof.bin', tamperedProof);
fs.writeFileSync('/tmp/trade_args_tampered.json', JSON.stringify(data, null, 2));
const piClean = publicInputs.map(p => p.replace(/^0x/, ''));
fs.writeFileSync('/tmp/public_inputs_tampered.json', JSON.stringify(piClean));

console.log('\nTampered trade args saved to /tmp/trade_args_tampered.json');
console.log('To submit: cd /Users/dharshan/dev/stellar/agent && node scripts/exec-submit-tampered.js');
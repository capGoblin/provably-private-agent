#!/usr/bin/env node
// Submit a trade to the Executor contract with proof + attestation.
// Usage: node submit-trade.js <executor_id> <agent_id> <user_id> <action> <amount>

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { execSync } = require('child_process');

// Parse args
const [executorId, agentId, userId, actionStr, amountStr] = process.argv.slice(2);
const action = parseInt(actionStr || '1');
const amount = parseInt(amountStr || '500000000');

const ROOT = '/Users/dharshan/dev/stellar';
const PRIV_HEX = fs.readFileSync('/tmp/verifier_priv.hex', 'utf8').trim();
// ed25519 PKCS8 prefix + raw key
const PRIV_KEY_PKCS8 = Buffer.concat([
  Buffer.from('302e020100300506032b657004220420', 'hex'),
  Buffer.from(PRIV_HEX, 'hex'),
]);
const PRIV_KEY_OBJ = crypto.createPrivateKey({
  key: PRIV_KEY_PKCS8,
  format: 'der',
  type: 'pkcs8',
});

// Load proof + VK
const proof = fs.readFileSync(path.join(ROOT, 'circuits/strategy_policy/target/proof'));

// Load public_inputs (first 11 fields from proof_fields.json)
const proofFields = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'circuits/strategy_policy/target/proof_fields.json'), 'utf8'
));

// Extract public inputs (first 11 = market_price, market_timestamp, pair_hash,
// balance, last_trade_ts, consecutive_losses, policy_hash, max_pct, pair,
// min_time, max_losses)
const publicInputsFields = proofFields.slice(0, 11);

console.log('public inputs (first 11):');
publicInputsFields.forEach((f, i) => console.log(`  [${i}] ${f}`));

// Compute new_state_hash (placeholder — actual value from circuit output)
const newStateHash = crypto.createHash('sha256').update('demo-state-' + Date.now()).digest('hex').slice(0, 64);
console.log('new_state_hash (no 0x):', newStateHash);

// Build x402 payment receipt (simplified for demo)
// In production: hash of x402 payment receipt (USDC transfer tx hash + signature)
const x402Payment = {
  payer: userId,
  amount: 1000000,  // 0.1 XLM
  token: 'XLM',
  timestamp: Math.floor(Date.now() / 1000),
  nonce: crypto.randomBytes(16).toString('hex'),
};
const x402ReceiptHash = crypto.createHash('sha256').update(JSON.stringify(x402Payment)).digest('hex');
console.log('x402 receipt hash:', x402ReceiptHash);

// Build attestation message
// message = keccak256(proof || public_inputs || action || amount || new_state_hash)
const messageBuilder = require('./build-message.js');
const messageHash = messageBuilder.buildMessage(proof, publicInputsFields, action, amount, newStateHash);
console.log('message hash:', messageHash.toString('hex'));

// Sign with ed25519 private key
const sig = crypto.sign(null, messageHash, PRIV_KEY_OBJ);
console.log('signature:', sig.toString('hex'));

// Write to JSON for shell command
const data = {
  executor_id: executorId,
  agent_id: agentId,
  user_id: userId,
  proof_file: path.join(ROOT, 'circuits/strategy_policy/target/proof'),
  public_inputs: publicInputsFields,
  action,
  amount,
  new_state_hash: newStateHash,
  attestation_sig: sig.toString('hex'),
  x402_payment_receipt: x402ReceiptHash,
};
fs.writeFileSync('/tmp/trade_args.json', JSON.stringify(data, null, 2));
console.log('\nWrote /tmp/trade_args.json');
#!/usr/bin/env node
// Execute submit_trade on executor using stellar CLI
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = JSON.parse(fs.readFileSync('/tmp/trade_args.json', 'utf8'));

// Write public_inputs to JSON file (Soroban CLI expects JSON array, no 0x prefix)
const piClean = args.public_inputs.map(p => p.startsWith('0x') ? p.slice(2) : p);
fs.writeFileSync('/tmp/public_inputs.json', JSON.stringify(piClean));
const PI_FILE = '/tmp/public_inputs.json';

const cmd = `stellar contract invoke \
  --id ${args.executor_id} \
  --source deployer \
  --network local \
  --send=yes \
  -- \
  submit_trade \
  --user ${args.user_id} \
  --agent_id ${args.agent_id} \
  --proof-file-path ${args.proof_file} \
  --public_inputs-file-path ${PI_FILE} \
  --action ${args.action} \
  --amount ${args.amount} \
  --new_state_hash ${args.new_state_hash} \
  --attestation_sig ${args.attestation_sig} \
  --x402_payment_receipt ${args.x402_payment_receipt}`;

console.log('CMD:', cmd);
try {
  const out = execSync(cmd, { stdio: 'inherit', encoding: 'utf8' });
  console.log('Output:', out);
} catch (e) {
  console.error('Error:', e.message);
  console.error('stderr:', e.stderr);
  process.exit(1);
}
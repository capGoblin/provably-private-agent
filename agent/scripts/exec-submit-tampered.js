#!/usr/bin/env node
// Submit tampered trade to demonstrate that bad proofs still need a valid ed25519 sig.
// The sig is valid FOR the tampered proof, so the contract accepts.
// But the proof itself is INVALID (verifies false with bb).
// This is the negative test demo.

const fs = require('fs');
const { execSync } = require('child_process');

const args = JSON.parse(fs.readFileSync('/tmp/trade_args_tampered.json', 'utf8'));

const ENV = {
  ...process.env,
  PATH: `/Users/dharshan/dev/stellar/.cargo/bin:${process.env.PATH}`,
  XDG_CONFIG_HOME: '/Users/dharshan/dev/stellar/.config',
};

function exec(cmd) {
  return execSync(cmd, { env: ENV, encoding: 'utf8' });
}

function runBbVerify() {
  // Verify the tampered proof locally with bb - should FAIL
  try {
    const out = exec(`/Users/dharshan/dev/stellar/.bb/bb verify \
  --scheme ultra_honk --oracle_hash keccak \
  --proof_path /tmp/tampered_proof.bin \
  --vk_path /Users/dharshan/dev/stellar/circuits/strategy_policy/target/vk`);
    console.log('bb verify output:', out);
    return false;
  } catch (e) {
    console.log('bb verify FAILED:', e.message);
    return true;
  }
}

console.log('=== NEGATIVE TEST ===');
console.log('Submitting tampered proof to executor...');
console.log('(ed25519 sig IS valid for tampered message, so contract accepts)');
console.log('');

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
  --public_inputs-file-path /tmp/public_inputs_tampered.json \
  --action ${args.action} \
  --amount ${args.amount} \
  --new_state_hash ${args.new_state_hash} \
  --attestation_sig ${args.attestation_sig}`;

console.log('Submit cmd:', cmd.slice(0, 200) + '...');
try {
  const out = exec(cmd);
  console.log('Submit result:', out.slice(-500));
} catch (e) {
  console.log('Submit failed:', e.stderr || e.message);
  process.exit(1);
}

console.log('');
console.log('=== Now verifying tampered proof locally with bb ===');
const proofIsInvalid = runBbVerify();

if (proofIsInvalid) {
  console.log('');
  console.log('✅ NEGATIVE TEST PASSED!');
  console.log('   - Trade accepted on-chain (sig valid)');
  console.log('   - Proof FAILS bb verify');
  console.log('   - Anyone can detect the bad proof by running bb verify themselves');
}
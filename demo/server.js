#!/usr/bin/env node
// Demo backend server for Provably Private Agent.
// Serves the HTML and provides API for running the real TS agent.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const PORT = 3000;
const EXECUTOR_ID = 'CDDBMMWA6WYT6ZT5QRBATVEXC3IMVJQ4ZR6TREVL43WWSJ3HOKRMP4OZ';
const AGENT_ID = 'GAHA2ALO53N5WN6NYBZQSJUPKZ3TWNCME2WPRR66YVP5AIOY23IXLYRT';
const USER_ID = 'GAHA2ALO53N5WN6NYBZQSJUPKZ3TWNCME2WPRR66YVP5AIOY23IXLYRT';
const ROOT = '/Users/dharshan/dev/stellar';
const RPC_URL = 'http://localhost:8130/soroban/rpc';
const PASSPHRASE = 'Standalone Network ; February 2017';
const AGENT_DB = '/Users/dharshan/dev/stellar/agent/.data/agent.db';

const ENV = {
  ...process.env,
  PATH: `/Users/dharshan/dev/stellar/.cargo/bin:/Users/dharshan/dev/stellar/.nargo/bin:/Users/dharshan/dev/stellar/.bb:${process.env.PATH}`,
  XDG_CONFIG_HOME: '/Users/dharshan/dev/stellar/.config',
};

function exec(cmd, opts = {}) {
  try {
    return execSync(cmd, { env: ENV, encoding: 'utf8', timeout: 120000, ...opts });
  } catch (e) {
    throw new Error((e.stderr || e.message || '').toString().slice(-2000));
  }
}

function invokeRead(fn, ...args) {
  let cmd = `stellar contract invoke --id ${EXECUTOR_ID} --source deployer --rpc-url ${RPC_URL} --network-passphrase '${PASSPHRASE}' --send=no -- ${fn}`;
  for (const a of args) cmd += ` ${a}`;
  return exec(cmd);
}

function invokeWrite(fn, ...args) {
  let cmd = `stellar contract invoke --id ${EXECUTOR_ID} --source deployer --rpc-url ${RPC_URL} --network-passphrase '${PASSPHRASE}' --send=yes -- ${fn}`;
  for (const a of args) cmd += ` ${a}`;
  return exec(cmd);
}

function readJSON(s) {
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(s.substring(start, end + 1)); } catch { return null; }
}

/** Fetch local SQLite trade records (where LLM reasoning + x402 tx hash live). */
function getLocalTrades(limit = 10) {
  try {
    // Lazy require so missing better-sqlite3 doesn't kill the server
    let Database;
    try { Database = require('better-sqlite3'); } catch { return []; }
    const db = new Database(AGENT_DB, { readonly: true, fileMustExist: false });
    const rows = db.prepare('SELECT * FROM trades ORDER BY created_at DESC LIMIT ?').all(limit);
    db.close();
    return rows;
  } catch { return []; }
}

/** Merge on-chain trade with local metadata (LLM reasoning, x402 tx hash). */
function enrichTrade(onchainTrade) {
  if (!onchainTrade) return null;
  const locals = getLocalTrades(100);
  const local = locals.find(l => String(l.trade_id) === String(onchainTrade.trade_id));
  return {
    ...onchainTrade,
    llm_reasoning: local?.llm_reasoning || null,
    x402_tx_hash: local?.x402_tx_hash || null,
    x402_amount_stroops: local?.x402_amount_stroops || null,
    reasoning: local?.reasoning || null,
    strategy_id: local?.strategy_id || null,
  };
}

/** Run the real agent end-to-end (one cycle). Returns the latest trade_id from the chain. */
function runRealAgent() {
  const before = parseInt(invokeRead('get_trade_count').trim().split('\n').pop()) || 0;
  exec('cd /Users/dharshan/dev/stellar/agent && npx tsx src/index.ts --once');
  const after = parseInt(invokeRead('get_trade_count').trim().split('\n').pop()) || before;
  return { trade_id: after - 1, total: after };
}

/** Re-verify a stored proof off-chain with bb. */
function reverify(id) {
  const proofOut = invokeRead('get_proof', `--trade_id ${id}`);
  let hex = proofOut.trim();
  if (hex.startsWith('"') && hex.endsWith('"')) hex = hex.slice(1, -1);
  const proofPath = `/tmp/check_proof_${id}.bin`;
  fs.writeFileSync(proofPath, Buffer.from(hex, 'hex'));
  try {
    exec(`/Users/dharshan/dev/stellar/.bb/bb verify --scheme ultra_honk --oracle_hash keccak --proof_path ${proofPath} --vk_path /Users/dharshan/dev/stellar/circuits/strategy_policy/target/vk/vk`);
    return { bb_valid: true };
  } catch {
    return { bb_valid: false };
  }
}

/**
 * Negative test #1 — fetch the stored proof, flip one byte, re-run bb verify.
 * The contract still accepts the trade (its ed25519 sig was valid for the
 * ORIGINAL proof). But anyone can re-verify and detect the tamper.
 */
function tamperAndReverify(id) {
  const proofOut = invokeRead('get_proof', `--trade_id ${id}`);
  let hex = proofOut.trim();
  if (hex.startsWith('"') && hex.endsWith('"')) hex = hex.slice(1, -1);
  const proof = Buffer.from(hex, 'hex');
  const origByte = proof[Math.floor(proof.length / 2)];
  proof[Math.floor(proof.length / 2)] = origByte ^ 0x01; // flip 1 bit
  const tamperedPath = `/tmp/tampered_proof_${id}.bin`;
  fs.writeFileSync(tamperedPath, proof);
  let valid = false;
  try {
    exec(`/Users/dharshan/dev/stellar/.bb/bb verify --scheme ultra_honk --oracle_hash keccak --proof_path ${tamperedPath} --vk_path /Users/dharshan/dev/stellar/circuits/strategy_policy/target/vk/vk`);
    valid = true;
  } catch {
    valid = false;
  }
  return {
    trade_id: id,
    original_byte: origByte,
    tampered_byte: origByte ^ 0x01,
    bb_valid_after_tamper: valid,
    explanation: valid
      ? 'WARNING: tampered proof still verifies (should not happen)'
      : 'Math detected the tamper: bb verify rejected the mutated proof',
  };
}

/**
 * Negative test #2 — try to generate a proof that violates policy.
 * The circuit's rate-limit / circuit-breaker / pair / amount checks
 * all run inside nargo execute. A policy-violating proof never compiles.
 */
function policyViolationProof() {
  // Write a Prover.toml that violates rate_limit (last_trade_ts == market_ts)
  const proverToml = `# Public inputs — DELIBERATELY VIOLATE RATE LIMIT
market_price = "1000000"
market_timestamp = "1700000000"
pair_hash = "1"
balance = "10000000000"
last_trade_ts = "1700000000"
consecutive_losses = "0"
policy_hash = "296da1c92f3e8cf79f98eab7ba99791b7f4051db50c0a81c0051a9e8f215cfa6"
max_trade_size_pct = "5"
allowed_pair_hash = "1"
min_time_between_trades = "60"
max_consecutive_losses = "3"

# Private witnesses
buy_threshold = "30"
sell_threshold = "70"
period = "14"
last_signal = "50"
position = "0"
secret = "32033860691238509638089186110252179911114176558315629513121575316285338593278"
`;
  const circuitDir = '/Users/dharshan/dev/stellar/circuits/strategy_policy';
  fs.writeFileSync(`${circuitDir}/Prover.toml`, proverToml);
  let stderr = '';
  try {
    exec(`cd ${circuitDir} && /Users/dharshan/dev/stellar/.nargo/bin/nargo execute 2>&1`, { timeout: 60000 });
    return { rejected: false, message: 'Proof generated (should have failed!)' };
  } catch (e) {
    stderr = (e.message || '').slice(-1500);
    return {
      rejected: true,
      message: 'Circuit rejected the policy violation',
      nargo_error: stderr,
      explanation: 'The ZK circuit enforces policy at proof-generation time — no way to fake a compliant trade',
    };
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  try {
    if (req.url === '/' || req.url === '/index.html') {
      fs.readFile(path.join(__dirname, 'index.html'), (e, data) => {
        if (e) { res.writeHead(500); res.end('error'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
      });
      return;
    }

    if (req.url === '/api/run-agent' && req.method === 'POST') {
      const result = runRealAgent();
      const onchain = readJSON(invokeRead('get_trade', `--trade_id ${result.trade_id}`));
      const trade = enrichTrade(onchain);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ...result, trade }));
      return;
    }

    if (req.url === '/api/trades' && req.method === 'GET') {
      const count = parseInt(invokeRead('get_trade_count').trim().split('\n').pop()) || 0;
      const trades = [];
      for (let i = 0; i < count; i++) {
        const t = enrichTrade(readJSON(invokeRead('get_trade', `--trade_id ${i}`)));
        if (t) trades.push(t);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ trades, count }));
      return;
    }

    if (req.url.startsWith('/api/trade/') && req.method === 'GET') {
      const id = parseInt(req.url.split('/').pop());
      const trade = enrichTrade(readJSON(invokeRead('get_trade', `--trade_id ${id}`)));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(trade));
      return;
    }

    if (req.url === '/api/vk' && req.method === 'GET') {
      const out = invokeRead('get_vk');
      let hex = out.trim();
      if (hex.startsWith('"') && hex.endsWith('"')) hex = hex.slice(1, -1);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ vk_hex: hex }));
      return;
    }

    if (req.url.startsWith('/api/reverify/') && req.method === 'GET') {
      const id = parseInt(req.url.split('/').pop());
      const result = reverify(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    if (req.url.startsWith('/api/tamper/') && req.method === 'GET') {
      const id = parseInt(req.url.split('/').pop());
      const result = tamperAndReverify(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    if (req.url === '/api/policy-violation' && req.method === 'GET') {
      const result = policyViolationProof();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    res.writeHead(404); res.end('Not found');
  } catch (e) {
    console.error('Error:', e.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(PORT, () => {
  console.log(`Demo server running at http://localhost:${PORT}`);
});
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
      const trade = readJSON(invokeRead('get_trade', `--trade_id ${result.trade_id}`));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ...result, trade }));
      return;
    }

    if (req.url === '/api/trades' && req.method === 'GET') {
      const count = parseInt(invokeRead('get_trade_count').trim().split('\n').pop()) || 0;
      const trades = [];
      for (let i = 0; i < count; i++) {
        const t = readJSON(invokeRead('get_trade', `--trade_id ${i}`));
        if (t) trades.push(t);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ trades, count }));
      return;
    }

    if (req.url.startsWith('/api/trade/') && req.method === 'GET') {
      const id = parseInt(req.url.split('/').pop());
      const trade = readJSON(invokeRead('get_trade', `--trade_id ${id}`));
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
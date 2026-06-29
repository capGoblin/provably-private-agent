#!/usr/bin/env node
// Demo backend server for Provably Private Agent
// Serves the HTML and provides API for running agent, listing trades, etc.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = 3000;
const EXECUTOR_ID = 'CA7NFXAOKDLNHEFOB674RBYBYZK3MDV7A7BAP4LU6ESFSAMXGBCSRYBZ';
const AGENT_ID = 'GAHA2ALO53N5WN6NYBZQSJUPKZ3TWNCME2WPRR66YVP5AIOY23IXLYRT';
const USER_ID = 'GAHA2ALO53N5WN6NYBZQSJUPKZ3TWNCME2WPRR66YVP5AIOY23IXLYRT';
const ROOT = '/Users/dharshan/dev/stellar';

const ENV = {
  ...process.env,
  PATH: `/Users/dharshan/dev/stellar/.cargo/bin:${process.env.PATH}`,
  XDG_CONFIG_HOME: '/Users/dharshan/dev/stellar/.config',
};

function exec(cmd) {
  try {
    return execSync(cmd, { env: ENV, encoding: 'utf8', timeout: 60000 });
  } catch (e) {
    throw new Error(e.stderr || e.message);
  }
}

function invokeRead(contractId, fn, ...args) {
  let cmd = `stellar contract invoke --id ${contractId} --source deployer --network local --send=no -- ${fn}`;
  for (const a of args) {
    cmd += ` ${a}`;
  }
  return exec(cmd);
}

function invokeWrite(contractId, fn, ...args) {
  let cmd = `stellar contract invoke --id ${contractId} --source deployer --network local --send=yes -- ${fn}`;
  for (const a of args) {
    cmd += ` ${a}`;
  }
  return exec(cmd);
}

function readJSON(s) {
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(s.substring(start, end + 1)); } catch { return null; }
}

async function runAgent() {
  console.log('Running agent...');
  exec('cd /Users/dharshan/dev/stellar/agent && node scripts/submit-trade.js ' +
    `${EXECUTOR_ID} ${AGENT_ID} ${USER_ID} 1 500000000`);
  const result = exec('cd /Users/dharshan/dev/stellar/agent && node scripts/exec-submit.js');
  // Parse trade_id from result
  const tradeIdMatch = result.match(/^(\d+)$/m);
  if (!tradeIdMatch) {
    // Could be the contract output that includes the trade ID
    // Look for "0" or specific output
    const lines = result.trim().split('\n').filter(l => l.trim());
    const lastLine = lines[lines.length - 1];
    // The contract returns u64 (trade_id), printed as a number
    const candidateId = parseInt(lastLine);
    if (isNaN(candidateId)) throw new Error('Could not parse trade ID from: ' + result);
    return { trade_id: candidateId };
  }
  return { trade_id: parseInt(tradeIdMatch[1]) };
}

function getTrade(id) {
  const out = invokeRead(EXECUTOR_ID, 'get_trade', `--trade_id ${id}`);
  return readJSON(out);
}

function getTradeCount() {
  const out = invokeRead(EXECUTOR_ID, 'get_trade_count');
  const n = parseInt(out.trim().split('\n').pop());
  return isNaN(n) ? 0 : n;
}

function getProof(id) {
  // Proof is too large to pass through CLI easily; for demo, just return path
  const out = invokeRead(EXECUTOR_ID, 'get_proof', `--trade_id ${id}`);
  return { proof_hex: out.trim() };
}

function getVK() {
  const out = invokeRead(EXECUTOR_ID, 'get_vk');
  return { vk_hex: out.trim() };
}

function readFile(filePath) {
  return fs.readFileSync(filePath);
}

function serveFile(res, filePath, contentType) {
  const data = readFile(filePath);
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  // CORS for dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (req.url === '/' || req.url === '/index.html') {
      serveFile(res, path.join(__dirname, 'index.html'), 'text/html');
      return;
    }

    if (req.url === '/api/run-agent' && req.method === 'POST') {
      const result = await runAgent();
      const trade = getTrade(result.trade_id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(trade));
      return;
    }

    if (req.url === '/api/trades' && req.method === 'GET') {
      const count = getTradeCount();
      const trades = [];
      for (let i = 0; i < count; i++) {
        const t = getTrade(i);
        if (t) trades.push(t);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ trades, count }));
      return;
    }

    if (req.url.startsWith('/api/trade/') && req.method === 'GET') {
      const id = parseInt(req.url.split('/').pop());
      const trade = getTrade(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(trade));
      return;
    }

    if (req.url === '/api/vk' && req.method === 'GET') {
      const vk = getVK();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(vk));
      return;
    }

    if (req.url.startsWith('/api/reverify/') && req.method === 'GET') {
      const id = parseInt(req.url.split('/').pop());
      // Run bb verify + ed25519 attestation verify via verify-attestation.js
      try {
        const out = exec(`cd /Users/dharshan/dev/stellar/agent && node scripts/verify-attestation.js ${EXECUTOR_ID} ${id} $(cat /tmp/verifier_pub.hex) 2>&1`);
        // Extract validity from output
        const bbValid = !out.includes('❌ INVALID') && out.includes('✅ VALID');
        // Also need to check attestation sig (verify-attestation already does both)
        const attestationValid = bbValid;
        // Also need bb verify separately for proof
        let proofBbValid = true;
        try {
          // Fetch the proof and run bb verify on it
          const proofOut = exec(`stellar contract invoke --id ${EXECUTOR_ID} --source deployer --network local --send=no -- get_proof --trade_id ${id}`);
          let hex = proofOut.trim();
          if (hex.startsWith('"') && hex.endsWith('"')) {
            hex = hex.slice(1, -1);
          }
          require('fs').writeFileSync('/tmp/check_proof.bin', Buffer.from(hex, 'hex'));
          exec('/Users/dharshan/dev/stellar/.bb/bb verify \
  --scheme ultra_honk --oracle_hash keccak \
  --proof_path /tmp/check_proof.bin \
  --vk_path /Users/dharshan/dev/stellar/circuits/strategy_policy/target/vk');
          proofBbValid = true;
        } catch (e) {
          proofBbValid = false;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          bb_valid: proofBbValid,
          attestation_valid: attestationValid,
          trade_id: id,
          raw_output: out,
        }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message, bb_valid: false, attestation_valid: false }));
      }
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  } catch (e) {
    console.error('Error:', e.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(PORT, () => {
  console.log(`Demo server running at http://localhost:${PORT}`);
});
#!/usr/bin/env node
// Main entry point: runs the trading agent in a loop.

import { config } from './config.js';
import { logger } from './logger.js';
import { TradingAgent } from './agent.js';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  const agent = new TradingAgent();
  const args = process.argv.slice(2);
  const runOnce = args.includes('--once');

  logger.info('Agent starting', { runOnce, pollIntervalMs: config.pollIntervalMs });

  if (runOnce) {
    await agent.runCycle();
    logger.info('Single cycle complete. Exiting.');
    process.exit(0);
  }

  while (true) {
    try {
      await agent.runCycle();
    } catch (err) {
      logger.error('Cycle failed', { error: (err as Error).message });
    }
    await sleep(config.pollIntervalMs);
  }
}

main().catch(err => {
  logger.error('Fatal', { error: (err as Error).message });
  process.exit(1);
});
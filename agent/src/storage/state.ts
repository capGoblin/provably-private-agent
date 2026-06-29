// SQLite-backed state store for the trading agent.
// Persists price history, trades, and agent state across restarts.

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { logger } from '../logger.js';
import type { PriceData } from '../strategies/types.js';

export interface TradeRecord {
  trade_id: number;
  tx_hash: string;
  agent_id: string;
  user_id: string;
  action: number;
  amount: string;
  market_price: string;
  market_timestamp: number;
  pair_hash: number;
  consecutive_losses: number;
  policy_hash: string;
  proof_hash: string;
  new_state_hash: string;
  attestation_sig: string;
  x402_payment_receipt: string;
  reasoning: string;
  strategy_id: string;
  strategy_signal: number;
  confidence: number;
  created_at: number;
  onchain_error?: string;
  x402_tx_hash?: string;
  x402_amount_stroops?: number;
}

export class StateStore {
  private db: Database.Database;

  constructor(dbPath: string = config.dbPath) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trades (
        trade_id INTEGER PRIMARY KEY,
        tx_hash TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        action INTEGER NOT NULL,
        amount TEXT NOT NULL,
        market_price TEXT NOT NULL,
        market_timestamp INTEGER NOT NULL,
        pair_hash INTEGER NOT NULL,
        consecutive_losses INTEGER NOT NULL,
        policy_hash TEXT NOT NULL,
        proof_hash TEXT NOT NULL,
        new_state_hash TEXT NOT NULL,
        attestation_sig TEXT NOT NULL,
        x402_payment_receipt TEXT NOT NULL,
        reasoning TEXT NOT NULL DEFAULT '',
        strategy_id TEXT NOT NULL DEFAULT '',
        strategy_signal REAL NOT NULL DEFAULT 0,
        confidence REAL NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        onchain_error TEXT,
        x402_tx_hash TEXT,
        x402_amount_stroops INTEGER
      );

      CREATE TABLE IF NOT EXISTS price_history (
        ts INTEGER NOT NULL,
        pair TEXT NOT NULL,
        price TEXT NOT NULL,
        PRIMARY KEY (ts, pair)
      );

      CREATE TABLE IF NOT EXISTS agent_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_trades_created ON trades(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_trades_agent ON trades(agent_id);
      CREATE INDEX IF NOT EXISTS idx_price_pair_ts ON price_history(pair, ts);
    `);
    logger.debug('StateStore initialized', { path: config.dbPath });
  }

  recordTrade(record: TradeRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO trades VALUES (
        @trade_id, @tx_hash, @agent_id, @user_id, @action, @amount,
        @market_price, @market_timestamp, @pair_hash, @consecutive_losses,
        @policy_hash, @proof_hash, @new_state_hash, @attestation_sig,
        @x402_payment_receipt, @reasoning, @strategy_id, @strategy_signal,
        @confidence, @created_at, @onchain_error, @x402_tx_hash, @x402_amount_stroops
      )
    `);
    stmt.run(record as any);
  }

  getRecentTrades(limit: number = 10): TradeRecord[] {
    return this.db.prepare(`
      SELECT * FROM trades ORDER BY created_at DESC LIMIT ?
    `).all(limit) as TradeRecord[];
  }

  getTradeByTradeId(tradeId: number): TradeRecord | undefined {
    return this.db.prepare('SELECT * FROM trades WHERE trade_id = ?').get(tradeId) as TradeRecord | undefined;
  }

  recordPrice(price: PriceData): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO price_history (ts, pair, price) VALUES (?, ?, ?)
    `).run(price.timestamp, price.pair, price.price.toString());
  }

  getRecentPrices(pair: string, limit: number = 20): PriceData[] {
    const rows = this.db.prepare(`
      SELECT ts, pair, price FROM price_history WHERE pair = ? ORDER BY ts DESC LIMIT ?
    `).all(pair, limit) as Array<{ ts: number; pair: string; price: string }>;
    return rows.map(r => ({ timestamp: r.ts, pair: r.pair, price: BigInt(r.price) })).reverse();
  }

  setState(key: string, value: string): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)
    `).run(key, value);
  }

  getState(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM agent_state WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value;
  }

  getConsecutiveLosses(): number {
    return parseInt(this.getState('consecutive_losses') || '0', 10);
  }

  setConsecutiveLosses(n: number): void {
    this.setState('consecutive_losses', n.toString());
  }

  getLastTradeAt(): number {
    return parseInt(this.getState('last_trade_at') || '0', 10);
  }

  setLastTradeAt(ts: number): void {
    this.setState('last_trade_at', ts.toString());
  }

  getTotalTrades(): number {
    return parseInt(this.getState('total_trades') || '0', 10);
  }

  incrementTotalTrades(): void {
    this.setTotalTrades(this.getTotalTrades() + 1);
  }

  setTotalTrades(n: number): void {
    this.setState('total_trades', n.toString());
  }

  close(): void {
    this.db.close();
  }
}

let _store: StateStore | undefined;
export function getStateStore(): StateStore {
  if (!_store) _store = new StateStore();
  return _store;
}
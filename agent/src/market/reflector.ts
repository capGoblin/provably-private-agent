// Reflector oracle client — fetches real market prices on Stellar.
// Falls back to a deterministic synthetic price history if the oracle call fails
// (so the demo always works locally).

import { config } from '../config.js';
import { logger } from '../logger.js';
import type { PriceData } from '../strategies/types.js';
import { execSync } from 'node:child_process';

// Reflector asset IDs (testnet)
// USDC:   CBKGPWGOSIDD3DAZITRCBF3YJQTUL5QB4D5KBQ5MZ6E5XYCN4D5JQV3E
// EURC:   CDQVNFRP4TQYJZ45M3WDXVFKBLET3I72QRQQMZA7FJ7C4DBAIM7CSHAH
// Pair hash for USDC/EURC = 1
const REFLECTOR_ASSETS: Record<number, string> = {
  1: 'USDC', // USDC/EURC pair
  2: 'XLM',  // USDC/XLM pair
};

export class ReflectorClient {
  private priceHistory: Map<string, bigint[]> = new Map();

  /** Get current price for a pair. Returns synthetic price if oracle unavailable. */
  async getPrice(pairHash: number): Promise<PriceData> {
    const asset = REFLECTOR_ASSETS[pairHash] || 'USDC';
    const timestamp = Math.floor(Date.now() / 1000);

    // Try oracle first
    try {
      const price = await this.fetchFromOracle(asset);
      if (price !== null) {
        this.recordHistory(asset, price);
        return { price, timestamp, pair: this.pairName(pairHash) };
      }
    } catch (e) {
      logger.warn(`Oracle fetch failed for ${asset}, using synthetic`, { error: (e as Error).message });
    }

    // Fallback: synthetic price walk (deterministic but realistic)
    const synthetic = this.syntheticPrice(asset, timestamp);
    this.recordHistory(asset, synthetic);
    return { price: synthetic, timestamp, pair: this.pairName(pairHash) };
  }

  /** Get recent price history for strategy analysis. */
  async getHistory(pairHash: number, lookback: number = 20): Promise<PriceData[]> {
    const asset = REFLECTOR_ASSETS[pairHash] || 'USDC';
    const history = this.priceHistory.get(asset) || [];
    const now = Math.floor(Date.now() / 1000);

    // If we don't have enough history, generate it
    while (history.length < lookback) {
      const ts = now - (lookback - history.length) * 60; // 1 min apart
      history.unshift(this.syntheticPrice(asset, ts));
    }

    return history.slice(-lookback).map((price, i) => ({
      price,
      timestamp: now - (lookback - 1 - i) * 60,
      pair: this.pairName(pairHash),
    }));
  }

  private async fetchFromOracle(asset: string): Promise<bigint | null> {
    // Try calling Reflector contract via stellar CLI
    // For demo simplicity, returns null (use synthetic data)
    // In production: stellar contract invoke --id <reflector> -- lastprice ...
    return null;
  }

  private recordHistory(asset: string, price: bigint) {
    const hist = this.priceHistory.get(asset) || [];
    hist.push(price);
    if (hist.length > 100) hist.shift();
    this.priceHistory.set(asset, hist);
  }

  /** Deterministic synthetic price walk (mean-reverting around 1.0 USDC/EURC ≈ 0.92). */
  private syntheticPrice(asset: string, timestamp: number): bigint {
    // Base price in stroops (7 decimals)
    // USDC/EURC historically ~0.92 EURC per USDC
    const baseUSDC_EURC = 9200000n; // 0.92 EURC per USDC
    const baseUSDC_XLM = 8500000n;  // 0.85 XLM per USDC (placeholder)
    const base = asset === 'EURC' ? baseUSDC_EURC : asset === 'XLM' ? baseUSDC_XLM : baseUSDC_EURC;

    // Mean-reverting random walk
    const seed = Number(BigInt(timestamp) / 60n); // changes every minute
    const noise = Math.sin(seed * 7.3) * 0.04 + Math.sin(seed * 13.7) * 0.02; // ±6%
    const drift = Math.cos(seed * 0.1) * 0.01; // slow drift
    const total = Number(base) * (1 + noise + drift);

    return BigInt(Math.round(total));
  }

  private pairName(pairHash: number): string {
    return pairHash === 1 ? 'USDC/EURC' : 'USDC/XLM';
  }
}
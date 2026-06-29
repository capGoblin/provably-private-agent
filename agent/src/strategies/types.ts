// Strategy interface — modular pluggable trading logic

export interface PriceData {
  price: bigint;       // stroops (7 decimals) — e.g., 1 USDC = 10000000
  timestamp: number;
  pair: string;        // 'USDC/EURC', etc.
}

export interface Policy {
  maxTradeSizePct: number;      // % of balance per trade
  allowedPairHash: number;      // hash of allowed pair
  minTimeBetweenTrades: number; // seconds
  maxConsecutiveLosses: number;
}

export interface AgentState {
  position: bigint;
  lastTradeAt: number;
  consecutiveLosses: number;
  totalTrades: number;
}

export interface StrategyInput {
  marketData: PriceData[];     // Recent prices (oldest first)
  currentPrice: PriceData;      // Latest price
  balance: bigint;              // stroops
  policy: Policy;
  agentState: AgentState;
  timestamp: number;
}

export interface StrategyOutput {
  action: 0 | 1 | 2;            // 0=HOLD, 1=BUY, 2=SELL
  amount: bigint;                // stroops (0 if HOLD)
  confidence: number;            // 0-1
  signal: number;                // Raw signal value (e.g., z-score)
  metadata: Record<string, any>; // For debug / display
}

export interface ZKStrategyInputs {
  strategyCommitment: bigint;
  signalValue: bigint;           // Scaled to integer (e.g., z-score * 1000)
  privateState: bigint;
}

export interface Strategy {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;

  /** Deterministic commitment — bound in ZK proof */
  getCommitment(): bigint;

  /** Deterministic analysis */
  analyze(input: StrategyInput): StrategyOutput;

  /** Encode output for ZK circuit */
  toZKInputs(output: StrategyOutput): ZKStrategyInputs;

  /** Strategy-specific private inputs for circuit */
  getZKPrivateInputs(output: StrategyOutput): Record<string, bigint>;
}
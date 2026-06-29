import 'dotenv/config';
import path from 'node:path';

export const config = {
  // MiniMax Anthropic-compatible LLM endpoint
  minimaxApiKey: process.env.MINIMAX_API_KEY || '',
  minimaxBaseUrl: process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1',
  claudeModel: process.env.CLAUDE_MODEL || 'MiniMax-M2.5',

  // Agent identity (Stellar secret key for the agent owner)
  agentSecret: process.env.AGENT_SECRET_KEY || 'SAOONLINEAGENTDEVSEED0000000000000000000000000000000000000000',

  // Stellar network
  network: process.env.NETWORK || 'local',
  rpcUrl: process.env.RPC_URL || 'http://localhost:8130/soroban/rpc',
  networkPassphrase:
    process.env.NETWORK_PASSPHRASE || 'Standalone Network ; February 2017',

  // Deployed contracts
  executorContractId: process.env.EXECUTOR_ID || '',
  reflectorContractId:
    process.env.REFLECTOR_CONTRACT_ID || 'CAVLPZX6QZX3WXPA3I3IF4KZWPOT4MNQ2KBZA3CX5ZMP3LSP6QYDC3E4',

  // Strategy
  strategySecret: BigInt(process.env.STRATEGY_SECRET || '0xDEADBEEFCAFEBABE'),
  activeStrategyId: process.env.ACTIVE_STRATEGY_ID || 'zscore-mean-reversion-v1',

  // Policy (USDC/EURC strategy)
  policy: {
    maxTradeSizePct: Number(process.env.MAX_TRADE_SIZE_PCT || 5),
    pairHash: Number(process.env.PAIR_HASH || 1), // USDC/EURC
    minTimeBetweenTrades: Number(process.env.MIN_TIME_BETWEEN_TRADES || 60),
    maxConsecutiveLosses: Number(process.env.MAX_CONSECUTIVE_LOSSES || 3),
  },

  // Project-local tool paths
  bbPath: process.env.BB_BIN || path.join(process.cwd(), '.bb', 'bb'),
  stellarCli: process.env.STELLAR_CLI || path.join(process.cwd(), '.cargo', 'bin', 'stellar'),

  // Pair mapping (Reflector asset codes)
  pairs: {
    USDC_EURC: 'USDC/EURC',
    USDC_XLM: 'USDC/XLM',
  },

  // Runtime
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 10000),

  // Demo mode: seed history with a clear mean-reversion pattern so the
  // strategy fires BUY/SELL deterministically. Disable for live demos.
  demoMode: process.env.DEMO_MODE !== 'false',

  // Storage
  dbPath: process.env.DB_PATH || path.join(process.cwd(), '.data', 'agent.db'),
};
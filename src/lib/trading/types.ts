// Data model for the simulated A-share trading module.
// Every record that belongs to a user carries `userId` so the store can later move to a multi-user database.

export type Board = "main" | "chinext" | "star" | "bse";
export type Side = "buy" | "sell";
export type AccountKind = "manual" | "strategy";
export type DataSource = "tencent" | "mock";

export type Quote = {
  symbol: string; // e.g. "sh600519"
  code: string; // e.g. "600519"
  name: string;
  price: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  bid1: number;
  ask1: number;
  volume: number; // shares
  amount: number; // CNY
  limitUp: number;
  limitDown: number;
  changePct: number;
  quoteTime: string; // ISO time of the quote
  tradeDate: string; // YYYY-MM-DD (Asia/Shanghai) the quote belongs to
  isSt: boolean;
  suspended: boolean;
  source: DataSource;
};

export type Bar = {
  date: string; // YYYY-MM-DD
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
};

export type PositionLot = {
  tradeId: string;
  quantity: number;
  costPerShare: number; // includes buy fees
  tradeDate: string; // T+1: lots bought today cannot be sold today
};

export type Position = {
  symbol: string;
  name: string;
  lots: PositionLot[];
};

export type TradingAccount = {
  id: string;
  userId: string;
  kind: AccountKind;
  name: string;
  initialCash: number;
  cash: number;
  positions: Position[];
  createdAt: string;
  updatedAt: string;
};

export type TradeEmotion = "calm" | "confident" | "fomo" | "fear" | "greedy" | "revenge" | "bored" | "unsure";

export type TradeJournal = {
  reason: string;
  emotion: TradeEmotion;
  confidence: number; // 1-5
  plannedStopLossPct?: number; // e.g. 5 means exit at -5%
  plannedTakeProfitPct?: number;
  plannedHoldDays?: number;
  tags: string[];
};

// Market context captured at the moment of a trade. These are the raw material for distilling a strategy.
export type TradeFeatures = {
  changePctToday: number;
  gapPct: number;
  ma5DistPct: number;
  ma20DistPct: number;
  momentum5dPct: number;
  momentum20dPct: number;
  volumeRatio5d: number;
  distToLimitUpPct: number;
  rangePosition20d: number; // 0 = at 20-day low, 1 = at 20-day high
  positionPctOfEquity: number; // size of this trade vs. account equity
};

export type MarketFeatureKey = Exclude<keyof TradeFeatures, "positionPctOfEquity">;

export type TradeFees = {
  commission: number;
  stampDuty: number;
  transferFee: number;
  total: number;
};

export type Trade = {
  id: string;
  userId: string;
  accountId: string;
  symbol: string;
  name: string;
  side: Side;
  quantity: number;
  price: number;
  amount: number;
  fees: TradeFees;
  tradeDate: string;
  executedAt: string;
  source: DataSource;
  journal?: TradeJournal;
  features?: TradeFeatures;
  realizedPnl?: number; // sells only, net of all fees
  strategyId?: string;
};

export type RoundTrip = {
  id: string;
  userId: string;
  accountId: string;
  symbol: string;
  name: string;
  entryTradeId: string;
  exitTradeId: string;
  quantity: number;
  entryPrice: number; // per share incl. fees
  exitPrice: number; // per share net of fees
  entryDate: string;
  exitDate: string;
  holdDays: number;
  pnl: number;
  returnPct: number;
  entryFeatures?: TradeFeatures;
  entryJournal?: TradeJournal;
  exitJournal?: TradeJournal;
};

export type ReviewVerdict = "disciplined" | "mixed" | "impulsive";

export type TradeReview = {
  id: string;
  userId: string;
  tradeId: string;
  provider: "local" | "ai";
  verdict: ReviewVerdict;
  score: number; // 0-100, process quality, not profit
  summary: string;
  strengths: string[];
  issues: string[];
  flags: string[];
  suggestion: string;
  safetyNote?: string;
  uncertaintyNote: string;
  createdAt: string;
};

export type StrategyCondition = {
  feature: MarketFeatureKey;
  op: "gte" | "lte";
  value: number;
  label: string;
  sample: number;
  winRate: number;
  avgReturnPct: number;
};

export type PerformanceStats = {
  count: number;
  wins: number;
  winRate: number;
  avgReturnPct: number;
  avgWinPct: number;
  avgLossPct: number;
  profitFactor: number;
  totalPnl: number;
  avgHoldDays: number;
  maxDrawdownPct: number;
};

export type BacktestTrade = {
  symbol: string;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  returnPct: number;
  exitReason: "stop" | "target" | "time" | "end";
};

export type BacktestResult = {
  from: string;
  to: string;
  symbols: string[];
  stats: PerformanceStats;
  trades: BacktestTrade[];
  warnings: string[];
  generatedAt: string;
};

export type DistilledStrategy = {
  id: string;
  userId: string;
  name: string;
  version: number;
  status: "draft" | "active" | "retired";
  basedOnRoundTrips: number;
  entryConditions: StrategyCondition[];
  exit: {
    stopLossPct: number;
    takeProfitPct: number;
    maxHoldDays: number;
  };
  sizing: {
    positionPct: number;
    maxPositions: number;
  };
  universe: string[];
  sourceStats: PerformanceStats;
  matchedStats: PerformanceStats;
  backtest?: BacktestResult;
  notes: string[];
  uncertaintyNote: string;
  createdAt: string;
  updatedAt: string;
};

export type StrategyLogEntry = {
  id: string;
  userId: string;
  strategyId: string;
  at: string;
  message: string;
};

export type TradingSettings = {
  dataSource: DataSource;
  enforceTradingHours: boolean;
  initialCash: number;
};

export type TradingState = {
  userId: string;
  accounts: TradingAccount[];
  trades: Trade[];
  reviews: TradeReview[];
  strategies: DistilledStrategy[];
  strategyLog: StrategyLogEntry[];
  watchlist: string[];
  settings: TradingSettings;
};

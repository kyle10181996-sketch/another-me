// Pure order-execution engine for the simulated A-share account. No I/O here: callers pass in quotes and state.
import {
  calculateFees,
  DEFAULT_INITIAL_CASH,
  isWithinTradingSession,
  roundMoney,
  shanghaiDate,
  TradingRuleError,
  validateQuantity,
} from "@/lib/trading/rules";
import type {
  AccountKind,
  Position,
  Quote,
  Side,
  Trade,
  TradeFeatures,
  TradeJournal,
  TradingAccount,
  TradingState,
} from "@/lib/trading/types";

export function createAccount(userId: string, kind: AccountKind, initialCash: number, now = new Date()): TradingAccount {
  const createdAt = now.toISOString();
  return {
    id: `acct_${kind}`,
    userId,
    kind,
    name: kind === "manual" ? "My Account" : "Strategy Account",
    initialCash,
    cash: initialCash,
    positions: [],
    createdAt,
    updatedAt: createdAt,
  };
}

export function createInitialTradingState(userId: string, initialCash = DEFAULT_INITIAL_CASH): TradingState {
  return {
    userId,
    accounts: [createAccount(userId, "manual", initialCash), createAccount(userId, "strategy", initialCash)],
    trades: [],
    reviews: [],
    strategies: [],
    strategyLog: [],
    watchlist: ["sh600519", "sz000001", "sz300750", "sh601318", "sz002594"],
    settings: {
      dataSource: "tencent",
      enforceTradingHours: true,
      initialCash,
    },
  };
}

export function totalQuantity(position: Position) {
  return position.lots.reduce((sum, lot) => sum + lot.quantity, 0);
}

export function sellableQuantity(position: Position, today: string) {
  return position.lots.filter((lot) => lot.tradeDate < today).reduce((sum, lot) => sum + lot.quantity, 0);
}

export function averageCost(position: Position) {
  const quantity = totalQuantity(position);
  if (!quantity) return 0;
  return position.lots.reduce((sum, lot) => sum + lot.quantity * lot.costPerShare, 0) / quantity;
}

export function earliestLotDate(position: Position) {
  return position.lots.reduce((earliest, lot) => (lot.tradeDate < earliest ? lot.tradeDate : earliest), position.lots[0]?.tradeDate ?? "");
}

export type PositionView = {
  symbol: string;
  name: string;
  quantity: number;
  sellable: number;
  avgCost: number;
  price: number;
  value: number;
  pnl: number;
  pnlPct: number;
};

export type AccountView = {
  account: TradingAccount;
  equity: number;
  marketValue: number;
  unrealizedPnl: number;
  totalReturnPct: number;
  positions: PositionView[];
};

export function valueAccount(account: TradingAccount, prices: Record<string, number>, today: string): AccountView {
  const positions = account.positions.map((position) => {
    const quantity = totalQuantity(position);
    const avgCost = averageCost(position);
    const price = prices[position.symbol] ?? avgCost;
    const value = quantity * price;
    const pnl = value - quantity * avgCost;
    return {
      symbol: position.symbol,
      name: position.name,
      quantity,
      sellable: sellableQuantity(position, today),
      avgCost: roundMoney(avgCost * 1000) / 1000,
      price,
      value: roundMoney(value),
      pnl: roundMoney(pnl),
      pnlPct: avgCost ? Math.round((pnl / (quantity * avgCost)) * 10_000) / 100 : 0,
    };
  });
  const marketValue = positions.reduce((sum, position) => sum + position.value, 0);
  const equity = account.cash + marketValue;

  return {
    account,
    equity: roundMoney(equity),
    marketValue: roundMoney(marketValue),
    unrealizedPnl: roundMoney(positions.reduce((sum, position) => sum + position.pnl, 0)),
    totalReturnPct: Math.round(((equity - account.initialCash) / account.initialCash) * 10_000) / 100,
    positions,
  };
}

export type OrderInput = {
  state: TradingState;
  accountId: string;
  side: Side;
  quantity: number;
  quote: Quote;
  now: Date;
  features?: TradeFeatures;
  journal?: TradeJournal;
  strategyId?: string;
};

function fillPrice(side: Side, quote: Quote) {
  if (side === "buy") {
    const hasAsk = quote.ask1 > 0 && quote.ask1 <= quote.limitUp;
    if (quote.price >= quote.limitUp && !hasAsk) {
      throw new TradingRuleError("LIMIT_UP_SEALED", "The stock is sealed at limit-up with no sellers. The simulator assumes a buy order would not fill.");
    }
    return hasAsk ? quote.ask1 : Math.min(quote.price, quote.limitUp);
  }

  const hasBid = quote.bid1 > 0 && quote.bid1 >= quote.limitDown;
  if (quote.price <= quote.limitDown && !hasBid) {
    throw new TradingRuleError("LIMIT_DOWN_SEALED", "The stock is sealed at limit-down with no buyers. The simulator assumes a sell order would not fill.");
  }
  return hasBid ? quote.bid1 : Math.max(quote.price, quote.limitDown);
}

export function executeOrder(input: OrderInput): { state: TradingState; trade: Trade } {
  const { state, accountId, side, quantity, quote, now } = input;
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account) throw new TradingRuleError("NO_ACCOUNT", "Account not found.");

  if (quote.suspended) throw new TradingRuleError("SUSPENDED", `${quote.name} is not trading today (suspended or not yet open).`);

  const today = shanghaiDate(now);
  if (state.settings.enforceTradingHours && quote.source !== "mock") {
    if (!isWithinTradingSession(now) || quote.tradeDate !== today) {
      throw new TradingRuleError(
        "MARKET_CLOSED",
        "The A-share market is closed. Orders fill only during 09:30-11:30 and 13:00-15:00 China time on trading days. You can turn this check off in Settings.",
      );
    }
  }

  const position = account.positions.find((item) => item.symbol === quote.symbol);
  const sellable = position ? sellableQuantity(position, today) : 0;
  const quantityError = validateQuantity(quote.symbol, side, quantity, sellable);
  if (quantityError) throw new TradingRuleError("BAD_QUANTITY", quantityError);

  const price = fillPrice(side, quote);
  const amount = roundMoney(price * quantity);
  const fees = calculateFees(side, amount);
  const executedAt = now.toISOString();
  const tradeId = `trade_${crypto.randomUUID()}`;

  let cash = account.cash;
  let positions = account.positions;
  let realizedPnl: number | undefined;

  if (side === "buy") {
    const cost = amount + fees.total;
    if (cost > account.cash + 1e-6) {
      throw new TradingRuleError("INSUFFICIENT_CASH", `Not enough cash: this order needs ¥${cost.toFixed(2)}, available ¥${account.cash.toFixed(2)}.`);
    }
    cash = roundMoney(account.cash - cost);
    const lot = { tradeId, quantity, costPerShare: cost / quantity, tradeDate: today };
    positions = position
      ? positions.map((item) => (item === position ? { ...item, name: quote.name, lots: [...item.lots, lot] } : item))
      : [...positions, { symbol: quote.symbol, name: quote.name, lots: [lot] }];
  } else {
    // Sell sellable lots first-in-first-out; lots bought today stay (T+1).
    let remaining = quantity;
    let costBasis = 0;
    const lots = position!.lots.map((lot) => ({ ...lot }));
    for (const lot of lots) {
      if (remaining === 0) break;
      if (lot.tradeDate >= today) continue;
      const used = Math.min(lot.quantity, remaining);
      lot.quantity -= used;
      remaining -= used;
      costBasis += used * lot.costPerShare;
    }
    const proceeds = amount - fees.total;
    realizedPnl = roundMoney(proceeds - costBasis);
    cash = roundMoney(account.cash + proceeds);
    const remainingLots = lots.filter((lot) => lot.quantity > 0);
    positions = remainingLots.length
      ? positions.map((item) => (item === position ? { ...item, lots: remainingLots } : item))
      : positions.filter((item) => item !== position);
  }

  const trade: Trade = {
    id: tradeId,
    userId: state.userId,
    accountId,
    symbol: quote.symbol,
    name: quote.name,
    side,
    quantity,
    price,
    amount,
    fees,
    tradeDate: today,
    executedAt,
    source: quote.source,
    journal: input.journal,
    features: input.features,
    realizedPnl,
    strategyId: input.strategyId,
  };

  const updatedAccount: TradingAccount = { ...account, cash, positions, updatedAt: executedAt };

  return {
    trade,
    state: {
      ...state,
      accounts: state.accounts.map((item) => (item.id === accountId ? updatedAccount : item)),
      trades: [trade, ...state.trades],
    },
  };
}

// Server-side use cases for the trading simulator. API routes stay thin and call these.
import { strategyExplainPrompt, tradeReviewPrompt } from "@/lib/ai/prompts";
import { generateJson, hasConfiguredApiKey } from "@/lib/ai/openai-responses";
import { buildRoundTrips, computeStats } from "@/lib/trading/analytics";
import { backtestStrategy } from "@/lib/trading/backtest";
import { distillStrategy, type DistillResult } from "@/lib/trading/distiller";
import { createAccount, executeOrder, valueAccount } from "@/lib/trading/engine";
import { computeFeatures, historyBefore, snapshotFromQuote } from "@/lib/trading/features";
import { getDailyBars, getQuote, getQuotes } from "@/lib/trading/market-data";
import { normalizeSymbol, shanghaiDate, TradingRuleError } from "@/lib/trading/rules";
import { STRATEGY_ACCOUNT_ID, runStrategyCycle } from "@/lib/trading/strategy-runner";
import { readTradingState, updateTradingState } from "@/lib/trading/store";
import { reviewTradeLocally } from "@/lib/trading/trade-reviewer";
import type { Bar, Quote, Side, TradeEmotion, TradeJournal, TradeReview, TradingSettings, TradingState } from "@/lib/trading/types";

export const MANUAL_ACCOUNT_ID = "acct_manual";

const emotions: TradeEmotion[] = ["calm", "confident", "fomo", "fear", "greedy", "revenge", "bored", "unsure"];

function optionalPositive(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : undefined;
}

export function parseJournal(value: unknown): TradeJournal {
  const input = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const confidence = Math.round(Number(input.confidence));
  return {
    reason: typeof input.reason === "string" ? input.reason.slice(0, 2000) : "",
    emotion: emotions.includes(input.emotion as TradeEmotion) ? (input.emotion as TradeEmotion) : "unsure",
    confidence: Number.isFinite(confidence) ? Math.min(5, Math.max(1, confidence)) : 3,
    plannedStopLossPct: optionalPositive(input.plannedStopLossPct),
    plannedTakeProfitPct: optionalPositive(input.plannedTakeProfitPct),
    plannedHoldDays: optionalPositive(input.plannedHoldDays),
    tags: Array.isArray(input.tags) ? input.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 10) : [],
  };
}

function requireSymbol(input: unknown) {
  const symbol = typeof input === "string" ? normalizeSymbol(input) : null;
  if (!symbol) throw new TradingRuleError("BAD_SYMBOL", "Enter a 6-digit A-share code, e.g. 600519 or 000001.");
  return symbol;
}

async function safeBars(symbol: string, state: TradingState, count: number, now: Date): Promise<Bar[]> {
  try {
    return await getDailyBars(symbol, state.settings.dataSource, count, now);
  } catch {
    return [];
  }
}

export async function lookupQuotes(symbols: string[]): Promise<Quote[]> {
  const state = await readTradingState();
  const normalized = symbols.map((symbol) => normalizeSymbol(symbol)).filter((symbol): symbol is string => Boolean(symbol));
  return getQuotes(normalized, state.settings.dataSource);
}

export async function placeManualOrder(input: { symbol: unknown; side: unknown; quantity: unknown; journal: unknown }) {
  const symbol = requireSymbol(input.symbol);
  const side: Side = input.side === "sell" ? "sell" : "buy";
  const quantity = Number(input.quantity);
  const journal = parseJournal(input.journal);

  return updateTradingState(async (state) => {
    const now = new Date();
    const quote = await getQuote(symbol, state.settings.dataSource, now);
    const bars = await safeBars(symbol, state, 60, now);
    const account = state.accounts.find((item) => item.id === MANUAL_ACCOUNT_ID)!;

    // Price every holding so position size is measured against real equity.
    const held = account.positions.map((position) => position.symbol).filter((item) => item !== symbol);
    const others = held.length ? await getQuotes(held, state.settings.dataSource, now) : [];
    const prices = Object.fromEntries([...others, quote].map((item) => [item.symbol, item.price]));
    const equity = valueAccount(account, prices, shanghaiDate(now)).equity;
    const features = computeFeatures(historyBefore(bars, quote.tradeDate), snapshotFromQuote(quote), ((quantity * quote.price) / equity) * 100);

    const { state: afterOrder, trade } = executeOrder({ state, accountId: MANUAL_ACCOUNT_ID, side, quantity, quote, now, features, journal });
    const roundTrips = side === "sell" ? buildRoundTrips(afterOrder.trades, MANUAL_ACCOUNT_ID).filter((trip) => trip.exitTradeId === trade.id) : [];
    const tradesToday = afterOrder.trades.filter((item) => item.accountId === MANUAL_ACCOUNT_ID && item.tradeDate === trade.tradeDate).length;
    const review = reviewTradeLocally(trade, { roundTrips, tradesToday });

    return { state: { ...afterOrder, reviews: [review, ...afterOrder.reviews] }, result: { trade, review } };
  });
}

type AiReview = Pick<TradeReview, "verdict" | "score" | "summary" | "strengths" | "issues" | "suggestion" | "uncertaintyNote">;

// Upgrades the local review of a trade with an AI review when an API key is configured.
export async function aiReviewTrade(tradeId: string) {
  if (!(await hasConfiguredApiKey())) return { provider: "local" as const, review: null };

  const snapshot = await readTradingState();
  const trade = snapshot.trades.find((item) => item.id === tradeId);
  const localReview = snapshot.reviews.find((item) => item.tradeId === tradeId);
  if (!trade || !localReview) throw new TradingRuleError("NOT_FOUND", "Trade not found.");

  const roundTrips = buildRoundTrips(snapshot.trades, trade.accountId);
  const closing = roundTrips.filter((trip) => trip.exitTradeId === trade.id);
  const recent = computeStats(roundTrips.slice(-30));

  const ai = await generateJson<AiReview>({
    instructions: tradeReviewPrompt,
    input: JSON.stringify({
      trade: { side: trade.side, name: trade.name, symbol: trade.symbol, quantity: trade.quantity, price: trade.price, fees: trade.fees.total, realizedPnl: trade.realizedPnl },
      journal: trade.journal,
      marketFeaturesAtTrade: trade.features,
      closedRoundTrips: closing.map((trip) => ({ returnPct: trip.returnPct, holdDays: trip.holdDays, entryJournal: trip.entryJournal })),
      ruleBasedFlags: localReview.flags,
      recentStats: recent,
    }),
  });

  const verdicts = ["disciplined", "mixed", "impulsive"] as const;
  const review: TradeReview = {
    ...localReview,
    id: `review_${crypto.randomUUID()}`,
    provider: "ai",
    verdict: verdicts.includes(ai.verdict) ? ai.verdict : localReview.verdict,
    score: Number.isFinite(Number(ai.score)) ? Math.max(0, Math.min(100, Math.round(Number(ai.score)))) : localReview.score,
    summary: typeof ai.summary === "string" ? ai.summary : localReview.summary,
    strengths: Array.isArray(ai.strengths) ? ai.strengths.map(String).slice(0, 6) : localReview.strengths,
    issues: Array.isArray(ai.issues) ? ai.issues.map(String).slice(0, 6) : localReview.issues,
    suggestion: typeof ai.suggestion === "string" ? ai.suggestion : localReview.suggestion,
    uncertaintyNote: typeof ai.uncertaintyNote === "string" && ai.uncertaintyNote ? ai.uncertaintyNote : localReview.uncertaintyNote,
    createdAt: new Date().toISOString(),
  };

  await updateTradingState(async (state) => ({
    state: { ...state, reviews: [review, ...state.reviews.filter((item) => item.tradeId !== tradeId || item.provider === "local")] },
    result: null,
  }));

  return { provider: "ai" as const, review };
}

function strategyUniverse(state: TradingState) {
  const traded = state.trades.filter((trade) => trade.accountId === MANUAL_ACCOUNT_ID).map((trade) => trade.symbol);
  return [...new Set([...state.watchlist, ...traded])].slice(0, 30);
}

export async function distillAndBacktest(): Promise<{ result: DistillResult; state: TradingState }> {
  const snapshot = await readTradingState();
  const roundTrips = buildRoundTrips(snapshot.trades, MANUAL_ACCOUNT_ID);
  const version = snapshot.strategies.length + 1;
  const result = distillStrategy(roundTrips, { userId: snapshot.userId, universe: strategyUniverse(snapshot), version });

  if (!result.ready) return { result, state: snapshot };

  const now = new Date();
  const barsEntries = await Promise.all(result.strategy.universe.map(async (symbol) => [symbol, await safeBars(symbol, snapshot, 250, now)] as const));
  const barsBySymbol = Object.fromEntries(barsEntries.filter(([, bars]) => bars.length > 0));
  const strategy = { ...result.strategy, backtest: backtestStrategy(result.strategy, barsBySymbol, snapshot.settings.initialCash) };

  if (await hasConfiguredApiKey()) {
    try {
      const ai = await generateJson<{ notes: string[]; uncertaintyNote: string }>({
        instructions: strategyExplainPrompt,
        input: JSON.stringify({
          entryConditions: strategy.entryConditions,
          exit: strategy.exit,
          sizing: strategy.sizing,
          sourceStats: strategy.sourceStats,
          matchedStats: strategy.matchedStats,
          backtest: { stats: strategy.backtest.stats, warnings: strategy.backtest.warnings },
        }),
      });
      if (Array.isArray(ai.notes)) strategy.notes = [...strategy.notes, ...ai.notes.map(String).slice(0, 4)];
      if (typeof ai.uncertaintyNote === "string" && ai.uncertaintyNote) strategy.uncertaintyNote = `${strategy.uncertaintyNote} ${ai.uncertaintyNote}`;
    } catch {
      // The rule-based notes are enough; AI commentary is optional.
    }
  }

  const { state } = await updateTradingState(async (current) => ({
    state: { ...current, strategies: [strategy, ...current.strategies] },
    result: null,
  }));

  return { result: { ready: true, strategy }, state };
}

export async function setStrategyStatus(strategyId: string, status: "active" | "retired") {
  return updateTradingState(async (state) => {
    if (!state.strategies.some((item) => item.id === strategyId)) throw new TradingRuleError("NOT_FOUND", "Strategy not found.");
    const now = new Date().toISOString();
    const strategies = state.strategies.map((item) => {
      if (item.id === strategyId) return { ...item, status, updatedAt: now };
      // Only one strategy trades at a time.
      if (status === "active" && item.status === "active") return { ...item, status: "retired" as const, updatedAt: now };
      return item;
    });
    return { state: { ...state, strategies }, result: null };
  });
}

export async function runActiveStrategy() {
  return updateTradingState(async (state) => {
    const strategy = state.strategies.find((item) => item.status === "active");
    if (!strategy) throw new TradingRuleError("NO_ACTIVE_STRATEGY", "Activate a distilled strategy first.");

    const now = new Date();
    const account = state.accounts.find((item) => item.id === STRATEGY_ACCOUNT_ID)!;
    const symbols = [...new Set([...strategy.universe, ...account.positions.map((position) => position.symbol)])];
    const quotes = await getQuotes(symbols, state.settings.dataSource, now);
    const barsEntries = await Promise.all(symbols.map(async (symbol) => [symbol, await safeBars(symbol, state, 60, now)] as const));
    const result = runStrategyCycle(
      state,
      strategy,
      Object.fromEntries(quotes.map((quote) => [quote.symbol, quote])),
      Object.fromEntries(barsEntries),
      now,
    );

    return { state: result.state, result: { trades: result.trades, log: result.log } };
  });
}

export async function updateSettings(input: { watchlist?: unknown; settings?: unknown }) {
  return updateTradingState(async (state) => {
    let next = state;
    if (Array.isArray(input.watchlist)) {
      const watchlist = [...new Set(input.watchlist.map((item) => (typeof item === "string" ? normalizeSymbol(item) : null)).filter((item): item is string => Boolean(item)))].slice(0, 50);
      next = { ...next, watchlist };
    }
    if (input.settings && typeof input.settings === "object") {
      const patch = input.settings as Partial<TradingSettings>;
      next = {
        ...next,
        settings: {
          ...next.settings,
          dataSource: patch.dataSource === "mock" || patch.dataSource === "tencent" ? patch.dataSource : next.settings.dataSource,
          enforceTradingHours: typeof patch.enforceTradingHours === "boolean" ? patch.enforceTradingHours : next.settings.enforceTradingHours,
        },
      };
    }
    return { state: next, result: null };
  });
}

// Resets both accounts to the starting cash and clears the trade history. Strategies are kept.
export async function resetAccounts(initialCash: unknown) {
  const cash = Number(initialCash);
  const amount = Number.isFinite(cash) && cash >= 10_000 && cash <= 100_000_000 ? Math.round(cash) : undefined;
  return updateTradingState(async (state) => {
    const startCash = amount ?? state.settings.initialCash;
    return {
      state: {
        ...state,
        accounts: [createAccount(state.userId, "manual", startCash), createAccount(state.userId, "strategy", startCash)],
        trades: [],
        reviews: [],
        strategyLog: [],
        strategies: state.strategies.map((item) => (item.status === "active" ? { ...item, status: "retired" as const } : item)),
        settings: { ...state.settings, initialCash: startCash },
      },
      result: null,
    };
  });
}

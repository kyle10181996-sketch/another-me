// Runs one decision cycle of the active distilled strategy against the separate strategy account.
// It only ever trades the simulator's virtual money.
import { matchesConditions } from "@/lib/trading/distiller";
import { averageCost, earliestLotDate, executeOrder, sellableQuantity, valueAccount } from "@/lib/trading/engine";
import { computeFeatures, historyBefore, snapshotFromQuote } from "@/lib/trading/features";
import { daysBetween, roundDownToLot, shanghaiDate, TradingRuleError } from "@/lib/trading/rules";
import type { Bar, DistilledStrategy, Quote, StrategyLogEntry, Trade, TradingState } from "@/lib/trading/types";

export const STRATEGY_ACCOUNT_ID = "acct_strategy";

export function runStrategyCycle(
  state: TradingState,
  strategy: DistilledStrategy,
  quotes: Record<string, Quote>,
  bars: Record<string, Bar[]>,
  now: Date,
): { state: TradingState; trades: Trade[]; log: StrategyLogEntry[] } {
  let next = state;
  const trades: Trade[] = [];
  const log: StrategyLogEntry[] = [];
  const today = shanghaiDate(now);
  const note = (message: string) =>
    log.push({ id: `slog_${crypto.randomUUID()}`, userId: state.userId, strategyId: strategy.id, at: now.toISOString(), message });

  const account = () => next.accounts.find((item) => item.id === STRATEGY_ACCOUNT_ID)!;
  const prices = () => Object.fromEntries(Object.values(quotes).map((quote) => [quote.symbol, quote.price]));

  // 1. Exits first.
  for (const position of account().positions) {
    const quote = quotes[position.symbol];
    if (!quote) continue;
    const sellable = sellableQuantity(position, today);
    if (!sellable) continue;
    const cost = averageCost(position);
    const pnlPct = ((quote.price - cost) / cost) * 100;
    const held = daysBetween(earliestLotDate(position), today);
    const reason =
      pnlPct <= -strategy.exit.stopLossPct
        ? `触发止损（${pnlPct.toFixed(2)}%）`
        : pnlPct >= strategy.exit.takeProfitPct
          ? `达到止盈（+${pnlPct.toFixed(2)}%）`
          : held >= strategy.exit.maxHoldDays
            ? `持有满 ${strategy.exit.maxHoldDays} 天`
            : null;
    if (!reason) continue;

    try {
      const result = executeOrder({
        state: next,
        accountId: STRATEGY_ACCOUNT_ID,
        side: "sell",
        quantity: sellable,
        quote,
        now,
        strategyId: strategy.id,
        journal: { reason: `${strategy.name}：${reason}`, emotion: "calm", confidence: 3, tags: ["strategy"] },
        features: bars[quote.symbol] ? computeFeatures(historyBefore(bars[quote.symbol], quote.tradeDate), snapshotFromQuote(quote)) : undefined,
      });
      next = result.state;
      trades.push(result.trade);
      note(`以 ¥${result.trade.price} 卖出 ${quote.name}（${quote.symbol}）${sellable} 股：${reason}。`);
    } catch (error) {
      note(`无法卖出 ${quote.symbol}：${error instanceof TradingRuleError ? error.message : "未知错误"}`);
    }
  }

  // 2. Entries.
  for (const symbol of strategy.universe) {
    const current = account();
    if (current.positions.length >= strategy.sizing.maxPositions) break;
    if (current.positions.some((position) => position.symbol === symbol)) continue;
    const quote = quotes[symbol];
    const history = bars[symbol];
    if (!quote || !history || quote.suspended) continue;

    const features = computeFeatures(historyBefore(history, quote.tradeDate), snapshotFromQuote(quote));
    if (!matchesConditions(features, strategy.entryConditions)) continue;

    const equity = valueAccount(current, prices(), today).equity;
    const price = quote.ask1 > 0 ? quote.ask1 : quote.price;
    const quantity = roundDownToLot(symbol, (equity * strategy.sizing.positionPct) / 100 / price);
    if (!quantity) {
      note(`${symbol} 出现买入信号，但按仓位计算不足一手。`);
      continue;
    }

    try {
      const result = executeOrder({
        state: next,
        accountId: STRATEGY_ACCOUNT_ID,
        side: "buy",
        quantity,
        quote,
        now,
        strategyId: strategy.id,
        features: { ...features, positionPctOfEquity: Math.round(((quantity * price) / equity) * 10_000) / 100 },
        journal: {
          reason: `${strategy.name}：${strategy.entryConditions.map((condition) => condition.label).join("；")}`,
          emotion: "calm",
          confidence: 3,
          plannedStopLossPct: strategy.exit.stopLossPct,
          plannedTakeProfitPct: strategy.exit.takeProfitPct,
          plannedHoldDays: strategy.exit.maxHoldDays,
          tags: ["strategy"],
        },
      });
      next = result.state;
      trades.push(result.trade);
      note(`以 ¥${result.trade.price} 买入 ${quote.name}（${symbol}）${quantity} 股。`);
    } catch (error) {
      note(`无法买入 ${symbol}：${error instanceof TradingRuleError ? error.message : "未知错误"}`);
    }
  }

  if (!log.length) note("已检查股票池内所有股票，没有买入或卖出信号。");

  return {
    trades,
    log,
    state: { ...next, strategyLog: [...log, ...next.strategyLog].slice(0, 300) },
  };
}

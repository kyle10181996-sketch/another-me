// Turns the trade log into completed round trips (buy -> sell) and performance statistics.
import { daysBetween } from "@/lib/trading/rules";
import type { PerformanceStats, RoundTrip, Trade, TradeFeatures, TradeJournal } from "@/lib/trading/types";

type OpenLot = {
  tradeId: string;
  remaining: number;
  costPerShare: number;
  date: string;
  features?: TradeFeatures;
  journal?: TradeJournal;
};

export function buildRoundTrips(trades: Trade[], accountId: string): RoundTrip[] {
  const ordered = trades
    .filter((trade) => trade.accountId === accountId)
    .sort((a, b) => a.executedAt.localeCompare(b.executedAt));
  const open = new Map<string, OpenLot[]>();
  const result: RoundTrip[] = [];

  for (const trade of ordered) {
    const queue = open.get(trade.symbol) ?? [];
    open.set(trade.symbol, queue);

    if (trade.side === "buy") {
      queue.push({
        tradeId: trade.id,
        remaining: trade.quantity,
        costPerShare: (trade.amount + trade.fees.total) / trade.quantity,
        date: trade.tradeDate,
        features: trade.features,
        journal: trade.journal,
      });
      continue;
    }

    const exitPerShare = (trade.amount - trade.fees.total) / trade.quantity;
    let remaining = trade.quantity;
    for (const lot of queue) {
      if (remaining === 0) break;
      if (lot.remaining === 0 || lot.date >= trade.tradeDate) continue;
      const quantity = Math.min(lot.remaining, remaining);
      lot.remaining -= quantity;
      remaining -= quantity;
      const pnl = quantity * (exitPerShare - lot.costPerShare);
      result.push({
        id: `${lot.tradeId}_${trade.id}`,
        userId: trade.userId,
        accountId,
        symbol: trade.symbol,
        name: trade.name,
        entryTradeId: lot.tradeId,
        exitTradeId: trade.id,
        quantity,
        entryPrice: lot.costPerShare,
        exitPrice: exitPerShare,
        entryDate: lot.date,
        exitDate: trade.tradeDate,
        holdDays: daysBetween(lot.date, trade.tradeDate),
        pnl: Math.round(pnl * 100) / 100,
        returnPct: Math.round(((exitPerShare - lot.costPerShare) / lot.costPerShare) * 10_000) / 100,
        entryFeatures: lot.features,
        entryJournal: lot.journal,
        exitJournal: trade.journal,
      });
    }
    open.set(trade.symbol, queue.filter((lot) => lot.remaining > 0));
  }

  return result;
}

export type StatInput = { returnPct: number; pnl: number; holdDays: number };

export function computeStats(items: StatInput[], baseCapital = 1_000_000): PerformanceStats {
  const count = items.length;
  const wins = items.filter((item) => item.pnl > 0);
  const losses = items.filter((item) => item.pnl <= 0);
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const avg = (values: number[]) => (values.length ? sum(values) / values.length : 0);
  const grossWin = sum(wins.map((item) => item.pnl));
  const grossLoss = Math.abs(sum(losses.map((item) => item.pnl)));

  let equity = baseCapital;
  let peak = baseCapital;
  let maxDrawdown = 0;
  for (const item of items) {
    equity += item.pnl;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak > 0 ? (peak - equity) / peak : 0);
  }

  const round2 = (value: number) => Math.round(value * 100) / 100;

  return {
    count,
    wins: wins.length,
    winRate: count ? round2((wins.length / count) * 100) : 0,
    avgReturnPct: round2(avg(items.map((item) => item.returnPct))),
    avgWinPct: round2(avg(wins.map((item) => item.returnPct))),
    avgLossPct: round2(avg(losses.map((item) => item.returnPct))),
    profitFactor: grossLoss > 0 ? round2(grossWin / grossLoss) : grossWin > 0 ? 99 : 0,
    totalPnl: round2(sum(items.map((item) => item.pnl))),
    avgHoldDays: round2(avg(items.map((item) => item.holdDays))),
    maxDrawdownPct: round2(maxDrawdown * 100),
  };
}

export function groupStats<K extends string>(roundTrips: RoundTrip[], keyOf: (trip: RoundTrip) => K | undefined) {
  const groups = new Map<K, RoundTrip[]>();
  for (const trip of roundTrips) {
    const key = keyOf(trip);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), trip]);
  }
  return [...groups.entries()]
    .map(([key, trips]) => ({ key, stats: computeStats(trips) }))
    .sort((a, b) => b.stats.count - a.stats.count);
}

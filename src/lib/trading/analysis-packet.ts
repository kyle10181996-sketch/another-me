// Builds a compact, self-describing snapshot of the user's simulated trading for analysis — either by the in-app
// AI coach or pasted into a Claude conversation. Contains only simulator data the user chose to export.
import { tradingDisclaimer } from "@/lib/safety/classify-risk";
import { buildRoundTrips, computeStats, groupStats } from "@/lib/trading/analytics";
import { aggregateByEntry, MIN_ROUND_TRIPS } from "@/lib/trading/distiller";
import { daysBetween } from "@/lib/trading/rules";
import { earliestLotDate, valueAccount } from "@/lib/trading/engine";
import { flagDescriptions, positiveFlags } from "@/lib/trading/trade-reviewer";
import type { TradingState } from "@/lib/trading/types";

const MANUAL = "acct_manual";
const STRATEGY = "acct_strategy";

export function buildAnalysisPacket(state: TradingState, prices: Record<string, number>, today: string) {
  const reviewsByTrade = new Map<string, TradingState["reviews"][number]>();
  for (const review of state.reviews) {
    const existing = reviewsByTrade.get(review.tradeId);
    if (!existing || review.provider === "ai") reviewsByTrade.set(review.tradeId, review);
  }
  const localReviews = state.reviews.filter((review) => review.provider === "local" && state.trades.some((trade) => trade.id === review.tradeId && trade.accountId === MANUAL));

  const manualTrips = aggregateByEntry(buildRoundTrips(state.trades, MANUAL));
  const strategyTrips = aggregateByEntry(buildRoundTrips(state.trades, STRATEGY));

  const flagCounts = new Map<string, number>();
  for (const review of localReviews) for (const flag of review.flags) flagCounts.set(flag, (flagCounts.get(flag) ?? 0) + 1);

  return {
    meta: {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      today,
      dataSource: state.settings.dataSource,
      disclaimer: tradingDisclaimer,
      distillationProgress: `${manualTrips.length}/${MIN_ROUND_TRIPS} closed trades`,
    },
    accounts: state.accounts.map((account) => {
      const view = valueAccount(account, prices, today);
      return {
        name: account.name,
        kind: account.kind,
        initialCash: account.initialCash,
        cash: account.cash,
        equity: view.equity,
        totalReturnPct: view.totalReturnPct,
        positions: view.positions.map((position) => {
          const raw = account.positions.find((item) => item.symbol === position.symbol);
          return {
            symbol: position.symbol,
            name: position.name,
            quantity: position.quantity,
            sellableToday: position.sellable,
            avgCost: position.avgCost,
            lastPrice: position.price,
            pnlPct: position.pnlPct,
            weightPct: view.equity ? Math.round((position.value / view.equity) * 1000) / 10 : 0,
            heldDays: raw ? daysBetween(earliestLotDate(raw), today) : 0,
          };
        }),
      };
    }),
    performance: {
      myClosedTrades: computeStats(manualTrips),
      strategyClosedTrades: computeStats(strategyTrips),
    },
    resultsByEntryEmotion: groupStats(manualTrips, (trip) => trip.entryJournal?.emotion).map(({ key, stats }) => ({
      emotion: key,
      trades: stats.count,
      winRate: stats.winRate,
      avgReturnPct: stats.avgReturnPct,
    })),
    resultsByConfidence: groupStats(manualTrips, (trip) => (trip.entryJournal ? `${trip.entryJournal.confidence}/5` : undefined)).map(({ key, stats }) => ({
      confidence: key,
      trades: stats.count,
      winRate: stats.winRate,
      avgReturnPct: stats.avgReturnPct,
    })),
    recurringProcessIssues: [...flagCounts.entries()]
      .filter(([flag]) => !positiveFlags.has(flag))
      .sort((a, b) => b[1] - a[1])
      .map(([flag, count]) => ({ flag, description: flagDescriptions[flag] ?? flag, count })),
    recurringGoodHabits: [...flagCounts.entries()]
      .filter(([flag]) => positiveFlags.has(flag))
      .sort((a, b) => b[1] - a[1])
      .map(([flag, count]) => ({ flag, description: flagDescriptions[flag] ?? flag, count })),
    avgProcessScore: localReviews.length ? Math.round(localReviews.reduce((sum, review) => sum + review.score, 0) / localReviews.length) : null,
    closedTrades: manualTrips.slice(-60).map((trip) => ({
      symbol: trip.symbol,
      name: trip.name,
      entryDate: trip.entryDate,
      exitDate: trip.exitDate,
      holdDays: trip.holdDays,
      returnPct: Math.round(trip.returnPct * 100) / 100,
      pnl: Math.round(trip.pnl),
      entry: trip.entryJournal
        ? {
            reason: trip.entryJournal.reason,
            emotion: trip.entryJournal.emotion,
            confidence: trip.entryJournal.confidence,
            plannedStopLossPct: trip.entryJournal.plannedStopLossPct,
            plannedTakeProfitPct: trip.entryJournal.plannedTakeProfitPct,
          }
        : null,
      exit: trip.exitJournal ? { reason: trip.exitJournal.reason, emotion: trip.exitJournal.emotion } : null,
      marketAtEntry: trip.entryFeatures ?? null,
    })),
    recentOrders: state.trades
      .filter((trade) => trade.accountId === MANUAL)
      .slice(0, 30)
      .map((trade) => {
        const review = reviewsByTrade.get(trade.id);
        return {
          time: trade.executedAt,
          side: trade.side,
          symbol: trade.symbol,
          name: trade.name,
          quantity: trade.quantity,
          price: trade.price,
          fees: trade.fees.total,
          realizedPnl: trade.realizedPnl,
          journal: trade.journal ?? null,
          marketAtTrade: trade.features ?? null,
          review: review ? { verdict: review.verdict, score: review.score, flags: review.flags } : null,
        };
      }),
    strategies: state.strategies.slice(0, 5).map((strategy) => ({
      name: strategy.name,
      status: strategy.status,
      entryConditions: strategy.entryConditions.map((condition) => condition.label),
      exit: strategy.exit,
      sizing: strategy.sizing,
      inSampleStats: strategy.matchedStats,
      backtestStats: strategy.backtest?.stats ?? null,
    })),
  };
}

export type AnalysisPacket = ReturnType<typeof buildAnalysisPacket>;

const featureGlossary =
  "marketAtEntry/marketAtTrade fields: changePctToday (% change that day), gapPct (open vs prev close), ma5DistPct/ma20DistPct (% above/below 5/20-day average), momentum5dPct/momentum20dPct, volumeRatio5d (volume vs 5-day avg), distToLimitUpPct (room to the daily limit-up), rangePosition20d (0 = 20-day low, 1 = 20-day high), positionPctOfEquity (order size as % of account).";

// Markdown version meant to be pasted into a chat with Claude.
export function packetToMarkdown(packet: AnalysisPacket) {
  const manual = packet.accounts.find((account) => account.kind === "manual");
  const perf = packet.performance.myClosedTrades;
  const lines = [
    "# My A-share simulator trading log",
    "",
    "I paper-trade A-shares in a simulator (virtual money, real A-share rules: T+1, lots of 100, price limits, fees) and journal every order with my reason and emotion. My goal is to find which of my habits make money, drop the emotional ones, and later turn the profitable pattern into fixed rules.",
    "",
    "Please analyze this log as a trading-process coach:",
    "1. What is working: which setups, conditions or behaviors line up with my winners?",
    "2. What is costing me money: recurring mistakes, emotional patterns, sizing, exits.",
    "3. Risks in my current open positions (process-wise, e.g. no stop, oversized, held past plan).",
    "4. 3 concrete rules I should follow for the next 20 trades, and how to tell if they work.",
    "5. How much of this is likely noise given the sample size.",
    "",
    "Do not predict prices or tell me to buy or sell specific stocks; judge my process.",
    "",
    "## Snapshot",
    `- Date: ${packet.meta.today} · data source: ${packet.meta.dataSource}`,
    manual ? `- My account: equity ¥${manual.equity.toFixed(0)} (${manual.totalReturnPct}% since start), cash ¥${manual.cash.toFixed(0)}, ${manual.positions.length} open positions` : "",
    `- Closed trades: ${perf.count} · win rate ${perf.winRate}% · avg return ${perf.avgReturnPct}% · avg win ${perf.avgWinPct}% / avg loss ${perf.avgLossPct}% · profit factor ${perf.profitFactor} · avg hold ${perf.avgHoldDays} days · max drawdown ${perf.maxDrawdownPct}%`,
    packet.avgProcessScore !== null ? `- Average process score from trade reviews: ${packet.avgProcessScore}/100` : "",
    `- Strategy distillation progress: ${packet.meta.distillationProgress}`,
    "",
  ];

  if (packet.resultsByEntryEmotion.length) {
    lines.push("## Results by emotion at entry", "| Emotion | Trades | Win rate | Avg return |", "|---|---|---|---|");
    for (const row of packet.resultsByEntryEmotion) lines.push(`| ${row.emotion} | ${row.trades} | ${row.winRate}% | ${row.avgReturnPct}% |`);
    lines.push("");
  }

  if (packet.recurringProcessIssues.length) {
    lines.push("## Recurring issues flagged by the rule-based reviewer");
    for (const issue of packet.recurringProcessIssues) lines.push(`- ${issue.description} ×${issue.count}`);
    lines.push("");
  }

  if (packet.recurringGoodHabits.length) {
    lines.push("## Good habits flagged by the reviewer");
    for (const habit of packet.recurringGoodHabits) lines.push(`- ${habit.description} ×${habit.count}`);
    lines.push("");
  }

  if (manual?.positions.length) {
    lines.push("## Open positions", "| Stock | Qty | Weight | P&L | Held |", "|---|---|---|---|---|");
    for (const position of manual.positions) lines.push(`| ${position.name} ${position.symbol} | ${position.quantity} | ${position.weightPct}% | ${position.pnlPct}% | ${position.heldDays}d |`);
    lines.push("");
  }

  lines.push("## Full data (JSON)", featureGlossary, "", "```json", JSON.stringify(packet, null, 1), "```");
  return lines.filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n");
}

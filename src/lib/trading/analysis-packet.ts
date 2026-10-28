// Builds a compact, self-describing snapshot of the user's simulated trading for analysis — either by the in-app
// AI coach or pasted into a Claude conversation. Contains only simulator data the user chose to export.
import { tradingDisclaimer } from "@/lib/safety/classify-risk";
import { buildRoundTrips, computeStats, groupStats } from "@/lib/trading/analytics";
import { aggregateByEntry, MIN_ROUND_TRIPS } from "@/lib/trading/distiller";
import { emotionLabel } from "@/lib/trading/labels";
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
      distillationProgress: `已平仓 ${manualTrips.length}/${MIN_ROUND_TRIPS} 笔`,
    },
    accounts: state.accounts.map((account) => {
      const view = valueAccount(account, prices, today);
      return {
        name: account.kind === "manual" ? "我的账户" : "策略账户",
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
  "JSON 中 marketAtEntry / marketAtTrade 字段说明：changePctToday 当日涨跌幅 %，gapPct 开盘跳空 %，ma5DistPct / ma20DistPct 偏离 5 日 / 20 日均线 %，momentum5dPct / momentum20dPct 5 日 / 20 日涨跌幅 %，volumeRatio5d 量比（对 5 日均量），distToLimitUpPct 距涨停 %，rangePosition20d 20 日区间位置（0 = 20 日最低，1 = 20 日最高），positionPctOfEquity 这笔订单占总资产 %。emotion 取值：calm 冷静、confident 自信、unsure 犹豫、fomo 怕错过、greedy 贪婪、fear 恐惧、revenge 想报复/回本、bored 无聊。";

// Markdown version meant to be pasted into a chat with Claude.
export function packetToMarkdown(packet: AnalysisPacket) {
  const manual = packet.accounts.find((account) => account.kind === "manual");
  const perf = packet.performance.myClosedTrades;
  const lines = [
    "# 我的 A 股模拟交易记录",
    "",
    "我在模拟器里用虚拟资金交易 A 股（按真实规则：T+1、100 股一手、涨跌停、手续费），每笔下单都记录了理由和当时的情绪。我的目标是找出哪些习惯能赚钱、去掉情绪化的交易，之后把盈利的模式固定成规则。",
    "",
    "请你以交易过程教练的身份，用中文分析这份记录：",
    "1. 哪些做法有效：我的盈利单在哪些买点、市场条件或行为上有共同点？",
    "2. 哪些地方在亏钱：反复出现的错误、情绪模式、仓位、离场方式。",
    "3. 当前持仓在交易过程上的风险（例如没设止损、仓位过重、超过计划持有时间）。",
    "4. 接下来 20 笔交易我应该遵守的 3 条具体规则，以及怎么判断它们是否有效。",
    "5. 考虑到样本量，这些结论有多少可能只是噪音。",
    "",
    "不要预测股价，也不要让我买卖某只具体的股票；请评价我的交易过程。",
    "",
    "## 概况",
    `- 日期：${packet.meta.today} · 数据源：${packet.meta.dataSource === "mock" ? "模拟行情" : "腾讯实时行情"}`,
    manual ? `- 我的账户：总资产 ¥${manual.equity.toFixed(0)}（累计 ${manual.totalReturnPct}%），现金 ¥${manual.cash.toFixed(0)}，持仓 ${manual.positions.length} 只` : "",
    `- 已平仓 ${perf.count} 笔 · 胜率 ${perf.winRate}% · 平均收益 ${perf.avgReturnPct}% · 平均盈利 ${perf.avgWinPct}% / 平均亏损 ${perf.avgLossPct}% · 盈亏比因子 ${perf.profitFactor} · 平均持有 ${perf.avgHoldDays} 天 · 最大回撤 ${perf.maxDrawdownPct}%`,
    packet.avgProcessScore !== null ? `- 逐笔复盘的平均过程分：${packet.avgProcessScore}/100` : "",
    `- 策略蒸馏进度：${packet.meta.distillationProgress}`,
    "",
  ];

  if (packet.resultsByEntryEmotion.length) {
    lines.push("## 按买入时情绪统计", "| 情绪 | 笔数 | 胜率 | 平均收益 |", "|---|---|---|---|");
    for (const row of packet.resultsByEntryEmotion) lines.push(`| ${emotionLabel(row.emotion)} | ${row.trades} | ${row.winRate}% | ${row.avgReturnPct}% |`);
    lines.push("");
  }

  if (packet.recurringProcessIssues.length) {
    lines.push("## 复盘反复标记的问题");
    for (const issue of packet.recurringProcessIssues) lines.push(`- ${issue.description} ×${issue.count}`);
    lines.push("");
  }

  if (packet.recurringGoodHabits.length) {
    lines.push("## 复盘标记的好习惯");
    for (const habit of packet.recurringGoodHabits) lines.push(`- ${habit.description} ×${habit.count}`);
    lines.push("");
  }

  if (manual?.positions.length) {
    lines.push("## 当前持仓", "| 股票 | 数量 | 仓位占比 | 浮动盈亏 | 已持有 |", "|---|---|---|---|---|");
    for (const position of manual.positions) lines.push(`| ${position.name} ${position.symbol} | ${position.quantity} | ${position.weightPct}% | ${position.pnlPct}% | ${position.heldDays} 天 |`);
    lines.push("");
  }

  lines.push("## 完整数据（JSON）", featureGlossary, "", "```json", JSON.stringify(packet, null, 1), "```");
  return lines.filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n");
}

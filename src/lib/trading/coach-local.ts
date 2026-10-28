// Rule-based portfolio analysis used when no AI provider is configured. Derived only from the analysis packet.
import type { AnalysisPacket } from "@/lib/trading/analysis-packet";
import { MIN_ROUND_TRIPS } from "@/lib/trading/distiller";
import { emotionLabel } from "@/lib/trading/labels";
import type { CoachAnalysis } from "@/lib/trading/types";

type Draft = Pick<CoachAnalysis, "headline" | "answer" | "working" | "costing" | "emotionalPatterns" | "openPositionNotes" | "rules" | "uncertaintyNote">;

const emotional = new Set(["fomo", "greedy", "revenge", "bored", "fear"]);

export function analyzeLocally(packet: AnalysisPacket): Draft {
  const perf = packet.performance.myClosedTrades;
  const working: string[] = [];
  const costing: string[] = [];
  const emotionalPatterns: string[] = [];
  const openPositionNotes: string[] = [];
  const rules: string[] = [];

  if (perf.count === 0) {
    return {
      headline: "还没有已平仓的交易，暂时没有可分析的结果。",
      answer: "",
      working: [],
      costing: [],
      emotionalPatterns: [],
      openPositionNotes: [],
      rules: ["每笔下单都写清理由、情绪、止损和止盈。", `至少平仓 ${MIN_ROUND_TRIPS} 笔后，再判断有没有规律。`],
      uncertaintyNote: "有了已平仓交易后才能开始分析。",
    };
  }

  if (perf.avgWinPct > 0 && perf.avgLossPct < 0) {
    const ratio = perf.avgWinPct / Math.abs(perf.avgLossPct);
    (ratio >= 1.5 ? working : costing).push(
      `平均盈利 ${perf.avgWinPct}%，平均亏损 ${perf.avgLossPct}%（盈亏比 ${ratio.toFixed(2)}）。${ratio >= 1.5 ? "赚的时候明显比亏的时候多。" : "亏损和盈利差不多大，只能靠胜率撑着。"}`,
    );
  }

  const byEmotion = packet.resultsByEntryEmotion.filter((row) => row.trades >= 2);
  for (const row of byEmotion) {
    const line = `情绪为「${emotionLabel(row.emotion)}」时买入：${row.trades} 笔，胜率 ${row.winRate}%，平均 ${row.avgReturnPct}%。`;
    if (emotional.has(row.emotion)) emotionalPatterns.push(line);
    else if (row.avgReturnPct > 0) working.push(line);
    else costing.push(line);
  }
  const worstEmotional = byEmotion.filter((row) => emotional.has(row.emotion)).sort((a, b) => a.avgReturnPct - b.avgReturnPct)[0];
  if (worstEmotional && worstEmotional.avgReturnPct < 0) rules.push(`感到「${emotionLabel(worstEmotional.emotion)}」时不下单。先等一小时，再重读一遍自己写的理由。`);

  for (const issue of packet.recurringProcessIssues.slice(0, 3)) {
    costing.push(`被标记 ${issue.count} 次：${issue.description}。`);
    if (issue.flag === "NO_STOP") rules.push("每次买入前必须先填好止损比例。");
    if (issue.flag === "CHASING") rules.push("当天已涨超过 7% 或距涨停不到 2% 时，不买。");
    if (issue.flag === "OVERSIZED") rules.push("单笔买入不超过总资产的 20%。");
    if (issue.flag === "HELD_LOSER") rules.push("触及计划止损后，一有机会就卖出。在模拟盘里不允许例外。");
  }

  const manual = packet.accounts.find((account) => account.kind === "manual");
  for (const position of manual?.positions ?? []) {
    if (position.weightPct > 30) openPositionNotes.push(`${position.name} 占账户 ${position.weightPct}%。`);
    if (position.pnlPct < -8) openPositionNotes.push(`${position.name} 目前 ${position.pnlPct}%，对照一下当初计划的止损。`);
  }

  if (rules.length === 0) rules.push("保持现在的做法并继续记录，再平仓 10 笔后重新检查。");

  return {
    headline: `已平仓 ${perf.count} 笔，胜率 ${perf.winRate}%，每笔平均收益 ${perf.avgReturnPct}%。`,
    answer: "",
    working,
    costing,
    emotionalPatterns,
    openPositionNotes,
    rules: [...new Set(rules)].slice(0, 5),
    uncertaintyNote:
      perf.count < MIN_ROUND_TRIPS
        ? `目前只有 ${perf.count} 笔已平仓交易，这么早看出的规律多半是噪音。这是规则化总结；在 API Settings 里配置 AI 提供方可以得到更深入的分析。`
        : "这是对你自己数据的规则化总结，描述的是过去，不预测股价。在 API Settings 里配置 AI 提供方可以得到更深入的分析。",
  };
}

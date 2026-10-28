// Rule-based review of a single trade. Works without an AI key; the AI review (if configured) builds on top of it.
import { classifyTradingRisk, getTradingSafetyNote } from "@/lib/safety/classify-risk";
import { emotionLabel } from "@/lib/trading/labels";
import type { ReviewVerdict, RoundTrip, Trade, TradeEmotion, TradeReview } from "@/lib/trading/types";

const emotionalStates: TradeEmotion[] = ["fomo", "greedy", "revenge", "bored"];

export const flagDescriptions: Record<string, string> = {
  NO_STOP: "没有预设止损",
  WEAK_REASON: "理由太简单，事后无法复盘",
  EMOTIONAL_ENTRY: "带着情绪买入",
  CHASING: "追涨当天的大涨",
  EXTENDED: "在远高于 20 日均线的位置买入",
  FALLING_KNIFE: "在 5 日急跌中接飞刀",
  OVERSIZED: "单笔仓位过重",
  LOW_CONFIDENCE_BIG: "信心低却下了重仓",
  OVERTRADING: "一天内交易过于频繁",
  HELD_LOSER: "亏损超过止损仍不卖",
  CUT_WINNER_EARLY: "因恐惧过早卖出盈利单",
  PANIC_SELL: "恐慌中在急跌时卖出",
  EMOTIONAL_EXIT: "带着情绪卖出",
  STOP_RESPECTED: "按计划止损",
  TARGET_HIT: "达到或超过止盈目标后卖出",
  PLAN_COMPLETE: "买入前设好了止损和止盈",
};

// Flags that mark good habits; every other flag is an issue.
export const positiveFlags = new Set(["STOP_RESPECTED", "TARGET_HIT", "PLAN_COMPLETE"]);

export type ReviewContext = {
  roundTrips: RoundTrip[]; // round trips closed by this trade (sells only)
  tradesToday: number;
};

function verdictFor(score: number): ReviewVerdict {
  if (score >= 70) return "disciplined";
  if (score >= 45) return "mixed";
  return "impulsive";
}

export function reviewTradeLocally(trade: Trade, context: ReviewContext): TradeReview {
  const journal = trade.journal;
  const features = trade.features;
  const strengths: string[] = [];
  const issues: string[] = [];
  const flags: string[] = [];

  const flag = (code: string, text: string, kind: "issue" | "strength") => {
    flags.push(code);
    (kind === "issue" ? issues : strengths).push(text);
  };

  if (!journal || journal.reason.trim().length < 8) {
    flag("WEAK_REASON", "理由写得太短。没有清楚的交易逻辑，事后很难从这笔交易里学到东西。", "issue");
  } else {
    strengths.push("写下了交易理由，这笔交易可以复盘。");
  }

  if (journal && emotionalStates.includes(journal.emotion)) {
    flag(trade.side === "buy" ? "EMOTIONAL_ENTRY" : "EMOTIONAL_EXIT", `你把这笔交易的情绪标为「${emotionLabel(journal.emotion)}」。这种状态下的交易，正是策略要过滤掉的。`, "issue");
  }

  if (context.tradesToday >= 6) {
    flag("OVERTRADING", `这是今天第 ${context.tradesToday} 笔交易。频繁交易往往是在对噪音做反应，手续费也会累积。`, "issue");
  }

  if (trade.side === "buy") {
    if (!journal?.plannedStopLossPct) {
      flag("NO_STOP", "没有预设止损。买入前就定好离场点，免得之后让恐惧或侥幸替你做决定。", "issue");
    } else if (journal.plannedTakeProfitPct) {
      const ratio = journal.plannedTakeProfitPct / journal.plannedStopLossPct;
      flag("PLAN_COMPLETE", `买入前设好了止损（-${journal.plannedStopLossPct}%）和止盈（+${journal.plannedTakeProfitPct}%），盈亏比约 ${ratio.toFixed(1)}。`, "strength");
      if (ratio < 1) issues.push("计划的止盈比止损还小，只有胜率一直很高才能赚钱。");
    }

    if (features) {
      if (features.changePctToday >= 7 || features.distToLimitUpPct <= 2) {
        flag("CHASING", `在当天已涨 ${features.changePctToday.toFixed(1)}%、距涨停只差 ${features.distToLimitUpPct.toFixed(1)}% 时买入。追涨一旦冲高回落，几乎没有缓冲空间。`, "issue");
      }
      if (features.ma20DistPct >= 15) {
        flag("EXTENDED", `买入时股价比 20 日均线高 ${features.ma20DistPct.toFixed(1)}%。`, "issue");
      }
      if (features.momentum5dPct <= -12) {
        flag("FALLING_KNIFE", `这只股票 5 天内跌了 ${Math.abs(features.momentum5dPct).toFixed(1)}%。确认这是计划好的反转买点，而不是觉得「便宜了」。`, "issue");
      }
      if (features.positionPctOfEquity > 30) {
        flag("OVERSIZED", `这笔买入占账户总资产的 ${features.positionPctOfEquity.toFixed(0)}%。一次判断失误就可能造成重大损失。`, "issue");
      } else if (features.positionPctOfEquity > 0 && features.positionPctOfEquity <= 20) {
        strengths.push(`仓位（占总资产 ${features.positionPctOfEquity.toFixed(0)}%）控制得当，单次失误不会伤筋动骨。`);
      }
      if (journal && journal.confidence <= 2 && features.positionPctOfEquity > 15) {
        flag("LOW_CONFIDENCE_BIG", "信心不足却下了重仓。仓位应该和把握程度相匹配。", "issue");
      }
    }
  } else {
    const trip = context.roundTrips[0];
    const pnlPct = context.roundTrips.length
      ? context.roundTrips.reduce((sum, item) => sum + item.returnPct * item.quantity, 0) / context.roundTrips.reduce((sum, item) => sum + item.quantity, 0)
      : undefined;
    const entryPlan = trip?.entryJournal;

    if (pnlPct !== undefined) {
      if (pnlPct < 0) {
        if (entryPlan?.plannedStopLossPct && Math.abs(pnlPct) <= entryPlan.plannedStopLossPct + 1.5) {
          flag("STOP_RESPECTED", `以 ${pnlPct.toFixed(1)}% 平仓，在计划止损 -${entryPlan.plannedStopLossPct}% 以内。按计划认亏是一种能力。`, "strength");
        } else if (entryPlan?.plannedStopLossPct && Math.abs(pnlPct) > entryPlan.plannedStopLossPct + 2) {
          flag("HELD_LOSER", `以 ${pnlPct.toFixed(1)}% 平仓，超过了计划止损 -${entryPlan.plannedStopLossPct}%。到了止损还扛着，是常见的情绪漏洞。`, "issue");
        } else if (!entryPlan?.plannedStopLossPct && pnlPct < -8) {
          flag("HELD_LOSER", `以 ${pnlPct.toFixed(1)}% 平仓，买入时没有设止损。`, "issue");
        }
      } else {
        if (entryPlan?.plannedTakeProfitPct && pnlPct >= entryPlan.plannedTakeProfitPct) {
          flag("TARGET_HIT", `以 +${pnlPct.toFixed(1)}% 平仓，达到或超过了计划止盈 +${entryPlan.plannedTakeProfitPct}%。`, "strength");
        } else if (entryPlan?.plannedTakeProfitPct && pnlPct < entryPlan.plannedTakeProfitPct * 0.5 && journal?.emotion === "fear") {
          flag("CUT_WINNER_EARLY", `在恐惧中以 +${pnlPct.toFixed(1)}% 平仓，离止盈目标 +${entryPlan.plannedTakeProfitPct}% 还差很远。`, "issue");
        }
      }
    }

    if (journal?.emotion === "fear" && features && features.changePctToday <= -5) {
      flag("PANIC_SELL", `在当天下跌 ${features.changePctToday.toFixed(1)}% 时恐慌卖出。回头看看最初的买入理由是否真的失效了。`, "issue");
    }
  }

  let score = 70 + strengths.length * 6 - issues.length * 14;
  if (journal && emotionalStates.includes(journal.emotion)) score = Math.min(score, 60);
  score = Math.max(0, Math.min(100, score));

  const safetyNote = getTradingSafetyNote(classifyTradingRisk(`${journal?.reason ?? ""} ${journal?.tags.join(" ") ?? ""}`)) ?? undefined;
  const verdict = verdictFor(score);
  const summary =
    verdict === "disciplined"
      ? "这笔交易基本按计划执行。不管结果如何，这样的过程值得重复并持续检验。"
      : verdict === "mixed"
        ? "这笔交易一部分有计划，一部分像是临时反应。重点留意下面列出的问题。"
        : "这笔交易有多处情绪化或无计划的迹象。无论结果好坏，都说明不了水平。";

  return {
    id: `review_${crypto.randomUUID()}`,
    userId: trade.userId,
    tradeId: trade.id,
    provider: "local",
    verdict,
    score,
    summary,
    strengths,
    issues,
    flags,
    suggestion: issues.length
      ? `下次点击${trade.side === "buy" ? "买入" : "卖出"}前，先写下：理由、止损、止盈、仓位占总资产的比例。缺任何一项，就放弃这笔交易。`
      : "继续这样记录。平仓满 20 笔以后，模拟器就能检验这类交易到底能不能帮你赚钱。",
    safetyNote,
    uncertaintyNote: "一笔交易的样本量非常小。这份复盘评价的是交易过程，不判断股票会涨还是会跌。",
    createdAt: new Date().toISOString(),
  };
}

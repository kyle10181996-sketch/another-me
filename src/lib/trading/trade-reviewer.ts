// Rule-based review of a single trade. Works without an AI key; the AI review (if configured) builds on top of it.
import { classifyTradingRisk, getTradingSafetyNote } from "@/lib/safety/classify-risk";
import type { ReviewVerdict, RoundTrip, Trade, TradeEmotion, TradeReview } from "@/lib/trading/types";

const emotionalStates: TradeEmotion[] = ["fomo", "greedy", "revenge", "bored"];

export const flagDescriptions: Record<string, string> = {
  NO_STOP: "No stop-loss planned",
  WEAK_REASON: "Reason too thin to review later",
  EMOTIONAL_ENTRY: "Entered in an emotional state",
  CHASING: "Chased a strong intraday move",
  EXTENDED: "Bought far above the 20-day average",
  FALLING_KNIFE: "Bought into a sharp 5-day drop",
  OVERSIZED: "Position too large for one idea",
  LOW_CONFIDENCE_BIG: "Large size despite low confidence",
  OVERTRADING: "Many trades in one day",
  HELD_LOSER: "Held a loser past the planned stop",
  CUT_WINNER_EARLY: "Cut a winner early out of fear",
  PANIC_SELL: "Sold into a sharp drop while fearful",
  EMOTIONAL_EXIT: "Exited in an emotional state",
  STOP_RESPECTED: "Respected the planned stop",
  TARGET_HIT: "Exited at or beyond the planned target",
  PLAN_COMPLETE: "Entered with stop and target defined",
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

  if (!journal || journal.reason.trim().length < 12) {
    flag("WEAK_REASON", "The reason is very short. Without a clear thesis it is hard to learn from this trade later.", "issue");
  } else {
    strengths.push("You wrote down a reason, which makes this trade reviewable.");
  }

  if (journal && emotionalStates.includes(journal.emotion)) {
    flag(trade.side === "buy" ? "EMOTIONAL_ENTRY" : "EMOTIONAL_EXIT", `You tagged this trade as "${journal.emotion}". Trades made in this state are the ones the strategy is meant to filter out.`, "issue");
  }

  if (context.tradesToday >= 6) {
    flag("OVERTRADING", `This is trade #${context.tradesToday} today. High frequency often means reacting to noise; fees also add up.`, "issue");
  }

  if (trade.side === "buy") {
    if (!journal?.plannedStopLossPct) {
      flag("NO_STOP", "No stop-loss was planned. Decide the exit before entry so fear or hope does not decide it later.", "issue");
    } else if (journal.plannedTakeProfitPct) {
      const ratio = journal.plannedTakeProfitPct / journal.plannedStopLossPct;
      flag("PLAN_COMPLETE", `Stop (-${journal.plannedStopLossPct}%) and target (+${journal.plannedTakeProfitPct}%) were set before entry, reward/risk ≈ ${ratio.toFixed(1)}.`, "strength");
      if (ratio < 1) issues.push("The planned target is smaller than the planned stop, so the win rate must stay high for this to pay off.");
    }

    if (features) {
      if (features.changePctToday >= 7 || features.distToLimitUpPct <= 2) {
        flag("CHASING", `Bought after a ${features.changePctToday.toFixed(1)}% move today, ${features.distToLimitUpPct.toFixed(1)}% below limit-up. Chasing strength leaves little room if the move fades.`, "issue");
      }
      if (features.ma20DistPct >= 15) {
        flag("EXTENDED", `Price was ${features.ma20DistPct.toFixed(1)}% above its 20-day average when you bought.`, "issue");
      }
      if (features.momentum5dPct <= -12) {
        flag("FALLING_KNIFE", `The stock had fallen ${Math.abs(features.momentum5dPct).toFixed(1)}% over 5 days. Make sure this was a planned reversal entry, not bargain hunting.`, "issue");
      }
      if (features.positionPctOfEquity > 30) {
        flag("OVERSIZED", `This buy is ${features.positionPctOfEquity.toFixed(0)}% of account equity. One wrong idea can do serious damage.`, "issue");
      } else if (features.positionPctOfEquity > 0 && features.positionPctOfEquity <= 20) {
        strengths.push(`Position size (${features.positionPctOfEquity.toFixed(0)}% of equity) keeps any single mistake survivable.`);
      }
      if (journal && journal.confidence <= 2 && features.positionPctOfEquity > 15) {
        flag("LOW_CONFIDENCE_BIG", "Confidence was low but the size was large. Size should follow conviction.", "issue");
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
          flag("STOP_RESPECTED", `Closed at ${pnlPct.toFixed(1)}%, within the planned stop of -${entryPlan.plannedStopLossPct}%. Taking a planned loss is a skill.`, "strength");
        } else if (entryPlan?.plannedStopLossPct && Math.abs(pnlPct) > entryPlan.plannedStopLossPct + 2) {
          flag("HELD_LOSER", `Closed at ${pnlPct.toFixed(1)}%, beyond the planned stop of -${entryPlan.plannedStopLossPct}%. Holding past the stop is a common emotional leak.`, "issue");
        } else if (!entryPlan?.plannedStopLossPct && pnlPct < -8) {
          flag("HELD_LOSER", `Closed at ${pnlPct.toFixed(1)}% with no stop planned at entry.`, "issue");
        }
      } else {
        if (entryPlan?.plannedTakeProfitPct && pnlPct >= entryPlan.plannedTakeProfitPct) {
          flag("TARGET_HIT", `Closed at +${pnlPct.toFixed(1)}%, at or beyond the planned target of +${entryPlan.plannedTakeProfitPct}%.`, "strength");
        } else if (entryPlan?.plannedTakeProfitPct && pnlPct < entryPlan.plannedTakeProfitPct * 0.5 && journal?.emotion === "fear") {
          flag("CUT_WINNER_EARLY", `Closed at +${pnlPct.toFixed(1)}%, well short of the +${entryPlan.plannedTakeProfitPct}% target, while feeling fear.`, "issue");
        }
      }
    }

    if (journal?.emotion === "fear" && features && features.changePctToday <= -5) {
      flag("PANIC_SELL", `Sold while fearful on a ${features.changePctToday.toFixed(1)}% down day. Check whether the original reason was actually broken.`, "issue");
    }
  }

  let score = 70 + strengths.length * 6 - issues.length * 14;
  if (journal && emotionalStates.includes(journal.emotion)) score = Math.min(score, 60);
  score = Math.max(0, Math.min(100, score));

  const safetyNote = getTradingSafetyNote(classifyTradingRisk(`${journal?.reason ?? ""} ${journal?.tags.join(" ") ?? ""}`)) ?? undefined;
  const verdict = verdictFor(score);
  const summary =
    verdict === "disciplined"
      ? "This trade mostly followed a plan. Whatever the result, the process is the kind worth repeating and measuring."
      : verdict === "mixed"
        ? "Parts of this trade were planned and parts look reactive. The issues below are the ones to watch for."
        : "This trade shows several signs of emotional or unplanned decision-making. Its outcome, good or bad, says little about skill.";

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
      ? `Next time, before you click ${trade.side}, write down: the reason, the stop, the target, and the size as % of equity. If one is missing, skip the trade.`
      : "Keep logging trades this way. After 20+ closed trades the simulator can test whether this kind of trade actually makes money for you.",
    safetyNote,
    uncertaintyNote: "One trade is a very small sample. This review judges the process, not whether the stock will rise or fall.",
    createdAt: new Date().toISOString(),
  };
}

// Rule-based portfolio analysis used when no AI provider is configured. Derived only from the analysis packet.
import { MIN_ROUND_TRIPS } from "@/lib/trading/distiller";
import type { AnalysisPacket } from "@/lib/trading/analysis-packet";
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
      headline: "No closed trades yet, so there is nothing to measure.",
      answer: "",
      working: [],
      costing: [],
      emotionalPatterns: [],
      openPositionNotes: [],
      rules: ["Journal every order with a reason, an emotion, a stop and a target.", `Close at least ${MIN_ROUND_TRIPS} trades before judging any pattern.`],
      uncertaintyNote: "Analysis starts once trades are closed.",
    };
  }

  if (perf.avgWinPct > 0 && perf.avgLossPct < 0) {
    const ratio = perf.avgWinPct / Math.abs(perf.avgLossPct);
    (ratio >= 1.5 ? working : costing).push(
      `Average win ${perf.avgWinPct}% vs. average loss ${perf.avgLossPct}% (ratio ${ratio.toFixed(2)}). ${ratio >= 1.5 ? "Winners are clearly larger than losers." : "Losers are about as big as winners, so the win rate has to carry everything."}`,
    );
  }

  const byEmotion = packet.resultsByEntryEmotion.filter((row) => row.trades >= 2);
  for (const row of byEmotion) {
    const line = `Entries tagged "${row.emotion}": ${row.trades} trades, win rate ${row.winRate}%, avg ${row.avgReturnPct}%.`;
    if (emotional.has(row.emotion)) emotionalPatterns.push(line);
    else if (row.avgReturnPct > 0) working.push(line);
    else costing.push(line);
  }
  const worstEmotional = byEmotion.filter((row) => emotional.has(row.emotion)).sort((a, b) => a.avgReturnPct - b.avgReturnPct)[0];
  if (worstEmotional && worstEmotional.avgReturnPct < 0) rules.push(`Do not place an order while feeling "${worstEmotional.emotion}". Wait one hour and re-read your reason.`);

  for (const issue of packet.recurringProcessIssues.slice(0, 3)) {
    costing.push(`Flagged ${issue.count}×: ${issue.description}.`);
    if (issue.flag === "NO_STOP") rules.push("Every buy needs a stop % written before you click Buy.");
    if (issue.flag === "CHASING") rules.push("No buys when the stock is already up more than 7% that day or within 2% of limit-up.");
    if (issue.flag === "OVERSIZED") rules.push("Cap any single buy at 20% of equity.");
    if (issue.flag === "HELD_LOSER") rules.push("When the planned stop is hit, sell at the next chance. No exceptions in the simulator.");
  }

  const manual = packet.accounts.find((account) => account.kind === "manual");
  for (const position of manual?.positions ?? []) {
    if (position.weightPct > 30) openPositionNotes.push(`${position.name} is ${position.weightPct}% of the account.`);
    if (position.pnlPct < -8) openPositionNotes.push(`${position.name} is at ${position.pnlPct}%. Check it against the stop you planned.`);
  }

  if (rules.length === 0) rules.push("Keep the current process and keep logging; re-check after the next 10 closed trades.");

  return {
    headline: `${perf.count} closed trades, ${perf.winRate}% win rate, ${perf.avgReturnPct}% average return per trade.`,
    answer: "",
    working,
    costing,
    emotionalPatterns,
    openPositionNotes,
    rules: [...new Set(rules)].slice(0, 5),
    uncertaintyNote:
      perf.count < MIN_ROUND_TRIPS
        ? `Only ${perf.count} closed trades. Patterns this early are mostly noise. Rule-based summary; set an AI provider in API Settings for deeper analysis.`
        : "Rule-based summary of your own data; it describes the past and does not predict prices. Set an AI provider in API Settings for deeper analysis.",
  };
}

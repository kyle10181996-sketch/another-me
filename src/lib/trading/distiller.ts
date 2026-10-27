// Distills the user's own trading behavior into an explicit, rule-based strategy.
// Approach: look at the market context of every closed trade, find simple threshold rules that separate the
// user's winners from losers, and keep only rules with enough supporting trades. Emotion is deliberately NOT an
// input to the strategy: the point is to keep the pattern and drop the emotional trades.
import { computeStats } from "@/lib/trading/analytics";
import { marketFeatureKeys, marketFeatureLabels } from "@/lib/trading/features";
import type { DistilledStrategy, MarketFeatureKey, RoundTrip, StrategyCondition, TradeEmotion, TradeFeatures } from "@/lib/trading/types";

export const MIN_ROUND_TRIPS = 20;
const MAX_CONDITIONS = 3;
const emotionalStates: TradeEmotion[] = ["fomo", "greedy", "revenge", "bored"];

export type DistillResult =
  | { ready: false; reason: string; closedTrades: number; required: number }
  | { ready: true; strategy: DistilledStrategy };

// One sample per entry trade, even when it was sold in several pieces.
export function aggregateByEntry(roundTrips: RoundTrip[]) {
  const groups = new Map<string, RoundTrip[]>();
  for (const trip of roundTrips) groups.set(trip.entryTradeId, [...(groups.get(trip.entryTradeId) ?? []), trip]);

  return [...groups.values()].map((trips) => {
    const quantity = trips.reduce((sum, trip) => sum + trip.quantity, 0);
    const first = trips[0];
    return {
      ...first,
      quantity,
      pnl: trips.reduce((sum, trip) => sum + trip.pnl, 0),
      returnPct: trips.reduce((sum, trip) => sum + trip.returnPct * trip.quantity, 0) / quantity,
      holdDays: Math.max(...trips.map((trip) => trip.holdDays)),
      exitDate: trips.reduce((latest, trip) => (trip.exitDate > latest ? trip.exitDate : latest), first.exitDate),
    };
  });
}

export function matchesConditions(features: TradeFeatures | Omit<TradeFeatures, "positionPctOfEquity">, conditions: StrategyCondition[]) {
  return conditions.every((condition) => {
    const value = features[condition.feature];
    return condition.op === "gte" ? value >= condition.value : value <= condition.value;
  });
}

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)));
  return sorted[index];
}

function median(values: number[]) {
  return quantile([...values].sort((a, b) => a - b), 0.5);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

type Sample = ReturnType<typeof aggregateByEntry>[number] & { entryFeatures: TradeFeatures };

function describe(feature: MarketFeatureKey, op: "gte" | "lte", value: number) {
  return `${marketFeatureLabels[feature]} ${op === "gte" ? "≥" : "≤"} ${value}`;
}

export function distillStrategy(
  roundTrips: RoundTrip[],
  options: { userId: string; universe: string[]; version: number; now?: Date },
): DistillResult {
  const samples = aggregateByEntry(roundTrips).filter((trip): trip is Sample => Boolean(trip.entryFeatures));

  if (samples.length < MIN_ROUND_TRIPS) {
    return {
      ready: false,
      reason: `Need at least ${MIN_ROUND_TRIPS} closed trades with recorded market context before a pattern can be distilled. You have ${samples.length}. Fewer trades than this would mostly capture luck.`,
      closedTrades: samples.length,
      required: MIN_ROUND_TRIPS,
    };
  }

  const sourceStats = computeStats(samples);
  const minSupport = Math.max(6, Math.ceil(samples.length * 0.25));
  const conditions: StrategyCondition[] = [];
  let current = samples;
  let currentAvg = sourceStats.avgReturnPct;

  for (let step = 0; step < MAX_CONDITIONS; step += 1) {
    let best: { condition: StrategyCondition; subset: Sample[]; score: number } | null = null;

    for (const feature of marketFeatureKeys) {
      if (conditions.some((condition) => condition.feature === feature)) continue;
      const values = current.map((sample) => sample.entryFeatures[feature]).sort((a, b) => a - b);

      for (const q of [0.33, 0.67]) {
        const threshold = round(quantile(values, q));
        for (const op of ["gte", "lte"] as const) {
          const subset = current.filter((sample) => (op === "gte" ? sample.entryFeatures[feature] >= threshold : sample.entryFeatures[feature] <= threshold));
          if (subset.length < minSupport || subset.length === current.length) continue;
          const stats = computeStats(subset);
          if (stats.avgReturnPct <= currentAvg + 0.3 || stats.avgReturnPct <= 0) continue;
          const score = stats.avgReturnPct * Math.sqrt(subset.length);
          if (!best || score > best.score) {
            best = {
              subset,
              score,
              condition: {
                feature,
                op,
                value: threshold,
                label: describe(feature, op, threshold),
                sample: subset.length,
                winRate: stats.winRate,
                avgReturnPct: stats.avgReturnPct,
              },
            };
          }
        }
      }
    }

    if (!best) break;
    conditions.push(best.condition);
    current = best.subset;
    currentAvg = best.condition.avgReturnPct;
  }

  const matchedStats = computeStats(current);

  if (conditions.length === 0) {
    return {
      ready: false,
      reason:
        sourceStats.avgReturnPct > 0
          ? "Your trades are profitable overall, but no consistent market pattern separates your winners from your losers yet. Keep trading and journaling; the pattern may simply need more samples."
          : "No group of your trades with a shared market pattern is profitable yet, so there is nothing reliable to distill. Use the trade reviews to fix process issues first.",
      closedTrades: samples.length,
      required: MIN_ROUND_TRIPS,
    };
  }

  if (matchedStats.avgReturnPct <= 0 || matchedStats.profitFactor <= 1) {
    return {
      ready: false,
      reason: "The best pattern found is not clearly profitable after fees. Nothing worth automating yet.",
      closedTrades: samples.length,
      required: MIN_ROUND_TRIPS,
    };
  }

  const winners = current.filter((sample) => sample.pnl > 0);
  const losers = current.filter((sample) => sample.pnl <= 0);
  const stopLossPct = round(clamp(losers.length ? Math.abs(median(losers.map((sample) => sample.returnPct))) : 5, 2, 10), 1);
  const takeProfitPct = round(clamp(winners.length ? median(winners.map((sample) => sample.returnPct)) : 8, 3, 25), 1);
  const holdDays = winners.map((sample) => sample.holdDays).sort((a, b) => a - b);
  const maxHoldDays = Math.round(clamp(holdDays.length ? quantile(holdDays, 0.75) : 10, 2, 30));
  const positionPct = round(clamp(median(current.map((sample) => sample.entryFeatures.positionPctOfEquity)) || 10, 5, 20), 1);
  const maxPositions = Math.max(1, Math.min(5, Math.floor(90 / positionPct)));

  const emotional = samples.filter((sample) => sample.entryJournal && emotionalStates.includes(sample.entryJournal.emotion));
  const emotionalStats = computeStats(emotional);
  const notes = [
    `Built from ${samples.length} of your closed trades. ${current.length} of them match these rules; those had a ${matchedStats.winRate}% win rate and ${matchedStats.avgReturnPct}% average return, vs. ${sourceStats.winRate}% and ${sourceStats.avgReturnPct}% for all your trades.`,
    emotional.length
      ? `${emotional.length} of your trades were tagged fomo/greedy/revenge/bored: ${emotionalStats.winRate}% win rate, ${emotionalStats.avgReturnPct}% average return. The strategy ignores mood entirely and only follows the market conditions and exits above.`
      : "None of your trades were tagged with an emotional state, so the emotion filter could not be measured.",
    `Exits come from your own history: stop at -${stopLossPct}% (typical loss), target at +${takeProfitPct}% (typical win), and close after ${maxHoldDays} days.`,
  ];

  const now = (options.now ?? new Date()).toISOString();

  return {
    ready: true,
    strategy: {
      id: `strat_${crypto.randomUUID()}`,
      userId: options.userId,
      name: `My Pattern v${options.version}`,
      version: options.version,
      status: "draft",
      basedOnRoundTrips: samples.length,
      entryConditions: conditions,
      exit: { stopLossPct, takeProfitPct, maxHoldDays },
      sizing: { positionPct, maxPositions },
      universe: options.universe,
      sourceStats,
      matchedStats,
      notes,
      uncertaintyNote:
        "These rules were fitted to the same trades they are measured on, so the in-sample numbers are optimistic. Markets change regime, and a pattern from a few dozen trades can be coincidence. Treat the strategy as a hypothesis to keep testing in the simulator, not as a reliable way to make money.",
      createdAt: now,
      updatedAt: now,
    },
  };
}

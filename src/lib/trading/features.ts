// Market-context features captured at trade time. The same function is used for live trades and for backtests,
// so a distilled strategy sees exactly the same inputs the user saw.
import type { Bar, MarketFeatureKey, Quote, TradeFeatures } from "@/lib/trading/types";

export type DaySnapshot = {
  open: number;
  price: number;
  high: number;
  low: number;
  volume: number;
  prevClose: number;
  limitUp: number;
};

export const marketFeatureLabels: Record<MarketFeatureKey, string> = {
  changePctToday: "Change today (%)",
  gapPct: "Opening gap (%)",
  ma5DistPct: "Distance from 5-day MA (%)",
  ma20DistPct: "Distance from 20-day MA (%)",
  momentum5dPct: "5-day momentum (%)",
  momentum20dPct: "20-day momentum (%)",
  volumeRatio5d: "Volume vs. 5-day average (x)",
  distToLimitUpPct: "Room to limit-up (%)",
  rangePosition20d: "Position in 20-day range (0-1)",
};

export const marketFeatureKeys = Object.keys(marketFeatureLabels) as MarketFeatureKey[];

function pct(value: number, base: number) {
  if (!base) return 0;
  return round(((value - base) / base) * 100);
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

// `history` must contain only completed days before the snapshot day, oldest first.
export function computeFeatures(history: Bar[], today: DaySnapshot, positionPctOfEquity = 0): TradeFeatures {
  const closes = [...history.map((bar) => bar.close), today.price];
  const last = (n: number) => closes.slice(-n);
  const ma5 = average(last(5));
  const ma20 = average(last(20));
  const close5 = closes.length > 5 ? closes[closes.length - 6] : closes[0];
  const close20 = closes.length > 20 ? closes[closes.length - 21] : closes[0];
  const avgVolume5 = average(history.slice(-5).map((bar) => bar.volume));
  const window = [...history.slice(-19), { high: today.high || today.price, low: today.low || today.price }];
  const high20 = Math.max(...window.map((bar) => bar.high));
  const low20 = Math.min(...window.map((bar) => bar.low));

  return {
    changePctToday: pct(today.price, today.prevClose),
    gapPct: pct(today.open || today.price, today.prevClose),
    ma5DistPct: pct(today.price, ma5),
    ma20DistPct: pct(today.price, ma20),
    momentum5dPct: pct(today.price, close5),
    momentum20dPct: pct(today.price, close20),
    volumeRatio5d: avgVolume5 ? round(today.volume / avgVolume5) : 1,
    distToLimitUpPct: today.limitUp ? round(((today.limitUp - today.price) / today.price) * 100) : 0,
    rangePosition20d: high20 > low20 ? round((today.price - low20) / (high20 - low20)) : 0.5,
    positionPctOfEquity: round(positionPctOfEquity),
  };
}

export function snapshotFromQuote(quote: Quote): DaySnapshot {
  return {
    open: quote.open,
    price: quote.price,
    high: quote.high,
    low: quote.low,
    volume: quote.volume,
    prevClose: quote.prevClose,
    limitUp: quote.limitUp,
  };
}

// Drops the bar for the quote's own day (live K-lines include today's partial bar).
export function historyBefore(bars: Bar[], tradeDate: string) {
  return bars.filter((bar) => bar.date < tradeDate);
}

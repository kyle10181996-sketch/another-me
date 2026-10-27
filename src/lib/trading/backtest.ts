// Daily-bar backtest of a distilled strategy, honoring T+1, price limits and fees.
// Signal on day d's close, enter at day d+1's open, exit from day d+2 onward (T+1).
import { computeStats } from "@/lib/trading/analytics";
import { matchesConditions } from "@/lib/trading/distiller";
import { computeFeatures } from "@/lib/trading/features";
import { boardOf, calculateFees, daysBetween, limitPrices } from "@/lib/trading/rules";
import type { BacktestResult, BacktestTrade, Bar, DistilledStrategy } from "@/lib/trading/types";

const WARMUP_BARS = 20;

export function backtestStrategy(strategy: DistilledStrategy, barsBySymbol: Record<string, Bar[]>, capital = 1_000_000): BacktestResult {
  const allocation = capital * (strategy.sizing.positionPct / 100);
  const trades: BacktestTrade[] = [];
  const warnings: string[] = [];
  let from = "";
  let to = "";

  for (const [symbol, bars] of Object.entries(barsBySymbol)) {
    if (bars.length < WARMUP_BARS + 3) {
      warnings.push(`${symbol}: not enough history, skipped.`);
      continue;
    }
    if (!from || bars[WARMUP_BARS].date < from) from = bars[WARMUP_BARS].date;
    if (!to || bars[bars.length - 1].date > to) to = bars[bars.length - 1].date;

    const board = boardOf(symbol);
    let i = WARMUP_BARS;

    while (i < bars.length - 2) {
      const day = bars[i];
      const prev = bars[i - 1];
      const features = computeFeatures(bars.slice(0, i), {
        open: day.open,
        price: day.close,
        high: day.high,
        low: day.low,
        volume: day.volume,
        prevClose: prev.close,
        limitUp: limitPrices(prev.close, board, false).limitUp,
      });

      if (!matchesConditions(features, strategy.entryConditions)) {
        i += 1;
        continue;
      }

      const entryBar = bars[i + 1];
      const entryLimits = limitPrices(day.close, board, false);
      if (entryBar.open >= entryLimits.limitUp && entryBar.low >= entryLimits.limitUp) {
        i += 1; // opened sealed at limit-up: no fill
        continue;
      }

      const shares = allocation / entryBar.open;
      const entryCost = (entryBar.open * shares + calculateFees("buy", entryBar.open * shares).total) / shares;
      const stop = entryCost * (1 - strategy.exit.stopLossPct / 100);
      const target = entryCost * (1 + strategy.exit.takeProfitPct / 100);

      let exitIndex = bars.length - 1;
      let exitPrice = bars[exitIndex].close;
      let exitReason: BacktestTrade["exitReason"] = "end";

      for (let j = i + 2; j < bars.length; j += 1) {
        const bar = bars[j];
        const limits = limitPrices(bars[j - 1].close, board, false);
        const sealedDown = bar.high <= limits.limitDown;
        if (sealedDown) continue; // cannot sell into a sealed limit-down

        if (bar.low <= stop) {
          exitIndex = j;
          exitPrice = Math.min(bar.open, stop);
          exitReason = "stop";
          break;
        }
        if (bar.high >= target) {
          exitIndex = j;
          exitPrice = Math.max(bar.open, target);
          exitReason = "target";
          break;
        }
        if (daysBetween(entryBar.date, bar.date) >= strategy.exit.maxHoldDays) {
          exitIndex = j;
          exitPrice = bar.close;
          exitReason = "time";
          break;
        }
      }

      const exitNet = (exitPrice * shares - calculateFees("sell", exitPrice * shares).total) / shares;
      trades.push({
        symbol,
        entryDate: entryBar.date,
        exitDate: bars[exitIndex].date,
        entryPrice: Math.round(entryCost * 100) / 100,
        exitPrice: Math.round(exitNet * 100) / 100,
        returnPct: Math.round(((exitNet - entryCost) / entryCost) * 10_000) / 100,
        exitReason,
      });
      i = exitIndex + 1;
    }
  }

  trades.sort((a, b) => a.exitDate.localeCompare(b.exitDate));
  const stats = computeStats(
    trades.map((trade) => ({
      returnPct: trade.returnPct,
      pnl: (trade.returnPct / 100) * allocation,
      holdDays: daysBetween(trade.entryDate, trade.exitDate),
    })),
    capital,
  );

  if (trades.length < 30) warnings.push(`Only ${trades.length} backtest trades. That is too few to tell skill from luck.`);
  warnings.push("Backtest uses daily bars and forward-adjusted prices; intraday fills and gaps can differ.");
  warnings.push("Each stock is tested independently; the max-positions limit and cash competition between stocks are ignored.");
  warnings.push("The period overlaps the trades the rules were learned from, so results are partly in-sample.");

  return {
    from,
    to,
    symbols: Object.keys(barsBySymbol),
    stats,
    trades: trades.slice(-200),
    warnings,
    generatedAt: new Date().toISOString(),
  };
}

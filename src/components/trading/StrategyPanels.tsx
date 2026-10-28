"use client";

import { Bot, FlaskConical, Pause, Play, RotateCcw } from "lucide-react";
import { useState } from "react";
import { buildRoundTrips, computeStats, groupStats } from "@/lib/trading/analytics";
import { aggregateByEntry, MIN_ROUND_TRIPS, type DistillResult } from "@/lib/trading/distiller";
import type { AccountView } from "@/lib/trading/engine";
import { flagDescriptions, positiveFlags } from "@/lib/trading/trade-reviewer";
import type { DistilledStrategy, PerformanceStats, StrategyLogEntry, Trade, TradingState } from "@/lib/trading/types";
import { api, Button, Card, Empty, money, Notice, signClass, signed, Stat } from "@/components/trading/ui";

function StatsGrid({ stats }: { stats: PerformanceStats }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label="Closed trades" value={stats.count} />
      <Stat label="Win rate" value={`${stats.winRate}%`} />
      <Stat label="Avg return" value={signed(stats.avgReturnPct)} tone={signClass(stats.avgReturnPct)} />
      <Stat label="Profit factor" value={stats.profitFactor} />
      <Stat label="Avg win / loss" value={`${signed(stats.avgWinPct)} / ${signed(stats.avgLossPct)}`} />
      <Stat label="Realized P&L" value={money(stats.totalPnl, 0)} tone={signClass(stats.totalPnl)} />
      <Stat label="Avg hold" value={`${stats.avgHoldDays} d`} />
      <Stat label="Max drawdown" value={`${stats.maxDrawdownPct}%`} />
    </div>
  );
}

export function InsightsPanel({ state, manual, strategy }: { state: TradingState; manual: AccountView; strategy: AccountView }) {
  const trips = aggregateByEntry(buildRoundTrips(state.trades, "acct_manual"));
  const stats = computeStats(trips);
  const byEmotion = groupStats(trips, (trip) => trip.entryJournal?.emotion);
  const manualReviews = state.reviews.filter((review) => review.provider === "local" && state.trades.some((trade) => trade.id === review.tradeId && trade.accountId === "acct_manual"));
  const avgScore = manualReviews.length ? Math.round(manualReviews.reduce((sum, review) => sum + review.score, 0) / manualReviews.length) : 0;
  const flagCounts = new Map<string, number>();
  for (const review of manualReviews) for (const flag of review.flags) flagCounts.set(flag, (flagCounts.get(flag) ?? 0) + 1);
  const topFlags = [...flagCounts.entries()].filter(([flag]) => !positiveFlags.has(flag)).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const progress = Math.min(100, Math.round((trips.length / MIN_ROUND_TRIPS) * 100));

  return (
    <div className="grid gap-4">
      <Card title="My closed trades">
        <StatsGrid stats={stats} />
        <div className="mt-3">
          <p className="text-xs text-[var(--muted)]">Progress to strategy distillation: {trips.length}/{MIN_ROUND_TRIPS} closed trades</p>
          <div className="mt-1 h-2 overflow-hidden rounded bg-[var(--panel-strong)]">
            <div className="h-full bg-[var(--accent)]" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </Card>

      <Card title="Me vs. my strategy">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="My account return" value={signed(manual.totalReturnPct)} tone={signClass(manual.totalReturnPct)} />
          <Stat label="Strategy account return" value={signed(strategy.totalReturnPct)} tone={signClass(strategy.totalReturnPct)} />
        </div>
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Both accounts start with the same virtual cash. The comparison only means something once both have traded over the same period.</p>
      </Card>

      <Card title="Results by emotion at entry">
        {byEmotion.length === 0 ? (
          <Empty>Close a few trades to see how your mood at entry relates to results.</Empty>
        ) : (
          <div className="grid gap-2">
            {byEmotion.map(({ key, stats: group }) => (
              <div key={key} className="grid grid-cols-[6rem_1fr_auto] items-center gap-2 rounded-md bg-[var(--panel)] px-3 py-2 text-sm">
                <span className="font-semibold capitalize">{key}</span>
                <span className="text-xs text-[var(--muted)]">{group.count} trades · win {group.winRate}%</span>
                <span className={`tabular-nums ${signClass(group.avgReturnPct)}`}>{signed(group.avgReturnPct)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title={`Recurring process issues${manualReviews.length ? ` · avg process score ${avgScore}` : ""}`}>
        {topFlags.length === 0 ? (
          <Empty>No reviewed trades yet.</Empty>
        ) : (
          <div className="grid gap-2">
            {topFlags.map(([flag, count]) => (
              <div key={flag} className="flex items-center justify-between rounded-md bg-[var(--panel)] px-3 py-2 text-sm">
                <span>{flagDescriptions[flag] ?? flag}</span>
                <span className="tabular-nums text-[var(--muted)]">×{count}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export function StrategyPanel({
  state,
  onState,
  autoRun,
  onAutoRun,
}: {
  state: TradingState;
  onState: (state: TradingState) => void;
  autoRun: boolean;
  onAutoRun: (value: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "warn" | "error"; text: string } | null>(null);
  const closed = aggregateByEntry(buildRoundTrips(state.trades, "acct_manual")).length;
  const active = state.strategies.find((strategy) => strategy.status === "active");

  async function call(body: object, onDone?: (result: Record<string, unknown>) => void) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api<{ state: TradingState } & Record<string, unknown>>("/api/trading/strategy", { method: "POST", body: JSON.stringify(body) });
      onState(result.state);
      onDone?.(result);
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Card title="Distill my pattern">
        <p className="text-sm leading-6 text-[var(--muted)]">
          Looks at the market conditions around each of your closed trades, finds the conditions your winners had in common, and turns them into fixed entry/exit rules. Mood is not an input, so the strategy cannot trade on FOMO or fear. It then backtests the rules on about a year of daily data.
        </p>
        <Button
          className="mt-3"
          disabled={busy}
          onClick={() =>
            void call({ action: "distill" }, (result) => {
              const distill = result.result as DistillResult;
              setMessage(distill.ready ? { tone: "info", text: `Created ${distill.strategy.name}. Review the backtest before activating it.` } : { tone: "warn", text: distill.reason });
            })
          }
        >
          <FlaskConical size={16} /> {busy ? "Working…" : `Distill from ${closed} closed trades`}
        </Button>
        {closed < MIN_ROUND_TRIPS && <p className="mt-2 text-xs text-[var(--muted)]">Needs at least {MIN_ROUND_TRIPS} closed trades.</p>}
      </Card>

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      {active && (
        <Card title={`Running: ${active.name}`}>
          <p className="text-sm leading-6 text-[var(--muted)]">
            The strategy trades only the separate Strategy Account. Each run checks exits for its holdings, then looks for entry signals in its stock list.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void call({ action: "run" })}>
              <Play size={16} /> Run one cycle now
            </Button>
            <Button variant={autoRun ? "primary" : "ghost"} onClick={() => onAutoRun(!autoRun)}>
              {autoRun ? <Pause size={16} /> : <Bot size={16} />} {autoRun ? "Auto-run on" : "Auto-run every 5 min"}
            </Button>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Auto-run works while this page stays open, during trading hours only.</p>
          <StrategyLog entries={state.strategyLog.filter((entry) => entry.strategyId === active.id).slice(0, 15)} />
        </Card>
      )}

      {state.strategies.length === 0 ? (
        <Empty>No strategies yet.</Empty>
      ) : (
        state.strategies.map((strategy) => (
          <StrategyCard
            key={strategy.id}
            strategy={strategy}
            trades={state.trades.filter((trade) => trade.strategyId === strategy.id)}
            busy={busy}
            onActivate={() => void call({ action: "activate", strategyId: strategy.id })}
            onRetire={() => void call({ action: "retire", strategyId: strategy.id })}
          />
        ))
      )}
    </div>
  );
}

function StrategyLog({ entries }: { entries: StrategyLogEntry[] }) {
  if (!entries.length) return null;
  return (
    <ul className="mt-3 grid gap-1 text-xs leading-5">
      {entries.map((entry) => (
        <li key={entry.id} className="rounded bg-[var(--panel)] px-2 py-1">
          <span className="text-[var(--muted)]">{new Date(entry.at).toLocaleString("en-GB", { timeZone: "Asia/Shanghai", hour12: false })} </span>
          {entry.message}
        </li>
      ))}
    </ul>
  );
}

function StrategyCard({ strategy, trades, busy, onActivate, onRetire }: { strategy: DistilledStrategy; trades: Trade[]; busy: boolean; onActivate: () => void; onRetire: () => void }) {
  const statusStyle = { draft: "bg-[var(--panel-strong)] text-[var(--muted)]", active: "bg-[#e3f3ec] text-[#13804a]", retired: "bg-[var(--panel-strong)] text-[var(--muted)]" }[strategy.status];
  const realized = trades.reduce((sum, trade) => sum + (trade.realizedPnl ?? 0), 0);

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          {strategy.name}
          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${statusStyle}`}>{strategy.status}</span>
        </span>
      }
      action={
        strategy.status === "active" ? (
          <Button variant="ghost" disabled={busy} onClick={onRetire}><RotateCcw size={15} /> Retire</Button>
        ) : (
          <Button variant="ghost" disabled={busy} onClick={onActivate}><Play size={15} /> Activate</Button>
        )
      }
    >
      <p className="text-sm font-semibold">Entry: all of these</p>
      <ul className="mt-1 grid gap-1 text-sm">
        {strategy.entryConditions.map((condition) => (
          <li key={condition.label} className="rounded bg-[var(--panel)] px-2 py-1">
            {condition.label} <span className="text-xs text-[var(--muted)]">({condition.sample} of your trades, win {condition.winRate}%, avg {signed(condition.avgReturnPct)})</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm">
        <strong>Exit:</strong> stop −{strategy.exit.stopLossPct}% · target +{strategy.exit.takeProfitPct}% · max {strategy.exit.maxHoldDays} days
        <br />
        <strong>Size:</strong> {strategy.sizing.positionPct}% of equity per stock, up to {strategy.sizing.maxPositions} stocks · {strategy.universe.length} stocks in its list
      </p>

      <p className="mt-3 text-sm font-semibold">Your trades matching these rules (in-sample)</p>
      <div className="mt-1"><StatsGrid stats={strategy.matchedStats} /></div>

      {strategy.backtest && (
        <>
          <p className="mt-3 text-sm font-semibold">Backtest {strategy.backtest.from} → {strategy.backtest.to}</p>
          <div className="mt-1"><StatsGrid stats={strategy.backtest.stats} /></div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-[var(--warning)]">
            {strategy.backtest.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </>
      )}

      {trades.length > 0 && (
        <p className="mt-3 text-sm">
          Live simulated trades: {trades.length} · realized <span className={signClass(realized)}>{money(realized)}</span>
        </p>
      )}

      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-[var(--muted)]">
        {strategy.notes.map((note) => <li key={note}>{note}</li>)}
      </ul>
      <div className="mt-3"><Notice>{strategy.uncertaintyNote}</Notice></div>
    </Card>
  );
}

export function SettingsPanel({ state, onState }: { state: TradingState; onState: (state: TradingState) => void }) {
  const [watchlist, setWatchlist] = useState(state.watchlist.map((symbol) => symbol.slice(2)).join(", "));
  const [cash, setCash] = useState(String(state.settings.initialCash));
  const [confirmReset, setConfirmReset] = useState(false);
  const [message, setMessage] = useState("");

  async function patch(body: object) {
    try {
      onState(await api<TradingState>("/api/trading/state", { method: "PATCH", body: JSON.stringify(body) }));
      setMessage("Saved.");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function reset() {
    try {
      onState(await api<TradingState>("/api/trading/state", { method: "POST", body: JSON.stringify({ action: "reset", initialCash: Number(cash) }) }));
      setConfirmReset(false);
      setMessage("Accounts reset.");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  return (
    <div className="grid gap-4">
      <Card title="Market data">
        <div className="grid gap-2">
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" className="mt-1" checked={state.settings.dataSource === "tencent"} onChange={() => void patch({ settings: { dataSource: "tencent" } })} />
            <span><strong>Live quotes (Tencent)</strong><br /><span className="text-[var(--muted)]">Real A-share prices from a free public feed. Unofficial and may be delayed.</span></span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" className="mt-1" checked={state.settings.dataSource === "mock"} onChange={() => void patch({ settings: { dataSource: "mock" } })} />
            <span><strong>Mock prices</strong><br /><span className="text-[var(--muted)]">Generated fake prices for trying the app offline. Do not learn patterns from these.</span></span>
          </label>
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={state.settings.enforceTradingHours} onChange={(event) => void patch({ settings: { enforceTradingHours: event.target.checked } })} />
            <span><strong>Only fill orders during trading hours</strong><br /><span className="text-[var(--muted)]">09:30-11:30 and 13:00-15:00 China time. Turning this off lets you trade at the last price after hours, which is less realistic.</span></span>
          </label>
        </div>
      </Card>

      <Card title="Watchlist (also the strategy's stock list)">
        <textarea value={watchlist} onChange={(event) => setWatchlist(event.target.value)} rows={3} className="w-full p-3 text-sm" placeholder="600519, 000001, 300750" />
        <Button className="mt-2" onClick={() => void patch({ watchlist: watchlist.split(/[\s,，]+/).filter(Boolean) })}>Save watchlist</Button>
      </Card>

      <Card title="Reset accounts">
        <p className="text-sm leading-6 text-[var(--muted)]">Clears all trades, reviews and positions in both accounts and restarts them with this much virtual cash. Strategies are kept but deactivated.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input value={cash} onChange={(event) => setCash(event.target.value.replace(/\D/g, ""))} inputMode="numeric" className="min-h-10 w-40 px-3" />
          {confirmReset ? (
            <>
              <Button variant="danger" onClick={() => void reset()}>Confirm reset</Button>
              <Button variant="ghost" onClick={() => setConfirmReset(false)}>Cancel</Button>
            </>
          ) : (
            <Button variant="danger" onClick={() => setConfirmReset(true)}>Reset</Button>
          )}
        </div>
      </Card>

      {message && <Notice>{message}</Notice>}
    </div>
  );
}

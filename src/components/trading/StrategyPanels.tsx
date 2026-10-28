"use client";

import { Bot, FlaskConical, Pause, Play, RotateCcw } from "lucide-react";
import { useState } from "react";
import { buildRoundTrips, computeStats, groupStats } from "@/lib/trading/analytics";
import { aggregateByEntry, MIN_ROUND_TRIPS, type DistillResult } from "@/lib/trading/distiller";
import type { AccountView } from "@/lib/trading/engine";
import { flagDescriptions, positiveFlags } from "@/lib/trading/trade-reviewer";
import { emotionLabel } from "@/lib/trading/labels";
import type { DistilledStrategy, PerformanceStats, StrategyLogEntry, Trade, TradingState } from "@/lib/trading/types";
import { api, Button, Card, Empty, money, Notice, signClass, signed, Stat } from "@/components/trading/ui";

function StatsGrid({ stats }: { stats: PerformanceStats }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label="已平仓" value={stats.count} />
      <Stat label="胜率" value={`${stats.winRate}%`} />
      <Stat label="平均收益" value={signed(stats.avgReturnPct)} tone={signClass(stats.avgReturnPct)} />
      <Stat label="盈亏比因子" value={stats.profitFactor} />
      <Stat label="平均盈利 / 亏损" value={`${signed(stats.avgWinPct)} / ${signed(stats.avgLossPct)}`} />
      <Stat label="已实现盈亏" value={money(stats.totalPnl, 0)} tone={signClass(stats.totalPnl)} />
      <Stat label="平均持有" value={`${stats.avgHoldDays} 天`} />
      <Stat label="最大回撤" value={`${stats.maxDrawdownPct}%`} />
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
      <Card title="我的已平仓交易">
        <StatsGrid stats={stats} />
        <div className="mt-3">
          <p className="text-xs text-[var(--muted)]">策略蒸馏进度：已平仓 {trips.length}/{MIN_ROUND_TRIPS} 笔</p>
          <div className="mt-1 h-2 overflow-hidden rounded bg-[var(--panel-strong)]">
            <div className="h-full bg-[var(--accent)]" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </Card>

      <Card title="我 vs. 我的策略">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="我的账户收益" value={signed(manual.totalReturnPct)} tone={signClass(manual.totalReturnPct)} />
          <Stat label="策略账户收益" value={signed(strategy.totalReturnPct)} tone={signClass(strategy.totalReturnPct)} />
        </div>
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">两个账户起始资金相同。只有两边在同一段时间里都交易过，对比才有意义。</p>
      </Card>

      <Card title="按买入时情绪统计">
        {byEmotion.length === 0 ? (
          <Empty>平仓几笔之后，就能看到买入时的情绪和结果之间的关系。</Empty>
        ) : (
          <div className="grid gap-2">
            {byEmotion.map(({ key, stats: group }) => (
              <div key={key} className="grid grid-cols-[6rem_1fr_auto] items-center gap-2 rounded-md bg-[var(--panel)] px-3 py-2 text-sm">
                <span className="font-semibold">{emotionLabel(key)}</span>
                <span className="text-xs text-[var(--muted)]">{group.count} 笔 · 胜率 {group.winRate}%</span>
                <span className={`tabular-nums ${signClass(group.avgReturnPct)}`}>{signed(group.avgReturnPct)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title={`反复出现的问题${manualReviews.length ? ` · 平均过程分 ${avgScore}` : ""}`}>
        {topFlags.length === 0 ? (
          <Empty>还没有复盘过的交易。</Empty>
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
      <Card title="蒸馏我的交易模式">
        <p className="text-sm leading-6 text-[var(--muted)]">
          查看你每笔已平仓交易买入时的市场情况，找出盈利单的共同条件，变成固定的买卖规则。情绪不参与策略，所以策略不会因为怕错过或恐惧而交易。随后用约一年的日线数据回测这些规则。
        </p>
        <Button
          className="mt-3"
          disabled={busy}
          onClick={() =>
            void call({ action: "distill" }, (result) => {
              const distill = result.result as DistillResult;
              setMessage(distill.ready ? { tone: "info", text: `已生成「${distill.strategy.name}」。启用前请先看看回测结果。` } : { tone: "warn", text: distill.reason });
            })
          }
        >
          <FlaskConical size={16} /> {busy ? "处理中…" : `用 ${closed} 笔已平仓交易蒸馏`}
        </Button>
        {closed < MIN_ROUND_TRIPS && <p className="mt-2 text-xs text-[var(--muted)]">至少需要 {MIN_ROUND_TRIPS} 笔已平仓交易。</p>}
      </Card>

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      {active && (
        <Card title={`运行中：${active.name}`}>
          <p className="text-sm leading-6 text-[var(--muted)]">
            策略只在独立的策略账户里交易。每次运行先检查持仓是否该卖，再在股票池里寻找买入信号。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void call({ action: "run" })}>
              <Play size={16} /> 立即运行一次
            </Button>
            <Button variant={autoRun ? "primary" : "ghost"} onClick={() => onAutoRun(!autoRun)}>
              {autoRun ? <Pause size={16} /> : <Bot size={16} />} {autoRun ? "自动运行中" : "每 5 分钟自动运行"}
            </Button>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">自动运行只在本页面保持打开、且处于交易时段时生效。</p>
          <StrategyLog entries={state.strategyLog.filter((entry) => entry.strategyId === active.id).slice(0, 15)} />
        </Card>
      )}

      {state.strategies.length === 0 ? (
        <Empty>还没有策略。</Empty>
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
          <span className="text-[var(--muted)]">{new Date(entry.at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })} </span>
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
          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${statusStyle}`}>{{ draft: "草稿", active: "运行中", retired: "已停用" }[strategy.status]}</span>
        </span>
      }
      action={
        strategy.status === "active" ? (
          <Button variant="ghost" disabled={busy} onClick={onRetire}><RotateCcw size={15} /> 停用</Button>
        ) : (
          <Button variant="ghost" disabled={busy} onClick={onActivate}><Play size={15} /> 启用</Button>
        )
      }
    >
      <p className="text-sm font-semibold">买入条件（同时满足）</p>
      <ul className="mt-1 grid gap-1 text-sm">
        {strategy.entryConditions.map((condition) => (
          <li key={condition.label} className="rounded bg-[var(--panel)] px-2 py-1">
            {condition.label} <span className="text-xs text-[var(--muted)]">(你的 {condition.sample} 笔交易，胜率 {condition.winRate}%，平均 {signed(condition.avgReturnPct)})</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm">
        <strong>离场：</strong>止损 −{strategy.exit.stopLossPct}% · 止盈 +{strategy.exit.takeProfitPct}% · 最长持有 {strategy.exit.maxHoldDays} 天
        <br />
        <strong>仓位：</strong>每只 {strategy.sizing.positionPct}% 总资产，最多 {strategy.sizing.maxPositions} 只 · 股票池 {strategy.universe.length} 只
      </p>

      <p className="mt-3 text-sm font-semibold">你的交易中符合这些规则的部分（样本内）</p>
      <div className="mt-1"><StatsGrid stats={strategy.matchedStats} /></div>

      {strategy.backtest && (
        <>
          <p className="mt-3 text-sm font-semibold">回测 {strategy.backtest.from} → {strategy.backtest.to}</p>
          <div className="mt-1"><StatsGrid stats={strategy.backtest.stats} /></div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-[var(--warning)]">
            {strategy.backtest.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </>
      )}

      {trades.length > 0 && (
        <p className="mt-3 text-sm">
          模拟盘实际交易：{trades.length} 笔 · 已实现盈亏 <span className={signClass(realized)}>{money(realized)}</span>
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
      setMessage("已保存。");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function reset() {
    try {
      onState(await api<TradingState>("/api/trading/state", { method: "POST", body: JSON.stringify({ action: "reset", initialCash: Number(cash) }) }));
      setConfirmReset(false);
      setMessage("账户已重置。");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  return (
    <div className="grid gap-4">
      <Card title="行情数据">
        <div className="grid gap-2">
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" className="mt-1" checked={state.settings.dataSource === "tencent"} onChange={() => void patch({ settings: { dataSource: "tencent" } })} />
            <span><strong>实时行情（腾讯）</strong><br /><span className="text-[var(--muted)]">来自免费公开接口的真实 A 股价格。非官方接口，可能有延迟。</span></span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" className="mt-1" checked={state.settings.dataSource === "mock"} onChange={() => void patch({ settings: { dataSource: "mock" } })} />
            <span><strong>模拟行情</strong><br /><span className="text-[var(--muted)]">生成的假价格，用于离线试用。不要从中总结交易模式。</span></span>
          </label>
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={state.settings.enforceTradingHours} onChange={(event) => void patch({ settings: { enforceTradingHours: event.target.checked } })} />
            <span><strong>只在交易时段成交</strong><br /><span className="text-[var(--muted)]">北京时间 09:30-11:30、13:00-15:00。关闭后可以在收盘后按最新价成交，但不够真实。</span></span>
          </label>
        </div>
      </Card>

      <Card title="自选股（也是策略的股票池）">
        <textarea value={watchlist} onChange={(event) => setWatchlist(event.target.value)} rows={3} className="w-full p-3 text-sm" placeholder="600519, 000001, 300750" />
        <Button className="mt-2" onClick={() => void patch({ watchlist: watchlist.split(/[\s,，]+/).filter(Boolean) })}>保存自选股</Button>
      </Card>

      <Card title="重置账户">
        <p className="text-sm leading-6 text-[var(--muted)]">清空两个账户的全部交易、复盘和持仓，并以下面的虚拟资金重新开始。策略会保留，但会被停用。</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input value={cash} onChange={(event) => setCash(event.target.value.replace(/\D/g, ""))} inputMode="numeric" className="min-h-10 w-40 px-3" />
          {confirmReset ? (
            <>
              <Button variant="danger" onClick={() => void reset()}>确认重置</Button>
              <Button variant="ghost" onClick={() => setConfirmReset(false)}>取消</Button>
            </>
          ) : (
            <Button variant="danger" onClick={() => setConfirmReset(true)}>重置</Button>
          )}
        </div>
      </Card>

      {message && <Notice>{message}</Notice>}
    </div>
  );
}

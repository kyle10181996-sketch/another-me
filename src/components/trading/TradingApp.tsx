"use client";

import { ArrowLeft, BarChart3, Bot, CandlestickChart, NotebookPen, Settings, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { tradingDisclaimer } from "@/lib/safety/classify-risk";
import { valueAccount } from "@/lib/trading/engine";
import { isWithinTradingSession, shanghaiDate } from "@/lib/trading/rules";
import type { Quote, TradingState } from "@/lib/trading/types";
import { InsightsPanel, SettingsPanel, StrategyPanel } from "@/components/trading/StrategyPanels";
import { JournalPanel, PortfolioPanel, TradePanel } from "@/components/trading/TradePanels";
import { api, Notice, signClass, signed, money } from "@/components/trading/ui";

type Tab = "trade" | "portfolio" | "journal" | "insights" | "strategy" | "settings";

const tabs: { id: Tab; label: string; icon: typeof Wallet }[] = [
  { id: "trade", label: "Trade", icon: CandlestickChart },
  { id: "portfolio", label: "Portfolio", icon: Wallet },
  { id: "journal", label: "Journal", icon: NotebookPen },
  { id: "insights", label: "Insights", icon: BarChart3 },
  { id: "strategy", label: "Strategy", icon: Bot },
  { id: "settings", label: "Settings", icon: Settings },
];

const QUOTE_REFRESH_MS = 15_000;
const AUTO_RUN_MS = 5 * 60_000;

export function TradingApp() {
  const [state, setState] = useState<TradingState | null>(null);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [tab, setTab] = useState<Tab>("trade");
  const [selected, setSelected] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [autoRun, setAutoRun] = useState(false);

  useEffect(() => {
    void api<TradingState>("/api/trading/state")
      .then(setState)
      .catch((error: Error) => setLoadError(error.message));
    void api<{ hasApiKey: boolean }>("/api/settings")
      .then((settings) => setHasApiKey(settings.hasApiKey))
      .catch(() => setHasApiKey(false));
  }, []);

  const trackedSymbols = useMemo(() => {
    if (!state) return [];
    const held = state.accounts.flatMap((account) => account.positions.map((position) => position.symbol));
    return [...new Set([...state.watchlist, ...held, ...(selected ? [selected] : [])])];
  }, [state, selected]);

  const symbolsKey = trackedSymbols.join(",");

  useEffect(() => {
    if (!symbolsKey) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const result = await api<{ quotes: Quote[] }>(`/api/trading/quotes?symbols=${symbolsKey}`);
        if (cancelled) return;
        setQuotes((current) => ({ ...current, ...Object.fromEntries(result.quotes.map((quote) => [quote.symbol, quote])) }));
      } catch {
        // Keep the last known prices; the trade ticket shows errors when they matter.
      }
    };
    const first = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), QUOTE_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [symbolsKey]);

  const activeStrategy = state?.strategies.find((strategy) => strategy.status === "active");

  useEffect(() => {
    if (!autoRun || !activeStrategy || !state) return;
    const tick = () => {
      if (state.settings.dataSource !== "mock" && !isWithinTradingSession(new Date())) return;
      void api<{ state: TradingState }>("/api/trading/strategy", { method: "POST", body: JSON.stringify({ action: "run" }) })
        .then((result) => setState(result.state))
        .catch(() => undefined);
    };
    const timer = window.setInterval(tick, AUTO_RUN_MS);
    return () => window.clearInterval(timer);
    // Re-arm only when the toggle or the active strategy changes, not on every state update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, activeStrategy?.id, state?.settings.dataSource]);

  if (loadError) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Notice tone="error">Could not load the simulator: {loadError}</Notice>
      </main>
    );
  }

  if (!state) {
    return <main className="mx-auto max-w-3xl px-4 py-8 text-sm text-[var(--muted)]">Loading simulator…</main>;
  }

  const prices = Object.fromEntries(Object.values(quotes).map((quote) => [quote.symbol, quote.price]));
  const today = shanghaiDate(new Date());
  const views = state.accounts.map((account) => valueAccount(account, prices, today));
  const manual = views.find((view) => view.account.kind === "manual")!;
  const strategyView = views.find((view) => view.account.kind === "strategy")!;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6">
      <header className="flex flex-col gap-3">
        <Link href="/" className="inline-flex w-fit items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--ink)]">
          <ArrowLeft size={15} /> AnotherMe
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold text-[var(--ink)] sm:text-4xl">A-Share Simulator</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Trade with virtual money, journal every decision, and let your own profitable patterns become a rule-based strategy.
            </p>
          </div>
          <span className={`rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-[var(--line)] ${state.settings.dataSource === "mock" ? "bg-[#fff4e6] text-[var(--warning)]" : "bg-white/60 text-[var(--accent)]"}`}>
            {state.settings.dataSource === "mock" ? "MOCK PRICES" : "Live quotes · Tencent"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SummaryTile label="My equity" value={money(manual.equity, 0)} sub={signed(manual.totalReturnPct)} subValue={manual.totalReturnPct} />
          <SummaryTile label="My cash" value={money(manual.account.cash, 0)} sub={`${manual.positions.length} positions`} />
          <SummaryTile label="Strategy equity" value={money(strategyView.equity, 0)} sub={signed(strategyView.totalReturnPct)} subValue={strategyView.totalReturnPct} />
          <SummaryTile label="Active strategy" value={activeStrategy ? activeStrategy.name : "None"} sub={activeStrategy ? (autoRun ? "Auto-run on" : "Manual runs") : "Distill one first"} />
        </div>
      </header>

      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition ${
                tab === item.id ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)] bg-white/55 text-[var(--ink)] hover:bg-white/80"
              }`}
            >
              <Icon size={16} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="surface rounded-lg p-3 shadow-sm sm:p-5">
        {tab === "trade" && (
          <TradePanel
            state={state}
            quotes={quotes}
            manual={manual}
            selected={selected}
            onSelect={setSelected}
            onState={setState}
            onQuote={(quote) => setQuotes((current) => ({ ...current, [quote.symbol]: quote }))}
            hasApiKey={hasApiKey}
          />
        )}
        {tab === "portfolio" && <PortfolioPanel views={views} onPick={(symbol) => { setSelected(symbol); setTab("trade"); }} />}
        {tab === "journal" && <JournalPanel state={state} onState={setState} hasApiKey={hasApiKey} />}
        {tab === "insights" && <InsightsPanel state={state} manual={manual} strategy={strategyView} />}
        {tab === "strategy" && <StrategyPanel state={state} onState={setState} autoRun={autoRun} onAutoRun={setAutoRun} />}
        {tab === "settings" && <SettingsPanel state={state} onState={setState} />}
      </div>

      <p className="pb-6 text-xs leading-5 text-[var(--muted)]">{tradingDisclaimer}</p>
    </main>
  );
}

function SummaryTile({ label, value, sub, subValue }: { label: string; value: string; sub: string; subValue?: number }) {
  return (
    <div className="surface min-w-0 rounded-lg px-3 py-2">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="truncate text-lg font-semibold tabular-nums">{value}</p>
      <p className={`truncate text-xs tabular-nums ${subValue !== undefined ? signClass(subValue) : "text-[var(--muted)]"}`}>{sub}</p>
    </div>
  );
}

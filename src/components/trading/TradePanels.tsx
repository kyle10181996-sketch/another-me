"use client";

import { RefreshCw, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import type { AccountView } from "@/lib/trading/engine";
import { boardLabel, boardOf, calculateFees, minBuyLot, normalizeSymbol, roundDownToLot } from "@/lib/trading/rules";
import type { Quote, Side, Trade, TradeEmotion, TradeReview, TradingState } from "@/lib/trading/types";
import { api, Button, Card, Empty, money, Notice, signClass, signed, Stat } from "@/components/trading/ui";

const emotionOptions: { id: TradeEmotion; label: string }[] = [
  { id: "calm", label: "Calm" },
  { id: "confident", label: "Confident" },
  { id: "unsure", label: "Unsure" },
  { id: "fomo", label: "FOMO" },
  { id: "greedy", label: "Greedy" },
  { id: "fear", label: "Fearful" },
  { id: "revenge", label: "Revenge" },
  { id: "bored", label: "Bored" },
];

type OrderResponse = { state: TradingState; trade: Trade; review: TradeReview };

export function TradePanel({
  state,
  quotes,
  manual,
  selected,
  onSelect,
  onState,
  onQuote,
  hasApiKey,
}: {
  state: TradingState;
  quotes: Record<string, Quote>;
  manual: AccountView;
  selected: string;
  onSelect: (symbol: string) => void;
  onState: (state: TradingState) => void;
  onQuote: (quote: Quote) => void;
  hasApiKey: boolean;
}) {
  const [code, setCode] = useState(selected.slice(2));
  const [side, setSide] = useState<Side>("buy");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [emotion, setEmotion] = useState<TradeEmotion>("calm");
  const [confidence, setConfidence] = useState(3);
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");
  const [holdDays, setHoldDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ trade: Trade; review: TradeReview } | null>(null);

  const quote = selected ? quotes[selected] : undefined;
  const position = manual.positions.find((item) => item.symbol === selected);
  const qty = Number(quantity) || 0;
  const estPrice = quote ? (side === "buy" ? quote.ask1 || quote.price : quote.bid1 || quote.price) : 0;
  const amount = qty * estPrice;
  const fees = amount > 0 ? calculateFees(side, amount) : null;

  async function lookup(input = code) {
    const symbol = normalizeSymbol(input);
    if (!symbol) {
      setError("Enter a 6-digit A-share code, e.g. 600519.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const response = await api<{ quotes: Quote[] }>(`/api/trading/quotes?symbols=${symbol}`);
      if (!response.quotes[0]) throw new Error("No quote found for that code.");
      onQuote(response.quotes[0]);
      onSelect(symbol);
      setCode(symbol.slice(2));
    } catch (lookupError) {
      setError((lookupError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function sizeByPct(pct: number) {
    if (!quote || !estPrice) return;
    setQuantity(String(roundDownToLot(quote.symbol, (manual.equity * pct) / 100 / estPrice)));
  }

  async function submit() {
    if (!quote) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await api<OrderResponse>("/api/trading/order", {
        method: "POST",
        body: JSON.stringify({
          symbol: quote.symbol,
          side,
          quantity: qty,
          journal: { reason, emotion, confidence, plannedStopLossPct: stop, plannedTakeProfitPct: target, plannedHoldDays: holdDays, tags: [] },
        }),
      });
      onState(response.state);
      setResult({ trade: response.trade, review: response.review });
      setQuantity("");
      setReason("");

      if (hasApiKey) {
        const ai = await api<{ review: TradeReview | null }>("/api/trading/review", { method: "POST", body: JSON.stringify({ tradeId: response.trade.id }) }).catch(() => null);
        if (ai?.review) {
          setResult({ trade: response.trade, review: ai.review });
          onState(await api<TradingState>("/api/trading/state"));
        }
      }
    } catch (orderError) {
      setError((orderError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = Boolean(quote) && qty > 0 && reason.trim().length >= 4 && !busy;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-4">
        <Card title="Find a stock">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void lookup();
            }}
          >
            <input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" className="min-h-10 min-w-0 flex-1 px-3" placeholder="Code, e.g. 600519" />
            <Button type="submit" disabled={busy}>
              <Search size={16} /> Quote
            </Button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            {state.watchlist.map((symbol) => {
              const item = quotes[symbol];
              return (
                <button
                  key={symbol}
                  onClick={() => void lookup(symbol)}
                  className={`rounded-md border px-2 py-1 text-left text-xs ${symbol === selected ? "border-[var(--accent)] bg-white" : "border-[var(--line)] bg-white/50"}`}
                >
                  <span className="block font-semibold">{item?.name ?? symbol}</span>
                  {item && <span className={`tabular-nums ${signClass(item.changePct)}`}>{item.price.toFixed(2)} {signed(item.changePct)}</span>}
                </button>
              );
            })}
          </div>
        </Card>

        {quote && <QuoteCard quote={quote} />}
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        {!quote ? (
          <Empty>Look up a stock to open the order ticket.</Empty>
        ) : (
          <Card title={`Order: ${quote.name}`}>
            <div className="grid grid-cols-2 gap-2">
              <Button variant={side === "buy" ? "buy" : "ghost"} onClick={() => setSide("buy")}>Buy</Button>
              <Button variant={side === "sell" ? "sell" : "ghost"} onClick={() => setSide("sell")}>Sell</Button>
            </div>

            <label className="mt-3 block text-sm font-semibold">Quantity (shares)</label>
            <input value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/\D/g, ""))} inputMode="numeric" className="mt-1 min-h-10 w-full px-3" placeholder={side === "buy" ? `Min ${minBuyLot(quote.symbol)}, lots of 100` : "Shares to sell"} />
            <div className="mt-2 flex flex-wrap gap-2">
              {side === "buy" ? (
                [5, 10, 20].map((pct) => (
                  <Button key={pct} variant="ghost" className="min-h-8 px-2 py-1 text-xs" onClick={() => sizeByPct(pct)}>{pct}% of equity</Button>
                ))
              ) : (
                <Button variant="ghost" className="min-h-8 px-2 py-1 text-xs" disabled={!position?.sellable} onClick={() => setQuantity(String(position?.sellable ?? 0))}>
                  All sellable ({position?.sellable ?? 0})
                </Button>
              )}
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              {side === "buy"
                ? `Cash ${money(manual.account.cash)} · est. ${money(amount)} + fees ${money(fees?.total ?? 0)}`
                : `Held ${position?.quantity ?? 0} · sellable today ${position?.sellable ?? 0} (T+1) · est. ${money(amount)} − fees ${money(fees?.total ?? 0)}`}
            </p>

            <div className="mt-4 border-t border-[var(--line)] pt-3">
              <p className="text-sm font-semibold">Journal (required for analysis)</p>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-2 w-full p-3 text-sm" placeholder={side === "buy" ? "Why this stock, why now? What would prove you wrong?" : "Why are you selling now? Did the original reason change?"} />
              <p className="mt-2 text-xs text-[var(--muted)]">How do you feel right now?</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {emotionOptions.map((option) => (
                  <button key={option.id} onClick={() => setEmotion(option.id)} className={`rounded-md border px-2 py-1 text-xs ${emotion === option.id ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)] bg-white/50"}`}>
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-[var(--muted)]">Confidence: {confidence}/5</p>
              <input type="range" min={1} max={5} value={confidence} onChange={(event) => setConfidence(Number(event.target.value))} className="w-full border-0" />
              {side === "buy" && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <input value={stop} onChange={(event) => setStop(event.target.value)} inputMode="decimal" className="min-h-10 min-w-0 px-2 text-sm" placeholder="Stop %" />
                  <input value={target} onChange={(event) => setTarget(event.target.value)} inputMode="decimal" className="min-h-10 min-w-0 px-2 text-sm" placeholder="Target %" />
                  <input value={holdDays} onChange={(event) => setHoldDays(event.target.value)} inputMode="numeric" className="min-h-10 min-w-0 px-2 text-sm" placeholder="Hold days" />
                </div>
              )}
            </div>

            <Button variant={side} className="mt-4 w-full" disabled={!canSubmit} onClick={() => void submit()}>
              {busy ? "Working…" : `${side === "buy" ? "Buy" : "Sell"} ${qty || ""} ${quote.name}`}
            </Button>
            {reason.trim().length < 4 && <p className="mt-2 text-xs text-[var(--muted)]">Write a reason first. Unjournaled trades cannot be learned from.</p>}
          </Card>
        )}

        {error && <Notice tone="error">{error}</Notice>}
        {result && <ReviewCard trade={result.trade} review={result.review} />}
      </div>
    </div>
  );
}

function QuoteCard({ quote }: { quote: Quote }) {
  const time = new Date(quote.quoteTime).toLocaleString("en-GB", { timeZone: "Asia/Shanghai", hour12: false });
  return (
    <Card
      title={
        <span>
          {quote.name} <span className="text-sm font-normal text-[var(--muted)]">{quote.symbol.toUpperCase()} · {boardLabel(boardOf(quote.symbol))}</span>
        </span>
      }
    >
      <p className={`text-3xl font-semibold tabular-nums ${signClass(quote.changePct)}`}>
        {quote.price.toFixed(2)} <span className="text-base">{signed(quote.changePct)}</span>
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Open" value={quote.open.toFixed(2)} />
        <Stat label="High" value={quote.high.toFixed(2)} />
        <Stat label="Low" value={quote.low.toFixed(2)} />
        <Stat label="Bid 1" value={quote.bid1.toFixed(2)} />
        <Stat label="Ask 1" value={quote.ask1.toFixed(2)} />
        <Stat label="Prev close" value={quote.prevClose.toFixed(2)} />
        <Stat label="Limit up" value={quote.limitUp.toFixed(2)} tone="text-[#c62f2f]" />
        <Stat label="Limit down" value={quote.limitDown.toFixed(2)} tone="text-[#13804a]" />
        <Stat label="Turnover" value={`${(quote.amount / 1e8).toFixed(2)}亿`} />
      </div>
      <p className="mt-2 text-xs text-[var(--muted)]">
        {quote.source === "mock" ? "Mock price (not real market data)" : "Tencent quote"} · {time} China time{quote.isSt ? " · ST stock" : ""}
      </p>
    </Card>
  );
}

const verdictStyles: Record<TradeReview["verdict"], string> = {
  disciplined: "bg-[#e3f3ec] text-[#13804a]",
  mixed: "bg-[#fff4e6] text-[var(--warning)]",
  impulsive: "bg-[#fdecef] text-[var(--danger)]",
};

export function ReviewCard({ trade, review, action }: { trade: Trade; review?: TradeReview; action?: React.ReactNode }) {
  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className={trade.side === "buy" ? "text-[#c62f2f]" : "text-[#13804a]"}>{trade.side === "buy" ? "BUY" : "SELL"}</span>
          {trade.name}
          <span className="text-sm font-normal tabular-nums text-[var(--muted)]">
            {trade.quantity} @ {trade.price.toFixed(2)}
          </span>
        </span>
      }
      action={action}
    >
      <p className="text-xs text-[var(--muted)]">
        {trade.tradeDate} · fees {money(trade.fees.total)}
        {trade.realizedPnl !== undefined && (
          <>
            {" · realized "}
            <span className={signClass(trade.realizedPnl)}>{money(trade.realizedPnl)}</span>
          </>
        )}
        {trade.strategyId ? " · by strategy" : ""}
        {trade.source === "mock" ? " · mock price" : ""}
      </p>
      {trade.journal && (
        <p className="mt-2 text-sm leading-6">
          <span className="text-[var(--muted)]">[{trade.journal.emotion}, {trade.journal.confidence}/5] </span>
          {trade.journal.reason}
        </p>
      )}
      {review && (
        <div className="mt-3 rounded-md bg-[var(--panel)] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${verdictStyles[review.verdict]}`}>{review.verdict}</span>
            <span className="text-xs text-[var(--muted)]">Process score {review.score}/100 · {review.provider === "ai" ? "AI review" : "rule-based review"}</span>
          </div>
          {review.safetyNote && <div className="mt-2"><Notice tone="warn">{review.safetyNote}</Notice></div>}
          <p className="mt-2 text-sm leading-6">{review.summary}</p>
          {review.issues.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-[var(--danger)]">
              {review.issues.map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          )}
          {review.strengths.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-[#13804a]">
              {review.strengths.map((strength) => <li key={strength}>{strength}</li>)}
            </ul>
          )}
          <p className="mt-2 text-sm leading-6"><strong>Next time: </strong>{review.suggestion}</p>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{review.uncertaintyNote}</p>
        </div>
      )}
    </Card>
  );
}

export function PortfolioPanel({ views, onPick }: { views: AccountView[]; onPick: (symbol: string) => void }) {
  return (
    <div className="grid gap-4">
      {views.map((view) => (
        <Card key={view.account.id} title={view.account.name}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Equity" value={money(view.equity)} />
            <Stat label="Cash" value={money(view.account.cash)} />
            <Stat label="Unrealized P&L" value={money(view.unrealizedPnl)} tone={signClass(view.unrealizedPnl)} />
            <Stat label="Total return" value={signed(view.totalReturnPct)} tone={signClass(view.totalReturnPct)} />
          </div>
          <div className="mt-3 grid gap-2">
            {view.positions.length === 0 ? (
              <Empty>No positions.</Empty>
            ) : (
              view.positions.map((position) => (
                <button key={position.symbol} onClick={() => onPick(position.symbol)} className="grid grid-cols-[1fr_auto] gap-1 rounded-md border border-[var(--line)] bg-[var(--panel)] p-3 text-left text-sm">
                  <span className="font-semibold">{position.name} <span className="font-normal text-[var(--muted)]">{position.symbol}</span></span>
                  <span className={`text-right font-semibold tabular-nums ${signClass(position.pnl)}`}>{signed(position.pnlPct)}</span>
                  <span className="text-xs text-[var(--muted)] tabular-nums">
                    {position.quantity} sh (sellable {position.sellable}) · cost {position.avgCost.toFixed(3)} · now {position.price.toFixed(2)}
                  </span>
                  <span className={`text-right text-xs tabular-nums ${signClass(position.pnl)}`}>{money(position.pnl)}</span>
                </button>
              ))
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

export function JournalPanel({ state, onState, hasApiKey }: { state: TradingState; onState: (state: TradingState) => void; hasApiKey: boolean }) {
  const [accountId, setAccountId] = useState("acct_manual");
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const trades = state.trades.filter((trade) => trade.accountId === accountId).slice(0, 100);

  function reviewFor(tradeId: string) {
    const reviews = state.reviews.filter((review) => review.tradeId === tradeId);
    return reviews.find((review) => review.provider === "ai") ?? reviews[0];
  }

  async function aiReview(tradeId: string) {
    setPending(tradeId);
    setError("");
    try {
      const result = await api<{ review: TradeReview | null; error?: string }>("/api/trading/review", { method: "POST", body: JSON.stringify({ tradeId }) });
      if (result.error) setError(result.error);
      onState(await api<TradingState>("/api/trading/state"));
    } catch (reviewError) {
      setError((reviewError as Error).message);
    } finally {
      setPending("");
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex gap-2">
        <Button variant={accountId === "acct_manual" ? "primary" : "ghost"} onClick={() => setAccountId("acct_manual")}>My trades</Button>
        <Button variant={accountId === "acct_strategy" ? "primary" : "ghost"} onClick={() => setAccountId("acct_strategy")}>Strategy trades</Button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {trades.length === 0 ? (
        <Empty>No trades yet.</Empty>
      ) : (
        trades.map((trade) => {
          const review = reviewFor(trade.id);
          return (
            <ReviewCard
              key={trade.id}
              trade={trade}
              review={review}
              action={
                hasApiKey && review && review.provider !== "ai" && !trade.strategyId ? (
                  <Button variant="ghost" className="min-h-8 px-2 py-1 text-xs" disabled={pending === trade.id} onClick={() => void aiReview(trade.id)}>
                    {pending === trade.id ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />} AI review
                  </Button>
                ) : null
              }
            />
          );
        })
      )}
    </div>
  );
}

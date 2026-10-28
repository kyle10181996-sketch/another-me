"use client";

import { RefreshCw, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import type { AccountView } from "@/lib/trading/engine";
import { boardLabel, boardOf, calculateFees, minBuyLot, normalizeSymbol, roundDownToLot } from "@/lib/trading/rules";
import { emotionLabel, emotionLabels, verdictLabels } from "@/lib/trading/labels";
import type { Quote, Side, Trade, TradeEmotion, TradeReview, TradingState } from "@/lib/trading/types";
import { api, Button, Card, Empty, money, Notice, signClass, signed, Stat } from "@/components/trading/ui";

const emotionOptions = (["calm", "confident", "unsure", "fomo", "greedy", "fear", "revenge", "bored"] as TradeEmotion[]).map((id) => ({ id, label: emotionLabels[id] }));

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
      setError("请输入 6 位 A 股代码，例如 600519。");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const response = await api<{ quotes: Quote[] }>(`/api/trading/quotes?symbols=${symbol}`);
      if (!response.quotes[0]) throw new Error("找不到这个代码的行情。");
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
        <Card title="查找股票">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void lookup();
            }}
          >
            <input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" className="min-h-10 min-w-0 flex-1 px-3" placeholder="股票代码，例如 600519" />
            <Button type="submit" disabled={busy}>
              <Search size={16} /> 查行情
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
          <Empty>先查一只股票，再打开下单面板。</Empty>
        ) : (
          <Card title={`下单：${quote.name}`}>
            <div className="grid grid-cols-2 gap-2">
              <Button variant={side === "buy" ? "buy" : "ghost"} onClick={() => setSide("buy")}>买入</Button>
              <Button variant={side === "sell" ? "sell" : "ghost"} onClick={() => setSide("sell")}>卖出</Button>
            </div>

            <label className="mt-3 block text-sm font-semibold">数量（股）</label>
            <input value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/\D/g, ""))} inputMode="numeric" className="mt-1 min-h-10 w-full px-3" placeholder={side === "buy" ? `至少 ${minBuyLot(quote.symbol)} 股，100 股一手` : "要卖出的股数"} />
            <div className="mt-2 flex flex-wrap gap-2">
              {side === "buy" ? (
                [5, 10, 20].map((pct) => (
                  <Button key={pct} variant="ghost" className="min-h-8 px-2 py-1 text-xs" onClick={() => sizeByPct(pct)}>总资产的 {pct}%</Button>
                ))
              ) : (
                <Button variant="ghost" className="min-h-8 px-2 py-1 text-xs" disabled={!position?.sellable} onClick={() => setQuantity(String(position?.sellable ?? 0))}>
                  全部可卖（{position?.sellable ?? 0}）
                </Button>
              )}
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              {side === "buy"
                ? `现金 ${money(manual.account.cash)} · 预计 ${money(amount)} + 手续费 ${money(fees?.total ?? 0)}`
                : `持有 ${position?.quantity ?? 0} 股 · 今日可卖 ${position?.sellable ?? 0} 股（T+1） · 预计 ${money(amount)} − 手续费 ${money(fees?.total ?? 0)}`}
            </p>

            <div className="mt-4 border-t border-[var(--line)] pt-3">
              <p className="text-sm font-semibold">交易日志（分析必填）</p>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-2 w-full p-3 text-sm" placeholder={side === "buy" ? "为什么买这只、为什么是现在？出现什么情况说明你判断错了？" : "为什么现在卖？当初买入的理由变了吗？"} />
              <p className="mt-2 text-xs text-[var(--muted)]">你现在是什么情绪？</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {emotionOptions.map((option) => (
                  <button key={option.id} onClick={() => setEmotion(option.id)} className={`rounded-md border px-2 py-1 text-xs ${emotion === option.id ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)] bg-white/50"}`}>
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-[var(--muted)]">信心：{confidence}/5</p>
              <input type="range" min={1} max={5} value={confidence} onChange={(event) => setConfidence(Number(event.target.value))} className="w-full border-0" />
              {side === "buy" && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <input value={stop} onChange={(event) => setStop(event.target.value)} inputMode="decimal" className="min-h-10 min-w-0 px-2 text-sm" placeholder="止损 %" />
                  <input value={target} onChange={(event) => setTarget(event.target.value)} inputMode="decimal" className="min-h-10 min-w-0 px-2 text-sm" placeholder="止盈 %" />
                  <input value={holdDays} onChange={(event) => setHoldDays(event.target.value)} inputMode="numeric" className="min-h-10 min-w-0 px-2 text-sm" placeholder="计划持有天数" />
                </div>
              )}
            </div>

            <Button variant={side} className="mt-4 w-full" disabled={!canSubmit} onClick={() => void submit()}>
              {busy ? "处理中…" : `${side === "buy" ? "买入" : "卖出"} ${quote.name} ${qty ? `${qty} 股` : ""}`}
            </Button>
            {reason.trim().length < 4 && <p className="mt-2 text-xs text-[var(--muted)]">请先写理由。没有日志的交易无法复盘。</p>}
          </Card>
        )}

        {error && <Notice tone="error">{error}</Notice>}
        {result && <ReviewCard trade={result.trade} review={result.review} />}
      </div>
    </div>
  );
}

function QuoteCard({ quote }: { quote: Quote }) {
  const time = new Date(quote.quoteTime).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
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
        <Stat label="开盘" value={quote.open.toFixed(2)} />
        <Stat label="最高" value={quote.high.toFixed(2)} />
        <Stat label="最低" value={quote.low.toFixed(2)} />
        <Stat label="买一" value={quote.bid1.toFixed(2)} />
        <Stat label="卖一" value={quote.ask1.toFixed(2)} />
        <Stat label="昨收" value={quote.prevClose.toFixed(2)} />
        <Stat label="涨停价" value={quote.limitUp.toFixed(2)} tone="text-[#c62f2f]" />
        <Stat label="跌停价" value={quote.limitDown.toFixed(2)} tone="text-[#13804a]" />
        <Stat label="成交额" value={`${(quote.amount / 1e8).toFixed(2)}亿`} />
      </div>
      <p className="mt-2 text-xs text-[var(--muted)]">
        {quote.source === "mock" ? "模拟价格（不是真实行情）" : "腾讯行情"} · 北京时间 {time}{quote.isSt ? " · ST 股" : ""}
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
          <span className={trade.side === "buy" ? "text-[#c62f2f]" : "text-[#13804a]"}>{trade.side === "buy" ? "买入" : "卖出"}</span>
          {trade.name}
          <span className="text-sm font-normal tabular-nums text-[var(--muted)]">
            {trade.quantity} 股 @ {trade.price.toFixed(2)}
          </span>
        </span>
      }
      action={action}
    >
      <p className="text-xs text-[var(--muted)]">
        {trade.tradeDate} · 手续费 {money(trade.fees.total)}
        {trade.realizedPnl !== undefined && (
          <>
            {" · 已实现盈亏 "}
            <span className={signClass(trade.realizedPnl)}>{money(trade.realizedPnl)}</span>
          </>
        )}
        {trade.strategyId ? " · 策略下单" : ""}
        {trade.source === "mock" ? " · 模拟价格" : ""}
      </p>
      {trade.journal && (
        <p className="mt-2 text-sm leading-6">
          <span className="text-[var(--muted)]">[{emotionLabel(trade.journal.emotion)}，信心 {trade.journal.confidence}/5] </span>
          {trade.journal.reason}
        </p>
      )}
      {review && (
        <div className="mt-3 rounded-md bg-[var(--panel)] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${verdictStyles[review.verdict]}`}>{verdictLabels[review.verdict]}</span>
            <span className="text-xs text-[var(--muted)]">过程分 {review.score}/100 · {review.provider === "ai" ? "AI 复盘" : "规则复盘"}</span>
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
          <p className="mt-2 text-sm leading-6"><strong>下次：</strong>{review.suggestion}</p>
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
        <Card key={view.account.id} title={view.account.kind === "manual" ? "我的账户" : "策略账户"}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="总资产" value={money(view.equity)} />
            <Stat label="现金" value={money(view.account.cash)} />
            <Stat label="浮动盈亏" value={money(view.unrealizedPnl)} tone={signClass(view.unrealizedPnl)} />
            <Stat label="累计收益" value={signed(view.totalReturnPct)} tone={signClass(view.totalReturnPct)} />
          </div>
          <div className="mt-3 grid gap-2">
            {view.positions.length === 0 ? (
              <Empty>没有持仓。</Empty>
            ) : (
              view.positions.map((position) => (
                <button key={position.symbol} onClick={() => onPick(position.symbol)} className="grid grid-cols-[1fr_auto] gap-1 rounded-md border border-[var(--line)] bg-[var(--panel)] p-3 text-left text-sm">
                  <span className="font-semibold">{position.name} <span className="font-normal text-[var(--muted)]">{position.symbol}</span></span>
                  <span className={`text-right font-semibold tabular-nums ${signClass(position.pnl)}`}>{signed(position.pnlPct)}</span>
                  <span className="text-xs text-[var(--muted)] tabular-nums">
                    {position.quantity} 股（可卖 {position.sellable}） · 成本 {position.avgCost.toFixed(3)} · 现价 {position.price.toFixed(2)}
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
        <Button variant={accountId === "acct_manual" ? "primary" : "ghost"} onClick={() => setAccountId("acct_manual")}>我的交易</Button>
        <Button variant={accountId === "acct_strategy" ? "primary" : "ghost"} onClick={() => setAccountId("acct_strategy")}>策略交易</Button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {trades.length === 0 ? (
        <Empty>还没有交易。</Empty>
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
                    {pending === trade.id ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />} AI 复盘
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

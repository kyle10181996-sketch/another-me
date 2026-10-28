"use client";

import { ClipboardCopy, Download, MessageSquareText, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { CoachAnalysis, TradingState } from "@/lib/trading/types";
import { api, Button, Card, Empty, Notice } from "@/components/trading/ui";

async function fetchMarkdown() {
  const response = await fetch("/api/trading/export?format=md", { cache: "no-store" });
  if (!response.ok) throw new Error("生成导出内容失败。");
  return response.text();
}

export function CoachPanel({ state, onState, hasApiKey }: { state: TradingState; onState: (state: TradingState) => void; hasApiKey: boolean }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [fallbackText, setFallbackText] = useState("");

  async function copyForClaude() {
    setNotice(null);
    try {
      const markdown = await fetchMarkdown();
      try {
        await navigator.clipboard.writeText(markdown);
        setFallbackText("");
        setNotice({ tone: "info", text: `已复制（约 ${Math.round(markdown.length / 1000)}k 字符）。粘贴到和 Claude 的对话里，可以再补充你的问题。` });
      } catch {
        // Clipboard can be blocked (e.g. some in-app browsers): show the text to copy manually.
        setFallbackText(markdown);
      }
    } catch (error) {
      setNotice({ tone: "error", text: (error as Error).message });
    }
  }

  async function download() {
    try {
      const markdown = await fetchMarkdown();
      const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `trading-log-${new Date().toISOString().slice(0, 10)}.md`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setNotice({ tone: "error", text: (error as Error).message });
    }
  }

  async function analyze() {
    setBusy(true);
    setNotice(null);
    try {
      await api<{ analysis: CoachAnalysis }>("/api/trading/analyze", { method: "POST", body: JSON.stringify({ question }) });
      onState(await api<TradingState>("/api/trading/state"));
      setQuestion("");
    } catch (error) {
      setNotice({ tone: "error", text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const [latest, ...older] = state.analyses;

  return (
    <div className="grid gap-4">
      <Card title="把交易记录发给 Claude">
        <p className="text-sm leading-6 text-[var(--muted)]">
          把你在模拟器里的全部记录（统计数据、按情绪的结果、反复出现的错误、每笔已平仓交易的理由和买入时的市场情况）打包成一条带分析要求的消息。粘贴到任意 Claude 对话即可。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => void copyForClaude()}>
            <ClipboardCopy size={16} /> 复制给 Claude
          </Button>
          <Button variant="ghost" onClick={() => void download()}>
            <Download size={16} /> 下载 .md
          </Button>
        </div>
        {fallbackText && (
          <>
            <p className="mt-3 text-xs text-[var(--muted)]">这里无法自动复制，请全选后手动复制：</p>
            <textarea readOnly value={fallbackText} rows={8} className="mt-1 w-full p-2 font-mono text-xs" onFocus={(event) => event.currentTarget.select()} />
          </>
        )}
      </Card>

      <Card title="应用内实时分析">
        <p className="text-sm leading-6 text-[var(--muted)]">
          {hasApiKey ? (
            "用 API Settings 里配置的 AI 立即分析你的全部记录。可以提一个具体问题，留空则做整体复盘。"
          ) : (
            <>
              还没有配置 AI 提供方，现在只能得到规则化总结。想让 Claude 在应用内分析：打开{" "}
              <Link href="/" className="underline">AnotherMe 首页</Link>，进入 API Settings，选择 Claude 预设，填入 Anthropic API Key。
            </>
          )}
        </p>
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={3} className="mt-3 w-full p-3 text-sm" placeholder="可选，例如：为什么我的创业板交易总亏？我是不是卖飞太早？" />
        <Button className="mt-2" disabled={busy} onClick={() => void analyze()}>
          <Sparkles size={16} /> {busy ? "分析中…" : "分析我的交易"}
        </Button>
      </Card>

      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      {latest ? <AnalysisView analysis={latest} /> : <Empty>还没有分析记录。</Empty>}
      {older.slice(0, 5).map((analysis) => (
        <details key={analysis.id} className="rounded-lg border border-[var(--line)] bg-white/40 p-3 text-sm">
          <summary className="cursor-pointer">
            {new Date(analysis.createdAt).toLocaleString("zh-CN", { hour12: false })} · {analysis.question || analysis.headline}
          </summary>
          <div className="mt-3"><AnalysisView analysis={analysis} /></div>
        </details>
      ))}
    </div>
  );
}

function List({ title, items, tone }: { title: string; items: string[]; tone?: string }) {
  if (!items.length) return null;
  return (
    <section className="mt-3">
      <h4 className="text-sm font-semibold">{title}</h4>
      <ul className={`mt-1 list-disc space-y-1 pl-5 text-sm leading-6 ${tone ?? ""}`}>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  );
}

function AnalysisView({ analysis }: { analysis: CoachAnalysis }) {
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <MessageSquareText size={17} className="text-[var(--accent)]" />
          {analysis.headline}
        </span>
      }
    >
      <p className="text-xs text-[var(--muted)]">
        {analysis.provider === "ai" ? "AI 分析" : "规则化总结"} · 基于 {analysis.basedOnClosedTrades} 笔已平仓交易 · {new Date(analysis.createdAt).toLocaleString("zh-CN", { hour12: false })}
      </p>
      {analysis.question && <p className="mt-2 text-sm"><strong>问：</strong>{analysis.question}</p>}
      {analysis.safetyNote && <div className="mt-2"><Notice tone="warn">{analysis.safetyNote}</Notice></div>}
      {analysis.answer && <p className="mt-2 text-sm leading-6">{analysis.answer}</p>}
      <List title="有效的做法" items={analysis.working} tone="text-[#13804a]" />
      <List title="让你亏钱的地方" items={analysis.costing} tone="text-[var(--danger)]" />
      <List title="情绪模式" items={analysis.emotionalPatterns} />
      <List title="当前持仓" items={analysis.openPositionNotes} />
      <List title="接下来要遵守的规则" items={analysis.rules} />
      <div className="mt-3"><Notice>{analysis.uncertaintyNote}</Notice></div>
    </Card>
  );
}

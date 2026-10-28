"use client";

import { ClipboardCopy, Download, MessageSquareText, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { CoachAnalysis, TradingState } from "@/lib/trading/types";
import { api, Button, Card, Empty, Notice } from "@/components/trading/ui";

async function fetchMarkdown() {
  const response = await fetch("/api/trading/export?format=md", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not build the export.");
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
        setNotice({ tone: "info", text: `Copied (${Math.round(markdown.length / 1000)}k characters). Paste it into a chat with Claude and add any question.` });
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
      <Card title="Send my log to Claude">
        <p className="text-sm leading-6 text-[var(--muted)]">
          Packs your whole simulator history (stats, results by emotion, recurring mistakes, every closed trade with your reason and the market context at entry) into one message with analysis instructions. Paste it into any Claude chat.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => void copyForClaude()}>
            <ClipboardCopy size={16} /> Copy for Claude
          </Button>
          <Button variant="ghost" onClick={() => void download()}>
            <Download size={16} /> Download .md
          </Button>
        </div>
        {fallbackText && (
          <>
            <p className="mt-3 text-xs text-[var(--muted)]">Clipboard is blocked here. Select all and copy:</p>
            <textarea readOnly value={fallbackText} rows={8} className="mt-1 w-full p-2 font-mono text-xs" onFocus={(event) => event.currentTarget.select()} />
          </>
        )}
      </Card>

      <Card title="Live analysis in the app">
        <p className="text-sm leading-6 text-[var(--muted)]">
          {hasApiKey ? (
            "Uses the AI provider from API Settings to analyze your full log now. Ask a specific question or leave it blank for a general review."
          ) : (
            <>
              No AI provider set, so you will get the rule-based summary. To have Claude analyze in the app, go to the{" "}
              <Link href="/" className="underline">AnotherMe home page</Link>, open API Settings, pick the Claude preset and paste an Anthropic API key.
            </>
          )}
        </p>
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={3} className="mt-3 w-full p-3 text-sm" placeholder="Optional, e.g. Why do my ChiNext trades keep losing? Am I cutting winners too early?" />
        <Button className="mt-2" disabled={busy} onClick={() => void analyze()}>
          <Sparkles size={16} /> {busy ? "Analyzing…" : "Analyze my trading"}
        </Button>
      </Card>

      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      {latest ? <AnalysisView analysis={latest} /> : <Empty>No analyses yet.</Empty>}
      {older.slice(0, 5).map((analysis) => (
        <details key={analysis.id} className="rounded-lg border border-[var(--line)] bg-white/40 p-3 text-sm">
          <summary className="cursor-pointer">
            {new Date(analysis.createdAt).toLocaleString("en-GB", { hour12: false })} · {analysis.question || analysis.headline}
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
        {analysis.provider === "ai" ? "AI analysis" : "Rule-based summary"} · {analysis.basedOnClosedTrades} closed trades · {new Date(analysis.createdAt).toLocaleString("en-GB", { hour12: false })}
      </p>
      {analysis.question && <p className="mt-2 text-sm"><strong>Q: </strong>{analysis.question}</p>}
      {analysis.safetyNote && <div className="mt-2"><Notice tone="warn">{analysis.safetyNote}</Notice></div>}
      {analysis.answer && <p className="mt-2 text-sm leading-6">{analysis.answer}</p>}
      <List title="What is working" items={analysis.working} tone="text-[#13804a]" />
      <List title="What is costing you" items={analysis.costing} tone="text-[var(--danger)]" />
      <List title="Emotional patterns" items={analysis.emotionalPatterns} />
      <List title="Open positions" items={analysis.openPositionNotes} />
      <List title="Rules for the next trades" items={analysis.rules} />
      <div className="mt-3"><Notice>{analysis.uncertaintyNote}</Notice></div>
    </Card>
  );
}

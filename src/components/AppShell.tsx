"use client";

import { BookOpen, Brain, CalendarDays, CandlestickChart, GitBranch, KeyRound, LetterText, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { generateProfile } from "@/lib/ai/profile-generator";
import type { LetterHorizon } from "@/lib/ai/letter-writer";
import { mergeMemories } from "@/lib/memory/memory-extractor";
import { defaultUserId, initialState, loadState, saveState } from "@/lib/storage";
import type { AppState, DailyLog, DecisionRecord, Memory, PublicSettings, SimulationResult } from "@/lib/types";

type View = "daily" | "decision" | "mirror" | "timeline" | "letters" | "settings";

function nowIso() {
  return new Date().toISOString();
}

function labelForMemory(type: Memory["type"]) {
  const labels: Record<Memory["type"], string> = {
    fact: "Fact",
    preference: "Preference",
    value: "Value",
    pattern: "Pattern",
    fear: "Fear",
    desire: "Desire",
    relationship: "Relationship",
    goal: "Goal",
    lesson: "Lesson",
    blind_spot: "Blind spot",
  };
  return labels[type];
}

function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-ink)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
    />
  );
}

function GhostButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-white/40 px-3 py-2 text-sm font-medium text-[var(--ink)] transition hover:bg-white/70"
    />
  );
}

export function AppShell() {
  const [state, setState] = useState<AppState>(initialState);
  const [settings, setSettings] = useState<PublicSettings>({ hasApiKey: false, baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" });
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>("daily");
  const [letter, setLetter] = useState("");

  useEffect(() => {
    let isMounted = true;

    void Promise.all([
      loadState(),
      fetch("/api/settings", { cache: "no-store" }).then((response) => response.json() as Promise<PublicSettings>),
    ]).then(([savedState, savedSettings]) => {
        if (!isMounted) return;
        setState(savedState);
        setSettings(savedSettings);
        setHydrated(true);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void saveState(state);
  }, [hydrated, state]);

  const profile = useMemo(() => generateProfile(state.memories, defaultUserId), [state.memories]);
  const latestSimulation = state.simulations[0];

  async function addDailyLog(text: string) {
    setBusy(true);
    const date = new Date().toISOString().slice(0, 10);
    const id = `log_${crypto.randomUUID()}`;
    const createdAt = nowIso();
    const response = await fetch("/api/ai/memories", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, sourceId: id, userId: defaultUserId }),
    });
    const result = await response.json() as { memories: Memory[] };
    const incoming = result.memories ?? [];
    const fresh = mergeMemories(state.memories, incoming);
    const log: DailyLog = {
      id,
      userId: defaultUserId,
      date,
      rawText: text,
      extractedMemoryIds: fresh.map((memory) => memory.id),
      emotions: [],
      tags: [],
      createdAt,
      updatedAt: createdAt,
    };

    setState((current) => ({
      ...current,
      dailyLogs: [log, ...current.dailyLogs],
      memories: [...fresh, ...current.memories],
    }));
    setView("mirror");
    setBusy(false);
  }

  async function addDecision(decision: Omit<DecisionRecord, "id" | "userId" | "status" | "createdAt" | "updatedAt">) {
    setBusy(true);
    const createdAt = nowIso();
    const record: DecisionRecord = {
      ...decision,
      id: `dec_${crypto.randomUUID()}`,
      userId: defaultUserId,
      status: "open",
      createdAt,
      updatedAt: createdAt,
    };
    const response = await fetch("/api/ai/simulate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ decision: record, memories: state.memories.filter((memory) => memory.status === "active") }),
    });
    const result = await response.json() as { simulation: SimulationResult };
    const simulation = result.simulation;

    setState((current) => ({
      ...current,
      decisions: [record, ...current.decisions],
      simulations: [simulation, ...current.simulations],
    }));
    setView("decision");
    setBusy(false);
  }

  function deleteMemory(id: string) {
    setState((current) => ({
      ...current,
      memories: current.memories.map((memory) =>
        memory.id === id ? { ...memory, status: "deleted", updatedAt: nowIso() } : memory,
      ),
    }));
  }

  function clearAll() {
    setState(initialState);
    setLetter("");
  }

  async function createLetter(question: string, horizon: LetterHorizon) {
    setBusy(true);
    const response = await fetch("/api/ai/letter", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question, horizon, memories: state.memories.filter((memory) => memory.status === "active") }),
    });
    const result = await response.json() as { letter: string };
    setLetter(result.letter);
    setView("letters");
    setBusy(false);
  }

  async function saveSettings(apiKey: string, baseUrl: string, model: string) {
    setBusy(true);
    const response = await fetch("/api/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ apiKey, baseUrl, model }),
    });
    const savedSettings = await response.json() as PublicSettings;
    setSettings(savedSettings);
    setBusy(false);
  }

  const navItems = [
    { id: "daily" as const, label: "Daily Log", icon: BookOpen },
    { id: "decision" as const, label: "Decision", icon: GitBranch },
    { id: "mirror" as const, label: "Mirror", icon: Brain },
    { id: "timeline" as const, label: "Timeline", icon: CalendarDays },
    { id: "letters" as const, label: "Letters", icon: LetterText },
    { id: "settings" as const, label: "API Settings", icon: KeyRound },
  ];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
      <header className="mb-5 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="max-w-3xl">
          <p className="mb-2 inline-flex items-center gap-2 rounded-md bg-white/55 px-3 py-1 text-xs font-semibold text-[var(--accent)] ring-1 ring-[var(--line)]">
            <Sparkles size={14} />
            AnotherMe MVP
          </p>
          <h1 className="text-4xl font-semibold tracking-normal text-[var(--ink)] sm:text-5xl">AnotherMe</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg">
            A local-first personal mirror that remembers your choices, motives, and outcomes so you can explore possible futures before important decisions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`inline-flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition ${
                  view === item.id
                    ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                    : "border-[var(--line)] bg-white/55 text-[var(--ink)] hover:bg-white/80"
                }`}
                title={item.label}
              >
                <Icon size={17} />
                <span>{item.label}</span>
              </button>
            );
          })}
          <Link
            href="/trading"
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--line)] bg-white/55 px-3 py-2 text-sm font-medium text-[var(--ink)] transition hover:bg-white/80"
            title="A 股模拟交易"
          >
            <CandlestickChart size={17} />
            <span>A 股模拟</span>
          </Link>
        </div>
      </header>

      <section className="grid flex-1 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div className="surface rounded-lg p-4 shadow-sm sm:p-5">
          {view === "daily" && <DailyLogPanel busy={busy} onSubmit={addDailyLog} />}
          {view === "decision" && (
            <DecisionPanel busy={busy} onSubmit={addDecision} simulation={latestSimulation} memoriesCount={state.memories.length} />
          )}
          {view === "mirror" && <MirrorPanel profile={profile} memories={state.memories} onDelete={deleteMemory} />}
          {view === "timeline" && <TimelinePanel state={state} />}
          {view === "letters" && <LettersPanel busy={busy} onSubmit={createLetter} letter={letter} />}
          {view === "settings" && <SettingsPanel busy={busy} settings={settings} onSubmit={saveSettings} />}
        </div>

        <aside className="flex flex-col gap-4">
          <StatusPanel state={state} settings={settings} hydrated={hydrated} onClear={clearAll} />
          <MemoryPreview memories={state.memories} onDelete={deleteMemory} />
          <SafetyPanel />
        </aside>
      </section>
    </main>
  );
}

function DailyLogPanel({ busy, onSubmit }: { busy: boolean; onSubmit: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");

  return (
    <section>
      <div className="mb-5 flex items-center gap-3">
        <BookOpen className="text-[var(--accent)]" />
        <div>
          <h2 className="text-2xl font-semibold">Start Today&apos;s Log</h2>
          <p className="text-sm text-[var(--muted)]">Write naturally. AnotherMe will turn it into structured memories.</p>
        </div>
      </div>
      <label className="mb-2 block text-sm font-semibold">What happened today? What mattered, and why?</label>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={12}
        className="w-full resize-none p-3 leading-7"
        placeholder="Example: Today I felt excited about building a new AI agent, but I also worried that I might start another project and fail to finish it."
      />
      <div className="mt-4 flex flex-wrap gap-3">
        <PrimaryButton disabled={busy || text.trim().length < 8} onClick={() => {
          void onSubmit(text);
          setText("");
        }}>
          <Sparkles size={17} />
          Save and Extract Memories
        </PrimaryButton>
        <GhostButton onClick={() => setText("Today I felt excited about building AnotherMe, a personal mirror that can understand my life choices. I also worried that I might be opening another ambitious project and not finishing it.")}>
          Use Sample
        </GhostButton>
      </div>
    </section>
  );
}

function DecisionPanel({
  onSubmit,
  simulation,
  memoriesCount,
  busy,
}: {
  onSubmit: (decision: Omit<DecisionRecord, "id" | "userId" | "status" | "createdAt" | "updatedAt">) => Promise<void>;
  simulation?: SimulationResult;
  memoriesCount: number;
  busy: boolean;
}) {
  const [context, setContext] = useState("");
  const [optionA, setOptionA] = useState("");
  const [optionB, setOptionB] = useState("");
  const [preference, setPreference] = useState("");
  const [fear, setFear] = useState("");
  const [desire, setDesire] = useState("");

  function submit() {
    void onSubmit({
      title: context.slice(0, 42) || "New important decision",
      context,
      options: [
        { id: "A", label: "A", description: optionA },
        { id: "B", label: "B", description: optionB },
      ],
      userInitialPreference: preference,
      fears: fear ? [fear] : [],
      desires: desire ? [desire] : [],
      affectedAreas: [],
    });
  }

  return (
    <section>
      <div className="mb-5 flex items-center gap-3">
        <GitBranch className="text-[var(--accent)]" />
        <div>
          <h2 className="text-2xl font-semibold">Ask Another Me</h2>
          <p className="text-sm text-[var(--muted)]">{memoriesCount} memories are available. More memories make simulations more personal.</p>
        </div>
      </div>
      <div className="grid gap-3">
        <textarea rows={4} value={context} onChange={(event) => setContext(event.target.value)} className="w-full p-3" placeholder="The decision I am facing is..." />
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={optionA} onChange={(event) => setOptionA(event.target.value)} className="min-h-11 px-3" placeholder="Option A" />
          <input value={optionB} onChange={(event) => setOptionB(event.target.value)} className="min-h-11 px-3" placeholder="Option B" />
        </div>
        <input value={preference} onChange={(event) => setPreference(event.target.value)} className="min-h-11 px-3" placeholder="Right now I lean toward..." />
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={fear} onChange={(event) => setFear(event.target.value)} className="min-h-11 px-3" placeholder="I am afraid that..." />
          <input value={desire} onChange={(event) => setDesire(event.target.value)} className="min-h-11 px-3" placeholder="I hope that..." />
        </div>
      </div>
      <div className="mt-4">
        <PrimaryButton disabled={busy || !context || !optionA || !optionB} onClick={submit}>
          <GitBranch size={17} />
          Generate Future Branches
        </PrimaryButton>
      </div>
      {simulation && <SimulationView simulation={simulation} />}
    </section>
  );
}

function SimulationView({ simulation }: { simulation: SimulationResult }) {
  return (
    <article className="mt-6 rounded-lg border border-[var(--line)] bg-white/55 p-4">
      <h3 className="text-xl font-semibold">How AnotherMe Reads This Choice</h3>
      <div className="mt-4 grid gap-4">
        <Section title="1. The Real Tension" body={simulation.coreConflict} />
        <Section title="2. What Your Past Self Might Choose" body={simulation.likelyPastChoice} />
        {simulation.branches.map((branch) => (
          <div key={branch.optionLabel} className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-3">
            <h4 className="font-semibold">Option {branch.optionLabel}: Future Branch</h4>
            <p className="mt-2 text-sm leading-6"><strong>After 1 year: </strong>{branch.oneYear}</p>
            <p className="mt-2 text-sm leading-6"><strong>After 3 years: </strong>{branch.threeYears}</p>
            <p className="mt-2 text-sm leading-6"><strong>After 10 years: </strong>{branch.tenYears}</p>
          </div>
        ))}
        <Section title="Inertia Patterns" body={simulation.inertiaPatterns.join(" ")} />
        <Section title="Potential Blind Spots" body={simulation.blindSpots.join(" ")} />
        <Section title="How Your Future Self Might View Today" body={simulation.futureEvaluation} />
        <Section title="Smallest Useful Action Now" body={simulation.minimumAction} />
        <p className="rounded-md bg-[var(--panel-strong)] p-3 text-sm leading-6 text-[var(--muted)]">{simulation.uncertaintyNote}</p>
      </div>
    </article>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <section>
      <h4 className="font-semibold">{title}</h4>
      <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{body}</p>
    </section>
  );
}

function MirrorPanel({
  profile,
  memories,
  onDelete,
}: {
  profile: ReturnType<typeof generateProfile>;
  memories: Memory[];
  onDelete: (id: string) => void;
}) {
  const active = memories.filter((memory) => memory.status === "active");

  return (
    <section>
      <div className="mb-5 flex items-center gap-3">
        <Brain className="text-[var(--accent)]" />
        <div>
          <h2 className="text-2xl font-semibold">My Mirror</h2>
          <p className="text-sm text-[var(--muted)]">This profile changes as you add logs and reviews.</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <ProfileTile title="Decision Style" body={profile.decisionStyle} />
        <ProfileTile title="Risk Preference" body={profile.riskPreference} />
        <ProfileTile title="Motivation Pattern" body={profile.motivationPattern} />
        <ProfileTile title="Stress Pattern" body={profile.stressPattern} />
      </div>
      <h3 className="mt-6 text-lg font-semibold">Memory Cards</h3>
      <div className="mt-3 grid gap-3">
        {active.length === 0 ? (
          <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-sm text-[var(--muted)]">No memories yet. Start by writing a daily log.</p>
        ) : (
          active.map((memory) => <MemoryCard key={memory.id} memory={memory} onDelete={onDelete} />)
        )}
      </div>
    </section>
  );
}

function ProfileTile({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-white/55 p-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{body}</p>
    </div>
  );
}

function MemoryCard({ memory, onDelete }: { memory: Memory; onDelete: (id: string) => void }) {
  return (
    <article className="rounded-lg border border-[var(--line)] bg-white/55 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold">{memory.title}</h4>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Type: {labelForMemory(memory.type)} · Confidence: {memory.confidence.toFixed(2)} · Importance: {memory.importance}/10
          </p>
        </div>
        <button title="Delete memory" onClick={() => onDelete(memory.id)} className="rounded-md p-2 text-[var(--danger)] hover:bg-white">
          <Trash2 size={16} />
        </button>
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{memory.content}</p>
    </article>
  );
}

function TimelinePanel({ state }: { state: AppState }) {
  const items = [
    ...state.dailyLogs.map((log) => ({ id: log.id, at: log.createdAt, title: "Daily Log", body: log.rawText })),
    ...state.decisions.map((decision) => ({ id: decision.id, at: decision.createdAt, title: "Important Decision", body: decision.context })),
  ].sort((a, b) => +new Date(b.at) - +new Date(a.at));

  return (
    <section>
      <div className="mb-5 flex items-center gap-3">
        <CalendarDays className="text-[var(--accent)]" />
        <div>
          <h2 className="text-2xl font-semibold">Timeline</h2>
          <p className="text-sm text-[var(--muted)]">Review events, choices, and outcomes over time.</p>
        </div>
      </div>
      <div className="grid gap-3">
        {items.length === 0 ? (
          <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-sm text-[var(--muted)]">Your timeline is empty. Add your first daily log to begin.</p>
        ) : (
          items.map((item) => (
            <article key={item.id} className="rounded-lg border border-[var(--line)] bg-white/55 p-3">
              <p className="text-xs text-[var(--muted)]">{new Date(item.at).toLocaleString("en-US")}</p>
              <h3 className="mt-1 font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.body}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function LettersPanel({ busy, onSubmit, letter }: { busy: boolean; onSubmit: (question: string, horizon: LetterHorizon) => Promise<void>; letter: string }) {
  const [question, setQuestion] = useState("");
  const [horizon, setHorizon] = useState<LetterHorizon>("3");

  return (
    <section>
      <div className="mb-5 flex items-center gap-3">
        <LetterText className="text-[var(--accent)]" />
        <div>
          <h2 className="text-2xl font-semibold">Letters From Future Me</h2>
          <p className="text-sm text-[var(--muted)]">Grounded in your memories, not generic encouragement.</p>
        </div>
      </div>
      <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={5} className="w-full p-3" placeholder="What do you want to ask your future self?" />
      <div className="mt-3 flex flex-wrap gap-3">
        <select value={horizon} onChange={(event) => setHorizon(event.target.value as LetterHorizon)} className="min-h-11 px-3">
          <option value="1">1 year from now</option>
          <option value="3">3 years from now</option>
          <option value="10">10 years from now</option>
          <option value="20">20 years from now</option>
        </select>
        <PrimaryButton disabled={busy} onClick={() => void onSubmit(question, horizon)}>
          <LetterText size={17} />
          Generate Letter
        </PrimaryButton>
      </div>
      {letter && <pre className="mt-5 whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-white/60 p-4 text-sm leading-7 text-[var(--ink)]">{letter}</pre>}
    </section>
  );
}

function SettingsPanel({
  busy,
  settings,
  onSubmit,
}: {
  busy: boolean;
  settings: PublicSettings;
  onSubmit: (apiKey: string, baseUrl: string, model: string) => Promise<void>;
}) {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [model, setModel] = useState(settings.model);
  const presets = [
    { label: "Claude", baseUrl: "https://api.anthropic.com", model: "claude-opus-5-5" },
    { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" },
    { label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
    { label: "Qwen", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
    { label: "Kimi", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
  ];

  return (
    <section>
      <div className="mb-5 flex items-center gap-3">
        <KeyRound className="text-[var(--accent)]" />
        <div>
          <h2 className="text-2xl font-semibold">API Settings</h2>
          <p className="text-sm text-[var(--muted)]">Use Claude (Anthropic API) or any OpenAI-compatible API. Base URL, model, and API key stay on this device.</p>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {presets.map((preset) => (
          <GhostButton key={preset.label} onClick={() => {
            setBaseUrl(preset.baseUrl);
            setModel(preset.model);
          }}>
            {preset.label}
          </GhostButton>
        ))}
      </div>
      <div className="grid gap-3">
        <label className="grid gap-2 text-sm font-semibold">
          Base URL
          <input
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            className="min-h-11 px-3"
            placeholder="https://api.openai.com/v1"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          API Key
          <input
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            className="min-h-11 px-3"
            placeholder={settings.maskedApiKey ?? "sk-..."}
            type="password"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Model
          <input value={model} onChange={(event) => setModel(event.target.value)} className="min-h-11 px-3" placeholder="deepseek-chat / qwen-plus / moonshot-v1-8k" />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <PrimaryButton disabled={busy || !baseUrl.trim() || !model.trim()} onClick={() => void onSubmit(apiKey, baseUrl, model)}>
          <KeyRound size={17} />
          Save Local Settings
        </PrimaryButton>
        <span className="text-sm text-[var(--muted)]">
          {settings.hasApiKey ? `Configured: ${settings.maskedApiKey} · ${settings.model}` : "No API key yet. Local fallback is active."}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
        Claude uses `https://api.anthropic.com` with an Anthropic API key (sk-ant-...). DeepSeek uses `https://api.deepseek.com/v1`, Qwen uses `https://dashscope.aliyuncs.com/compatible-mode/v1`, and Kimi uses `https://api.moonshot.cn/v1`.
      </p>
    </section>
  );
}

function StatusPanel({ state, settings, hydrated, onClear }: { state: AppState; settings: PublicSettings; hydrated: boolean; onClear: () => void }) {
  return (
    <section className="surface rounded-lg p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Local Status</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {hydrated ? `Data is saved locally. ${settings.hasApiKey ? "AI is configured." : "No API key configured."}` : "Loading local files..."}
          </p>
        </div>
        <button onClick={onClear} title="Clear all data" className="rounded-md p-2 text-[var(--danger)] hover:bg-white/70">
          <Trash2 size={17} />
        </button>
      </div>
      <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
        <Metric label="Logs" value={state.dailyLogs.length} />
        <Metric label="Memories" value={state.memories.filter((memory) => memory.status === "active").length} />
        <Metric label="Decisions" value={state.decisions.length} />
        <Metric label="Sims" value={state.simulations.length} />
      </dl>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-white/50 p-2">
      <dt className="text-xs text-[var(--muted)]">{label}</dt>
      <dd className="font-mono text-xl font-semibold">{value}</dd>
    </div>
  );
}

function MemoryPreview({ memories, onDelete }: { memories: Memory[]; onDelete: (id: string) => void }) {
  const active = memories.filter((memory) => memory.status === "active").slice(0, 3);

  return (
    <section className="surface rounded-lg p-4 shadow-sm">
      <h2 className="font-semibold">Recent Memories</h2>
      <div className="mt-3 grid gap-2">
        {active.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Memory evidence will appear after you add logs.</p>
        ) : (
          active.map((memory) => <MemoryCard key={memory.id} memory={memory} onDelete={onDelete} />)
        )}
      </div>
    </section>
  );
}

function SafetyPanel() {
  return (
    <section className="surface rounded-lg p-4 shadow-sm">
      <div className="flex gap-3">
        <ShieldCheck className="mt-1 shrink-0 text-[var(--accent)]" />
        <div>
          <h2 className="font-semibold">Safety Boundaries</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            For medical, legal, financial, mental-health, or personal-safety topics, AnotherMe only helps organize context, surface risks, and suggest small validation steps.
          </p>
        </div>
      </div>
    </section>
  );
}

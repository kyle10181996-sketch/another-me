"use client";

import { BookOpen, Brain, CalendarDays, GitBranch, KeyRound, LetterText, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
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
    fact: "事实",
    preference: "偏好",
    value: "价值观",
    pattern: "行为模式",
    fear: "恐惧",
    desire: "愿望",
    relationship: "关系",
    goal: "目标",
    lesson: "经验",
    blind_spot: "盲区",
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
  const [settings, setSettings] = useState<PublicSettings>({ hasApiKey: false, model: "gpt-4.1-mini" });
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

  async function saveSettings(apiKey: string, model: string) {
    setBusy(true);
    const response = await fetch("/api/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ apiKey, model }),
    });
    const savedSettings = await response.json() as PublicSettings;
    setSettings(savedSettings);
    setBusy(false);
  }

  const navItems = [
    { id: "daily" as const, label: "每日记录", icon: BookOpen },
    { id: "decision" as const, label: "决策模拟", icon: GitBranch },
    { id: "mirror" as const, label: "我的镜像", icon: Brain },
    { id: "timeline" as const, label: "时间线", icon: CalendarDays },
    { id: "letters" as const, label: "未来来信", icon: LetterText },
    { id: "settings" as const, label: "API 设置", icon: KeyRound },
  ];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
      <header className="mb-5 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="max-w-3xl">
          <p className="mb-2 inline-flex items-center gap-2 rounded-md bg-white/55 px-3 py-1 text-xs font-semibold text-[var(--accent)] ring-1 ring-[var(--line)]">
            <Sparkles size={14} />
            AnotherMe MVP
          </p>
          <h1 className="text-4xl font-semibold tracking-normal text-[var(--ink)] sm:text-5xl">世另我</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg">
            世界上另一个你，替你预演没走的路。记录经历、选择和结果，在关键节点前看见不同人生分支。
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
          <h2 className="text-2xl font-semibold">开始记录今天</h2>
          <p className="text-sm text-[var(--muted)]">写自然语言即可，系统会拆成结构化记忆。</p>
        </div>
      </div>
      <label className="mb-2 block text-sm font-semibold">今天发生了什么？做了什么重要决定？为什么？</label>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={12}
        className="w-full resize-none p-3 leading-7"
        placeholder="例如：今天我又想做一个新的 AI agent 项目，名字叫世另我。我很兴奋，但也担心自己又开了一个新坑，最后没有坚持做完。"
      />
      <div className="mt-4 flex flex-wrap gap-3">
        <PrimaryButton disabled={busy || text.trim().length < 8} onClick={() => {
          void onSubmit(text);
          setText("");
        }}>
          <Sparkles size={17} />
          保存并生成今日记忆
        </PrimaryButton>
        <GhostButton onClick={() => setText("今天我又想做一个新的 AI agent 项目，名字叫世另我。我很兴奋，因为它像是一个能理解我人生选择的数字分身。但我也担心自己又开了一个新坑，最后没有坚持做完。")}>
          使用种子示例
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
      title: context.slice(0, 42) || "新的重大决策",
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
          <h2 className="text-2xl font-semibold">问问另一个我</h2>
          <p className="text-sm text-[var(--muted)]">当前有 {memoriesCount} 条可用记忆，记忆越多，模拟越像你。</p>
        </div>
      </div>
      <div className="grid gap-3">
        <textarea rows={4} value={context} onChange={(event) => setContext(event.target.value)} className="w-full p-3" placeholder="我现在面临的选择是..." />
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={optionA} onChange={(event) => setOptionA(event.target.value)} className="min-h-11 px-3" placeholder="选项 A" />
          <input value={optionB} onChange={(event) => setOptionB(event.target.value)} className="min-h-11 px-3" placeholder="选项 B" />
        </div>
        <input value={preference} onChange={(event) => setPreference(event.target.value)} className="min-h-11 px-3" placeholder="我目前更倾向于..." />
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={fear} onChange={(event) => setFear(event.target.value)} className="min-h-11 px-3" placeholder="我害怕..." />
          <input value={desire} onChange={(event) => setDesire(event.target.value)} className="min-h-11 px-3" placeholder="我期待..." />
        </div>
      </div>
      <div className="mt-4">
        <PrimaryButton disabled={busy || !context || !optionA || !optionB} onClick={submit}>
          <GitBranch size={17} />
          生成未来分支
        </PrimaryButton>
      </div>
      {simulation && <SimulationView simulation={simulation} />}
    </section>
  );
}

function SimulationView({ simulation }: { simulation: SimulationResult }) {
  return (
    <article className="mt-6 rounded-lg border border-[var(--line)] bg-white/55 p-4">
      <h3 className="text-xl font-semibold">另一个我怎么看这个选择</h3>
      <div className="mt-4 grid gap-4">
        <Section title="1. 你真正纠结的核心" body={simulation.coreConflict} />
        <Section title="2. 根据过去的你，你可能会怎么选" body={simulation.likelyPastChoice} />
        {simulation.branches.map((branch) => (
          <div key={branch.optionLabel} className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-3">
            <h4 className="font-semibold">选择 {branch.optionLabel}：未来分支</h4>
            <p className="mt-2 text-sm leading-6"><strong>1 年后：</strong>{branch.oneYear}</p>
            <p className="mt-2 text-sm leading-6"><strong>3 年后：</strong>{branch.threeYears}</p>
            <p className="mt-2 text-sm leading-6"><strong>10 年后：</strong>{branch.tenYears}</p>
          </div>
        ))}
        <Section title="惯性模式" body={simulation.inertiaPatterns.join(" ")} />
        <Section title="可能忽视的盲区" body={simulation.blindSpots.join(" ")} />
        <Section title="未来的你可能如何评价今天" body={simulation.futureEvaluation} />
        <Section title="现在最小可行行动" body={simulation.minimumAction} />
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
          <h2 className="text-2xl font-semibold">我的镜像</h2>
          <p className="text-sm text-[var(--muted)]">动态画像会随着记录和复盘改变。</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <ProfileTile title="决策风格" body={profile.decisionStyle} />
        <ProfileTile title="风险偏好" body={profile.riskPreference} />
        <ProfileTile title="动力模式" body={profile.motivationPattern} />
        <ProfileTile title="压力模式" body={profile.stressPattern} />
      </div>
      <h3 className="mt-6 text-lg font-semibold">记忆卡片</h3>
      <div className="mt-3 grid gap-3">
        {active.length === 0 ? (
          <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-sm text-[var(--muted)]">还没有记忆。先去“每日记录”写一段今天的经历。</p>
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
            类型：{labelForMemory(memory.type)} · 置信度：{memory.confidence.toFixed(2)} · 重要性：{memory.importance}/10
          </p>
        </div>
        <button title="删除记忆" onClick={() => onDelete(memory.id)} className="rounded-md p-2 text-[var(--danger)] hover:bg-white">
          <Trash2 size={16} />
        </button>
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{memory.content}</p>
    </article>
  );
}

function TimelinePanel({ state }: { state: AppState }) {
  const items = [
    ...state.dailyLogs.map((log) => ({ id: log.id, at: log.createdAt, title: "每日记录", body: log.rawText })),
    ...state.decisions.map((decision) => ({ id: decision.id, at: decision.createdAt, title: "重大决策", body: decision.context })),
  ].sort((a, b) => +new Date(b.at) - +new Date(a.at));

  return (
    <section>
      <div className="mb-5 flex items-center gap-3">
        <CalendarDays className="text-[var(--accent)]" />
        <div>
          <h2 className="text-2xl font-semibold">人生时间线</h2>
          <p className="text-sm text-[var(--muted)]">按时间查看事件、选择和结果。</p>
        </div>
      </div>
      <div className="grid gap-3">
        {items.length === 0 ? (
          <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-sm text-[var(--muted)]">时间线还空着。记录第一天后，这里会开始出现你的轨迹。</p>
        ) : (
          items.map((item) => (
            <article key={item.id} className="rounded-lg border border-[var(--line)] bg-white/55 p-3">
              <p className="text-xs text-[var(--muted)]">{new Date(item.at).toLocaleString("zh-CN")}</p>
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
          <h2 className="text-2xl font-semibold">未来的我写信</h2>
          <p className="text-sm text-[var(--muted)]">基于已有记忆，而不是空泛鼓励。</p>
        </div>
      </div>
      <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={5} className="w-full p-3" placeholder="想问未来的自己什么？" />
      <div className="mt-3 flex flex-wrap gap-3">
        <select value={horizon} onChange={(event) => setHorizon(event.target.value as LetterHorizon)} className="min-h-11 px-3">
          <option value="1">来自 1 年后的我</option>
          <option value="3">来自 3 年后的我</option>
          <option value="10">来自 10 年后的我</option>
          <option value="20">来自 20 年后的我</option>
        </select>
        <PrimaryButton disabled={busy} onClick={() => void onSubmit(question, horizon)}>
          <LetterText size={17} />
          生成来信
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
  onSubmit: (apiKey: string, model: string) => Promise<void>;
}) {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(settings.model);

  return (
    <section>
      <div className="mb-5 flex items-center gap-3">
        <KeyRound className="text-[var(--accent)]" />
        <div>
          <h2 className="text-2xl font-semibold">API 设置</h2>
          <p className="text-sm text-[var(--muted)]">API Key 只保存在本机 `data/settings.json`，不会上传到 GitHub。</p>
        </div>
      </div>
      <div className="grid gap-3">
        <label className="grid gap-2 text-sm font-semibold">
          OpenAI API Key
          <input
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            className="min-h-11 px-3"
            placeholder={settings.maskedApiKey ?? "sk-..."}
            type="password"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          模型
          <input value={model} onChange={(event) => setModel(event.target.value)} className="min-h-11 px-3" placeholder="gpt-4.1-mini" />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <PrimaryButton disabled={busy || !model.trim()} onClick={() => void onSubmit(apiKey, model)}>
          <KeyRound size={17} />
          保存本地设置
        </PrimaryButton>
        <span className="text-sm text-[var(--muted)]">
          {settings.hasApiKey ? `已配置：${settings.maskedApiKey}` : "尚未配置 API Key，当前会使用本地模拟。"}
        </span>
      </div>
    </section>
  );
}

function StatusPanel({ state, settings, hydrated, onClear }: { state: AppState; settings: PublicSettings; hydrated: boolean; onClear: () => void }) {
  return (
    <section className="surface rounded-lg p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">本地原型状态</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {hydrated ? `数据已保存到项目本地文件。${settings.hasApiKey ? "AI 已配置。" : "未配置 API Key。"}` : "正在读取本地文件..."}
          </p>
        </div>
        <button onClick={onClear} title="清空全部数据" className="rounded-md p-2 text-[var(--danger)] hover:bg-white/70">
          <Trash2 size={17} />
        </button>
      </div>
      <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
        <Metric label="记录" value={state.dailyLogs.length} />
        <Metric label="记忆" value={state.memories.filter((memory) => memory.status === "active").length} />
        <Metric label="决策" value={state.decisions.length} />
        <Metric label="模拟" value={state.simulations.length} />
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
      <h2 className="font-semibold">最近记忆</h2>
      <div className="mt-3 grid gap-2">
        {active.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">新增记录后会显示记忆依据。</p>
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
          <h2 className="font-semibold">安全边界</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            涉及医疗、法律、投资、借贷、心理危机和人身安全时，系统只做辅助整理、风险提示和小步验证，不做确定性建议。
          </p>
        </div>
      </div>
    </section>
  );
}

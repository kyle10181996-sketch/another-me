import type { Memory, MemoryType } from "@/lib/types";
import { classifyRisk } from "@/lib/safety/classify-risk";

const typeRules: Array<{ type: MemoryType; title: string; terms: string[] }> = [
  { type: "fear", title: "反复出现的担心", terms: ["担心", "害怕", "焦虑", "怕"] },
  { type: "desire", title: "被点亮的愿望", terms: ["希望", "想", "期待", "兴奋"] },
  { type: "lesson", title: "近期学到的经验", terms: ["学到", "意识到", "复盘", "下次"] },
  { type: "blind_spot", title: "可能需要留意的盲区", terms: ["又", "总是", "忍不住", "拖延"] },
  { type: "value", title: "正在浮现的价值观", terms: ["重要", "在乎", "长期", "价值"] },
  { type: "goal", title: "正在靠近的目标", terms: ["目标", "计划", "完成", "坚持"] },
];

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function extractMemories(rawText: string, sourceId: string, userId: string): Memory[] {
  const now = new Date().toISOString();
  const selectedRules = typeRules.filter((rule) => hasAny(rawText, rule.terms));
  const rules = selectedRules.length > 0 ? selectedRules : [typeRules[0], typeRules[1]];
  const riskType = classifyRisk(rawText);

  return rules.slice(0, 4).map((rule, index) => ({
    id: makeId("mem"),
    userId,
    type: rule.type,
    title: rule.title,
    content: buildMemoryContent(rawText, rule.type),
    evidenceIds: [sourceId],
    confidence: Math.max(0.52, 0.78 - index * 0.08),
    importance: Math.max(5, 8 - index),
    visibility: riskType === "none" ? "normal" : "sensitive",
    status: "active",
    createdAt: now,
    updatedAt: now,
  }));
}

function buildMemoryContent(rawText: string, type: MemoryType) {
  const compact = rawText.trim().replace(/\s+/g, " ");
  const excerpt = compact.length > 96 ? `${compact.slice(0, 96)}...` : compact;

  if (type === "fear") return `用户在这段记录中呈现出需要被认真看见的担心：${excerpt}`;
  if (type === "desire") return `用户被某个方向吸引，并期待它能带来改变：${excerpt}`;
  if (type === "blind_spot") return `这段记录提示一个需要小步验证的盲区，避免把兴奋直接变成过大的承诺：${excerpt}`;
  if (type === "value") return `用户可能正在强调一个长期价值，但仍需要更多记录验证：${excerpt}`;
  if (type === "goal") return `用户表达了一个可以拆成近期行动的目标：${excerpt}`;
  if (type === "lesson") return `用户从近期经历中提炼了一个可复用经验：${excerpt}`;
  return excerpt;
}

export function mergeMemories(existing: Memory[], incoming: Memory[]) {
  const active = existing.filter((memory) => memory.status !== "deleted");
  return incoming.filter((memory) => {
    return !active.some((item) => item.type === memory.type && item.content === memory.content);
  });
}

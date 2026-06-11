import type { Memory, MemoryType } from "@/lib/types";
import { classifyRisk } from "@/lib/safety/classify-risk";

const typeRules: Array<{ type: MemoryType; title: string; terms: string[] }> = [
  { type: "fear", title: "Recurring concern", terms: ["worry", "afraid", "fear", "anxious", "concern"] },
  { type: "desire", title: "Emerging desire", terms: ["want", "hope", "excited", "expect", "wish"] },
  { type: "lesson", title: "Recent lesson", terms: ["learned", "realized", "review", "next time"] },
  { type: "blind_spot", title: "Possible blind spot", terms: ["again", "always", "can't help", "procrastinate"] },
  { type: "value", title: "Emerging value", terms: ["important", "care", "long-term", "value"] },
  { type: "goal", title: "Active goal", terms: ["goal", "plan", "finish", "commit"] },
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

  if (type === "fear") return `This log points to a concern that should be taken seriously: ${excerpt}`;
  if (type === "desire") return `The user seems drawn toward a direction they hope could create change: ${excerpt}`;
  if (type === "blind_spot") return `This log suggests a blind spot worth testing in small steps before turning excitement into a large commitment: ${excerpt}`;
  if (type === "value") return `The user may be emphasizing a long-term value, though more evidence would help confirm it: ${excerpt}`;
  if (type === "goal") return `The user expressed a goal that can be broken into near-term action: ${excerpt}`;
  if (type === "lesson") return `The user extracted a reusable lesson from recent experience: ${excerpt}`;
  return excerpt;
}

export function mergeMemories(existing: Memory[], incoming: Memory[]) {
  const active = existing.filter((memory) => memory.status !== "deleted");
  return incoming.filter((memory) => {
    return !active.some((item) => item.type === memory.type && item.content === memory.content);
  });
}

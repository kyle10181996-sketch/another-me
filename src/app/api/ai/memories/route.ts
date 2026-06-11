import { NextResponse } from "next/server";
import { generateJson, hasConfiguredApiKey } from "@/lib/ai/openai-responses";
import { extractMemories } from "@/lib/memory/memory-extractor";
import type { Memory, MemoryType } from "@/lib/types";

type MemoryDraft = {
  type: MemoryType;
  title: string;
  content: string;
  confidence: number;
  importance: number;
  visibility?: Memory["visibility"];
};

const allowedTypes: MemoryType[] = ["fact", "preference", "value", "pattern", "fear", "desire", "relationship", "goal", "lesson", "blind_spot"];

export async function POST(request: Request) {
  const body = await request.json();
  const text = typeof body.text === "string" ? body.text : "";
  const sourceId = typeof body.sourceId === "string" ? body.sourceId : `log_${crypto.randomUUID()}`;
  const userId = typeof body.userId === "string" ? body.userId : "local-user";

  if (!text.trim()) {
    return NextResponse.json({ memories: [] });
  }

  if (!(await hasConfiguredApiKey())) {
    return NextResponse.json({ memories: extractMemories(text, sourceId, userId), provider: "local" });
  }

  try {
    const result = await generateJson<{ memories: MemoryDraft[] }>({
      instructions: "You are AnotherMe's memory extraction module. Output JSON only. Do not use Markdown. Do not exaggerate or turn one-off events into permanent personality claims. If evidence is weak, confidence must not exceed 0.6.",
      input: `Extract 2 to 6 long-term memories from this user log. Each memory must include type,title,content,confidence,importance,visibility.\nAllowed types: ${allowedTypes.join(", ")}.\nUser text: ${text}`,
    });
    const now = new Date().toISOString();
    const memories = (result.memories ?? [])
      .filter((memory) => allowedTypes.includes(memory.type))
      .slice(0, 6)
      .map<Memory>((memory, index) => ({
        id: `mem_${crypto.randomUUID()}`,
        userId,
        type: memory.type,
        title: memory.title || "New memory",
        content: memory.content,
        evidenceIds: [sourceId],
        confidence: Math.min(0.95, Math.max(0.1, Number(memory.confidence) || 0.55)),
        importance: Math.min(10, Math.max(1, Number(memory.importance) || 6 + index)),
        visibility: memory.visibility ?? "normal",
        status: "active",
        createdAt: now,
        updatedAt: now,
      }));

    return NextResponse.json({ memories, provider: "openai" });
  } catch {
    return NextResponse.json({ memories: extractMemories(text, sourceId, userId), provider: "local-fallback" });
  }
}

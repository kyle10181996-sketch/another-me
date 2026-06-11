import { NextResponse } from "next/server";
import { generateJson, hasConfiguredApiKey } from "@/lib/ai/openai-responses";
import { writeFutureLetter, type LetterHorizon } from "@/lib/ai/letter-writer";
import type { Memory } from "@/lib/types";

export async function POST(request: Request) {
  const body = await request.json();
  const question = typeof body.question === "string" ? body.question : "";
  const horizon = (typeof body.horizon === "string" ? body.horizon : "3") as LetterHorizon;
  const memories = Array.isArray(body.memories) ? body.memories as Memory[] : [];

  if (!(await hasConfiguredApiKey())) {
    return NextResponse.json({ letter: writeFutureLetter(question, horizon, memories), provider: "local" });
  }

  try {
    const result = await generateJson<{ letter: string }>({
      instructions: "你是“未来的我”写信模块。语气真诚、克制、有洞察，不要鸡汤，不要玄学。只输出 JSON: {\"letter\":\"...\"}。",
      input: `请以 ${horizon} 年后的用户口吻，基于真实记忆给现在的用户写一封信，最后给出一个立刻可执行的小行动。\n问题：${question}\n记忆：${JSON.stringify(memories.slice(0, 8))}`,
    });

    return NextResponse.json({ letter: result.letter || writeFutureLetter(question, horizon, memories), provider: "openai" });
  } catch {
    return NextResponse.json({ letter: writeFutureLetter(question, horizon, memories), provider: "local-fallback" });
  }
}

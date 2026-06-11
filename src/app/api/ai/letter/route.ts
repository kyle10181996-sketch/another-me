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
      instructions: "You are the future-self letter module. Be sincere, restrained, and insightful. Avoid generic motivational language and mysticism. Output JSON only: {\"letter\":\"...\"}.",
      input: `Write a letter from the user's perspective ${horizon} years in the future, grounded in real memories. End with one small action they can take immediately.\nQuestion: ${question}\nMemories: ${JSON.stringify(memories.slice(0, 8))}`,
    });

    return NextResponse.json({ letter: result.letter || writeFutureLetter(question, horizon, memories), provider: "openai" });
  } catch {
    return NextResponse.json({ letter: writeFutureLetter(question, horizon, memories), provider: "local-fallback" });
  }
}

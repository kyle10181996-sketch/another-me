import { NextResponse } from "next/server";
import { generateJson, hasConfiguredApiKey } from "@/lib/ai/openai-responses";
import { simulateDecision } from "@/lib/ai/decision-simulator";
import type { DecisionRecord, Memory, SimulationResult } from "@/lib/types";

export async function POST(request: Request) {
  const body = await request.json();
  const decision = body.decision as DecisionRecord;
  const memories = Array.isArray(body.memories) ? body.memories as Memory[] : [];

  if (!decision) {
    return NextResponse.json({ error: "Missing decision" }, { status: 400 });
  }

  if (!(await hasConfiguredApiKey())) {
    return NextResponse.json({ simulation: simulateDecision(decision, memories), provider: "local" });
  }

  try {
    const result = await generateJson<SimulationResult>({
      instructions: "你是“世另我”的决策模拟模块。不要预测命运，不替用户做决定。必须区分事实、推测和建议。只输出符合 TypeScript SimulationResult 结构的 JSON。",
      input: `请基于当前决策和相关记忆，生成可解释的 A/B 未来分支模拟。字段必须包含 id,decisionId,coreConflict,likelyPastChoice,branches,inertiaPatterns,blindSpots,futureEvaluation,evidence,minimumAction,uncertaintyNote,createdAt。\n当前决策：${JSON.stringify(decision)}\n相关记忆：${JSON.stringify(memories.slice(0, 8))}`,
    });

    return NextResponse.json({
      simulation: {
        ...result,
        id: result.id || `sim_${crypto.randomUUID()}`,
        decisionId: decision.id,
        createdAt: result.createdAt || new Date().toISOString(),
      },
      provider: "openai",
    });
  } catch {
    return NextResponse.json({ simulation: simulateDecision(decision, memories), provider: "local-fallback" });
  }
}

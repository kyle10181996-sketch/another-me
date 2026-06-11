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
      instructions: "You are AnotherMe's decision simulation module. Do not predict fate or make the final decision for the user. Separate facts, inferences, and suggestions. Output JSON matching the TypeScript SimulationResult structure.",
      input: `Generate an explainable A/B future-branch simulation based on the current decision and relevant memories. Required fields: id,decisionId,coreConflict,likelyPastChoice,branches,inertiaPatterns,blindSpots,futureEvaluation,evidence,minimumAction,uncertaintyNote,createdAt.\nCurrent decision: ${JSON.stringify(decision)}\nRelevant memories: ${JSON.stringify(memories.slice(0, 8))}`,
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

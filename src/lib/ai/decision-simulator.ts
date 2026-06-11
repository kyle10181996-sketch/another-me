import type { DecisionRecord, Memory, SimulationBranch, SimulationResult } from "@/lib/types";
import { retrieveRelevantMemories } from "@/lib/memory/retrieve-memory";
import { classifyRisk, getSafetyResponse } from "@/lib/safety/classify-risk";

function makeBranch(optionLabel: string, description: string, memories: Memory[], index: number): SimulationBranch {
  const anchor = memories[index % Math.max(memories.length, 1)];
  const evidence = anchor?.content ?? "There are not many memories yet, so this simulation should stay modest.";

  return {
    optionLabel,
    oneYear: `If you choose ${optionLabel}, the first year may mostly be an adaptation period. The visible outcome will revolve around "${description}". Based on the current memory base, the key is not proving the choice right immediately, but reviewing it honestly every 2 to 4 weeks.`,
    threeYears: `After three years, this branch may amplify one of your patterns: either turning excitement into sustained commitment, or losing patience if the scope grows too large. Evidence: ${evidence}`,
    tenYears: `Over a ten-year horizon, the value of ${optionLabel} is less about winning a single choice and more about whether it keeps aligning with your long-term values and leaves reusable lessons.`,
    benefits: ["May align more closely with current motivation", "Can create new information and real feedback", "May turn into reusable decision experience"],
    risks: ["Early excitement may hide execution costs", "Without a review rhythm, the choice may become pressure", "External changes can reduce the reliability of this simulation"],
    regretProbability: memories.length < 3 ? "unknown" : index === 0 ? "medium" : "low",
  };
}

export function simulateDecision(decision: DecisionRecord, memories: Memory[]): SimulationResult {
  const risk = classifyRisk(`${decision.context} ${decision.fears.join(" ")} ${decision.desires.join(" ")}`);
  const relevant = retrieveRelevantMemories(memories, decision.context, 8);
  const safety = getSafetyResponse(risk);
  const now = new Date().toISOString();

  if (risk === "crisis") {
    return {
      id: `sim_${crypto.randomUUID()}`,
      decisionId: decision.id,
      coreConflict: safety ?? "This input triggered safety support mode.",
      likelyPastChoice: "This situation is not suitable for future simulation.",
      branches: [],
      inertiaPatterns: [],
      blindSpots: ["The immediate priority is real-world safety and trusted human support."],
      futureEvaluation: "It will be more reliable to revisit this choice after safety and stability are restored.",
      evidence: ["The user input triggered self-harm or severe crisis risk terms."],
      minimumAction: "Contact someone you trust now, or contact local emergency services.",
      uncertaintyNote: "Safety takes priority over simulation. No prediction is provided.",
      createdAt: now,
    };
  }

  const branches = decision.options.map((option, index) =>
    makeBranch(option.label, option.description, relevant, index),
  );

  return {
    id: `sim_${crypto.randomUUID()}`,
    decisionId: decision.id,
    coreConflict: `The real tension may not be the options themselves, but the pull between "${decision.fears[0] || "carrying uncertainty"}" and "${decision.desires[0] || "moving closer to the life you want"}".`,
    likelyPastChoice: "From the available memories, your past self might first be drawn to the more imaginative option, but would benefit from a low-cost validation step before acting.",
    branches,
    inertiaPatterns: [
      "You can become excited quickly when a new idea appears.",
      "When the scope grows, you may start worrying about whether you can finish.",
      "You seem better suited to calibrating choices with real feedback than making one large bet.",
    ],
    blindSpots: [
      safety ?? "You may underestimate the time, money, or emotional cost required for sustained effort.",
      "You may focus too much on whether the choice is perfect, instead of whether the next step can be tested.",
    ],
    futureEvaluation: "Your future self may care less about which road you chose today and more about whether you recorded your motives honestly, controlled the scope, and reviewed the outcome.",
    evidence: relevant.length > 0 ? relevant.map((memory) => memory.content).slice(0, 4) : ["There are only a few memories, so this judgment relies mostly on the current input and has limited confidence."],
    minimumAction: "Spend 30 minutes writing the smallest testable action for each option, then test only one small assumption within 7 days.",
    uncertaintyNote: "This is not a prediction of fate. It is an explainable simulation based on current memories. External conditions, health, resources, and timing can all change the outcome.",
    createdAt: now,
  };
}

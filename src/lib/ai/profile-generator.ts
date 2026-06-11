import type { Memory, PersonalityProfile } from "@/lib/types";

export function generateProfile(memories: Memory[], userId: string): PersonalityProfile {
  const active = memories.filter((memory) => memory.status === "active");
  const values = active.filter((memory) => memory.type === "value").map((memory) => memory.content);
  const blindSpots = active.filter((memory) => memory.type === "blind_spot").map((memory) => memory.content);
  const desires = active.filter((memory) => memory.type === "desire").length;
  const fears = active.filter((memory) => memory.type === "fear").length;

  return {
    userId,
    riskPreference: fears > desires ? "You tend to identify risks before deciding whether to move forward." : "You can be energized by new opportunities, but you need clear boundaries to keep momentum healthy.",
    decisionStyle: "You seem better suited to small experiments than all-in commitments, with short reviews at key checkpoints.",
    motivationPattern: "Motivation appears when an idea connects long-term meaning with honest self-expression.",
    stressPattern: "When uncertainty lasts too long, decision quality may drop; breaking the problem down helps.",
    longTermValues: values.slice(0, 4),
    recurringBlindSpots: blindSpots.slice(0, 4),
    strengths: ["Sensitive to inner motives", "Willing to review choices", "Able to see long-term possibility in ideas"],
    lastGeneratedAt: new Date().toISOString(),
  };
}

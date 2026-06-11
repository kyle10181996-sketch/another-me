import type { Memory, PersonalityProfile } from "@/lib/types";

export function generateProfile(memories: Memory[], userId: string): PersonalityProfile {
  const active = memories.filter((memory) => memory.status === "active");
  const values = active.filter((memory) => memory.type === "value").map((memory) => memory.content);
  const blindSpots = active.filter((memory) => memory.type === "blind_spot").map((memory) => memory.content);
  const desires = active.filter((memory) => memory.type === "desire").length;
  const fears = active.filter((memory) => memory.type === "fear").length;

  return {
    userId,
    riskPreference: fears > desires ? "倾向于先识别风险，再决定是否推进。" : "容易被新机会点亮，但需要边界感来保持推进质量。",
    decisionStyle: "适合用小步试错替代一次性 all in，并在关键节点做短复盘。",
    motivationPattern: "当一个想法能连接长期意义和真实自我表达时，动力更容易出现。",
    stressPattern: "当不确定性持续太久，决策质量可能下降，需要把问题拆小。",
    longTermValues: values.slice(0, 4),
    recurringBlindSpots: blindSpots.slice(0, 4),
    strengths: ["对自我动机敏感", "愿意复盘选择", "能从想法中看到长期可能性"],
    lastGeneratedAt: new Date().toISOString(),
  };
}

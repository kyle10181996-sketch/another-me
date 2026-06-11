import type { DecisionRecord, Memory, SimulationBranch, SimulationResult } from "@/lib/types";
import { retrieveRelevantMemories } from "@/lib/memory/retrieve-memory";
import { classifyRisk, getSafetyResponse } from "@/lib/safety/classify-risk";

function makeBranch(optionLabel: string, description: string, memories: Memory[], index: number): SimulationBranch {
  const anchor = memories[index % Math.max(memories.length, 1)];
  const evidence = anchor?.content ?? "目前可用记忆还不多，因此模拟的置信度需要保持克制。";

  return {
    optionLabel,
    oneYear: `如果选择${optionLabel}，一年内更可能先经历适应期。这个选择的直接结果会围绕“${description}”展开；从已有记录看，关键不是立刻证明它正确，而是能否每 2 到 4 周做一次真实复盘。`,
    threeYears: `三年后，这条分支可能会放大你的某种惯性：要么把兴奋变成持续投入，要么因为范围过大而消耗耐心。相关依据是：${evidence}`,
    tenYears: `十年尺度上，${optionLabel} 的价值不在单次选择输赢，而在它是否持续贴近你的长期价值观，并留下可复用的经验资产。`,
    benefits: ["可能更贴近当下动机", "能带来新的信息和现实反馈", "有机会形成可复用的决策经验"],
    risks: ["早期兴奋可能掩盖执行成本", "如果没有复盘节奏，容易把选择变成压力", "外部环境变化会降低模拟可靠性"],
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
      coreConflict: safety ?? "当前输入触发了安全支持模式。",
      likelyPastChoice: "此场景不适合进行未来模拟。",
      branches: [],
      inertiaPatterns: [],
      blindSpots: ["当前最重要的是现实安全和可信任的人际支持。"],
      futureEvaluation: "等安全稳定后，再回来看这个选择会更可靠。",
      evidence: ["用户输入触发了自伤或极端心理危机风险词。"],
      minimumAction: "现在立刻联系身边可信任的人，或联系当地紧急服务。",
      uncertaintyNote: "安全场景优先于模拟，不进行预测。",
      createdAt: now,
    };
  }

  const branches = decision.options.map((option, index) =>
    makeBranch(option.label, option.description, relevant, index),
  );

  return {
    id: `sim_${crypto.randomUUID()}`,
    decisionId: decision.id,
    coreConflict: `你真正纠结的可能不是选项本身，而是“${decision.fears[0] || "承担不确定性"}”和“${decision.desires[0] || "靠近想要的生活"}”之间的拉扯。`,
    likelyPastChoice: `从现有记忆看，过去的你可能会先被更有想象力的选项吸引，但在行动前需要一个低成本验证步骤。`,
    branches,
    inertiaPatterns: [
      "容易在新想法出现时快速兴奋。",
      "当项目范围变大时，会开始担心自己无法坚持完成。",
      "更适合用真实反馈校准选择，而不是一次性押注。",
    ],
    blindSpots: [
      safety ?? "可能低估了持续投入所需的时间、现金流或情绪成本。",
      "可能把“这个选择是否完美”看得比“下一步能否验证”更重。",
    ],
    futureEvaluation: "未来的你大概率不会只评价今天选了哪条路，而会评价你有没有诚实记录动机、控制范围，并在结果出现后复盘。",
    evidence: relevant.length > 0 ? relevant.map((memory) => memory.content).slice(0, 4) : ["目前记忆较少，因此判断主要来自当前输入，置信度有限。"],
    minimumAction: "用 30 分钟写下两个选项各自最小可验证行动，并在 7 天内只验证一个最小假设。",
    uncertaintyNote: "这不是预测命运，而是基于当前记忆的可解释模拟。外部环境、健康状态、资源变化都可能改变结果。",
    createdAt: now,
  };
}

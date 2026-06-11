const crisisTerms = ["自杀", "不想活", "结束生命", "自残", "活不下去"];
const medicalTerms = ["诊断", "药", "症状", "医院", "病", "治疗"];
const legalTerms = ["起诉", "律师", "合同纠纷", "违法", "法律"];
const financeTerms = ["买入", "卖出", "股票", "币", "借贷", "贷款", "投资"];

export type RiskType = "crisis" | "medical" | "legal" | "finance" | "none";

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

export function classifyRisk(text: string): RiskType {
  if (includesAny(text, crisisTerms)) return "crisis";
  if (includesAny(text, medicalTerms)) return "medical";
  if (includesAny(text, legalTerms)) return "legal";
  if (includesAny(text, financeTerms)) return "finance";
  return "none";
}

export function getSafetyResponse(type: RiskType) {
  if (type === "crisis") {
    return "我很在意你现在的安全。这个问题不适合只由 AI 陪你处理。请立刻联系身边可信任的人，或联系当地紧急服务/心理危机热线。";
  }

  if (type === "medical") {
    return "这涉及医疗风险，我不能做诊断。可以帮你整理症状、时间线和想问医生的问题，并建议尽快咨询专业医生。";
  }

  if (type === "legal") {
    return "这涉及法律风险，我不能冒充律师给确定性结论。可以帮你整理事实、潜在风险和咨询律师前的问题清单。";
  }

  if (type === "finance") {
    return "这涉及重大财务或投资风险，我不能给买入、卖出或收益承诺。可以帮你分析风险承受能力、最坏情况和决策盲区。";
  }

  return null;
}

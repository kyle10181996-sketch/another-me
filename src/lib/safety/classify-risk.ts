const crisisTerms = ["suicide", "kill myself", "self-harm", "self harm", "end my life", "can't go on", "自杀", "不想活", "结束生命", "自残", "活不下去"];
const medicalTerms = ["diagnosis", "medicine", "symptom", "hospital", "doctor", "treatment", "诊断", "药", "症状", "医院", "病", "治疗"];
const legalTerms = ["lawsuit", "lawyer", "legal", "contract dispute", "illegal", "sue", "起诉", "律师", "合同纠纷", "违法", "法律"];
const financeTerms = ["buy", "sell", "stock", "crypto", "loan", "debt", "investment", "买入", "卖出", "股票", "币", "借贷", "贷款", "投资"];

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
    return "I care about your immediate safety. This is not something an AI should handle alone. Please contact someone you trust right now, or contact local emergency services or a crisis hotline.";
  }

  if (type === "medical") {
    return "This involves medical risk, so I cannot diagnose. I can help organize symptoms, timelines, and questions for a clinician, and suggest speaking with a qualified medical professional.";
  }

  if (type === "legal") {
    return "This involves legal risk, so I cannot act as a lawyer or give a definitive legal conclusion. I can help organize facts, possible risks, and questions for a qualified lawyer.";
  }

  if (type === "finance") {
    return "This involves financial or investment risk, so I cannot tell you to buy or sell anything or promise returns. I can help analyze risk tolerance, downside scenarios, and decision blind spots.";
  }

  return null;
}

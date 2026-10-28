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

// ---------- Trading simulator ----------
// Trade notes are checked for crisis language and for real-money danger signals (borrowed money, leverage,
// "winning it back"). The simulator itself uses virtual money, but these notes often describe real life.

const tradingLeverageTerms = [
  "borrow",
  "loan",
  "margin",
  "leverage",
  "all in",
  "all-in",
  "mortgage",
  "credit card",
  "win it back",
  "make it back",
  "借钱",
  "借款",
  "贷款",
  "网贷",
  "信用卡",
  "融资",
  "杠杆",
  "配资",
  "梭哈",
  "全仓",
  "回本",
  "翻本",
  "房贷",
  "抵押",
];

export type TradingRiskType = "crisis" | "leverage" | "none";

export function classifyTradingRisk(text: string): TradingRiskType {
  const lower = text.toLowerCase();
  if (includesAny(lower, crisisTerms)) return "crisis";
  if (includesAny(lower, tradingLeverageTerms)) return "leverage";
  return "none";
}

export function getTradingSafetyNote(type: TradingRiskType) {
  if (type === "crisis") {
    return "我很在意你现在的安全。这不是 AI 能单独陪你处理的事。请马上联系你信任的人，或拨打当地的紧急求助电话或心理危机热线。";
  }

  if (type === "leverage") {
    return "你提到了借钱、加杠杆、梭哈或想把亏损赚回来。在真实市场里，这些正是最容易造成巨大且难以挽回损失的做法。请不要根据模拟盘的结果投入真实资金或借来的钱，可以先和信任的人或持牌顾问聊一聊。";
  }

  return null;
}

export const tradingDisclaimer =
  "这是使用虚拟资金的模拟器。这里的分析评价的是你的交易过程和习惯，不构成投资建议，不预测股价；过去的模拟结果不代表未来收益。";

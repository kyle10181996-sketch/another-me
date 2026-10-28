// Chinese display labels shared by the simulator UI and generated text.
import type { ReviewVerdict, TradeEmotion } from "@/lib/trading/types";

export const emotionLabels: Record<TradeEmotion, string> = {
  calm: "冷静",
  confident: "自信",
  unsure: "犹豫",
  fomo: "怕错过",
  greedy: "贪婪",
  fear: "恐惧",
  revenge: "想报复/回本",
  bored: "无聊",
};

export const verdictLabels: Record<ReviewVerdict, string> = {
  disciplined: "有纪律",
  mixed: "一半一半",
  impulsive: "冲动",
};

export function emotionLabel(value: string) {
  return emotionLabels[value as TradeEmotion] ?? value;
}

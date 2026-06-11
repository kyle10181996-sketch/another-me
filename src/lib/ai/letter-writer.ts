import type { Memory } from "@/lib/types";

const horizonLabels = {
  "1": "一年后",
  "3": "三年后",
  "10": "十年后",
  "20": "二十年后",
} as const;

export type LetterHorizon = keyof typeof horizonLabels;

export function writeFutureLetter(question: string, horizon: LetterHorizon, memories: Memory[]) {
  const label = horizonLabels[horizon];
  const evidence = memories
    .filter((memory) => memory.status === "active")
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 3);

  const evidenceText = evidence.length > 0
    ? evidence.map((memory) => `- ${memory.content}`).join("\n")
    : "- 目前记忆还很少，所以这封信会保持克制，只基于你刚刚提出的问题。";

  return `来自${label}的我：

我记得你现在问的是：“${question || "我接下来该怎么走？"}”

如果只给你一句话，我想说：不要急着把今天的纠结变成一个宏大的承诺。你真正需要的是一个能被现实检验的小动作。

我这样说，是因为这些记忆反复提醒我：
${evidenceText}

从${label}回头看，真正改变你的不是某次灵光一现，而是你有没有在兴奋之后给它边界，在焦虑出现时继续诚实记录，在结果出来后不逃开复盘。

今天先做一件小事：写下这个问题背后最害怕失去的东西，以及最想靠近的东西。然后只选一个 30 分钟内能完成的验证动作。`;
}

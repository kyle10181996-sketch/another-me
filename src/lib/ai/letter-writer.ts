import type { Memory } from "@/lib/types";

const horizonLabels = {
  "1": "one year from now",
  "3": "three years from now",
  "10": "ten years from now",
  "20": "twenty years from now",
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
    : "- There are not many memories yet, so this letter stays modest and is based mainly on the question you just asked.";

  return `From me, ${label}:

I remember that you are asking: "${question || "Where should I go next?"}"

If I could give you one sentence, it would be this: do not rush to turn today's uncertainty into a grand commitment. What you need is a small action that reality can test.

I say this because these memories keep pointing in the same direction:
${evidenceText}

Looking back from ${label}, what changed you was not a single spark of inspiration. It was whether you gave excitement a boundary, kept recording honestly when anxiety appeared, and stayed long enough to review the outcome.

Do one small thing today: write down what you are most afraid of losing, and what you most want to move toward. Then choose one validation action you can finish in 30 minutes.`;
}

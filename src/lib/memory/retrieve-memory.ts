import type { Memory } from "@/lib/types";

export function retrieveRelevantMemories(memories: Memory[], query: string, limit = 6) {
  const words = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

  return memories
    .filter((memory) => memory.status === "active")
    .map((memory) => {
      const haystack = `${memory.title} ${memory.content}`.toLowerCase();
      const lexicalScore = words.reduce((score, word) => score + (haystack.includes(word) ? 1 : 0), 0);
      return {
        memory,
        score: lexicalScore + memory.importance * 0.35 + memory.confidence,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ memory }) => memory);
}

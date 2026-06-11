export async function embedText(input: string) {
  return {
    provider: process.env.OPENAI_API_KEY ? "openai-ready" : "mock",
    vector: Array.from({ length: 16 }, (_, index) => {
      const char = input.charCodeAt(index % Math.max(input.length, 1)) || 0;
      return Number(((char % 31) / 31).toFixed(4));
    }),
  };
}

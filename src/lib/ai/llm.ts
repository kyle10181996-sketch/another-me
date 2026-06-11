export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function generateText(messages: LlmMessage[]) {
  const hasKey = Boolean(process.env.OPENAI_API_KEY);

  if (!hasKey) {
    return {
      provider: "mock",
      text: messages.at(-1)?.content ?? "",
    };
  }

  return {
    provider: "openai-ready",
    text: "OpenAI provider is configured. Replace this adapter with a live Responses API call when moving beyond the local MVP.",
  };
}

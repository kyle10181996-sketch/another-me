// Claude provider (Anthropic Messages API via the official SDK). Server-side only: the API key never reaches the browser.
import Anthropic from "@anthropic-ai/sdk";

export const CLAUDE_DEFAULT_MODEL = "claude-opus-5-5";
export const CLAUDE_BASE_URL = "https://api.anthropic.com";

export async function generateClaudeText(options: { apiKey: string; model: string; system: string; input: string }) {
  const client = new Anthropic({ apiKey: options.apiKey });

  const response = await client.beta.messages.create({
    model: options.model || CLAUDE_DEFAULT_MODEL,
    max_tokens: 16000,
    // Thinking is adaptive by default on current models; effort controls depth.
    output_config: { effort: "medium" },
    // If a safety classifier declines, the API retries on a suitable fallback model in the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: options.system,
    messages: [{ role: "user", content: options.input }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("AI_REFUSED");
  }

  const text = response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  if (!text) throw new Error("AI_EMPTY_RESPONSE");
  return text;
}

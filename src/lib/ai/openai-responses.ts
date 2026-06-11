import { readLocalSettings } from "@/lib/local-file-store";

type GenerateJsonOptions = {
  instructions: string;
  input: string;
};

export async function hasConfiguredApiKey() {
  const settings = await readLocalSettings();
  return Boolean(settings.apiKey);
}

export async function generateJson<T>(options: GenerateJsonOptions): Promise<T> {
  const settings = await readLocalSettings();

  if (!settings.apiKey) {
    throw new Error("NO_API_KEY");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: settings.model,
      instructions: options.instructions,
      input: options.input,
      text: {
        format: {
          type: "json_object",
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OPENAI_REQUEST_FAILED:${response.status}:${errorText.slice(0, 240)}`);
  }

  const data = await response.json();
  const text = data.output_text ?? data.output?.flatMap((item: { content?: Array<{ text?: string }> }) => item.content ?? []).map((content: { text?: string }) => content.text ?? "").join("");

  if (!text || typeof text !== "string") {
    throw new Error("OPENAI_EMPTY_RESPONSE");
  }

  return JSON.parse(text) as T;
}

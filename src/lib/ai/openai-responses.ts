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

  const endpoint = `${settings.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const body = {
    model: settings.model,
    messages: [
      {
        role: "system",
        content: `${options.instructions}\n\n你必须只返回一个合法 JSON 对象，不要使用 Markdown 代码块，不要输出解释文字。`,
      },
      {
        role: "user",
        content: options.input,
      },
    ],
    temperature: 0.4,
    response_format: {
      type: "json_object",
    },
  };

  let response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok && response.status === 400) {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...body, response_format: undefined }),
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI_REQUEST_FAILED:${response.status}:${errorText.slice(0, 240)}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;

  if (!text || typeof text !== "string") {
    throw new Error("AI_EMPTY_RESPONSE");
  }

  return JSON.parse(extractJsonObject(text)) as T;
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);

  return trimmed;
}

// app/lib/grokClient.ts

const DEFAULT_BASE_URL = "https://api.x.ai/v1";
const DEFAULT_MODEL = "grok-4-fast-reasoning";

type GrokMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function callGrokChat({
  messages,
}: {
  messages: GrokMessage[];
}): Promise<string> {
  const apiKey =
    process.env.XAI_API_KEY || process.env.GROK_API_KEY || "";

  if (!apiKey) {
    console.error("❌ XAI_API_KEY / GROK_API_KEY is not set on the server");
    throw new Error("Grok API key missing");
  }

  const baseUrl = process.env.GROK_BASE_URL || DEFAULT_BASE_URL;
  const model = process.env.GROK_MODEL || DEFAULT_MODEL;

  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;

  const payload = {
    model,
    messages,
    temperature: 0.2,
    max_tokens: 800,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("🔴 Grok error:", res.status, text);
    throw new Error(`Grok API error: ${res.status} ${text}`);
  }

  const json = await res.json();

  const content: string =
    json?.choices?.[0]?.message?.content ??
    json?.choices?.[0]?.delta?.content ??
    "";

  if (!content) {
    console.error("Grok JSON without content:", JSON.stringify(json, null, 2));
    throw new Error("Grok returned empty content");
  }

  return content;
}

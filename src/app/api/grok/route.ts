// src/app/api/grok/route.ts
import { NextRequest } from "next/server";

export const runtime = "nodejs"; // or "edge" if you prefer

const BASE_URL = process.env.GROK_BASE_URL || "https://api.x.ai/v1";
const API_KEY = process.env.GROK_API_KEY!;
const MODEL = process.env.GROK_MODEL || "grok-2-latest";

if (!API_KEY) {
  console.warn("⚠️ GROK_API_KEY is missing. Set it in .env.local");
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages: ChatMessage[] = Array.isArray(body?.messages) ? body.messages : [];
    const stream: boolean = !!body?.stream;

    if (!messages.length) {
      return new Response(JSON.stringify({ error: "Send { messages: [{role,content}, ...] }" }), { status: 400 });
    }

    const url = `${BASE_URL}/chat/completions`; // OpenAI-compatible path
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: body?.model || MODEL,
        messages,
        stream,
        // You can pass temperature, top_p, max_tokens, etc., if supported:
        temperature: body?.temperature ?? 0.7,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return new Response(JSON.stringify({ error: "Upstream error", detail: text }), { status: 500 });
    }

    // If streaming, just pipe through the ReadableStream
    if (stream && resp.body) {
      const headers = new Headers(resp.headers);
      // Ensure proper content type for event streams (SSE) if upstream provides it
      if (!headers.get("Content-Type")) headers.set("Content-Type", "text/event-stream");
      headers.set("Cache-Control", "no-cache");
      headers.set("Connection", "keep-alive");
      return new Response(resp.body, { status: 200, headers });
    }

    // Non-stream JSON
    const data = await resp.json();
    return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("Grok proxy error:", err);
    return new Response(JSON.stringify({ error: "Proxy failed", detail: String(err?.message || err) }), {
      status: 500,
    });
  }
}

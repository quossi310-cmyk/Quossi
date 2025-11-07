// app/api/realtime/route.ts
import { NextResponse } from "next/server";
import { SystemPrompt } from "@/app/lib/systemPrompt";

export async function POST() {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    // Pick your realtime model; keep it in env so you can switch easily
    const model =
      process.env.OPENAI_REALTIME_MODEL ||
      "gpt-4o-realtime-preview-2024-12-17";

    // Create a short-lived client secret (NO nested `session.*` keys)
    const resp = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "realtime=v1",
      },
      body: JSON.stringify({
        model,
        // top-level options (sessions API):
        voice: "verse",
        modalities: ["audio", "text"],
        instructions: SystemPrompt,
        // Enable server VAD so assistant auto-responds after you stop speaking
        turn_detection: { type: "server_vad", prefix_padding_ms: 300, silence_duration_ms: 600 },
        // expires_in: 600, // seconds (optional)
      }),
    });

    const text = await resp.text();
    if (!resp.ok) {
      // proxy the exact OpenAI error to the client to make debugging easy
      return NextResponse.json(
        { error: text ? JSON.parse(text) : "OpenAI error" },
        { status: 500 }
      );
    }

    const json = text ? JSON.parse(text) : {};
    // shape is: { id, client_secret: { value, ... }, ice_servers: [...], ... }
    return NextResponse.json(
      { client_secret: json.client_secret, ice_servers: json.ice_servers },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}

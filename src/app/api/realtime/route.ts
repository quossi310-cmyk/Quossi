// app/api/realtime/route.ts
import { NextResponse } from "next/server";

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
      },
      body: JSON.stringify({
        model,
        // top-level options:
        voice: "verse",                 // <- was session.voice (wrong)
        modalities: ["audio", "text"],  // optional but handy
        // optional:
        // instructions: "You are Quossi. Be concise and warm.",
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
    // shape is: { id, client_secret: { value, ... }, ... }
    return NextResponse.json(
      { client_secret: json.client_secret },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}

// app/api/realtime/route.ts
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  // Optional: pass initial instructions / tools for your “Quossi AI”
  const body = await req.json().catch(() => ({}));

  const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // pick a realtime-capable model and a voice you like
      model: "gpt-4o-realtime-preview",    // or the latest realtime model
      voice: "verse",                       // e.g. marin, alloy, verse…
      modalities: ["audio", "text"],
      // you can seed system instructions for QUOSSI here:
      instructions: body?.instructions ?? "You are QUOSSI. Be warm, concise, and helpful."
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    return new Response(JSON.stringify({ error: err }), { status: 500 });
  }

  const json = await r.json();
  // The response includes a short-lived client_secret for WebRTC
  return new Response(JSON.stringify(json), { status: 200, headers: { "Content-Type": "application/json" }});
}

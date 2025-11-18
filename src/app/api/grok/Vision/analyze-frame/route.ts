import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const XAI_API_KEY = process.env.XAI_API_KEY!;

export async function POST(req: NextRequest) {
  try {
    const { prompt, image_b64 } = await req.json();

    if (!image_b64 || !prompt) {
      return NextResponse.json({ error: "Missing prompt or image_b64" }, { status: 400 });
    }

    const r = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-vision-latest", // keep in env if you prefer
        messages: [
          { role: "system", content: "You are a trading coach. Be concise, precise, and safe." },
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${image_b64}` },
              },
            ],
          },
        ],
        // temperature: 0.2,
      }),
    });

    const json = await r.json();
    if (!r.ok) {
      return NextResponse.json({ error: json?.error || "Grok error", raw: json }, { status: 500 });
    }
    return NextResponse.json(json);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

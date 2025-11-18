// app/api/transcribe/route.ts
export const runtime = "nodejs"; // ensure Node runtime (required for Buffer)
import { NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

    // Convert browser File to Node Buffer
    const ab = await file.arrayBuffer();
    const buffer = Buffer.from(ab);

    const transcription = await groq.audio.transcriptions.create({
      file: buffer,
      model: "whisper-large-v3-turbo",
      temperature: 0,
      response_format: "verbose_json",
    });

    return NextResponse.json({ text: transcription.text });
  } catch (err: any) {
    console.error("Transcription error:", err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}

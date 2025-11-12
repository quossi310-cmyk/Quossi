// src/app/api/qscore-groq/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { computeQScore } from "@/app/lib/quossiEngine";
import { supabase } from "@/app/lib/supabase/supabase";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/* 1) Schemas (support both old and new shapes)                       */
/* ------------------------------------------------------------------ */
const MsgSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const BodySchema = z.object({
  // NEW preferred
  userId: z.string().optional(),
  history: z.array(MsgSchema).optional(),

  // Back-compat
  answers: z.array(z.string()).optional(),
  messages: z.array(MsgSchema).optional(),

  // Optional labels
  user: z.string().optional(),
  nickname: z.string().optional(),
});

/* ------------------------------------------------------------------ */
/* 2) Helpers                                                         */
/* ------------------------------------------------------------------ */
async function getUserId(
  req: NextRequest,
  body?: z.infer<typeof BodySchema>
): Promise<string> {
  // Prefer explicit values first
  let u =
    body?.userId ||
    body?.user ||
    // headers from client (fallback)
    req.headers.get("x-quossi-user") ||
    // cookie (sync, no await)
    cookies().get("qscore_user")?.value ||
    // query ?user=
    new URL(req.url).searchParams.get("user") ||
    "anonymous";

  u = u.replace(/[^a-zA-Z0-9_-]/g, "_");
  return u || "anonymous";
}

function normalizeToStrings(body: z.infer<typeof BodySchema>): string[] {
  // NEW preferred: history -> only user messages
  if (body.history && Array.isArray(body.history)) {
    return body.history
      .filter((m) => m && m.role === "user" && typeof m.content === "string")
      .map((m) => m.content.trim())
      .filter(Boolean);
  }

  // Back-compat: answers
  if (body.answers && Array.isArray(body.answers)) {
    return body.answers.filter((s): s is string => typeof s === "string" && s.trim() !== "");
  }

  // Back-compat: messages
  if (body.messages && Array.isArray(body.messages)) {
    return body.messages
      .map((m) => m?.content ?? "")
      .filter((s): s is string => typeof s === "string" && s.trim() !== "");
  }

  return [];
}

// De-dupe near-identical lines so repeated inputs don’t jitter scores
function normalizedUnique(msgs: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of msgs) {
    const k = m.toLowerCase().replace(/\s+/g, " ").trim();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(m);
    }
  }
  return out;
}

// Snap score to stable anchors (band midpoints)
function quantize(q: number) {
  if (q < 200) return 150;  // Storm
  if (q < 300) return 250;  // Ground
  if (q < 400) return 350;  // Flow
  if (q < 500) return 450;  // Gold
  return 550;               // Sun
}

// Smooth between previous and current (EMA)
function ema(current: number, last: number | null, alpha = 0.3) {
  return last == null ? current : Math.round(last * (1 - alpha) + current * alpha);
}

const rangeMap = {
  Storm: { name: "Storm", archetype: "The Reactor", element: "Fire", motto: "Emotion first, logic later." },
  Ground: { name: "Ground", archetype: "The Builder", element: "Earth", motto: "Steady hands make heavy bags." },
  Flow:  { name: "Flow",  archetype: "The Surfer",  element: "Water", motto: "Don’t fight the wave — ride it." },
  Gold:  { name: "Gold",  archetype: "The Strategist", element: "Air",  motto: "Silence wins faster." },
  Sun:   { name: "Sun",   archetype: "The Oracle", element: "Light", motto: "Peace is the ultimate edge." },
} as const;

/* ---------------- LLM (reflection only) ---------------- */
async function callModelReflection(messages: string[], fixed: { qScore: number; range: string; archetype: string }) {
  const grokKey = process.env.GROK_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  // If no keys, just return a default reflection
  if (!grokKey && !groqKey) {
    return "Keep showing up. Consistency compounds clarity.";
  }

  // Prefer xAI Grok if available
  if (grokKey) {
    const base = process.env.GROK_BASE_URL || "https://api.x.ai/v1";
    const model = process.env.GROK_MODEL || "grok-2-latest";

    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${grokKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: "system", content: "Write a single helpful sentence. No JSON. No preface." },
          {
            role: "user",
            content:
`User messages:
${messages.map((m, i) => `[${i + 1}] ${m}`).join("\n")}

Given:
- qScore: ${fixed.qScore}
- range: ${fixed.range}
- archetype: ${fixed.archetype}

Task: Write ONE sentence of encouragement/action aligned with the range.`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`xAI Grok reflection failed: ${res.status} ${t}`);
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || "Stay consistent and keep journaling.";
  }

  // Groq fallback if available
  const { default: Groq } = await import("groq-sdk");
  const groq = new Groq({ apiKey: groqKey! });
  const completion = await groq.chat.completions.create({
    model: "llama-3.1-70b-versatile",
    temperature: 0,
    messages: [
      { role: "system", content: "Write a single helpful sentence. No JSON. No preface." },
      {
        role: "user",
        content:
`User messages:
${messages.map((m, i) => `[${i + 1}] ${m}`).join("\n")}

Given:
- qScore: ${fixed.qScore}
- range: ${fixed.range}
- archetype: ${fixed.archetype}

Task: Write ONE sentence of encouragement/action aligned with the range.`,
      },
    ],
  });

  return completion.choices?.[0]?.message?.content?.trim() || "Stay consistent and keep journaling.";
}

/* ---------------- Persistence ---------------- */
async function storeResult(user: string, data: any) {
  const { error } = await supabase
    .from("qscores")
    .upsert({ user_id: user, data }, { onConflict: "user_id" });
  if (error) console.error("Supabase save error:", error);
}

async function fetchResult(user: string): Promise<any | null> {
  const { data, error } = await supabase
    .from("qscores")
    .select("data")
    .eq("user_id", user)
    .single();
  if (error && error.code !== "PGRST116") {
    console.error("Supabase fetch error:", error);
    return null;
  }
  return data?.data || null;
}

/* ------------------------------------------------------------------ */
/* 4) POST – deterministic score + (quantize + smooth) + reflection   */
/* ------------------------------------------------------------------ */
export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json(
      { error: "Invalid request", hint: "Send {userId, history[]} OR {answers[]} OR {messages[]}." },
      { status: 400 }
    );
  }

  const user = await getUserId(req, body);

  // Normalize inputs
  const rawMsgs = normalizeToStrings(body);
  const messages = normalizedUnique(rawMsgs);

  // Deterministic local score
  let result = computeQScore(messages); // { qScore, range, archetype, reflection? }

  // Quantize to band anchors
  result.qScore = quantize(result.qScore);

  // Smooth with previous score
  const previous = await fetchResult(user);
  result.qScore = ema(result.qScore, previous?.qScore ?? null);

  // Re-derive range/archetype from quantized score (safety net)
  const q = result.qScore;
  const band =
    q < 200 ? "Storm" :
    q < 300 ? "Ground" :
    q < 400 ? "Flow" :
    q < 500 ? "Gold" : "Sun";

  result.range = band;
  result.archetype = (rangeMap as any)[band]?.archetype ?? "The Builder";

  // Ask LLM ONLY for reflection (optional)
  try {
    const reflection = await callModelReflection(messages, {
      qScore: result.qScore,
      range: result.range,
      archetype: result.archetype,
    });
    result.reflection = reflection || result.reflection || "Keep going.";
  } catch (e) {
    console.warn("Reflection model failed; keeping local/default reflection:", e);
    if (!result.reflection) {
      result.reflection = "Keep going.";
    }
  }

  // Persist
  await storeResult(user, result);

  // Build response and set cookie here (Route Handlers require setting on the response)
  const res = NextResponse.json(result);
  res.cookies.set("qscore_user", user, {
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
    sameSite: "lax",
    // httpOnly: true, // turn on if you don't need client JS to read it
  });
  return res;
}

/* ------------------------------------------------------------------ */
/* 5) GET – read last summary                                         */
/* ------------------------------------------------------------------ */
export async function GET(req: NextRequest) {
  const user = await getUserId(req);
  const raw = await fetchResult(user);

  const defaultSummary = {
    user,
    tone: "neutral",
    qscore: 250,
    range: rangeMap.Ground,
    main_qscore: 250,
    trend_slope: 0,
    volatility: null as number | null,
    streak: { direction: "flat", length: 0 },
    reflection: "Complete the form to generate your Q-Score.",
  };

  if (!raw) return NextResponse.json(defaultSummary);

  const range = (rangeMap as any)[raw.range] ?? rangeMap.Ground;

  const summary = {
    user,
    tone: "neutral",
    qscore: raw.qScore,
    range: { ...range },
    main_qscore: raw.qScore,
    trend_slope: 0,
    volatility: null as number | null,
    streak: { direction: "flat", length: 0 },
    reflection: raw.reflection,
  };

  return NextResponse.json(summary);
}

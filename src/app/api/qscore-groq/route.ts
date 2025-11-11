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
    // cookie (must await cookies())
    (await cookies()).get("qscore_user")?.value ||
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

function isValidResult(r: any): r is {
  qScore: number;
  range: string;
  archetype: string;
  reflection: string;
} {
  return (
    typeof r?.qScore === "number" &&
    r.qScore >= 100 &&
    r.qScore <= 600 &&
    typeof r?.range === "string" &&
    typeof r?.archetype === "string" &&
    typeof r?.reflection === "string"
  );
}

const rangeMap = {
  Storm: { name: "Storm", archetype: "The Reactor", element: "Fire", motto: "Emotion first, logic later." },
  Ground: { name: "Ground", archetype: "The Builder", element: "Earth", motto: "Steady hands make heavy bags." },
  Flow:  { name: "Flow",  archetype: "The Surfer",  element: "Water", motto: "Don’t fight the wave — ride it." },
  Gold:  { name: "Gold",  archetype: "The Strategist", element: "Air",  motto: "Silence wins faster." },
  Sun:   { name: "Sun",   archetype: "The Oracle", element: "Light", motto: "Peace is the ultimate edge." },
} as const;

function groqPrompt(messages: string[]) {
  return `
You are a scoring function. Return ONLY valid JSON for the user's Q-Score.

## Inputs
Messages:
${messages.map((m, i) => `[${i + 1}] ${m}`).join("\n")}

## Scoring rubric (MIRROR exactly):
- Tone: positive (happy|calm|peace|grateful|good|confident), anxious (anxious|worried|nervous|fear|scared), over-confident (angry|mad|frustrated|furious|revenge), else neutral
- Self-awareness: 1 if /i (noticed|realized|learned|understand|see|reflect)/i
- Impulse: 1 if /(immediately|couldn’t wait|had to|revenge|all in|double down|panic)/i

Compute:
1) stabilityScore = max(0, 1 - (uniqueTonesCount - 1) / 3)
2) toneScore = (#positive * 1) + (#neutral * 0.8) - (#anxious_or_overconfident * 0.5)
3) impulseScore = 1 - (impulseCount / messageCount)
4) selfAwarenessScore = (selfAwareCount / messageCount)
5) composite = stabilityScore*0.3 + (toneScore/messageCount)*0.3 + selfAwarenessScore*0.25 + impulseScore*0.15
6) ratio = clamp(composite, 0, 1)
7) qScore = round(100 + ratio*500)

Map:
100–199 → "Storm", "The Reactor", "Emotion first, logic later."
200–299 → "Ground", "The Builder", "Steady hands make heavy bags."
300–399 → "Flow", "The Surfer", "Don’t fight the wave — ride it."
400–499 → "Gold", "The Strategist", "Silence wins faster."
500–600 → "Sun", "The Oracle", "Peace is the ultimate edge."

Reflection:
{vibe} — {archetype} energy. {next step}

## Output JSON (STRICT):
{
  "qScore": number,
  "range": string,
  "archetype": string,
  "reflection": string
}
`.trim();
}

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
/* 3) Provider call (xAI Grok or Groq)                                */
/* ------------------------------------------------------------------ */
async function callModel(messages: string[]) {
  const groqKey = process.env.GROQ_API_KEY;
  const grokKey = process.env.GROK_API_KEY;

  if (!groqKey && !grokKey) {
    throw new Error("No model key provided. Set GROK_API_KEY (xAI) or GROQ_API_KEY (Groq).");
  }

  // === Prefer xAI Grok if available (Option B) ===
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
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Return ONLY JSON. Follow rubric." },
          { role: "user", content: groqPrompt(messages) },
        ],
      }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`xAI Grok call failed: ${res.status} ${t}`);
    }

    const data = await res.json();
    const content =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.delta?.content ??
      "";

    const parsed = content ? JSON.parse(content) : null;
    if (!isValidResult(parsed)) throw new Error("Invalid xAI Grok output");
    return parsed;
  }

  // === Groq fallback if you add GROQ_API_KEY ===
  const { default: Groq } = await import("groq-sdk");
  const groq = new Groq({ apiKey: groqKey! });
  const completion = await groq.chat.completions.create({
    model: "llama-3.1-70b-versatile",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "Return ONLY JSON. Follow rubric." },
      { role: "user", content: groqPrompt(messages) },
    ],
  });
  const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
  if (!isValidResult(parsed)) throw new Error("Invalid Groq output");
  return parsed;
}

/* ------------------------------------------------------------------ */
/* 4) POST – compute + save                                           */
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

  // Persist a cookie for later GETs (7 days)
  const cookieStore = await cookies();
  cookieStore.set("qscore_user", user, { path: "/", maxAge: 7 * 24 * 60 * 60 });

  const messages = normalizeToStrings(body);

  let result: { qScore: number; range: string; archetype: string; reflection: string };

  if (!messages.length) {
    result = {
      qScore: 250,
      range: "Ground",
      archetype: "The Builder",
      reflection: "Say a bit more to calibrate your Q-Score.",
    };
  } else {
    try {
      result = await callModel(messages);
    } catch (err) {
      console.warn("Model call failed, using fallback:", err);
      result = computeQScore(messages);
    }
  }

  await storeResult(user, result);
  return NextResponse.json(result);
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

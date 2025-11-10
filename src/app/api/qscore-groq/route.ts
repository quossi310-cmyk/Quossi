// src/app/api/qscore-groq/route.ts
import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { z } from "zod";
import { computeQScore } from "@/app/lib/quossiEngine";
import { supabase } from "@/app/lib/supabase/supabase";  // CORRECT
import { cookies } from "next/headers"; // For session user

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/* 1. Types & Schemas                                                 */
/* ------------------------------------------------------------------ */
type QScoreData = {
  qScore: number;
  range: string;
  archetype: string;
  reflection: string;
};

type QSummary = {
  user: string;
  tone: string;
  qscore: number;
  range: {
    name: string;
    archetype: string;
    element?: string;
    motto: string;
  };
  main_qscore: number | null;
  trend_slope: number;
  volatility: number | null;
  streak: { direction: string; length: number };
  reflection: string;
};

const BodySchema = z.object({
  answers: z.array(z.string()).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional(),
  user: z.string().optional(),
  nickname: z.string().optional(),
});

/* ------------------------------------------------------------------ */
/* 2. Helper – get user from cookie or query                          */
/* ------------------------------------------------------------------ */
function getUserId(req: NextRequest): string {
  // 1. Try cookie (recommended)
  const cookieUser = cookies().get("qscore_user")?.value;
  if (cookieUser) return cookieUser;

  // 2. Fallback to query
  const url = new URL(req.url);
  const queryUser = url.searchParams.get("user");
  if (queryUser) return queryUser.replace(/[^a-zA-Z0-9_-]/g, "_");

  // 3. Default
  return "anonymous";
}

/* ------------------------------------------------------------------ */
/* 3. Range Map with Element                                          */
/* ------------------------------------------------------------------ */
const rangeMap: Record<
  string,
  { name: string; archetype: string; element?: string; motto: string }
> = {
  Storm: {
    name: "Storm",
    archetype: "The Reactor",
    element: "Fire",
    motto: "Emotion first, logic later.",
  },
  Ground: {
    name: "Ground",
    archetype: "The Builder",
    element: "Earth",
    motto: "Steady hands make heavy bags.",
  },
  Flow: {
    name: "Flow",
    archetype: "The Surfer",
    element: "Water",
    motto: "Don’t fight the wave — ride it.",
  },
  Gold: {
    name: "Gold",
    archetype: "The Strategist",
    element: "Air",
    motto: "Silence wins faster.",
  },
  Sun: {
    name: "Sun",
    archetype: "The Oracle",
    element: "Light",
    motto: "Peace is the ultimate edge.",
  },
};

/* ------------------------------------------------------------------ */
/* 4. POST – compute + save                                           */
/* ------------------------------------------------------------------ */
export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json(
      { error: "Invalid request", hint: "Send {answers: string[]} or {messages: [...]}." },
      { status: 400 }
    );
  }

  const user = (body.user ?? getUserId(req)).replace(/[^a-zA-Z0-9_-]/g, "_");
  const messages = normalizeToStrings(body);

  let result: QScoreData;

  if (!messages.length) {
    result = {
      qScore: 250,
      range: "Ground",
      archetype: "The Builder",
     reflection: "Say a bit more to calibrate your Q-Score.",
    };
  } else {
    try {
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
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
      result = parsed;
    } catch (err) {
      console.warn("Groq failed, using fallback:", err);
      result = computeQScore(messages);
    }
  }

  await storeResult(user, result);
  return NextResponse.json(result);
}

/* ------------------------------------------------------------------ */
/* 5. GET – read from Supabase + fallback                             */
/* ------------------------------------------------------------------ */
export async function GET(req: NextRequest) {
  const user = getUserId(req);
  const raw = await fetchResult(user);

  // Default if no data
  const defaultSummary: QSummary = {
    user,
    tone: "neutral",
    qscore: 250,
    range: rangeMap.Ground,
    main_qscore: 250,
    trend_slope: 0,
    volatility: null,
    streak: { direction: "flat", length: 0 },
    reflection: "Complete the form to generate your Q-Score.",
  };

  if (!raw) {
    return NextResponse.json(defaultSummary);
  }

  const range = rangeMap[raw.range] ?? rangeMap.Ground;

  const summary: QSummary = {
    user,
    tone: "neutral",
    qscore: raw.qScore,
    range: { ...range },
    main_qscore: raw.qScore,
    trend_slope: 0,
    volatility: null,
    streak: { direction: "flat", length: 0 },
    reflection: raw.reflection,
  };

  return NextResponse.json(summary);
}

/* ------------------------------------------------------------------ */
/* 6. Helpers                                                         */
/* ------------------------------------------------------------------ */
function normalizeToStrings(body: z.infer<typeof BodySchema>): string[] {
  if (body.answers && Array.isArray(body.answers)) {
    return body.answers.filter((s): s is string => typeof s === "string" && s.trim() !== "");
  }
  if (body.messages && Array.isArray(body.messages)) {
    return body.messages
      .map((m) => m?.content ?? "")
      .filter((s): s is string => typeof s === "string" && s.trim() !== "");
  }
  return [];
}

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

async function storeResult(user: string, data: QScoreData) {
  const { error } = await supabase
    .from("qscores")
    .upsert({ user_id: user, data }, { onConflict: "user_id" });

  if (error) console.error("Supabase save error:", error);
}

async function fetchResult(user: string): Promise<QScoreData | null> {
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

function isValidResult(r: any): r is QScoreData {
  return (
    typeof r.qScore === "number" &&
    r.qScore >= 100 &&
    r.qScore <= 600 &&
    typeof r.range === "string" &&
    typeof r.archetype === "string" &&
    typeof r.reflection === "string"
  );
}
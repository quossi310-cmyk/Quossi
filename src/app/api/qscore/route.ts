// app/api/qscore/route.ts
import { NextRequest, NextResponse } from "next/server";
import { analyzeConversation } from "@/app/lib/utils/analyzer";
import { calculateQScore } from "@/app/lib/engines/emotionEngine";
import { getStoryAnalogy } from "@/app/lib/engines/storyEngine";
import { generateTasks } from "@/app/lib/engines/taskEngine";
import { corsHeaders, handleOptions, isOriginAllowed } from "@/app/lib/cors";

export const runtime = "nodejs";
// Keep dynamic so this route is never statically analyzed/exported
export const dynamic = "force-dynamic";

/** CONFIG — tune these to your taste */
const MIN_USER_TURNS = 10;           // first time QScore is allowed
const REFRESH_EVERY_USER_TURNS = 10; // compute again after every +10 user turns
const WINDOW_USER_TURNS = 12;        // how many recent user turns to analyze (10–15 recommended)
const MAX_WINDOW_USER_TURNS = 15;

/** Simple in-memory hints (resets on server restart) */
type ChatMsg = { role: "user" | "assistant"; content: string };
const favMovieByUser = new Map<string, string>();
const lastComputedUserTurns = new Map<string, number>(); // remembers when we last emitted a QScore

function tierFromScore(q: number): "Ground" | "Flow" | "Gold" | "Sun" {
  if (q >= 85) return "Sun";
  if (q >= 65) return "Gold";
  if (q >= 45) return "Flow";
  return "Ground";
}
function toneFromConfidence(conf: number): "positive" | "neutral" | "stressed" {
  if (conf >= 0.7) return "positive";
  if (conf <= 0.4) return "stressed";
  return "neutral";
}

/** Count user turns in a history */
function countUserTurns(history: ChatMsg[] = []): number {
  return history.filter((m) => m.role === "user").length;
}

/** Decide if we should compute/show QScore now, based on user turn counts */
function gatingAllow(
  userId: string,
  history: ChatMsg[] | undefined
): { allowed: boolean; reason?: string } {
  const uTurns = countUserTurns(history || []);
  if (uTurns < MIN_USER_TURNS) {
    return {
      allowed: false,
      reason: `Need at least ${MIN_USER_TURNS} user messages before Q-Score.`,
    };
  }
  const last = lastComputedUserTurns.get(userId) ?? 0;
  if (uTurns - last < REFRESH_EVERY_USER_TURNS) {
    const remaining = REFRESH_EVERY_USER_TURNS - (uTurns - last);
    return {
      allowed: false,
      reason: `Learning… Q-Score updates after ${remaining} more user messages.`,
    };
  }
  return { allowed: true };
}

/**
 * Select a slice of history that contains the most recent N user turns
 * (and all assistant messages around them), so we analyze a 10–15 turn window.
 */
function selectWindowByUserTurns(history: ChatMsg[] = []): ChatMsg[] {
  if (!history.length) return [];
  const targetTurns = Math.min(
    Math.max(WINDOW_USER_TURNS, MIN_USER_TURNS),
    MAX_WINDOW_USER_TURNS
  );

  // Walk backwards collecting user turns and tracking the earliest index included
  let userTurns = 0;
  let startIdx = history.length - 1;

  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role === "user") userTurns++;
    startIdx = i;
    if (userTurns >= targetTurns) break;
  }
  // Slice from earliest included index to end
  return history.slice(startIdx);
}

/** Build a single analysis string from a selected window or fallback to single message */
function buildAnalysisText(
  history: ChatMsg[] | undefined,
  message?: string
): { text: string; usedHistory: boolean } {
  if (Array.isArray(history) && history.length) {
    const windowSlice = selectWindowByUserTurns(history);
    const text = windowSlice.map((m) => `${m.role}: ${m.content}`).join("\n");
    return { text, usedHistory: true };
  }
  const text = (message ?? "").trim();
  return { text, usedHistory: false };
}

type Body =
  | { userId?: string; history?: ChatMsg[]; favoriteMovie?: string }
  | { userId?: string; message?: string; favoriteMovie?: string };

/* ---------- small safe JSON helper ---------- */
function safeJson<T = unknown>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/* ---------- CORS preflight ---------- */
export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

/* ---------- Main handler ---------- */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");

  // Origin gate (web, preview, Capacitor etc. handled by lib/cors)
  if (!isOriginAllowed(origin, req)) {
    return NextResponse.json(
      { ok: false, error: "Origin not allowed" },
      { status: 403, headers: corsHeaders(origin) }
    );
  }

  // Parse body safely
  const raw = await req.text();
  const body = safeJson<Body>(raw);
  if (!body) {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400, headers: corsHeaders(origin) }
    );
  }

  try {
    const userId = (body as any).userId || "anonymous";
    const history = (body as any).history as ChatMsg[] | undefined;
    const singleMessage = (body as any).message as string | undefined;

    // optional: remember a small preference like favorite movie
    const fav = (body as any).favoriteMovie?.trim();
    if (fav) favMovieByUser.set(userId, fav);

    // Gate: only allow when the threshold is met
    const gate = gatingAllow(userId, history);

    // Always build text + compute metrics (you might log these), but only
    // return Q-Score when gate.allowed === true
    const { text: analysisText, usedHistory } = buildAnalysisText(
      history,
      singleMessage
    );
    if (!analysisText) {
      return NextResponse.json(
        { ok: false, error: "message or history is required" },
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    // ---- analyze / compute
    const { clarityPulse, confidenceIndex } = analyzeConversation(analysisText);
    const qScore = calculateQScore(clarityPulse, confidenceIndex);
    const movie = favMovieByUser.get(userId) || "Rocky";
    const story = getStoryAnalogy(qScore, movie); // { message, range }
    const tasks = generateTasks(qScore);
    const firstTask =
      Array.isArray(tasks) && tasks.length ? String(tasks[0]) : "";

    // Result object (only exposed when allowed)
    const result = {
      tone: toneFromConfidence(confidenceIndex),
      qScore,
      tier: tierFromScore(qScore),
      task: firstTask,
      runAt: new Date().toISOString(),
    };

    // If allowed, mark the last computed user turn count
    if (gate.allowed) {
      const uTurns = countUserTurns(history || []);
      lastComputedUserTurns.set(userId, uTurns);
    }

    return NextResponse.json(
      {
        // what your UI uses:
        allowed: gate.allowed,
        result: gate.allowed ? result : undefined,
        reason: gate.allowed ? undefined : gate.reason,

        // optional diagnostics for dev
        ok: true,
        userId,
        usedHistory,
        metrics: {
          clarityPulse,
          confidenceIndex,
          qScore,
          range: story?.range,
        },
        story: story?.message ?? "",
        tasks,
      },
      { status: 200, headers: corsHeaders(origin) }
    );
  } catch (e: unknown) {
    const msg = (e as Error)?.message ?? "unknown error";
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500, headers: corsHeaders(origin) }
    );
  }
}

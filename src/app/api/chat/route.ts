// app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { SYSTEM_PROMPT } from "@/app/lib/systemPrompt";

export const runtime = "nodejs";

/* ================= CORS (Capacitor + Android emulator) ================= */
const ALLOWED_ORIGINS = [
  "http://localhost:3000",     // dev web
  "http://10.0.2.2:3000",      // Android emulator reaching your machine
  "capacitor://localhost",     // Capacitor WebView scheme
  "https://yourdomain.com",    // prod domain (replace/extend as needed)
];

// Build CORS headers dynamically so we echo the exact Origin (or allow none).
function buildCorsHeaders(origin: string | null) {
  // Some WebViews (Capacitor) send no Origin at all; allow in dev.
  const allowAny = !origin || origin.length === 0;

  // Strict allow if present; otherwise allow empty (native/webview).
  const isAllowed =
    allowAny || ALLOWED_ORIGINS.some((o) => origin!.startsWith(o));

  // If you prefer strict blocking, set Access-Control-Allow-Origin to a matched origin only.
  const allowOrigin = allowAny
    ? "*"
    : isAllowed
    ? origin!
    : "null";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-CSRF-Token",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  } as Record<string, string>;
}

// Preflight for browsers/webviews
export async function OPTIONS(req: NextRequest) {
  const headers = buildCorsHeaders(req.headers.get("origin"));
  return new NextResponse(null, { status: 204, headers });
}

/* ================= In-memory persistence (dev-friendly) ================= */
type StoredMsg = { role: "user" | "assistant"; content: string; ts: number };
const conversations = new Map<string, StoredMsg[]>();

function getConversation(userId?: string): StoredMsg[] {
  if (!userId) return [];
  return conversations.get(userId) ?? [];
}
function appendMessage(userId: string, msg: StoredMsg) {
  const arr = conversations.get(userId) ?? [];
  arr.push(msg);
  conversations.set(userId, arr);
}

/* ================= Throttle ================= */
const hits = new Map<string, { count: number; ts: number }>();
function throttle(ip: string, limit = 20, windowMs = 60_000) {
  const now = Date.now();
  const rec = hits.get(ip) ?? { count: 0, ts: now };
  if (now - rec.ts > windowMs) {
    rec.count = 0;
    rec.ts = now;
  }
  rec.count += 1;
  hits.set(ip, rec);
  return rec.count <= limit;
}

export async function GET(req: NextRequest) {
  const headers = buildCorsHeaders(req.headers.get("origin"));
  // Health check: do NOT call OpenAI here
  return NextResponse.json({ ok: true, message: "health" }, { headers });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = buildCorsHeaders(origin);

  // If an Origin is present but not allowed, block (empty Origin is allowed for native apps/webviews)
  if (origin && !ALLOWED_ORIGINS.some((o) => origin.startsWith(o))) {
    return NextResponse.json(
      { error: "Origin not allowed" },
      { status: 403, headers }
    );
  }

  // Rate limit
  const xff = req.headers.get("x-forwarded-for");
  const headerIp =
    xff?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    req.headers.get("cf-connecting-ip");
  const ip = headerIp ?? (req as any).ip ?? "unknown";
  if (!throttle(String(ip))) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers }
    );
    }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY" },
      { status: 500, headers }
    );
  }

  // Parse payload
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers }
    );
  }

  const { message, history = [], userId } = body ?? {};
  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json(
      { error: "Missing message" },
      { status: 400, headers }
    );
  }

  // Merge conversation history
  let serverHistory: StoredMsg[] = [];
  if (userId) {
    serverHistory = getConversation(userId);
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const openaiMessages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [
    { role: "system", content: SYSTEM_PROMPT },
    ...serverHistory,
    ...(Array.isArray(history) ? history : []),
    { role: "user", content: message.trim() },
  ];

  try {
    // Persist incoming user message
    if (userId) {
      appendMessage(userId, {
        role: "user",
        content: message.trim(),
        ts: Date.now(),
      });
    }

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      input: openaiMessages,
    });

    const text = response.output_text ?? "No response";

    // Persist assistant reply
    if (userId) {
      appendMessage(userId, {
        role: "assistant",
        content: text,
        ts: Date.now(),
      });
    }

    return NextResponse.json(
      {
        response: text,
        meta: { intent: "general" },
      },
      { headers }
    );
  } catch (e: any) {
    const code = e?.status ?? 500;
    return NextResponse.json(
      { error: "OpenAI request failed", code, details: e?.message },
      { status: code, headers }
    );
  }
}

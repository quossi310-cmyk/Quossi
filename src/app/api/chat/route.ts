// app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { SYSTEM_PROMPT } from "@/app/lib/systemPrompt";
import {
  corsHeaders,
  handleOptions,
  isOriginAllowed,
} from "@/app/lib/cors";

export const runtime = "nodejs";
// Keep this if you want to guarantee SSR for this route
export const dynamic = "force-dynamic";

/* ================= In-memory persistence (dev-friendly) ================= */
type ChatRole = "user" | "assistant";
type StoredMsg = { role: ChatRole; content: string; ts: number };

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

/* ================= Small helpers ================= */
function safeJson<T = unknown>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/* ================= CORS preflight ================= */
export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

/* ================= Health (no OpenAI) ================= */
export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  return NextResponse.json(
    { ok: true, message: "health" },
    { headers: corsHeaders(origin) }
  );
}

/* ================= Main chat ================= */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");

  // Gate by allowed origins (null/absent origin is allowed by lib/cors for native/webviews)
  if (!isOriginAllowed(origin, req)) {
    return NextResponse.json(
      { error: "Origin not allowed" },
      { status: 403, headers: corsHeaders(origin) }
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
      { status: 429, headers: corsHeaders(origin) }
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY" },
      { status: 500, headers: corsHeaders(origin) }
    );
  }

  // Parse payload safely
  const raw = await req.text();
  const body = safeJson<{ message?: string; history?: unknown; userId?: string }>(raw);
  if (!body) {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: corsHeaders(origin) }
    );
  }

  const { message, history = [], userId } = body;
  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json(
      { error: "Missing message" },
      { status: 400, headers: corsHeaders(origin) }
    );
  }

  // Merge conversation history
  const serverHistory = userId ? getConversation(userId) : [];

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const openaiMessages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [
    { role: "system", content: SYSTEM_PROMPT },
    ...serverHistory,
    ...(Array.isArray(history) ? (history as any[]).filter(Boolean).map((h) => {
      const role: "user" | "assistant" =
        h?.role === "assistant" ? "assistant" : "user";
      const content = typeof h?.content === "string" ? h.content : "";
      return { role, content };
    }) : []),
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

    // You were using the Responses API; keep that
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      input: openaiMessages,
      temperature: 0.6,
      max_output_tokens: 500,
      // user: userId,  // uncomment if you want per-user tagging
    });

    const text = (response as any).output_text ?? "No response";

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
      { headers: corsHeaders(origin) }
    );
  } catch (e: unknown) {
    const code = (e as any)?.status ?? 500;
    const msg = (e as Error)?.message ?? "OpenAI request failed";
    return NextResponse.json(
      { error: "OpenAI request failed", code, details: msg },
      { status: code, headers: corsHeaders(origin) }
    );
  }
}

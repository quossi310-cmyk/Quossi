// app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { corsHeaders, handleOptions, isOriginAllowed } from "@/app/lib/cors";
import * as Sys from "@/app/lib/systemPrompt";
import { getUserState, markSystemSent, saveSummary } from "@/app/lib/userState";
import { cheapSummary } from "@/app/lib/cheapSummary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ================= In-memory persistence ================= */
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

/* ================= Small per-user queue ================= */
const userLocks = new Map<string, Promise<void>>();
async function withUserLock<T>(userId: string | undefined, fn: () => Promise<T>): Promise<T> {
  if (!userId) return fn();
  const prev = userLocks.get(userId) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((res) => (release = res));
  userLocks.set(userId, prev.then(() => next).catch(() => next));
  try { await prev; return await fn(); } finally { release(); }
}

/* ================= Throttle (local) ================= */
const hits = new Map<string, { count: number; ts: number }>();
function throttle(ip: string, limit = 20, windowMs = 60_000) {
  const now = Date.now();
  const rec = hits.get(ip) ?? { count: 0, ts: now };
  if (now - rec.ts > windowMs) { rec.count = 0; rec.ts = now; }
  rec.count += 1;
  hits.set(ip, rec);
  return rec.count <= limit;
}

/* ================= Helpers ================= */
function safeJson<T = unknown>(raw: string): T | null { try { return JSON.parse(raw) as T; } catch { return null; } }
function resolveSystemPrompt(): string {
  const fn = (Sys as any).buildSystemPrompt;
  if (typeof fn === "function") return fn();
  const str1 = (Sys as any).SYSTEM_PROMPT; if (typeof str1 === "string") return str1;
  const str2 = (Sys as any).systemPrompt;  if (typeof str2 === "string") return str2;
  const def  = (Sys as any).default;
  if (typeof def === "string") return def;
  if (typeof def === "function") return def();
  return "You are Quossi, a helpful assistant.";
}
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
function mapAndTrimServerHistory(
  serverHistory: StoredMsg[],
  lastN = 4
): Array<{ role: "user" | "assistant"; content: string }> {
  return serverHistory.slice(-lastN).map((m) => ({ role: m.role, content: normalize(m.content) }));
}

/* ================= CORS & health ================= */
export async function OPTIONS(req: NextRequest) { return handleOptions(req); }
export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  const url = new URL(req.url);
  if (url.searchParams.get("diag") === "1") {
    // Lightweight sanity check against Grok using your env
    try {
      const r = await callGrok([
        { role: "system", content: "You are a test assistant." },
        { role: "user", content: "Say OK." },
      ], { timeoutMs: 8000 });
      return NextResponse.json({ ok: true, message: "diag pass", sample: r.text.slice(0, 64) }, { headers: corsHeaders(origin) });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message ?? "diag failed", detail: e?.detailRaw ?? null, status: e?.status ?? 500 }, { status: 500, headers: corsHeaders(origin) });
    }
  }
  return NextResponse.json({ ok: true, message: "health" }, { headers: corsHeaders(origin) });
}

/* ================= xAI Grok client ================= */
const GROK_BASE = process.env.GROK_BASE_URL || "https://api.x.ai/v1";
const GROK_KEY  = process.env.GROK_API_KEY ?? "";
const GROK_MODEL = process.env.GROK_MODEL || "grok-2-latest";

// Early visibility if envs are missing (doesn't crash builds)
if (!GROK_KEY) {
  console.warn("⚠️ GROK_API_KEY is missing. Set it in .env.local / Vercel envs.");
}
if (!GROK_BASE?.startsWith("http")) {
  console.warn("⚠️ GROK_BASE_URL looks invalid:", GROK_BASE);
}

type GrokMessage = { role: "system" | "user" | "assistant"; content: string };

function extractGrokText(data: any): string {
  const choice = data?.choices?.[0];
  const mc = choice?.message?.content;
  if (typeof mc === "string") return mc;
  if (Array.isArray(mc)) return mc.map((p) => (typeof p === "string" ? p : p?.text ?? "")).join("");
  return typeof mc === "undefined" ? "" : String(mc);
}

async function callGrok(
  messages: GrokMessage[],
  opts?: { model?: string; temperature?: number; max_tokens?: number; timeoutMs?: number }
): Promise<{ text: string; raw: any }> {
  if (!GROK_KEY) {
    const e = new Error("Missing GROK_API_KEY"); (e as any).status = 500; throw e;
  }
  // Guard: messages must be non-empty and strings
  const cleanMsgs = (messages || [])
    .filter(m => m && typeof m.content === "string" && m.content.trim().length > 0)
    .map(m => ({ role: m.role, content: m.content.trim() }));
  if (cleanMsgs.length === 0) {
    const e = new Error("No valid messages to send"); (e as any).status = 400; throw e;
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 12_000);
  try {
    const res = await fetch(`${GROK_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROK_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: opts?.model || GROK_MODEL,
        messages: cleanMsgs,
        temperature: opts?.temperature ?? 0.6,
        max_tokens: opts?.max_tokens ?? 400,
      }),
      signal: controller.signal,
    });

    const rawTxt = await res.text().catch(() => "");
    // Try to parse even on non-200 to surface upstream JSON error bodies
    let data: any = null;
    try { data = rawTxt ? JSON.parse(rawTxt) : null; } catch {}

    if (!res.ok) {
      const err: any = new Error(`Grok upstream ${res.status}`);
      err.status = res.status;
      err.detailRaw = rawTxt || null;
      throw err;
    }

    const text = extractGrokText(data).trim() || "…";
    return { text, raw: data };
  } catch (err: any) {
    // If it was an abort, make it obvious
    if (err?.name === "AbortError") {
      const e: any = new Error("Grok request timeout");
      e.status = 504;
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(t);
  }
}

/* ================= Main chat ================= */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!isOriginAllowed(origin, req)) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403, headers: corsHeaders(origin) });
  }

  // Local IP throttle
  const xff = req.headers.get("x-forwarded-for");
  const headerIp = xff?.split(",")[0].trim()
    ?? req.headers.get("x-real-ip")
    ?? req.headers.get("cf-connecting-ip");
  const ip = headerIp ?? (req as any).ip ?? "unknown";
  if (!throttle(String(ip))) {
    return NextResponse.json({ error: "Too many requests", source: "local-throttle" }, { status: 429, headers: corsHeaders(origin) });
  }

  const raw = await req.text();
  const body = safeJson<{ message?: string; history?: any[]; userId?: string }>(raw);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders(origin) });

  const { message, history = [], userId } = body;
  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "Missing message" }, { status: 400, headers: corsHeaders(origin) });
  }

  // Build messages (system once + rolling summary + prior turns)
  const system = resolveSystemPrompt();
  const serverHistory = userId ? getConversation(userId) : [];
  const mappedServerHistory = mapAndTrimServerHistory(serverHistory);

  let systemSent = false;
  let summaryLine: string | undefined;

  if (userId) {
    const st = await getUserState(userId).catch(() => null);
    systemSent = !!st?.system_sent;
    if (st?.last_summary) summaryLine = `Context: ${normalize(st.last_summary)}`;
  }

  const messages: GrokMessage[] = [
    ...(!systemSent ? [{ role: "system", content: system }] : []),
    ...(summaryLine ? [{ role: "system", content: summaryLine }] : []),
    ...mappedServerHistory,
    ...(Array.isArray(history)
      ? history
          .filter(Boolean)
          .map((h) => ({
            role: h?.role === "assistant" ? "assistant" : "user",
            content: typeof h?.content === "string" ? normalize(h.content) : "",
          }))
          .filter((m) => m.content.length > 0)
          .slice(-2)
      : []),
    { role: "user", content: normalize(message) },
  ];

  return withUserLock(userId, async () => {
    try {
      // Persist incoming user message
      if (userId) {
        appendMessage(userId, { role: "user", content: message.trim(), ts: Date.now() });
        try {
          fetch("/api/quossi_2_0", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ event: "chat", user: userId, message: message.trim() }),
            keepalive: true,
          }).catch(() => {});
        } catch {}
      }

      // === xAI Grok ===
      const { text, raw } = await callGrok(messages, { temperature: 0.6, max_tokens: 400 });

      if (userId) {
        appendMessage(userId, { role: "assistant", content: text, ts: Date.now() });
      }
      if (userId && !systemSent) await markSystemSent(userId).catch(() => {});
      if (userId) {
        const recentTurns = mapAndTrimServerHistory(getConversation(userId), 6);
        const newSum = cheapSummary(recentTurns, 240);
        if (newSum) await saveSummary(userId, newSum).catch(() => {});
      }

      return NextResponse.json(
        { response: text, meta: { provider: "xai", model: GROK_MODEL, usage: raw?.usage ?? null, intent: "general" } },
        { headers: corsHeaders(origin) }
      );
    } catch (e: any) {
      // Now you’ll SEE the upstream body/status in responses & server logs
      const payload = {
        error: "Grok request failed",
        source: "xai-upstream",
        code: e?.status ?? 500,
        details: e?.message ?? "unknown",
        upstream_body: e?.detailRaw ?? null,
      };
      if (process.env.NODE_ENV !== "production") {
        console.error("🔴 Grok error:", payload);
        console.error("🔑 GROK_BASE:", GROK_BASE);
        console.error("🔑 GROK_MODEL:", GROK_MODEL);
        // Only log a short, masked key hint for debugging
        console.error("🔑 GROK_API_KEY starts with:", GROK_KEY?.slice(0, 6) || "(missing)");
      }
      return NextResponse.json(payload, { status: e?.status ?? 500, headers: corsHeaders(origin) });
    }
  });
}

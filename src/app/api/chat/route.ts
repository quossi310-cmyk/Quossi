// app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { corsHeaders, handleOptions, isOriginAllowed } from "@/app/lib/cors";
import * as Sys from "@/app/lib/systemPrompt";

/* === Supabase state helpers === */
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

/* ================= Small per-user queue (avoid bursts) ================= */
const userLocks = new Map<string, Promise<void>>();
async function withUserLock<T>(userId: string | undefined, fn: () => Promise<T>): Promise<T> {
  if (!userId) return fn();
  const prev = userLocks.get(userId) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((res) => (release = res));
  userLocks.set(userId, prev.then(() => next).catch(() => next));
  try {
    await prev;
    return await fn();
  } finally {
    release();
  }
}

/* ================= Throttle (local) ================= */
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

/* ================= Helpers ================= */
function safeJson<T = unknown>(raw: string): T | null {
  try { return JSON.parse(raw) as T; } catch { return null; }
}
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
function normalize(s: string) {
  return s.replace(/\s+/g, " ").trim();
}
function mapAndTrimServerHistory(
  serverHistory: StoredMsg[],
  lastN = 4
): Array<{ role: "user" | "assistant"; content: string }> {
  return serverHistory.slice(-lastN).map((m) => ({ role: m.role, content: normalize(m.content) }));
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ================= CORS preflight & health ================= */
export async function OPTIONS(req: NextRequest) { return handleOptions(req); }
export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  return NextResponse.json({ ok: true, message: "health" }, { headers: corsHeaders(origin) });
}

/* =======================================================================
   OPENAI FAILOVER: try multiple API keys, retry briefly per key
   ======================================================================= */
const getApiKeys = () => {
  // Order matters: try explicit 1/2/3 first, then fallback OPENAI_API_KEY
  return [
    process.env.OPENAI_API_KEY_1,
    process.env.OPENAI_API_KEY_2,
    process.env.OPENAI_API_KEY_3,
    process.env.OPENAI_API_KEY, // optional legacy fallback
  ].filter(Boolean) as string[];
};

type OAIMeta = {
  openai: {
    model: string;
    prompt_tokens?: number;
    completion_tokens?: number;
    key_index: number; // which key succeeded
  };
  attempt: number; // attempts on the successful key
};

async function callOpenAIWithKey(
  key: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  model: string,
  perKeyTimeCapMs = 4500
): Promise<{ text: string; meta: OAIMeta }> {
  const client = new OpenAI({ apiKey: key });
  const start = Date.now();
  let attempt = 0;

  while (true) {
    attempt++;
    try {
      const completion = await client.chat.completions.create({
        model,
        temperature: 0.6,
        max_tokens: 400,
        messages,
      });
      return {
        text: completion.choices[0]?.message?.content?.trim() || "No response",
        meta: {
          openai: {
            model,
            prompt_tokens: completion.usage?.prompt_tokens,
            completion_tokens: completion.usage?.completion_tokens,
            key_index: -1, // will be filled by the caller
          },
          attempt,
        },
      };
    } catch (e: any) {
      const code = e?.status ?? e?.response?.status ?? 500;
      const elapsed = Date.now() - start;

      // For per-key retry: retry on 429/5xx/network-ish; also allow a single retry on 400 just in case of transient routing issues
      const retriable = code === 429 || code >= 500 || code === 408 || code === 425 || code === 524 || code === 400;

      if (!retriable || elapsed >= perKeyTimeCapMs || attempt >= 2) {
        // Bubble up so outer loop can try the next key
        let headers: Record<string, string> | undefined;
        try {
          const h = e?.response?.headers;
          if (h && typeof h.get === "function") {
            headers = {
              "retry-after": h.get("retry-after") ?? "",
              "x-ratelimit-limit-requests": h.get("x-ratelimit-limit-requests") ?? "",
              "x-ratelimit-remaining-requests": h.get("x-ratelimit-remaining-requests") ?? "",
              "x-ratelimit-limit-tokens": h.get("x-ratelimit-limit-tokens") ?? "",
              "x-ratelimit-remaining-tokens": h.get("x-ratelimit-remaining-tokens") ?? "",
            };
          }
        } catch {}
        const err = new Error(e?.message ?? "OpenAI error") as any;
        err.status = code;
        err.headers = headers;
        throw err;
      }

      // brief backoff with jitter
      const jitter = Math.floor(Math.random() * 200);
      const base = 250 * Math.pow(2, attempt - 1);
      const waitMs = Math.min(base + jitter, Math.max(0, perKeyTimeCapMs - (Date.now() - start)));
      if (waitMs > 0) await sleep(waitMs);
    }
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
  const headerIp =
    xff?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    req.headers.get("cf-connecting-ip");
  const ip = headerIp ?? (req as any).ip ?? "unknown";
  if (!throttle(String(ip))) {
    return NextResponse.json(
      { error: "Too many requests", source: "local-throttle" },
      { status: 429, headers: corsHeaders(origin) }
    );
  }

  const keys = getApiKeys();
  if (keys.length === 0) {
    return NextResponse.json({ error: "Missing OPENAI_API_KEY(s)" }, { status: 500, headers: corsHeaders(origin) });
  }

  const raw = await req.text();
  const body = safeJson<{ message?: string; history?: any[]; userId?: string }>(raw);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders(origin) });

  const { message, history = [], userId } = body;
  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "Missing message" }, { status: 400, headers: corsHeaders(origin) });
  }

  /* === Build messages with Supabase-backed "send system prompt once" + rolling summary === */
  const system = resolveSystemPrompt();
  const serverHistory = userId ? getConversation(userId) : [];
  const mappedServerHistory = mapAndTrimServerHistory(serverHistory);

  // NEW: read state from Supabase (system_sent + last_summary)
  let systemSent = false;
  let summaryLine: string | undefined;

  if (userId) {
    const st = await getUserState(userId).catch(() => null);
    systemSent = !!st?.system_sent;
    if (st?.last_summary) summaryLine = `Context: ${normalize(st.last_summary)}`;
  }

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
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

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  return withUserLock(userId, async () => {
    try {
      // Persist incoming user message (existing memory)
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

      // === Try keys sequentially ===
      let lastErr: any = null;
      for (let i = 0; i < keys.length; i++) {
        try {
          const { text, meta } = await callOpenAIWithKey(keys[i], messages, model, 4500);
          // stamp which key succeeded
          meta.openai.key_index = i;
          if (userId) {
            appendMessage(userId, { role: "assistant", content: text, ts: Date.now() });
          }

          // Update Supabase state after success
          if (userId && !systemSent) {
            await markSystemSent(userId).catch(() => {});
          }
          if (userId) {
            const recentTurns = mapAndTrimServerHistory(getConversation(userId), 6);
            const newSum = cheapSummary(recentTurns, 240);
            if (newSum) await saveSummary(userId, newSum).catch(() => {});
          }

          return NextResponse.json(
            { response: text, meta: { ...meta, intent: "general" } },
            { headers: corsHeaders(origin) }
          );
        } catch (e: any) {
          lastErr = e;
          // Try next key
        }
      }

      // If we got here, all keys failed
      const code = lastErr?.status ?? 502;
      return NextResponse.json(
        {
          error: "OpenAI request failed (all keys)",
          source: code === 429 ? "openai-upstream" : "unknown",
          code,
          details: lastErr?.message ?? "unknown",
          headers: lastErr?.headers,
        },
        { status: code, headers: corsHeaders(origin) }
      );
    } catch (e: any) {
      const code = e?.status ?? 500;
      return NextResponse.json(
        {
          error: "OpenAI request failed",
          source: code === 429 ? "openai-upstream" : "unknown",
          code,
          details: e?.message ?? "unknown",
          headers: e?.headers,
        },
        { status: code, headers: corsHeaders(origin) }
      );
    }
  });
}

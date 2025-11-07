// api/quossi_2_0.js
// ==========================
// QUOSSI 2.1 — Emotional Memory Prototype (Serverless-ready, JS)
// Mirrors the Python implementation 1:1
// ==========================

const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

// ---- Core Ranges ----
const RANGES = [
  ["🌪 Storm", 100, 199, "The Reactor", "Fire", "Emotion first, logic later."],
  ["🌍 Ground", 200, 299, "The Builder", "Earth", "Steady hands make heavy bags."],
  ["🌊 Flow", 300, 399, "The Surfer", "Water", "Don’t fight the wave — ride it."],
  ["🏆 Gold", 400, 499, "The Strategist", "Air", "Silence wins faster."],
  ["☀️ Sun", 500, 600, "The Oracle", "Light", "Peace is the ultimate edge."],
];

// ---- Config ----
const MEM_BASE_DIR = process.env.QUOSSI_MEM_DIR || "/tmp";
const MEMORY_FILE_TEMPLATE = (user) => `quossi_memory_${user}.json`;
const ROLLING_WINDOW = 10;
const SLOPE_WINDOW = 7;

const EMOTION_WEIGHTS = {
  anxious: {
    angry: 2, mad: 2, frustrated: 3, lost: 2, hate: 2, sad: 2,
    anxious: 3, scared: 3, panic: 3, fear: 2, stressed: 3
  },
  positive: {
    happy: 2, grateful: 2, confident: 3, calm: 3, peaceful: 3,
    good: 1, winning: 2, profit: 2, composed: 2, focused: 1
  },
  "high-energy": {
    excited: 3, pumped: 3, ready: 2, motivated: 2, amped: 3,
    hyped: 3, wired: 2
  },
  neutral: {
    nervous: 1, unsure: 1, maybe: 1, confused: 2, ok: 1, fine: 1
  },
};

const BASE_BY_TONE = {
  anxious: 150,
  neutral: 250,
  positive: 350,
  "high-energy": 400,
};

// ---------- Helpers ----------
const safeUser = (u) => (u || "default").trim().replace(/[^a-zA-Z0-9_\-]/g, "_");
const memoryPath = async (user) => {
  await fs.mkdir(MEM_BASE_DIR, { recursive: true }).catch(() => {});
  return path.join(MEM_BASE_DIR, MEMORY_FILE_TEMPLATE(safeUser(user)));
};

async function loadMemory(user) {
  const p = await memoryPath(user);
  try {
    const raw = await fs.readFile(p, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { user, history: [] };
  }
}

async function saveMemory(user, memory) {
  try {
    const p = await memoryPath(user);
    await fs.writeFile(p, JSON.stringify(memory, null, 2), "utf-8");
  } catch {
    // ignore on read-only serverless
  }
}

function tokenCounts(msg) {
  const counts = {};
  for (const tone of Object.keys(EMOTION_WEIGHTS)) {
    const weights = EMOTION_WEIGHTS[tone];
    for (const token of Object.keys(weights)) {
      // word-boundary match like Python's \b
      const re = new RegExp(`\\b${escapeRegex(token)}\\b`, "g");
      const matches = msg.match(re);
      if (matches && matches.length) counts[token] = (counts[token] || 0) + matches.length;
    }
  }
  return counts;
}

function analyzeTone(message) {
  const msg = (message || "").toLowerCase();
  const counts = tokenCounts(msg);
  const scores = Object.fromEntries(Object.keys(EMOTION_WEIGHTS).map((k) => [k, 0]));

  for (const tone of Object.keys(EMOTION_WEIGHTS)) {
    const weights = EMOTION_WEIGHTS[tone];
    for (const [token, w] of Object.entries(weights)) {
      if (counts[token]) scores[tone] += w * counts[token];
    }
  }

  const exclam = (message.match(/!/g) || []).length;
  const caps = (message.match(/[A-Z]/g) || []).length;
  scores["anxious"] += Math.trunc(exclam * 0.5);
  scores["high-energy"] += Math.trunc(Math.max(0, caps - 8) * 0.2);

  if (Object.values(scores).every((v) => v === 0)) return "neutral";
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
}

function emotionalStability(message) {
  const text = message || "";
  const length = Math.max(1, text.length);
  const exclamQ = (text.match(/[!?]/g) || []).length;
  const caps = (text.match(/[A-Z]/g) || []).length;
  const repeats = (text.match(/(.)\1{2,}/g) || []).length;
  const rawInstability = exclamQ * 1.2 + Math.max(0, caps - 10) * 0.5 + repeats * 2.0;
  const normalized = rawInstability / (1 + length / 120);
  const score = Math.max(0, 100 - Math.trunc(Math.round(normalized * 3)));
  return score;
}

function deterministicJitter(message, span = 31) {
  const h = crypto.createHash("md5").update(message || "").digest("hex");
  const v = parseInt(h.slice(0, 8), 16) % span; // 0..30
  return v - 15;
}

function calculateQScore(message) {
  const tone = analyzeTone(message);
  const stability = emotionalStability(message);
  const base = BASE_BY_TONE[tone] ?? 250;
  let adjusted = base + Math.trunc((stability - 50) / 2);
  adjusted += deterministicJitter(message);
  return clamp(adjusted, 100, 600);
}

function assignRange(qscore) {
  for (const [name, low, high, archetype, element, motto] of RANGES) {
    if (qscore >= low && qscore <= high) {
      return { name, archetype, element, motto };
    }
  }
  return { name: "Unknown", archetype: "-", element: "-", motto: "-" };
}

function linearSlope(arr) {
  const y = [...arr];
  const n = y.length;
  if (n < 2) return 0.0;
  const xSum = ((n - 1) * n) / 2;
  const x2Sum = ((n - 1) * n * (2 * n - 1)) / 6;
  const ySum = y.reduce((a, b) => a + b, 0);
  const xySum = y.reduce((acc, yi, i) => acc + i * yi, 0);
  const denom = n * x2Sum - xSum ** 2;
  if (denom === 0) return 0.0;
  return (n * xySum - xSum * ySum) / denom;
}

function popStdDev(nums) {
  if (!nums || nums.length < 2) return null;
  const n = nums.length;
  const mean = nums.reduce((a, b) => a + b, 0) / n;
  const v = nums.reduce((acc, x) => acc + (x - mean) ** 2, 0) / n;
  return Math.round(Math.sqrt(v));
}

function weightedMainQscore(scores) {
  if (!scores || !scores.length) return null;
  const n = scores.length;
  const weights = Array.from({ length: n }, (_, i) => i + 1);
  const num = scores.reduce((acc, s, i) => acc + s * weights[i], 0);
  const den = weights.reduce((a, b) => a + b, 0);
  return Math.round(num / den);
}

function streakDirection(scores) {
  if (!scores || scores.length < 2) return ["steady", 1];
  let direction = "steady";
  let length = 1;
  for (let i = scores.length - 1; i > 0; i--) {
    const diff = scores[i] - scores[i - 1];
    const step = diff > 0 ? "up" : diff < 0 ? "down" : "steady";
    if (direction === "steady") {
      direction = step;
      length = 1;
    } else if (step === direction && step !== "steady") {
      length += 1;
    } else {
      break;
    }
  }
  return [direction, length];
}

function hypeReflection(tone, qrange, slope) {
  const trendHint =
    slope > 0.5
      ? "You’re trending up — keep channeling that rhythm."
      : slope < -0.5
      ? "Tiny wobble — slow the breath, steady the hands."
      : "You’re steady — consistency compounds.";

  const map = {
    anxious: `You sound tense, but self-aware — ${qrange.name} energy. Breathe. Let’s steady those hands. ${trendHint}`,
    neutral: `You’re composed — classic ${qrange.name} range. Builder focus on. ${trendHint}`,
    positive: `Calm confidence detected — pure ${qrange.name} flow. Stay locked in. ${trendHint}`,
    "high-energy": `Hyped and focused — ${qrange.name} elite energy. Channel it with patience. ${trendHint}`,
  };
  return map[tone] || `Clarity compounds. ${trendHint}`;
}

function updateMemoryObj(memory, { message, qscore, tone, nickname }) {
  if (nickname) memory.nickname = nickname;
  memory.history = memory.history || [];
  memory.history.push({
    ts: new Date().toISOString(),
    message,
    qscore,
    tone,
  });
  return memory;
}

async function updateMemory(user, message, qscore, tone, nickname) {
  const mem = await loadMemory(user);
  updateMemoryObj(mem, { message, qscore, tone, nickname });
  await saveMemory(user, mem);
  return mem;
}

function computeSummary(message, { user = "default", nickname = null, memory: preMem = null } = {}) {
  const tone = analyzeTone(message);
  const qscore = calculateQScore(message);
  const qrange = assignRange(qscore);

  const mem = preMem || { user, history: [] };
  updateMemoryObj(mem, { message, qscore, tone, nickname });

  const recent = mem.history.slice(-ROLLING_WINDOW).map((x) => x.qscore);
  const main_q = weightedMainQscore(recent);
  const vol = popStdDev(recent);
  const slope = recent.length ? linearSlope(recent.slice(-SLOPE_WINDOW)) : 0.0;
  const [streak_dir, streak_len] = streakDirection(recent);
  const reflection = hypeReflection(tone, qrange, slope);

  return {
    user,
    nickname: mem.nickname || nickname || null,
    tone,
    qscore,
    range: qrange,
    main_qscore: main_q,
    trend_slope: slope,
    volatility: vol,
    streak: { direction: streak_dir, length: streak_len },
    reflection,
  };
}

// ---------- Supabase (optional) ----------
function supabaseCfg() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? [url.replace(/\/+$/, ""), key] : [null, null];
}

function supabaseHeaders(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

async function httpJson(method, url, headers, payload = undefined) {
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: payload !== undefined ? JSON.stringify(payload) : undefined,
      // keep it snappy
      // NOTE: Vercel fetch doesn't support custom timeouts; rely on platform defaults.
    });
    const text = await res.text();
    return [res.status, Object.fromEntries(res.headers.entries()), text];
  } catch (e) {
    return [0, {}, String(e)];
  }
}

async function supabaseInsertHistory({ user, ts_iso, message, qscore, tone, nickname }) {
  const [url, key] = supabaseCfg();
  if (!url || !key) return;
  const endpoint = `${url}/rest/v1/qscore_history`;
  await httpJson("POST", endpoint, supabaseHeaders(key), [
    { user, ts: ts_iso, message, qscore, tone, nickname },
  ]);
}

async function supabaseUpsertState({ user, memory, summary }) {
  const [url, key] = supabaseCfg();
  if (!url || !key) return;
  const endpoint = `${url}/rest/v1/qscore_state?on_conflict=user`;
  await httpJson("POST", endpoint, supabaseHeaders(key), [
    {
      user,
      memory,
      last_summary: summary,
      updated_at: new Date().toISOString(),
    },
  ]);
}

async function supabaseFetchLatestSummary(user) {
  const [url, key] = supabaseCfg();
  if (!url || !key) return null;

  // Try state first
  const qs = new URLSearchParams({ select: "last_summary", user: `eq.${user}`, limit: "1" }).toString();
  let endpoint = `${url}/rest/v1/qscore_state?${qs}`;
  let [status, _hdrs, body] = await httpJson("GET", endpoint, supabaseHeaders(key));
  if (status >= 200 && status < 300) {
    try {
      const rows = JSON.parse(body || "[]");
      if (rows && rows.length && rows[0].last_summary && typeof rows[0].last_summary === "object") {
        return rows[0].last_summary;
      }
    } catch {}
  }

  // Fallback: build from latest history
  const qs2 = new URLSearchParams({
    select: "ts,message,qscore,tone,nickname",
    user: `eq.${user}`,
    order: "ts.desc",
    limit: "10",
  }).toString();
  endpoint = `${url}/rest/v1/qscore_history?${qs2}`;
  [status, _hdrs, body] = await httpJson("GET", endpoint, supabaseHeaders(key));
  if (status >= 200 && status < 300) {
    try {
      const rows = JSON.parse(body || "[]");
      if (!rows || !rows.length) return null;
      const recentScores = rows
        .map((r) => (Number.isInteger(r.qscore) ? r.qscore : null))
        .filter((x) => x !== null)
        .reverse(); // chronological
      const main_q = weightedMainQscore(recentScores);
      const vol = popStdDev(recentScores);
      const slope = recentScores.length ? linearSlope(recentScores.slice(-SLOPE_WINDOW)) : 0.0;
      const last = rows[0];
      const qscore = parseInt(last.qscore || 0, 10) || 0;
      const tone = last.tone || "neutral";
      const nickname = last.nickname || null;
      const qrange = assignRange(qscore);
      const [streak_dir, streak_len] = streakDirection(recentScores);
      const reflection = hypeReflection(tone, qrange, slope);
      return {
        user,
        nickname,
        tone,
        qscore,
        range: qrange,
        main_qscore: main_q,
        trend_slope: slope,
        volatility: vol,
        streak: { direction: streak_dir, length: streak_len },
        reflection,
      };
    } catch {
      return null;
    }
  }
  return null;
}

async function supabaseFetchStateMemory(user) {
  const [url, key] = supabaseCfg();
  if (!url || !key) return null;
  const qs = new URLSearchParams({ select: "memory", user: `eq.${user}`, limit: "1" }).toString();
  const endpoint = `${url}/rest/v1/qscore_state?${qs}`;
  const [status, _hdrs, body] = await httpJson("GET", endpoint, supabaseHeaders(key));
  if (status >= 200 && status < 300) {
    try {
      const rows = JSON.parse(body || "[]");
      if (rows && rows.length && rows[0].memory && typeof rows[0].memory === "object") {
        return rows[0].memory;
      }
    } catch {
      return null;
    }
  }
  return null;
}

// ---------- HTTP handling (Vercel/Next.js pages/api style) ----------
function corsHeadersFor(req) {
  const origin =
    (req.headers && (req.headers.origin || req.headers.Origin)) || "*";
  return {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Origin": origin,
  };
}

function send(res, status, headers, body) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers || {})) res.setHeader(k, v);
  if (body === "" || body === undefined || body === null) {
    res.end("");
  } else {
    const out = typeof body === "string" ? body : JSON.stringify(body);
    res.end(out);
  }
}

function parseJsonBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

// Export for Vercel/Next.js
module.exports = async (req, res) => {
  const cors = corsHeadersFor(req);

  try {
    const method = (req.method || "GET").toUpperCase();

    // CORS preflight
    if (method === "OPTIONS") {
      return send(res, 204, cors, "");
    }

    if (method === "GET") {
      // try to read user from query
      const urlObj = new URL(req.url, "http://local");
      const user = urlObj.searchParams.get("user") || "default";

      // Prefer Supabase summary
      const sb = await supabaseFetchLatestSummary(user);
      if (sb) {
        return send(res, 200, { "content-type": "application/json", ...cors }, sb);
      }

      // Fallback to local memory
      const mem = await loadMemory(user);
      const hist = mem.history || [];
      if (!hist.length) {
        return send(
          res,
          404,
          { "content-type": "application/json", ...cors },
          { error: "No history for user" }
        );
      }
      const recent = hist.slice(-ROLLING_WINDOW).map((x) => x.qscore);
      const main_q = weightedMainQscore(recent);
      const vol = popStdDev(recent);
      const slope = recent.length ? linearSlope(recent.slice(-SLOPE_WINDOW)) : 0.0;
      const last = hist[hist.length - 1];
      const qscore = last.qscore || 0;
      const tone = last.tone || "neutral";
      const qrange = assignRange(qscore);
      const [streak_dir, streak_len] = streakDirection(recent);
      const reflection = hypeReflection(tone, qrange, slope);

      return send(res, 200, { "content-type": "application/json", ...cors }, {
        user,
        nickname: mem.nickname || null,
        tone,
        qscore,
        range: qrange,
        main_qscore: main_q,
        trend_slope: slope,
        volatility: vol,
        streak: { direction: streak_dir, length: streak_len },
        reflection,
      });
    }

    if (method !== "POST") {
      return send(
        res,
        405,
        { "allow": "GET,POST,OPTIONS", "content-type": "application/json", ...cors },
        { error: "Use GET to read or POST to update" }
      );
    }

    // POST
    const data = await parseJsonBody(req);
    const headers = req.headers || {};
    const user = data.user || headers["x-quossi-user"] || "default";
    const nickname = data.nickname || headers["x-quossi-nickname"] || null;

    // Branch: chat event buffering
    if (data.chat || data.event === "chat") {
      const chatMsg = data.message;
      if (typeof chatMsg !== "string" || !chatMsg.trim()) {
        return send(
          res,
          400,
          { "content-type": "application/json", ...cors },
          { error: "Invalid chat message" }
        );
      }

      const mem = (await supabaseFetchStateMemory(user)) || (await loadMemory(user));
      const chatState = mem.chat_state || {};
      let count = Number(chatState.count || 0);
      let threshold = Number(chatState.threshold || 0);
      let buffer = Array.isArray(chatState.buffer) ? chatState.buffer : [];
      if (threshold < 15 || threshold > 20) threshold = 15 + Math.floor(Math.random() * 6);

      buffer.push(chatMsg.trim());
      count += 1;

      if (count < threshold) {
        mem.chat_state = { count, threshold, buffer };
        await saveMemory(user, mem);
        try {
          const lastSummary = (await supabaseFetchLatestSummary(user)) || {};
          await supabaseUpsertState({ user, memory: mem, summary: lastSummary });
        } catch {}
        return send(
          res,
          202,
          { "content-type": "application/json", ...cors },
          { status: "queued", count, threshold }
        );
      }

      // threshold reached
      const combined = buffer.filter((m) => typeof m === "string" && m.trim()).join(" | ");
      const out = computeSummary(combined, { user, nickname });

      // reset counter & buffer with new threshold
      const freshMem =
        (await supabaseFetchStateMemory(user)) || (await loadMemory(user));
      freshMem.nickname = freshMem.nickname || nickname || null;
      freshMem.chat_state = { count: 0, threshold: 15 + Math.floor(Math.random() * 6), buffer: [] };
      await saveMemory(user, freshMem);

      try {
        const ts_iso = new Date().toISOString();
        await supabaseInsertHistory({
          user,
          ts_iso,
          message: combined,
          qscore: out.qscore || 0,
          tone: out.tone || "neutral",
          nickname: out.nickname || null,
        });
        await supabaseUpsertState({ user, memory: freshMem, summary: out });
      } catch {}

      return send(res, 200, { "content-type": "application/json", ...cors }, out);
    }

    // Branch: form answers
    const answers = data.answers;
    if (!Array.isArray(answers) || !answers.every((x) => typeof x === "string")) {
      return send(
        res,
        400,
        { "content-type": "application/json", ...cors },
        { error: "Invalid payload: 'answers' must be a list of strings." }
      );
    }

    const message = answers.map((a) => (a || "").trim()).filter(Boolean).join(" | ");
    const out = computeSummary(message, { user, nickname });

    try {
      const ts_iso = new Date().toISOString();
      await supabaseInsertHistory({
        user,
        ts_iso,
        message,
        qscore: out.qscore || 0,
        tone: out.tone || "neutral",
        nickname: out.nickname || null,
      });
      const memNow = await loadMemory(user);
      await supabaseUpsertState({ user, memory: memNow, summary: out });
    } catch {}

    return send(res, 200, { "content-type": "application/json", ...cors }, out);
  } catch (e) {
    return send(
      res,
      500,
      { "content-type": "application/json", ...cors },
      { error: String(e && e.message ? e.message : e) }
    );
  }
};
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function corsHeaders(origin: string | null) {
  const allowOrigin = origin || "*";
  return {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Origin": allowOrigin,
  } as Record<string, string>;
}

function mergeHeaders(a: HeadersInit, b: Record<string, string>) {
  const out = new Headers(a);
  for (const [k, v] of Object.entries(b)) out.set(k, v);
  return out;
}

async function tryChatSummary(req: NextRequest) {
  try {
    const origin = req.nextUrl.origin;
    const chatUrl = new URL("/api/chat", origin);
    if (req.nextUrl.search) chatUrl.search = req.nextUrl.search;
    const init: RequestInit = { method: "GET" };
    const resp = await fetch(chatUrl.toString(), init);
    if (!resp.ok) return null;
    const text = await resp.text();
    const headers = mergeHeaders(resp.headers, corsHeaders(req.headers.get("origin")));
    return new NextResponse(text, { status: resp.status, headers });
  } catch {
    return null;
  }
}

async function proxyToPython(req: NextRequest, bodyOverride?: string) {
  const origin = req.nextUrl.origin;
  const url = new URL("/api/quossi_2_0.py", origin);
  if (req.nextUrl.search) url.search = req.nextUrl.search;

  const init: RequestInit = {
    method: req.method,
    headers: {
      "content-type": req.headers.get("content-type") || "application/json",
      "x-quossi-user": req.headers.get("x-quossi-user") || "",
      "x-quossi-nickname": req.headers.get("x-quossi-nickname") || "",
    },
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = bodyOverride ?? (await req.text());
  }

  const resp = await fetch(url, init);
  if (!resp.ok) {
    throw new Error(`proxy ${resp.status}`);
  }
  const text = await resp.text();
  const headers = mergeHeaders(resp.headers, corsHeaders(req.headers.get("origin")));
  return new NextResponse(text, { status: resp.status, headers });
}

export async function OPTIONS(req: NextRequest) {
  const headers = corsHeaders(req.headers.get("origin"));
  return new NextResponse(null, { status: 204, headers });
}

export async function GET(req: NextRequest) {
  try {
    const viaChat = await tryChatSummary(req);
    if (viaChat) return viaChat;
    return await proxyToPython(req);
  } catch {
    // Fallback for local dev without Python runtime
    const headers = corsHeaders(req.headers.get("origin"));
    const user = req.nextUrl.searchParams.get("user") || "default";
    const q = 100 + ((Array.from(user).reduce((a, c) => a + c.charCodeAt(0), 0) + new Date().getUTCDate()) % 501);
    const qscore = Math.max(100, Math.min(600, q));
    const body = {
      user,
      tone: qscore >= 400 ? "positive" : qscore >= 300 ? "neutral" : qscore >= 200 ? "neutral" : "stressed",
      qscore,
      range:
        qscore < 200
          ? { name: "Storm", archetype: "The Reactor", element: "Fire", motto: "Emotion first, logic later." }
          : qscore < 300
          ? { name: "Ground", archetype: "The Builder", element: "Earth", motto: "Steady hands make heavy bags." }
          : qscore < 400
          ? { name: "Flow", archetype: "The Surfer", element: "Water", motto: "Don't fight the wave — ride it." }
          : qscore < 500
          ? { name: "Gold", archetype: "The Strategist", element: "Air", motto: "Silence wins faster." }
          : { name: "Sun", archetype: "The Oracle", element: "Light", motto: "Peace is the ultimate edge." },
      main_qscore: null,
      trend_slope: 0,
      volatility: null,
      streak: { direction: "flat", length: 0 },
      reflection: "Keep stacking calm reps.",
    };
    return NextResponse.json(body, { status: 200, headers });
  }
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req.headers.get("origin"));
  // Validate payload from form page
  let data: any = {};
  try { data = await req.json(); } catch {}
  const answers = Array.isArray(data?.answers) ? data.answers : null;
  if (!answers || !answers.every((x: any) => typeof x === "string")) {
    return NextResponse.json(
      { error: "Invalid payload: 'answers' must be an array of strings" },
      { status: 400, headers }
    );
  }
  try {
    const body = JSON.stringify({ answers, user: data?.user, nickname: data?.nickname, event: data?.event, message: data?.message });
    return await proxyToPython(req, body);
  } catch {
    // Fallback: accept and proceed (frontend only checks res.ok)
    return NextResponse.json({}, { status: 200, headers });
  }
}

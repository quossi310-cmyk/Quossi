// app/lib/cors.ts
import { NextResponse, NextRequest } from "next/server";

const comma = /,\s*/g;

type AllowRule =
  | { type: "exact"; value: string }
  | { type: "suffix"; value: string } // e.g. .vercel.app
  | { type: "scheme_host"; scheme: string; host: string }; // e.g. capacitor://localhost

function buildDefaultAllowlist(): AllowRule[] {
  const rules: AllowRule[] = [
    { type: "exact", value: "http://localhost:3000" },
    { type: "exact", value: "http://127.0.0.1:3000" },
    { type: "exact", value: "http://10.0.2.2:3000" },      // Android emulator loopback
    { type: "exact", value: "https://quossi.com" },
    { type: "exact", value: "https://www.quossi.com" },
    { type: "scheme_host", scheme: "capacitor", host: "localhost" }, // Capacitor WebView
  ];

  // Optional preview hosts via env toggles
  const allowVercel = (process.env.ALLOW_VERCEL_PREVIEWS ?? "true") === "true";
  const allowNetlify = (process.env.ALLOW_NETLIFY_PREVIEWS ?? "true") === "true";

  if (allowVercel) rules.push({ type: "suffix", value: ".vercel.app" });
  if (allowNetlify) rules.push({ type: "suffix", value: ".netlify.app" });

  // Extra origins from env (comma-separated)
  const fromEnv = (process.env.ALLOWED_ORIGINS ?? "")
    .split(comma)
    .map(s => s.trim())
    .filter(Boolean);

  for (const o of fromEnv) rules.push({ type: "exact", value: o });

  return rules;
}

const allowlist = buildDefaultAllowlist();

function originMatchesRule(origin: string, rule: AllowRule): boolean {
  try {
    const u = new URL(origin);

    if (rule.type === "exact") return origin === rule.value;

    if (rule.type === "suffix") {
      // Only applies to http/https hosts
      if (u.protocol !== "http:" && u.protocol !== "https:") return false;
      return u.hostname.endsWith(rule.value);
    }

    if (rule.type === "scheme_host") {
      return u.protocol === `${rule.scheme}:` && u.hostname === rule.host;
    }

    return false;
  } catch {
    return false;
  }
}

export function isOriginAllowed(origin: string | null, req: NextRequest): boolean {
  // Same-origin / server internal calls (no Origin) → allow
  if (!origin) return true;

  // Allow if request origin equals the runtime origin (SSR same-origin)
  try {
    if (origin === req.nextUrl.origin) return true;
  } catch { /* ignore */ }

  return allowlist.some(rule => originMatchesRule(origin, rule));
}

export function corsHeaders(origin: string | null, req?: NextRequest) {
  const requestHeaders =
    req?.headers.get("access-control-request-headers") ?? "Content-Type, Authorization";

  const hdrs: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": requestHeaders,
    "Access-Control-Allow-Credentials": "true",
  };

  if (origin) hdrs["Access-Control-Allow-Origin"] = origin;

  return hdrs;
}

export function handleOptions(req: NextRequest) {
  const origin = req.headers.get("origin");
  const ok = isOriginAllowed(origin, req);
  const headers = ok ? corsHeaders(origin, req) : {};
  return new NextResponse(null, { status: ok ? 204 : 403, headers });
}

/** Wrap any Response with CORS headers (use in your route handlers) */
export function withCORS(res: Response, req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!isOriginAllowed(origin, req)) {
    return new NextResponse(JSON.stringify({ error: "CORS: origin not allowed" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  const headers = corsHeaders(origin, req);
  // Merge headers
  const merged = new Headers(res.headers);
  for (const [k, v] of Object.entries(headers)) merged.set(k, v);
  return new Response(res.body, { status: res.status, headers: merged });
}

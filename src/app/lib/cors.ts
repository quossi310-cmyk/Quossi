// app/lib/cors.ts
import { NextResponse, NextRequest } from "next/server";

const comma = /,\s*/g;

function getAllowedOrigins() {
  // Comma-separated list in an env var
  const list = process.env.ALLOWED_ORIGINS ?? "";
  const fromEnv = list.split(comma).filter(Boolean);

  // Add localhost for dev by default
  const defaults = ["http://localhost:3000", "http://127.0.0.1:3000"];

  // Optional: allow all Netlify previews
  const allowNetlifyPreviews = (process.env.ALLOW_NETLIFY_PREVIEWS ?? "true") === "true";

  return { fromEnv, defaults, allowNetlifyPreviews };
}

export function isOriginAllowed(origin: string | null, req: NextRequest) {
  // Same-origin or server-side calls (no Origin) → allow
  if (!origin) return true;

  const { fromEnv, defaults, allowNetlifyPreviews } = getAllowedOrigins();
  const allow = new Set([...fromEnv, ...defaults]);

  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();

    // exact matches
    if (allow.has(origin)) return true;

    // allow your own runtime origin (SSR) if it matches
    try {
      const runtimeOrigin = req.nextUrl.origin;
      if (origin === runtimeOrigin) return true;
    } catch { /* ignore */ }

    // wildcard convenience: *.netlify.app (previews/branches)
    if (allowNetlifyPreviews && host.endsWith(".netlify.app")) return true;

    return false;
  } catch {
    return false;
  }
}

export function corsHeaders(origin: string | null) {
  // Only echo back allowed origins; callers already checked
  const hdrs: Record<string, string> = {
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  if (origin) hdrs["Access-Control-Allow-Origin"] = origin;
  return hdrs;
}

export function handleOptions(req: NextRequest) {
  const origin = req.headers.get("origin");
  const ok = isOriginAllowed(origin, req);
  const headers = ok ? corsHeaders(origin) : {};
  return new NextResponse(null, { status: ok ? 204 : 403, headers });
}

// src/lib/supabase/service.ts
import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the Service Role key.
 * Use ONLY in server code (API routes, server actions, cron jobs).
 * Never import this into client components.
 */
export function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "X-Client-Info": "quossi-api" } },
  });
}

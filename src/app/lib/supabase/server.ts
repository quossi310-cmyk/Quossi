// src/lib/supabase/server.ts
import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          // ⚠️ Will throw in Server Components; allowed in Route Handlers / Server Actions
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // ignore during RSC render
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            // Either approach works:
            // cookieStore.delete(name);
            cookieStore.set({ name, value: '', ...options });
          } catch {
            // ignore during RSC render
          }
        },
      },
    }
  );
}

// app/signup/page.tsx
"use client";

import React, { Suspense, useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Image from "next/image";
import { supabaseBrowser } from "@/app/lib/supabase/client";

// tiny password score helper
function scorePassword(pw: string) {
  let s = 0;
  if (!pw) return 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4); // 0..4
}

/** Page-level component: provides Suspense boundary required for useSearchParams */
export default function SignUpPage() {
  return (
    <Suspense fallback={<div />}>
      <SignUpInner />
    </Suspense>
  );
}

/** Inner component does the actual work (safe to use useSearchParams here) */
function SignUpInner() {
  const router = useRouter();
  const qs = useSearchParams();

  const envOK =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const supabase = envOK ? supabaseBrowser() : null;

  // form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState<string>(qs.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const pwScore = useMemo(() => scorePassword(password), [password]);
  const canSubmit =
    envOK && !loading && email.length > 3 && password.length >= 8 && password === confirm;

  // already authed? bounce to dashboard
  useEffect(() => {
    (async () => {
      if (!supabase) return;
      const { data, error } = await supabase.auth.getUser();
      if (!error && data.user) router.replace("/dashboard");
    })();
  }, [router, supabase]);

  async function handleEmailPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase || !canSubmit) return;

    try {
      setLoading(true);
      setMsg(null);
      setErr(null);

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: name ? { full_name: name } : undefined,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;

      if (!data.session) {
        setMsg("Check your email to confirm your account.");
      } else {
        setMsg("Account created! Redirecting…");
        router.replace("/dashboard");
      }
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : "Sign up failed.";
      setErr(m);
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    if (!supabase || !email) return;

    try {
      setLoading(true);
      setMsg(null);
      setErr(null);

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });

      if (error) throw error;
      setMsg("Magic link sent. Check your email.");
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : "Could not send magic link.";
      setErr(m);
    } finally {
      setLoading(false);
    }
  }

  async function oauth(provider: "google" | "github") {
    if (!supabase) return;
    setLoading(true);
    setMsg(null);
    setErr(null);
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    // Supabase will redirect
  }

  return (
    <main className="relative min-h-screen bg-black text-white font-sans overflow-y-auto">
      {/* Fixed background layers (stay static while content scrolls) */}
      <div className="fixed inset-0 z-10 bg-yellow-400" />
      <div className="fixed inset-0 z-20 flex items-center justify-center hover-animation">
        <Image
          src="/lg23.png"
          alt="Background Logo"
          width={500}
          height={500}
          className="drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] select-none"
          priority
        />
      </div>
      <div className="fixed inset-0 z-30 bg-gradient-to-b from-transparent via-[#1b144060] to-[#0a0615] pointer-events-none" />

      {/* Scrollable content */}
      <div className="relative z-40 flex flex-col items-center justify-start min-h-screen px-4 py-16">
        <div className="bg-white/10 backdrop-blur-md border border-white/20 shadow-[0_0_25px_rgba(255,255,255,0.3)] rounded-2xl p-10 w-[90%] max-w-md text-center mb-24">
          <h2 className="glow-bounce text-3xl font-bold mb-6 text-yellow-400 drop-shadow-[0_0_15px_rgba(255,215,0,0.8)]">
            Create An Account
          </h2>

          {!envOK && (
            <p className="mb-4 text-red-300">
              Missing <code>NEXT_PUBLIC_SUPABASE_URL</code> /{" "}
              <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>. Add them to
              <code> .env.local</code> and restart your dev server.
            </p>
          )}

          <form className="flex flex-col gap-5" onSubmit={handleEmailPassword}>
            <input
              type="text"
              placeholder="Full Name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="px-5 py-3 rounded-full bg-white/20 border border-white/30 placeholder-gray-300 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400 transition-all duration-300"
            />

            <input
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="px-5 py-3 rounded-full bg-white/20 border border-white/30 placeholder-gray-300 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400 transition-all duration-300"
            />

            <div className="space-y-3">
              <input
                type="password"
                placeholder="Password (min 8 chars)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-5 py-3 rounded-full bg-white/20 border border-white/30 placeholder-gray-300 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400 transition-all duration-300"
              />

              {/* strength bar */}
              <div className="h-2 w-full bg-white/20 rounded-full overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all duration-200 ${
                    pwScore >= 3 ? "bg-green-400" : pwScore === 2 ? "bg-yellow-400" : "bg-red-400"
                  }`}
                  style={{ width: `${(pwScore / 4) * 100}%` }}
                />
              </div>

              <input
                type="password"
                placeholder="Confirm Password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                className="w-full px-5 py-3 rounded-full bg-white/20 border border-white/30 placeholder-gray-300 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400 transition-all duration-300"
              />
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className={`mt-2 px-8 py-3 font-semibold rounded-full bg-gradient-to-r from-yellow-500 to-yellow-600 shadow-[0_0_25px_rgba(255,215,0,0.6)] transition-all duration-300 ${
                canSubmit
                  ? "hover:shadow-[0_0_50px_rgba(255,215,0,0.9)] hover:scale-105"
                  : "opacity-60 cursor-not-allowed"
              }`}
            >
              {loading ? "Creating..." : "Sign Up"}
            </button>

           

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-white/20" />
              <span className="text-sm text-gray-200">or</span>
              <div className="h-px flex-1 bg-white/20" />
            </div>

          
          </form>

          {msg && <p className="mt-4 text-sm text-green-300">{msg}</p>}
          {err && <p className="mt-4 text-sm text-red-300">{err}</p>}

          <p className="mt-6 text-sm text-gray-200">
            Already have an account?{" "}
            <span
              onClick={() => router.push("/signin")}
              className="text-yellow-300 hover:underline cursor-pointer"
            >
              Sign In
            </span>
          </p>
        </div>
      </div>

      {/* Keyframes */}
      <style jsx global>{`
        @keyframes hoverAnimation {
          0% { transform: translateY(0); }
          50% { transform: translateY(-20px); }
          100% { transform: translateY(0); }
        }
        .hover-animation { animation: hoverAnimation 3s ease-in-out infinite; }

        @keyframes glowPulse {
          0% { text-shadow: 0 0 5px rgba(0,0,0,0.4); transform: translateY(0); }
          50% { text-shadow: 0 0 15px rgba(0,0,0,0.6); transform: translateY(-10px); }
          100% { text-shadow: 0 0 5px rgba(0,0,0,0.4); transform: translateY(0); }
        }
        .glow-bounce { animation: glowPulse 2.5s ease-in-out infinite; }
      `}</style>
    </main>
  );
}

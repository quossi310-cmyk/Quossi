// src/app/signin/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Image from "next/image";
import { supabaseBrowser } from "@/app/lib/supabase/client";

type OAuthProvider = "google" | "github";

export default function SignIn() {
  const router = useRouter();
  const supabase = supabaseBrowser();

  const [sparkleActive, setSparkleActive] = useState(false);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setSparkleActive(true);
      setTimeout(() => setSparkleActive(false), 1500);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  async function emailPasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: pass,
    });
    setLoading(false);
    setMsg(error ? error.message : "Logged in! Redirecting…");
    if (!error) router.push("/dashboard");
  }

  async function magicLink(e?: React.MouseEvent<HTMLButtonElement>) {
    e?.preventDefault();
    setLoading(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    setMsg(error ? error.message : "Check your email for the magic link.");
  }

  async function oauth(provider: OAuthProvider) {
    setMsg(null);
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setLoading(false);
      setMsg(error.message);
    } else if (!data?.url) {
      setLoading(false);
      setMsg("Unable to start OAuth flow.");
    }
  }

  return (
    <main className="relative min-h-screen bg-black text-white font-sans overflow-y-auto">
      {/* --- Background layers --- */}
      <div className="fixed inset-0 flex items-center justify-center z-0 bg-yellow-400" />
      <div className="fixed inset-0 flex items-center justify-center z-10 hover-animation">
        <Image
          src="/lg23.png"
          alt="Background Logo"
          width={500}
          height={500}
          className="drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] select-none"
          priority
        />
      </div>
      <div className="fixed inset-0 z-20 bg-gradient-to-b from-transparent via-[#1b144060] to-[#0a0615] pointer-events-none" />

      {/* --- Scrollable Content --- */}
      <div className="relative z-30 flex flex-col items-center justify-start min-h-screen py-20 px-4">
        <div className="bg-white/10 backdrop-blur-md border border-white/20 shadow-[0_0_25px_rgba(255,255,255,0.3)] rounded-2xl p-8 sm:p-10 w-[90%] max-w-md text-center mb-20">
          <h2 className="glow-bounce text-3xl font-bold mb-6 text-yellow-400 drop-shadow-[0_0_15px_rgba(255,215,0,0.8)]">
            Welcome Back
          </h2>

          <form onSubmit={emailPasswordLogin} className="flex flex-col gap-5">
            <input
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="px-5 py-3 rounded-full bg-white/20 border border-white/30 placeholder-gray-300 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400 transition-all duration-300"
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              className="px-5 py-3 rounded-full bg-white/20 border border-white/30 placeholder-gray-300 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400 transition-all duration-300"
              required
            />

            <button
              type="submit"
              disabled={loading}
              className={`relative mt-2 px-8 py-3 font-semibold rounded-full bg-black text-white overflow-hidden shadow-[0_0_25px_rgba(255,215,0,0.6)] transition-all duration-300 bubble-btn ${
                sparkleActive ? "sparkle-active" : ""
              } disabled:opacity-60`}
            >
              <span className="bubble-layer" aria-hidden="true">
                <span className="bubble bubble-1" />
                <span className="bubble bubble-2" />
                <span className="bubble bubble-3" />
              </span>
              <span className="sparkle-layer" aria-hidden="true" />
              <span className="button-text relative z-10">
                {loading ? "Signing in..." : "Login"}
              </span>
            </button>
          </form>

          

          {msg && <p className="mt-4 text-sm text-yellow-200/90">{msg}</p>}

          <p className="mt-6 text-sm text-gray-200">
            Don’t have an account?{" "}
            <span
              onClick={() => router.push("/form")}
              className="text-yellow-400 hover:underline cursor-pointer"
            >
              Sign Up
            </span>
          </p>
        </div>
      </div>

      {/* --- Animations --- */}
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

        @keyframes sparkle {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(100%); }
          100% { transform: translateX(100%); }
        }
        .sparkle-layer {
          position: absolute;
          inset: 0;
          background: linear-gradient(120deg, transparent, rgba(255,215,0,0.6), transparent);
          transform: translateX(-100%);
          pointer-events: none;
          z-index: 8;
        }
        .sparkle-active .sparkle-layer { animation: sparkle 1.5s linear forwards; }

        .bubble-btn { position: relative; display: inline-flex; align-items: center; justify-content: center; }
        .bubble-layer { position: absolute; inset: 0; pointer-events: none; overflow: visible; z-index: 5; }
        .bubble { position: absolute; border-radius: 9999px; background: rgba(255,255,255,0.12); opacity: 0; transform: translateY(8px) scale(0.7); will-change: transform, opacity; }
        .bubble-1 { left: 18%; bottom: 18%; width: 10px; height: 10px; animation-delay: 0ms; }
        .bubble-2 { left: 50%; bottom: 10%; width: 14px; height: 14px; animation-delay: 90ms; }
        .bubble-3 { right: 18%; bottom: 20%; width: 8px; height: 8px; animation-delay: 180ms; }

        @keyframes bubbleUp {
          0% { transform: translateY(8px) scale(0.6); opacity: 0; }
          10% { opacity: 0.9; }
          80% { opacity: 0.4; }
          100% { transform: translateY(-28px) scale(1.2); opacity: 0; }
        }
        .bubble-btn:hover .bubble {
          animation-name: bubbleUp;
          animation-duration: 900ms;
          animation-timing-function: cubic-bezier(0.2, 0.9, 0.2, 1);
          animation-fill-mode: forwards;
        }
      `}</style>
    </main>
  );
}

"use client";
import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type QRange = {
  name: string;
  archetype: string;
  element?: string;
  motto: string;
};

type QSummary = {
  user: string;
  tone: string;
  qscore: number;
  range: QRange;
  main_qscore: number | null;
  trend_slope: number;
  volatility: number | null;
  streak: { direction: string; length: number };
  reflection: string;
};

export default function QScoreBanner() {
  const router = useRouter();
  const [data, setData] = useState<QSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let mounted = true;

    // Cancel any previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    async function load() {
      try {
        // 1. Show cached result instantly
        const cached = sessionStorage.getItem("qscore_result");
        if (cached && mounted) {
          try {
            const parsed = JSON.parse(cached) as QSummary;
            setData(parsed);
          } catch {
            // Ignore corrupted cache
          }
        }

        // 2. Fetch fresh data from local API route only
        const res = await fetch("/api/qscore-groq", {
          method: "GET",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          cache: "no-store", // Always fresh
        });

        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`HTTP ${res.status}: ${txt}`);
        }

        const fresh: QSummary = await res.json();

        // 3. Cache fresh result
        sessionStorage.setItem("qscore_result", JSON.stringify(fresh));

        if (mounted) {
          setData(fresh);
          setError(null);
        }
      } catch (e: any) {
        if (!mounted || e?.name === "AbortError") return;
        setError(e?.message || "Failed to load Q-Score");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, []); // No dependencies — only runs on mount

  const title = loading ? "Loading…" : data?.range?.archetype || "QUOSSI";
  const score = data?.qscore ?? null;
  const reflection = error
    ? error
    : data?.reflection || "Complete the form to generate your Q-Score.";

  return (
    <main className="relative min-h-screen bg-transparent text-white flex items-center justify-center overflow-hidden">
      {/* Soft glow background */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="w-[640px] h-[640px] rounded-full bg-yellow-400/25 blur-[140px]" />
      </div>

      {/* Card */}
      <section
        className="relative w-[min(92vw,520px)] rounded-[28px] bg-[#0b0b0b] text-center p-8 md:p-10
                   border border-white/5 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_22px_70px_rgba(0,0,0,0.65)]"
      >
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-wide text-yellow-400">
          {title}
        </h1>

        {!loading && data?.range && (
          <div className="mt-3 text-sm text-white/70">
            <span className="px-2 py-1 rounded-md bg-white/5 border border-white/10">
              {data.range.name}
              {data.range.element ? ` • ${data.range.element}` : ""}
            </span>
            {data.range.motto && (
              <p className="mt-3 italic text-white/60">“{data.range.motto}”</p>
            )}
          </div>
        )}

        <p className="mt-6 text-[17px] md:text-[18px] text-white/90">
          Q-Score:{" "}
          {loading ? (
            <span className="font-semibold text-white/70">—</span>
          ) : (
            <span className="font-semibold">{score ?? "—"}</span>
          )}
        </p>

        <p className="mt-7 text-base md:text-lg leading-relaxed text-yellow-300 min-h-[3rem]">
          {reflection}
        </p>

        <button
          type="button"
          onClick={() => router.push("/signup")}
          className="mt-9 inline-flex items-center justify-center rounded-xl px-6 py-3
                     bg-yellow-400 text-black font-semibold
                     shadow-[0_8px_24px_rgba(255,215,0,0.35)]
                     hover:bg-yellow-300 active:translate-y-[1px]
                     focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow-200
                     transition"
        >
          View Stat-Chat <span className="ml-2">↗</span>
        </button>
      </section>
    </main>
  );
}
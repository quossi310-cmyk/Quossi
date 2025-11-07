// components/QScoreBanner.tsx
"use client";
import React, { useEffect, useState } from "react";

type QRange = { name: string; archetype: string; element: string; motto: string };
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
  const [data, setData] = useState<QSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10000);
    async function run() {
      try {
        const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
        const url = `${base}/api/quossi_2_0?user=default`;
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(t);
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Fetch failed ${res.status} ${res.statusText}${text ? `: ${text}` : ""}`);
        }
        const json = (await res.json()) as QSummary;
        if (isMounted) setData(json);
      } catch (e: any) {
        if (isMounted) setError(e?.message || "Failed to load QScore");
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    run();
    return () => {
      isMounted = false;
      controller.abort();
      clearTimeout(t);
    };
  }, []);

  const title = data?.range?.archetype || "QUOSSI";
  const score = data?.qscore ?? null;
  const mainScore = data?.main_qscore ?? null;
  const reflection = data?.reflection || "Answer the form to generate your Q-Score.";

  return (
    <main className="relative min-h-screen bg-transparent text-white flex items-center justify-center overflow-hidden">
      {/* Yellow glow background */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="w-[640px] h-[640px] rounded-full bg-yellow-400/25 blur-[140px]" />
      </div>

      {/* Card */}
      <section
        className="relative w-[min(92vw,520px)] rounded-[28px] bg-[#0b0b0b] text-center p-8 md:p-10
                   border border-white/5 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_22px_70px_rgba(0,0,0,0.65)]"
      >
        {/* Name */}
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-wide text-yellow-400">
          {loading ? "Loading…" : title}
        </h1>

        {/* Stats */}
        <p className="mt-6 text-[17px] md:text-[18px] text-white/90">
          Composure Level: {loading ? (
            <span className="font-semibold text-white/70">—</span>
          ) : (
            <span className="font-semibold">{mainScore ?? score ?? "—"} (Recent)</span>
          )}
        </p>
        <p className="mt-1 text-[17px] md:text-[18px] text-white/90">
          Q-Score: {loading ? (
            <span className="font-semibold text-white/70">—</span>
          ) : (
            <span className="font-semibold">{score ?? "—"}</span>
          )}
        </p>

        {/* Quote */}
        <p className="mt-7 text-base md:text-lg leading-relaxed text-yellow-300 min-h-[3rem]">
          {error ? (
            <span className="text-red-400">{error}</span>
          ) : (
            reflection
          )}
        </p>

        {/* Button */}
    <button
  type="button"
  onClick={() => (window.location.href = "/signup")}
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


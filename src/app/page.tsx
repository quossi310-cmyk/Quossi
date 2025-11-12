// app/qscore/page.tsx (Next.js App Router)
"use client";

import Image from "next/image";
import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/* ================= TYPES ================= */
type DayBar = {
  label: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
  height: number; // in px
  trend: "up" | "down"; // "up" -> green, "down" -> red
};

const WEEK_DATA: DayBar[] = [
  { label: "Mon", height: 120, trend: "up" },
  { label: "Tue", height: 60, trend: "down" },
  { label: "Wed", height: 100, trend: "up" },
  { label: "Thu", height: 50, trend: "down" },
  { label: "Fri", height: 110, trend: "up" },
  { label: "Sat", height: 80, trend: "up" },
  { label: "Sun", height: 140, trend: "up" },
];

/* ================= SPARKLE BACKGROUND ================= */
function SparkleBackground(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const REDUCED = mediaQuery.matches;

    let width = 0;
    let height = 0;
    let rafId = 0;

    const DPR = Math.min(window.devicePixelRatio || 1, 2);

    type Star = {
      x: number;
      y: number;
      r: number; // radius
      p: number; // phase
      s: number; // speed
      t: number; // twinkle speed
      hue: number;
    };

    let stars: Star[] = [];

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.max(1, Math.floor(width * DPR));
      canvas.height = Math.max(1, Math.floor(height * DPR));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }

    function rand(min: number, max: number) {
      return Math.random() * (max - min) + min;
    }

    function createStars() {
      const density = Math.round((width * height) / 22000); // ~ responsive density
      stars = new Array(density).fill(0).map(() => ({
        x: rand(0, width),
        y: rand(0, height),
        r: rand(0.6, 1.8),
        p: rand(0, Math.PI * 2),
        s: rand(-0.05, 0.05), // slow drift
        t: rand(0.015, 0.035), // twinkle speed
        hue: Math.random() < 0.25 ? 50 + rand(-6, 6) : 0, // some warm sparkles
      }));
    }

    function drawStar(star: Star) {
      const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(star.p)); // 0.35..1.0
      const alpha = Math.min(1, Math.max(0.1, twinkle));
      // Slight soft glow with two passes
      ctx.globalAlpha = alpha * 0.55;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r * 2.2, 0, Math.PI * 2);
      ctx.fillStyle =
        star.hue === 0 ? "rgba(255,255,255,1)" : `hsla(${star.hue},100%,70%,1)`;
      ctx.fill();

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    }

    function step() {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < stars.length; i++) {
        const st = stars[i];
        // drift
        st.x += st.s;
        st.y += st.s * 0.15;
        // wrap
        if (st.x < -2) st.x = width + 2;
        if (st.x > width + 2) st.x = -2;
        if (st.y < -2) st.y = height + 2;
        if (st.y > height + 2) st.y = -2;

        // twinkle
        st.p += st.t;

        drawStar(st);
      }

      rafId = requestAnimationFrame(step);
    }

    function init() {
      resize();
      createStars();

      // Draw once if reduced motion; else animate
      if (REDUCED) {
        ctx.clearRect(0, 0, width, height);
        for (const st of stars) drawStar(st);
        return;
      }
      step();
    }

    init();
    const onResize = () => {
      resize();
      createStars();
    };
    window.addEventListener("resize", onResize);
    const onMQChange = () => {
      cancelAnimationFrame(rafId);
      init();
    };
    mediaQuery.addEventListener?.("change", onMQChange);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      mediaQuery.removeEventListener?.("change", onMQChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 opacity-90"
      style={{
        WebkitMaskImage:
          "radial-gradient(120% 90% at 50% 40%, rgba(0,0,0,1) 55%, rgba(0,0,0,0.75) 75%, rgba(0,0,0,0.45) 100%)",
        maskImage:
          "radial-gradient(120% 90% at 50% 40%, rgba(0,0,0,1) 55%, rgba(0,0,0,0.75) 75%, rgba(0,0,0,0.45) 100%)",
      }}
    />
  );
}

/* ================= PAGE ================= */
export default function QScorePage(): JSX.Element {
  const router = useRouter();

  return (
    <main className="relative overflow-hidden bg-black text-white min-h-screen flex flex-col items-center justify-start px-6 py-10 font-sans">
      {/* Sparkles behind everything */}
      <SparkleBackground />

      {/* CONTENT */}
      <div className="relative z-10 w-full flex flex-col items-center">
        {/* Swinging Logo */}
        <div className="w-[180px] h-[180px] md:w-[220px] md:h-[220px] mb-2 flex items-center justify-center">
          <Image
            src="/dannn.png"
            alt="Logo"
            width={400}
            height={400}
            className="w-full h-full object-contain swing-bell"
            style={{ imageRendering: "-webkit-optimize-contrast" }}
            priority
          />
        </div>

        {/* Typing Text */}
        <div className="typing-container text-yellow-400 text-2xl md:text-3xl font-semibold leading-tight mb-2">
          <div className="line-1">Every good trade</div>
          <div className="line-2 mt-1">starts with a Q-Score.</div>
        </div>

        <p className="text-gray-400 text-base mb-5">What&apos;s yours?</p>

        {/* CTA Button */}
        <div className="w-full max-w-md">
          <button
            type="button"
            aria-label="Check your Q-Score"
            onClick={() => router.push("/form")} // ← Redirect to /form
            className="w-full flex justify-between items-center px-5 py-3 bg-gray-800/70 rounded-full border border-gray-700 hover:border-gray-600 transition group shadow-md backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-yellow-400/60"
          >
            <span className="text-gray-300 font-medium">
              Check your Q-Score...
            </span>
            <span className="text-yellow-400 font-semibold group-hover:text-black">
              Check now
            </span>
          </button>

          <div className="mt-3 text-center">
            <Link
              href="/signin"
              className="inline-flex items-center justify-center px-4 py-2 rounded-full border border-gray-700 bg-gray-800/40 text-sm text-gray-200 hover:bg-gray-800/60 active:bg-yellow-400 active:text-black active:border-yellow-400 transition-colors"
            >
              Login
            </Link>
          </div>
        </div>

        {/* Bar Chart Panel */}
        <section className="w-full max-w-lg mt-10">
          <div className="relative bg-gray-900/50 backdrop-blur-sm rounded-2xl p-6 shadow-2xl">
            <div className="relative h-48 flex items-end justify-between px-2 gap-2">
              {WEEK_DATA.map((d, idx) => {
                const colorClass = d.trend === "up" ? "bg-green-500" : "bg-red-500";
                const delayMap = [0, 0.75, 1.5, 2.25, 0.375, 1.125, 1.875];
                const delay = `${delayMap[idx] ?? 0}s`;

                return (
                  <div key={d.label} className="flex flex-col items-center flex-1">
                    <div
                      className={`wave-bar w-8 md:w-10 ${colorClass} rounded-t-md`}
                      style={{ height: `${d.height}px`, animationDelay: delay }}
                      aria-label={`${d.label} bar`}
                    />
                    <span className="text-gray-500 text-xs mt-2">{d.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <style jsx global>{`
        /* ========= Ultra-smooth swinging (pendulum-style) ========= */
        .swing-bell {
          --angle: 10deg;
          --duration: 3.6s;
          animation: swing-smooth var(--duration) cubic-bezier(.44,.01,.56,1) infinite;
          transform-origin: 50% 0%;
          will-change: transform;
          backface-visibility: hidden;
        }
        @keyframes swing-smooth {
          0%   { transform: rotate(calc(var(--angle) * -1)); }
          50%  { transform: rotate(var(--angle)); }
          100% { transform: rotate(calc(var(--angle) * -1)); }
        }

        @media (prefers-reduced-motion: reduce) {
          .swing-bell { animation: none; transform: none; }
          .wave-bar { animation: none; transform: none; }
          .line-1, .line-2 { animation: none; width: auto; white-space: normal; }
        }

        /* ========= Wave bars ========= */
        .wave-bar {
          animation: wave-height 3s ease-in-out infinite;
          transform-origin: bottom;
          will-change: transform;
        }
        @keyframes wave-height {
          0%, 100% { transform: scaleY(1); }
          50%      { transform: scaleY(0.6); }
        }

        /* ========= Typing effect ========= */
        .typing-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .line-1, .line-2 {
          overflow: hidden;
          white-space: nowrap;
          width: 0;
          animation: type-hold-delete 70s linear infinite;
        }
        .line-2 { animation-delay: -35s; }
        @keyframes type-hold-delete {
          0%   { width: 0; }
          5%   { width: 16ch; }  /* "Every good trade" */
          45%  { width: 17ch; }
          50%  { width: 0; }
          55%  { width: 22ch; }  /* "starts with a Q-Score." */
          95%  { width: 23ch; }
          100% { width: 0; }
        }
      `}</style>
    </main>
  );
}

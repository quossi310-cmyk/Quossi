// app/qscore/page.tsx
"use client";

import Image from "next/image";
import React, { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";

/* ================= TYPES ================= */
type QType = "text" | "select" | "textarea";
type Question =
  | { num: string; text: string; type: "text"; placeholder?: string }
  | { num: string; text: string; type: "textarea"; placeholder?: string }
  | { num: string; text: string; type: "select"; options: string[] };

const QUESTIONS: Question[] = [
  { num: "01", text: "What’s your trading name?", type: "text", placeholder: "Mr White" },
  {
    num: "02",
    text: "What kind of trader are you?",
    type: "select",
    options: [
      "Scalper",
      "Day Trader",
      "Swing Trader",
      "Position Trader",
      "Long-Term Investor",
      "New / Exploring",
    ],
  },
  {
    num: "03",
    text: "How do you analyze your chart?",
    type: "select",
    options: [
      "Technical (indicators/patterns)",
      "Fundamental (macro/news)",
      "Sentiment (crowd/flow)",
      "Quant / Algorithmic",
      "Price Action / Order Flow",
      "Intuitive / Gut",
    ],
  },
  { num: "04", text: "What’s the first thing you do when you’ve lost a trade?", type: "text" },
  { num: "05", text: "How do you celebrate your wins?", type: "text" },
  { num: "06", text: "What’s one thing you do outside trading that calms you?", type: "textarea" },
  {
    num: "07",
    text: "How confident are you in your risk decisions?",
    type: "select",
    options: ["Very Confident", "Confident", "Sometimes Doubtful", "Rarely Confident", "Always Second-Guessing"],
  },
  {
    num: "08",
    text: "What drives you more — fear or curiosity?",
    type: "select",
    options: ["Pure Curiosity", "Mostly Curiosity", "Balanced (50/50)", "Slightly Fearful", "Mostly Fearful", "Pure Fear"],
  },
  { num: "09", text: "What’s your biggest trading regret?", type: "text" },
  { num: "10", text: "What’s your favorite quote or trading philosophy?", type: "text" },
  {
    num: "11",
    text: "Pick a mantra:",
    type: "select",
    options: ["Make the market chase me.", "One A+ setup a day.", "Flat is a position."],
  },
  { num: "12", text: "What do you believe the market will look like in 5 years?", type: "textarea" },
];

/* =============== Auto-resizing Textarea =============== */
function AutoResizeTextarea({
  value, onChange, onFocus, placeholder, minRows = 1,
}: {
  value: string;
  onChange: (v: string) => void;
  onFocus?: () => void;
  placeholder?: string;
  minRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const resize = () => {
    if (!ref.current) return;
    const el = ref.current;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(() => {
    resize();
    const onResize = () => requestAnimationFrame(resize);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useEffect(() => { resize(); }, [value]);

  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      onFocus={onFocus}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? "Type here..."}
      className="mt-4 w-full resize-none rounded-2xl border-0 bg-[#1a1a1a] p-5 text-lg font-light text-white placeholder:italic placeholder:text-gray-500 focus:outline-none focus:ring-4 focus:ring-[#ffdd00]/40 shadow-inner"
      style={{ lineHeight: "1.5", overflow: "hidden" }}
      onKeyDown={(e) => { e.stopPropagation(); }}
    />
  );
}

/* ================= PAGE ================= */
export default function QScorePage() {
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<(string | null)[]>(() => Array(QUESTIONS.length).fill(null));
  const [hideImage, setHideImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const total = QUESTIONS.length;
  const q = QUESTIONS[current];
  const containerRef = useRef<HTMLDivElement | null>(null);

  const progressPct = useMemo(() => ((current + 1) / total) * 100, [current, total]);

  const hasAnswer = useMemo(() => {
    const v = answers[current];
    return v !== null && v.toString().trim() !== "";
  }, [answers, current]);

  function handleSelect(option: string) {
    setHideImage(true);
    setAnswers((prev) => {
      const copy = [...prev];
      copy[current] = option.trim();
      return copy;
    });
  }
  function handleInputChange(value: string) {
    setAnswers((prev) => {
      const copy = [...prev];
      copy[current] = value;
      return copy;
    });
  }

  function back() {
    if (current > 0 && !submitting) setCurrent((i) => i - 1);
  }

  // Fire-and-forget POST to /api/quossi_2_0 (no Python), store results in sessionStorage.
  async function postSummary(cleaned: string[]) {
    const tradingName = (cleaned[0] || "").trim() || "default";
    const user = tradingName.replace(/[^a-zA-Z0-9_\-]/g, "_");
    const nickname = tradingName;

    try {
      const res = await fetch("/api/quossi_2_0", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-quossi-user": user,
          "x-quossi-nickname": nickname,
        },
        body: JSON.stringify({ answers: cleaned, user, nickname }),
        keepalive: true,
      });

      if (res.ok) {
        const payload = await res.json().catch(() => null);
        try {
          sessionStorage.setItem("qscore_result", JSON.stringify(payload));
        } catch {}
      } else {
        // Save a lightweight error so QScoreCard can show a fallback
        try {
          sessionStorage.setItem("qscore_error", `HTTP ${res.status} ${res.statusText}`);
        } catch {}
      }
    } catch (e: any) {
      try {
        sessionStorage.setItem("qscore_error", e?.message || "Network error");
      } catch {}
    }
  }

  function next() {
    if (!hasAnswer || submitting) return;

    if (current < total - 1) {
      setCurrent((i) => i + 1);
      requestAnimationFrame(() => {
        containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      });
    } else {
      // Final step: stash answers, start POST, and redirect immediately to /qscorecard
      const cleaned = answers.map((a) => (a ?? "").trim());

      const tradingName = (cleaned[0] || "").trim() || "default";
      const user = tradingName.replace(/[^a-zA-Z0-9_\-]/g, "_");
      const nickname = tradingName;

      try {
        sessionStorage.setItem("qscore_answers", JSON.stringify(cleaned));
        sessionStorage.setItem("qscore_user", user);
        sessionStorage.setItem("qscore_nickname", nickname);
      } catch {}

      setSubmitting(true);
      setSubmitError(null);

      // fire and forget (don’t await)
      postSummary(cleaned);

      // immediate redirect to QScoreCard view
      router.push("/components");
    }
  }

  // click outside to show image again
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA" && target.getAttribute("role") !== "option") {
        setHideImage(false);
      }
    };
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  // Enter to advance (not inside textarea)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !hasAnswer || submitting) return;
      const active = (document.activeElement as HTMLElement) || null;
      if (active && active.tagName === "TEXTAREA") return;
      next();
    };
    window.addEventListener("keydown", onKey as any);
    return () => window.removeEventListener("keydown", onKey as any);
  }, [hasAnswer, submitting]);

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-transparent">
      {/* BACKGROUND */}
      <div aria-hidden className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-black" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#ffd70043] to-[#b8860bb3] pointer-events-none" />
      </div>

      {/* FOREGROUND CONTENT */}
      <div className="relative z-10 flex min-h-screen flex-col text-white">
        {/* HEADER WITH LOGO */}
        {!hideImage && (
          <header className="text-center py-5 px-6">
            <div className="inline-block swing-bell">
              <Image
                src="/quossi12-removebg-preview.png"
                alt="QUOSSI Logo"
                width={96}
                height={96}
                className="mx-auto h-auto w-24 drop-shadow-2xl select-none"
                priority
              />
            </div>
            <p className="mt-3 text-lg opacity-90 md:text-xl">Discover Your Trading Zone</p>
            <p className="mt-1 text-sm opacity-80 md:text-base">Answer truthfully – the market always knows when you lie.</p>
          </header>
        )}

        {/* PROGRESS BAR */}
        <div className="mx-auto mt-5 h-1 w-11/12 max-w-md overflow-hidden rounded-full bg-gray-800">
          <div
            className="progress-fill h-full bg-[#ffdd00]"
            style={{ width: `${progressPct}%`, transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)" }}
          />
        </div>
        <div className="mt-2 text-center text-sm font-bold text-[#ffdd00]">
          {current + 1} / {total}
        </div>

        {/* QUESTION AREA */}
        <main
          ref={containerRef}
          className="mx-auto flex max-w-2xl flex-1 flex-col justify-center space-y-6 overflow-y-auto px-6 text-left md:px-12"
        >
          <div className="bright-text text-7xl font-black text-[#ffdd00] md:text-8xl">{q.num}</div>
          <div className="bright-text mb-2 text-2xl font-semibold text-white md:text-3xl">{q.text}</div>

          {q.type === "select" ? (
            <div className="mt-4 w-full space-y-3">
              {"options" in q &&
                q.options.map((o) => {
                  const selected = answers[current] === o;
                  return (
                    <button
                      type="button"
                      key={o}
                      role="option"
                      aria-selected={selected}
                      onClick={() => handleSelect(o)}
                      className={`w-full cursor-pointer rounded-2xl p-5 text-left text-lg font-medium shadow-md transition-all hover:shadow-lg
                      ${selected ? "bg-[#ffdd00] text-black font-bold shadow-xl" : "bg-[#1a1a1a] text-white hover:bg-[#252525]"}`}
                    >
                      {o}
                    </button>
                  );
                })}
            </div>
          ) : (
            <AutoResizeTextarea
              value={answers[current] ?? ""}
              onFocus={() => setHideImage(true)}
              onChange={handleInputChange}
              placeholder={(q as any).placeholder ?? "Type here..."}
              minRows={q.type === "text" ? 1 : 4}
            />
          )}

          {submitError && (
            <p className="text-red-400 text-sm mt-2">
              {submitError}
            </p>
          )}
        </main>

        {/* NAV BUTTONS */}
        <div className="mx-auto w-full max-w-md px-6 pb-5">
          <div className="flex justify-between">
            <button
              type="button"
              onClick={back}
              disabled={current === 0 || submitting}
              className="px-6 py-3 font-medium text-white disabled:opacity-40"
            >
              Back
            </button>
            <button
              type="button"
              onClick={next}
              disabled={!hasAnswer || submitting}
              className={`rounded-full px-9 py-3 font-bold shadow-xl transition-all disabled:opacity-40 hover:scale-105
              ${current === total - 1 ? "bg-green-500 text-black" : "bg-[#ffdd00] text-black"}`}
            >
              {submitting ? "Submitting…" : current === total - 1 ? "Finish" : "Next"}
            </button>
          </div>
        </div>

        <footer className="pb-4 text-center text-xs font-light opacity-70">
          Powered by <span className="text-[#ffdd00]">QUOSSI.</span>
        </footer>
      </div>

      <style jsx global>{`
        .bright-text { font-weight: 700; letter-spacing: -0.8px; }
        .swing-bell { animation: swing 2.5s ease-in-out infinite; transform-origin: top center; }
        @keyframes swing {
          0% { transform: rotate(0deg); }
          25% { transform: rotate(15deg); }
          50% { transform: rotate(0deg); }
          75% { transform: rotate(-15deg); }
          100% { transform: rotate(0deg); }
        }
      `}</style>
    </div>
  );
}

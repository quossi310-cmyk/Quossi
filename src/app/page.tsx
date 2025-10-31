// pages/index.tsx (Option A: StatusBar below content, safe-area paddings removed on mobile)
"use client";

import Image from "next/image";
import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/* === Capacitor StatusBar (Option A) === */
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";

/* ================= QSCORE TYPES ================= */
type Tone = "positive" | "neutral" | "stressed";
type Tier = "Ground" | "Flow" | "Gold" | "Sun";
type QScoreResult = { tone: Tone; qScore: number; tier: Tier; task: string; runAt: string };

interface Message {
  id: number;
  text: string;
  timestamp: number;
  role: "user" | "assistant";
}

/* ================= CONSTANTS ================= */
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const STORAGE_KEY = "chat_messages";
const OPEN_STATE_KEY = "chat_interface_open";
const UID_KEY = "quossi_user_id";
const LAST_QSCORE_KEY = "quossi_last_qscore";

/* Docking behavior for desktop composer */
const DOCK_DELAY_MS = 800;

/* ===== AUTH PROMPT TIMING (15 minutes) ===== */
const AUTH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const AUTH_LAST_SHOWN_KEY = "quossi_auth_prompt_last_shown";

/* ================= UTIL: LOCAL UID ================= */
function getOrCreateUserId(): string {
  if (typeof window === "undefined") return "local-user";
  let uid = localStorage.getItem(UID_KEY);
  if (!uid) {
    uid = `u_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem(UID_KEY, uid);
  }
  return uid;
}

/* ================= SUPABASE (optional if no auth) ================= */
const supabase: SupabaseClient | null =
  typeof window !== "undefined"
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "public-anon-key"
      )
    : null;

/* ================= SMALL UI PARTS ================= */
function MessageBubble({ m }: { m: Message }) {
  return (
    <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} space-x-2 items-start`}>
      {m.role === "assistant" && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden mt-1 mr-2 border border-white/30">
          <Image src="/send.png" alt="Quossi AI" width={32} height={32} className="object-cover" />
        </div>
      )}
      <div
        className={`p-3 rounded-lg max-w-xs break-words whitespace-pre-wrap border border-black/20 ${
          m.role === "user"
            ? "bg-black/30 backdrop-blur-sm text-white"
            : "bg-yellow-400/90 text-black border-black/20 shadow-lg"
        }`}
        title={new Date(m.timestamp).toString()}
      >
        <div>{m.text}</div>
        <div className={`mt-1 text-[11px] leading-none ${m.role === "user" ? "text-white/70" : "text-black/70"}`}>
          {new Date(m.timestamp).toLocaleDateString(undefined, { day: "2-digit", month: "short" })} •{" "}
          {new Date(m.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })}
        </div>
      </div>
      {m.role === "user" && (
        <div className="flex-shrink-0 mt-1 ml-2">
          <span className="text-white text-sm font-semibold">👤</span>
        </div>
      )}
    </div>
  );
}

function QScorePanel({ q }: { q: QScoreResult | null }) {
  if (!q) return null;

  const toneColor =
    q.tone === "positive"
      ? "bg-emerald-500/20 text-emerald-200 border-emerald-500/40"
      : q.tone === "stressed"
      ? "bg-rose-500/20 text-rose-200 border-rose-500/40"
      : "bg-slate-500/20 text-slate-200 border-slate-500/40";

  return (
    <div className="animate-slide-up">
      <div className="flex items-center gap-2">
        <span className={`px-2 py-1 text-xs rounded-md border ${toneColor}`}>Tone: {q.tone}</span>
        <span className="px-2 py-1 text-xs rounded-md border border-yellow-400/40 bg-yellow-400/10 text-yellow-200">
          Q-Score: <strong className="ml-1 text-yellow-100">{Math.round(q.qScore)}</strong>
        </span>
        <span className="px-2 py-1 text-xs rounded-md border border-blue-400/40 bg-blue-400/10 text-blue-200">
          Tier: <strong className="ml-1 text-blue-100">{q.tier}</strong>
        </span>
      </div>

      {q.task && (
        <div className="mt-2 p-3 rounded-lg border border-white/10 bg-white/5">
          <div className="text-xs uppercase tracking-wide text-white/60 mb-1">Suggested Task</div>
          <div className="text-sm text-white/90">{q.task}</div>
          <div className="mt-1 text-[11px] text-white/50">Generated: {new Date(q.runAt).toLocaleString()}</div>
        </div>
      )}
    </div>
  );
}

/* ============== AUTH PROMPT MODAL ============== */
function AuthPromptModal({
  open,
  onClose,
  onSignin,
  onSignup,
}: {
  open: boolean;
  onClose: () => void;
  onSignin: () => void;
  onSignup: () => void;
}) {
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Sign in or create account" className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-[101] w-[92%] max-w-md rounded-2xl border border-white/15 bg-[#0b0b0b]/95 text-white shadow-2xl animate-auth-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-0 -z-10 rounded-2xl bg-gradient-to-br from-blue-500/15 via-yellow-400/10 to-white/5 blur-2xl" />
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Create an account</h3>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-9 h-9 grid place-items-center rounded-lg border border-white/15 bg-white/10 hover:bg-white/15 active:scale-95"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <p className="mt-2 text-sm text-white/80">
            Unlock your dashboard, save chats, and get paid with QUOSSI. Login if you already have an account, or sign up in seconds.
          </p>

          <div className="mt-5 grid grid-cols-1 gap-2">
            <button onClick={onSignin} className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 bg-white text-black font-semibold hover:bg-white/90 active:scale-95 transition">
              <span>Login</span>
            </button>
            <button onClick={onSignup} className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 bg-yellow-400 text-black font-semibold hover:bg-yellow-300 active:scale-95 transition">
              <span>Create account</span>
            </button>
          </div>

          <button onClick={onClose} className="mt-3 w-full text-center text-sm text-white/70 hover:text-white underline underline-offset-4">
            Not now
          </button>
        </div>
      </div>
      <style jsx>{`
        @keyframes auth-pop {
          0% { transform: translateY(12px) scale(0.98); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        .animate-auth-pop { animation: auth-pop 180ms ease-out both; }
      `}</style>
    </div>
  );
}

/* ================= MAIN ================= */
export default function Home() {
  const router = useRouter();
  const userId = getOrCreateUserId();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isInputFocused, setIsInputFocused] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(OPEN_STATE_KEY) === "true";
  });
  const [activated, setActivated] = useState(false); // gate to hide history until user clicks
  const [isLoading, setIsLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // IMPORTANT: Start closed on mobile; open only after tapping the button
  const [showMobileChat, setShowMobileChat] = useState(false);

  const [docked, setDocked] = useState(false);
  const [qscore, setQscore] = useState<QScoreResult | null>(null);
  const [toast, setToast] = useState<{ open: boolean; text: string }>({ open: false, text: "" });
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);

  function notify(msg: string, ms = 2200) {
    setToast({ open: true, text: msg });
    // @ts-expect-error store timer id
    window.clearTimeout(notify._t);
    // @ts-expect-error store timer id
    notify._t = window.setTimeout(() => setToast((t) => ({ ...t, open: false })), ms);
  }

  /* === Initialize Capacitor StatusBar: Option A === */
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;
    (async () => {
      try {
        await StatusBar.setOverlaysWebView({ overlay: false }); // keeps content below status bar
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: "#000000" });
      } catch {
        // ignore on web or if plugin not installed
      }
    })();
  }, []);

  /* Check auth status once */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!supabase) return setIsAuthed(false);
        const { data } = await supabase.auth.getUser();
        if (mounted) setIsAuthed(!!data?.user);
      } catch {
        if (mounted) setIsAuthed(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  /* ===== 15-minute auth nudges for unauthenticated users ===== */
  useEffect(() => {
    if (isAuthed) return;
    let timeoutId: number | undefined;
    let intervalId: number | undefined;

    const now = Date.now();
    const last = Number(localStorage.getItem(AUTH_LAST_SHOWN_KEY) || 0);
    const elapsed = now - last;
    const remaining = Math.max(AUTH_INTERVAL_MS - elapsed, 0);

    const show = () => {
      setAuthPromptOpen(true);
      localStorage.setItem(AUTH_LAST_SHOWN_KEY, String(Date.now()));
    };

    timeoutId = window.setTimeout(() => {
      show();
      intervalId = window.setInterval(() => {
        show();
      }, AUTH_INTERVAL_MS);
    }, remaining);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAuthPromptOpen(false);
    };
    window.addEventListener("keydown", onKey);

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      if (intervalId) window.clearInterval(intervalId);
      window.removeEventListener("keydown", onKey);
    };
  }, [isAuthed]);

  // ---------------------------
  // MOBILE INTRO BEHAVIOR
  // ---------------------------

  // 1) Lock background scroll while intro is visible
  useEffect(() => {
    if (!showMobileChat) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [showMobileChat]);

  // 2) Auto-focus textarea when chat opens
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (showMobileChat) {
      setTimeout(() => textareaRef.current?.focus(), 120);
    }
  }, [showMobileChat]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const interfaceRef = useRef<HTMLElement>(null);
  const deskMessagesRef = useRef<HTMLDivElement>(null);
  const mobileMessagesRef = useRef<HTMLDivElement>(null);

  const hasValidatedOnceRef = useRef(false);

  const jumpToBottom = (el: HTMLDivElement | null, smooth = false) => {
    if (!el) return;
    if (smooth) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    else el.scrollTop = el.scrollHeight;
  };

  /* Load & migrate local messages (7-day retention) */
  useEffect(() => {
    const load = () => {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: Message[] = JSON.parse(stored);
        const now = Date.now();
        const filtered = parsed.filter((m) => now - m.timestamp < SEVEN_DAYS_MS);
        const migrated: Message[] = filtered.map((m) => ({
          ...m,
          role: (m.role ?? "user") as Message["role"],
        }));
        setMessages(migrated);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      }
    };
    load();
    const id = setInterval(load, 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  /* Initial QScore calculation once */
  useEffect(() => {
    if (hasValidatedOnceRef.current) return;
    hasValidatedOnceRef.current = true;
    const t = setTimeout(() => {
      const history = messages.map((m) => ({ role: m.role, content: m.text }));
      if (history.length) {
        maybeUpdateQScore(history);
      } else {
        setQscore(null);
        localStorage.removeItem(LAST_QSCORE_KEY);
      }
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  /* Persist composer open state */
  useEffect(() => {
    localStorage.setItem(OPEN_STATE_KEY, String(isInputFocused));
  }, [isInputFocused]);

  /* Autoscroll on new messages */
  useEffect(() => {
    jumpToBottom(deskMessagesRef.current, true);
    if (showMobileChat) jumpToBottom(mobileMessagesRef.current, true);
  }, [messages, showMobileChat]);

  useEffect(() => {
    if (isInputFocused) {
      const id = requestAnimationFrame(() => {
        jumpToBottom(deskMessagesRef.current, false);
      });
      return () => cancelAnimationFrame(id);
    }
  }, [isInputFocused]);

  async function maybeUpdateQScore(history: { role: "user" | "assistant"; content: string }[]) {
    try {
      const res = await fetch("/api/qscore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, history }),
      });

      if (res.status === 204) {
        setQscore(null);
        localStorage.removeItem(LAST_QSCORE_KEY);
        return;
      }

      if (!res.ok) return;
      const data = await res.json();

      if (data?.allowed && data?.result) {
        setQscore(data.result as QScoreResult);
        localStorage.setItem(LAST_QSCORE_KEY, JSON.stringify(data.result));
      } else {
        setQscore(null);
        localStorage.removeItem(LAST_QSCORE_KEY);
      }
    } catch {
      // ignore
    }
  }

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    const now = Date.now();
    const userMsg: Message = {
      text: userText,
      id: now,
      timestamp: now,
      role: "user",
    };
    const updated = [...messages, userMsg];
    setMessages(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    setIsLoading(true);
    let finalUpdated = updated;

    try {
      const history = updated.map((m) => ({ role: m.role, content: m.text }));
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText, history }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData?.error || "API error");
      }

      const { response } = await res.json();
      const ts = Date.now();
      const assistantMsg: Message = {
        text: response,
        id: ts,
        timestamp: ts,
        role: "assistant",
      };
      finalUpdated = [...updated, assistantMsg];
      setMessages(finalUpdated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(finalUpdated));

      const newHistory = finalUpdated.map((m) => ({ role: m.role, content: m.text })); 
      await maybeUpdateQScore(newHistory);
    } catch (error: any) {
      const ts = Date.now();
      const errorMsg: Message = {
        text: `Error: ${error?.message || "Could not get response."}`,
        id: ts,
        timestamp: ts,
        role: "assistant",
      };
      finalUpdated = [...updated, errorMsg];
      setMessages(finalUpdated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(finalUpdated));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const handleBackgroundClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget || !interfaceRef.current?.contains(e.target as Node)) {
      setIsInputFocused(false);
    }
  };

  const handleSlideUp = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsInputFocused(false);
  };

  const handleGoSignin = () => {
    setAuthPromptOpen(false);
    router.push("/signin");
  };
  const handleGoSignup = () => {
    setAuthPromptOpen(false);
    router.push("/signup");
  };

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch {
      // ignore
    } finally {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(OPEN_STATE_KEY);
        sessionStorage.clear();
      } catch {}
      setMobileMenuOpen(false);
      setIsLoading(false);
      router.replace("/signin");
    }
  };

  const handleStartVoiceCall = () => {
    notify("Feature coming soon");
  };

  return (
    <main className="relative min-h-screen bg-black text-white font-sans" onClick={handleBackgroundClick}>
      {/* Background */}
      <div className="fixed inset-0 z-[5] bg-black" />
      <div className="fixed inset-0 z-[7] hidden md:flex items-center justify-center">
        <div className="ripple-container">
          <span className="ripple" />
          <span className="ripple delay-1" />
          <span className="ripple delay-2" />
        </div>
      </div>
      <div className="fixed inset-0 z-[10] hidden md:flex items-center justify-center hover-animation">
        <Image
          src="/lg23.png"
          alt="Background Logo"
          width={500}
          height={200}
          className="drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] select-none glow-animation cursor-pointer"
          priority
        />
      </div>
      <div className="fixed inset-0 z-[15] bg-gradient-to-b from-transparent via-[#ffd70043] to-[#b8860bb3] pointer-events-none" />

      {/* Toast */}
      {toast.open && (
        <div role="status" aria-live="polite" className="fixed top-4 left-1/2 -translate-x-1/2 z-[80]">
          <div className="px-4 py-2 rounded-xl bg-white/90 text-black shadow-lg border border-black/10">{toast.text}</div>
        </div>
      )}

      {/* ===== DESKTOP TOP-RIGHT TOOLBAR ===== */}
      <div className="hidden md:flex fixed top-3 right-3 z-[70] gap-2">
        <button
          type="button"
          onClick={handleGoSignin}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/15 bg-white/10 backdrop-blur-md hover:bg-white/15 active:scale-95 transition"
          title="Go to sign in"
        >
          <span className="text-sm font-semibold">Login</span>
        </button>

        <button
          type="button"
          onClick={handleGoSignup}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/15 bg-white/10 backdrop-blur-md hover:bg-white/15 active:scale-95 transition"
          title="Go to sign up"
        >
          <span className="text-sm font-semibold">Sign up</span>
        </button>
      </div>

      {/* ===== MOBILE: FIXED TOP BAR ===== */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-[30] bg-black/60 backdrop-blur-xl border-b border-white/10 pt-2">
        <div className="flex items-center justify-between px-3 py-3 translate-y-[2%]">
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={mobileMenuOpen}
            onClick={(e) => {
              e.stopPropagation();
              setMobileMenuOpen(true);
            }}
            className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-white/15 bg-white/10 active:scale-95 transition"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>

          <div className="text-sm font-semibold text-white/90">QUOSSI</div>
          <div className="w-10 h-10" />
        </div>
      </header>

      {/* ===== MOBILE DRAWER ===== */}
      <div
        role="dialog"
        aria-modal="true"
        className={`md:hidden fixed inset-0 z-[40] transition ${mobileMenuOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        onClick={() => setMobileMenuOpen(false)}
      >
        <div className={`absolute inset-0 bg-black/60 transition-opacity ${mobileMenuOpen ? "opacity-100" : "opacity-0"}`} />
        <nav
          className={`absolute top-0 left-0 h-full w-[80%] max-w-[320px] bg-[#0B0B0B] border-r border-white/10 pt-3 px-4 pb-3 transform transition-transform duration-300 ${
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-white/80 font-semibold">Menu</span>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMobileMenuOpen(false)}
              className="w-10 h-10 grid place-items-center rounded-xl border border-white/15 bg-white/10"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <ul className="space-y-1">
            <li className="pt-2">
              <button className="w-full text-left px-3 py-3 rounded-lg bg-yellow-400 text-black font-semibold hover:bg-yellow-300" onClick={handleGoSignin}>
                Login
              </button>
            </li>
          </ul>

          <ul className="space-y-1">
            <li className="pt-2">
              <button className="w-full text-left px-3 py-3 rounded-lg bg-yellow-400 text-black font-semibold hover:bg-yellow-300" onClick={handleGoSignup}>
                Sign Up
              </button>
            </li>
          </ul>
        </nav>
      </div>

      {/* ===== MOBILE CHAT ===== */}
      <section className="md:hidden fixed inset-0 z-[25]">
        {!showMobileChat ? (
          // INTRO stays until the button is tapped
          <div className="fixed inset-0 min-h-[100dvh] bg-transparent flex flex-col items-center justify-start gap-2 pt-[72px]">
            <Image src="/dave2.png" alt="quossi" width={900} height={360} priority className="free-swinging-dave pointer-events-none select-none" />
            <button
              onClick={() => setShowMobileChat(true)}
              className="mt-0 px-5 py-2 rounded-full bg-white/20 border border-white/20 backdrop-blur-md active:scale-95 transition"
            >
              whats on your mind?
            </button>
          </div>
        ) : (
          <div className="flex flex-col h-[100dvh] bg-transparent">
            {/* QScore header (mobile) */}
            <div className="px-4 pt-[72px] pb-2">
              <QScorePanel q={qscore} />
            </div>

            <div ref={mobileMessagesRef} className="flex-1 overflow-y-auto px-4 pb-[108px] pt-2 space-y-4 overscroll-contain scroll-smooth">
              {messages.map((m) => (
                <MessageBubble key={m.id} m={m} />
              ))}
              <div ref={messagesEndRef} />
              {isLoading && (
                <div className="flex justify-start space-x-2 items-start">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden mr-2 border border-white/30">
                    <Image src="/send.png" alt="Quossi AI" width={32} height={32} className="object-cover" />
                  </div>
                  <div className="bg-yellow-400/90 text-black p-3 rounded-lg max-w-xs border border-black/20 shadow-lg">typing</div>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 left-0 right-0 z-[26] bg-black/70 backdrop-blur-md border-t border-white/10 px-3 pt-2 pb-3">
              <div className="flex gap-2 items-end">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyPress}
                  className="flex-1 p-6 rounded-xl bg-white/20 text-white placeholder-white/70 border border-white/20 focus:outline-none focus:ring-2 focus:ring-yellow-400/50 resize-none overflow-hidden min-h-[44px] max-h-[120px]"
                  placeholder="Type a message…"
                  disabled={isLoading}
                  onFocus={() => {
                    setIsInputFocused(true);
                    setActivated(true);
                  }}
                />
                <button
                  type="button"
                  aria-label="Send message"
                  disabled={!input.trim() || isLoading}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleSendMessage}
                  className={`group relative grid place-items-center rounded-lg mb-1 border backdrop-blur-sm transition-colors w-11 h-11 ${
                    input.trim() && !isLoading
                      ? "border-blue-300/20 bg-blue-500/30 hover:bg-blue-500/40 active:!bg-black active:!bg-opacity-100 active:!border-black"
                      : "bg-white/10 opacity-60 cursor-not-allowed border-white/20"
                  }`}
                >
                  <Image src="/send.png" alt="Send" width={45} height={45} className="select-none" />
                  <span className="pointer-events-auto cursor-pointer absolute inset-0 rounded-lg ring-0 group-focus-visible:ring-2 ring-yellow-300/60" />
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ===== DESKTOP CHAT (full-height ➜ docked) ===== */}
      <section
        ref={interfaceRef}
        className={`hidden md:block fixed left-1/2 z-[50] w-full max-w-2xl -translate-x-1/2 px-4 transition-[top,bottom,transform] duration-300 ease-out ${
          activated
            ? (docked ? "bottom-6 top-auto translate-y-0" : "top-0 bottom-0 translate-y-0")
            : "top-1/2 -translate-y-1/2"
        }`}
      >
        <div
          className={`relative flex flex-col w-full overflow-hidden rounded-2xl bg-transparent backdrop-blur-0 border border-white/10 shadow-lg transition-[opacity,box-shadow,height,max-height] duration-300 ease-out ${
            (isInputFocused || activated) ? "opacity-100 yellow-glow-animation" : "opacity-95"
          } ${activated ? (docked ? "h-[85vh] max-h-[85vh]" : "h-[100vh] max-h-[100vh]") : ""}`}
          onClick={() => {
            if (!activated) {
              setActivated(true);
              setIsInputFocused(true);
              setTimeout(() => textareaRef.current?.focus(), 0);
              // stay full-height briefly, then dock to bottom
              window.setTimeout(() => setDocked(true), DOCK_DELAY_MS);
            }
          }}
        >
          {/* soft background pulse */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-[#deddd9] via-[#4a4a49] to-[#000000] opacity-30 blur-xl animate-ping-slow pointer-events-none" />

          {/* Top pull-handle only when revealed */}
          {(isInputFocused || activated) && (
            <div
              className="flex justify-center pt-2 pb-1 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                handleSlideUp(e);
                // when collapsing, send it back to center
                setDocked(false);
              }}
            >
              <div className="w-12 h-1 bg-white/30 rounded-full" />
            </div>
          )}

          {/* -------- HERO (pre-activation) -------- */}
          {!activated && (
            <div className="relative flex-1 grid place-items-center py-10">
              <div className="text-center px-6">
                <h2 className="text-3xl font-semibold text-white/90 mb-6">Whats on your mind?</h2>

                {/* “Ask anything” CTA using your copy */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActivated(true);
                    setIsInputFocused(true);
                    setTimeout(() => textareaRef.current?.focus(), 0);
                    window.setTimeout(() => setDocked(true), DOCK_DELAY_MS);
                  }}
                  className="group mx-auto flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-4 py-3 hover:bg-white/15 active:scale-95 transition"
                >
                  <span className="grid place-items-center w-9 h-9 rounded-full border border-white/15 bg-white/10 text-white/80 text-xl leading-none">
                    +
                  </span>
                  <span className="text-white/70">Type a message…</span>
                  <span className="ml-2 text-white/30 text-sm">(press to start)</span>
                </button>
              </div>
            </div>
          )}

          {/* -------- Chat history + typing area (after activation) -------- */}
          {activated && (
            <>
              {/* Top section: QScore at the very top of the viewport/panel */}
              {qscore && (
                <div className="px-4 pt-3 shrink-0">
                  <QScorePanel q={qscore} />
                </div>
              )}

              {/* Messages fill from top → bottom; own scroll */}
              <div
                ref={deskMessagesRef}
                className="relative flex-1 min-h-0 overflow-y-auto p-4 pt-2 space-y-4"
                style={{ scrollBehavior: "smooth" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsInputFocused(true);
                }}
              >
                {messages.map((m) => (
                  <MessageBubble key={m.id} m={m} />
                ))}

                <div ref={messagesEndRef} />

                {isLoading && (
                  <div className="flex justify-start space-x-2 items-start">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden mr-2 border border-white/30">
                      <Image src="/send.png" alt="Quossi AI" width={32} height={32} className="object-cover" />
                    </div>
                    <div className="bg-yellow-400/90 text-black p-3 rounded-lg max-w-xs border border-black/20 shadow-lg">typing</div>
                  </div>
                )}
              </div>

              {/* Input docks at the very bottom */}
              <div className="relative p-2 bg-transparent border-t border-white/10 shrink-0">
                <div className="flex gap-2 items-end">
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyPress}
                    onFocus={() => setIsInputFocused(true)}
                    className="flex-1 p-3 rounded-lg bg-white/30 text-white placeholder-white/70 border border-white/20 focus:outline-none focus:ring-2 focus:ring-yellow-400/50 resize-none overflow-hidden min-h-[44px] max-h-[100px]"
                    placeholder="Type a message..."
                    disabled={isLoading}
                  />

                  <button
                    type="button"
                    aria-label="Send message"
                    disabled={!input.trim() || isLoading}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleSendMessage}
                    className={`group relative grid place-items-center rounded-lg mb-1 border border-blue-300/20 backdrop-blur-sm transition w-11 h-11 ${
                      input.trim() && !isLoading
                        ? "bg-blue-500/30 hover:bg-blue-500/40 active:bg-blue-500/50"
                        : "bg-white/10 opacity-60 cursor-not-allowed"
                    }`}
                  >
                    <Image src="/send.png" alt="Send" width={45} height={45} className="select-none" />
                    <span className="pointer-events-auto cursor-pointer absolute inset-0 rounded-lg ring-0 group-focus-visible:ring-2 ring-yellow-300/60" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ===== Auth popup modal (every 15min) ===== */}
      <AuthPromptModal
        open={!!authPromptOpen}
        onClose={() => setAuthPromptOpen(false)}
        onSignin={handleGoSignin}
        onSignup={handleGoSignup}
      />

      {/* Keyframes & extras */}
      <style jsx global>{`
        @keyframes hoverAnimation {
          0% { transform: translateY(0); }
          50% { transform: translateY(-20px); }
          100% { transform: translateY(0); }
        }
        @keyframes glowAnimation {
          0% { filter: drop-shadow(0 0 10px rgba(255, 255, 255, 0.3)); }
          50% { filter: drop-shadow(0 0 20px rgba(255, 255, 255, 0.7)); }
          100% { filter: drop-shadow(0 0 10px rgba(255, 255, 255, 0.3)); }
        }
        @keyframes yellowGlowAnimation {
          0% { box-shadow: 0 0 20px rgba(255, 215, 0, 0.3), 0 0 40px rgba(255, 215, 0, 0.2), inset 0 0 20px rgba(255, 215, 0, 0.1); }
          50% { box-shadow: 0 0 40px rgba(255, 215, 0, 0.6), 0 0 80px rgba(255, 215, 0, 0.4), inset 0 0 40px rgba(255, 215, 0, 0.2); }
          100% { box-shadow: 0 0 20px rgba(255, 215, 0, 0.3), 0 0 40px rgba(255, 215, 0, 0.2), inset 0 0 20px rgba(255, 215, 0, 0.1); }
        }
        .hover-animation { animation: hoverAnimation 3s ease-in-out infinite; }
        .glow-animation { animation: glowAnimation 2s ease-in-out infinite; }
        .yellow-glow-animation { animation: yellowGlowAnimation 3s ease-in-out infinite; }

        .ripple-container { position: absolute; width: 400px; height: 400px; display: flex; align-items: center; justify-content: center; border-radius: 50%; overflow: visible; }
        .ripple { position: absolute; border: 4px solid rgba(255, 255, 255, 0.4); border-radius: 50%; width: 400px; height: 400px; opacity: 0; animation: rippleWave 4s ease-out infinite; }
        .ripple.delay-1 { animation-delay: 1.3s; }
        .ripple.delay-2 { animation-delay: 2.6s; }
        @keyframes rippleWave {
          0% { transform: scale(0.5); opacity: 0.6; }
          70% { opacity: 0.3; }
          100% { transform: scale(2); opacity: 0; }
        }

        @keyframes ping-slow {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.05); opacity: 0.5; }
        }
        .animate-ping-slow { animation: ping-slow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }

        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in { animation: fade-in 0.5s ease-out both; }

        @keyframes slide-up {
          from { transform: translateY(24px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up { animation: slide-up 0.28s ease-out both; }

        .free-swinging-dave { position: relative; animation: freeSwing 3s ease-in-out infinite; transform-origin: top center; will-change: transform; }
        @keyframes freeSwing {
          0%, 100% { transform: rotate(-10deg); }
          50% { transform: rotate(10deg); }
        }
      `}</style>
    </main>
  );
}

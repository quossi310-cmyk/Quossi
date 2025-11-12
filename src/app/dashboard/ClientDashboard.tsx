// pages/index.tsx — Mobile intro removed, mobile shows chat immediately
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

// 🆕 extend Message with image fields + status
interface Message {
  id: number;
  text: string;
  timestamp: number;
  role: "user" | "assistant";
  imageUrl?: string;       // final public URL from Supabase
  imagePreview?: string;   // base64 optimistic preview
  status?: "sending" | "sent" | "error" | "uploading";
}

/* ================= CONSTANTS ================= */
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const STORAGE_KEY = "chat_messages";
const OPEN_STATE_KEY = "chat_interface_open";
const UID_KEY = "quossi_user_id";
const LAST_QSCORE_KEY = "quossi_last_qscore";
// Limit how many past messages we send to the server (reduces tokens/cost)
// (chat history trimming removed)
const QSCORE_CARD_SHOWN_KEY = "quossi_qscore_card_shown";

/* Docking behavior for desktop composer */
const DOCK_DELAY_MS = 800;

/* ===== AUTH PROMPT TIMING (disabled) ===== */
const AUTH_INTERVAL_MS = 15 * 60 * 1000; // kept for future use
const AUTH_LAST_SHOWN_KEY = "quossi_auth_prompt_last_shown";
const AUTH_NUDGES_ENABLED = false as const; // << turn off auto popups

/* ==== Realtime voice (model) ==== */
const REALTIME_MODEL =
  process.env.NEXT_PUBLIC_OPENAI_REALTIME_MODEL || "gpt-4o-realtime-preview-2024-12-17";

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

/* ================= SMALL UTILS ================= */
async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, ms = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

/** Wait until ICE gathering completes so our SDP actually contains candidates */
function waitForIceGatheringComplete(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") {
      resolve();
      return;
    }
    const check = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", check);
    setTimeout(() => {
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    }, 2500);
  });
}

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
        {/* 🆕 image preview/final */}
        {(m.imagePreview || m.imageUrl) && (
          <div className="mb-2 overflow-hidden rounded-md">
            {m.imageUrl ? (
              <img src={m.imageUrl} alt="uploaded" className="max-w-full h-auto" />
            ) : (
              <img src={m.imagePreview} alt="preview" className="max-w-full h-auto opacity-90" />
            )}
          </div>
        )}

        {/* text (optional) */}
        {m.text && <div>{m.text}</div>}

        <div className={`mt-1 text-[11px] leading-none ${m.role === "user" ? "text-white/70" : "text-black/70"}`}>
          {new Date(m.timestamp).toLocaleDateString(undefined, { day: "2-digit", month: "short" })} •{" "}
          {new Date(m.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })}
          {/* 🆕 status chips */}
          {m.status === "uploading" && " • uploading…"}
          {m.status === "error" && " • upload failed"}
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

/* ===== ChatGPT-style pill composer (keeps your colors) ===== */
function ChatComposer({
  value,
  disabled,
  onChange,
  onKeyDown,
  onSend,
  onPlus,
  micOn,
  onMicToggle,
  textareaRef,
  loadingDot,
}: {
  value: string;
  disabled?: boolean;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onPlus?: () => void;
  micOn?: boolean;
  onMicToggle?: () => void;
  textareaRef?: React.Ref<HTMLTextAreaElement>;
  loadingDot?: boolean;
}) {
  return (
    <div
      className="
        grid grid-cols-[auto_1fr_auto] items-center gap-3
        rounded-full border border-white/15 bg-white/10
        px-3 sm:px-4 py-2 min-h-14 backdrop-blur-md
      "
    >
      {/* + button */}
      <button
        type="button"
        aria-label="New"
        onClick={onPlus}
        className="h-10 w-10 grid place-items-center rounded-full border border-white/15 bg-white/10 hover:bg-white/15 active:scale-95 transition"
      >
        <span className="text-xl leading-none text-white/80">+</span>
      </button>

      {/* textarea (auto-grow up to ~6 lines) */}
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={(e) => {
          onChange(e);
          const el = e.target;
          el.style.height = "auto";
          const line = parseInt(getComputedStyle(el).lineHeight || "20", 10) || 20;
          const maxHeight = line * 6;
          const nextHeight = Math.min(el.scrollHeight, maxHeight);
          el.style.height = `${nextHeight}px`;
          el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
        }}
        onKeyDown={onKeyDown}
        placeholder="what's on your mind"
        className="
          flex-1 w-full bg-transparent outline-none resize-none
          placeholder:text-white/70 text-white text-base leading-relaxed py-2
          overflow-hidden min-h-[44px]
          transition-[height] duration-150 ease-in-out
        "
        disabled={disabled}
      />

      {/* right controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Voice"
          onClick={onMicToggle}
          className={`h-10 w-10 grid place-items-center rounded-full ${
            micOn ? "bg-rose-500/80" : "hover:bg-white/15 bg-white/10"
          } active:scale-95 transition`}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-yellow-400" fill="none">
            <path d="M12 15a4 4 0 0 0 4-4V7a4 4 0 1 0-8 0v4a4 4 0 0 0 4 4Z" stroke="currentColor" strokeWidth="2" />
            <path d="M19 11a7 7 0 0 1-14 0M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        <button
          type="button"
          aria-label="Send message"
          disabled={!value.trim() || disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onSend}
          className={`grid place-items-center rounded-full border border-white/15 w-11 h-11 transition ${
            value.trim() && !disabled
              ? "bg-yellow-400 text-black hover:bg-yellow-300"
              : "bg-white/10 opacity-60 cursor-not-allowed"
          }`}
        >
          <Image src="/send.png" alt="Send" width={20} height={20} className="select-none" />
        </button>
      </div>
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

/* ================= ICONS & DRAWER ================= */

// components/TelegramDrawer.tsx (inline)
function TelegramDrawer({
  onVoiceCall,
  onLogout,
  onShareScreen,
  onOpenComponents, // ✅ NEW: handler for Q SCORE
}: {
  onVoiceCall?: () => void;
  onLogout?: () => void;
  onShareScreen?: () => void;
  onOpenComponents?: () => void; // ✅ NEW
}) {
  const itemsTop = [
    { label: "Q SCORE", icon: UserIcon, onClick: onOpenComponents }, // ✅ wired
    { label: "Daily News", icon: WalletIcon },
    { isDivider: true as const },
    { label: "Share screen", icon: UsersIcon, onClick: onShareScreen },
    { label: "voice call", icon: PhoneIcon, onClick: onVoiceCall },
    {
      label: "Settings",
      icon: GearIcon,
      badge: (
        <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-[11px] font-bold">
          !
        </span>
      ),
    },
  ];

  const itemsBottom = [
    { label: "Log out", icon: UserPlusIcon, onClick: onLogout },
    { label: "Quossi Features", icon: QuestionIcon },
  ];

  return (
    <aside className="w-[300px] h-screen bg-[#0e1621] text-white flex flex-col">
      {/* Header */}
      <div className="relative p-4 pb-3">
        {/* Theme toggle */}
        <button
          aria-label="Toggle theme"
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-white/10 hover:bg-white/15"
        >
          <SunIcon className="h-4 w-4 text-white/90" />
        </button>

        {/* Avatar + name */}
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 overflow-hidden rounded-full bg-[#2b5278]">
            <img
              src="/send.png"
              alt="Profile"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="truncate font-semibold">Quossi calm</p>
              <ChevronDown className="h-4 w-4 text-white/60" />
            </div>
            <p className="text-white/60 text-sm">always active</p>
          </div>
        </div>
      </div>

      {/* Scrollable menu */}
      <div className="flex-1 overflow-y-auto">
        <MenuSection items={itemsTop} />
        <div className="h-px bg-white/5 my-2" />
        <MenuSection items={itemsBottom} />
      </div>
    </aside>
  );
}

function MenuSection({
  items,
}: {
  items: Array<
    | { label: string; icon: (p: IconProps) => JSX.Element; badge?: React.ReactNode; onClick?: () => void }
    | { isDivider: true }
  >;
}) {
  return (
    <nav className="px-2">
      {items.map((it, idx) =>
        "isDivider" in it ? (
          <div key={`div-${idx}`} className="h-px bg-white/5 my-2" />
        ) : (
          <button
            key={it.label}
            onClick={it.onClick}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-white/5 active:bg-white/10 transition"
          >
            <IconFrame>
              <it.icon className="h-[18px] w-[18px]" />
            </IconFrame>
            <span className="text-[15px]">{it.label}</span>
            {it.badge}
          </button>
        )
      )}
    </nav>
  );
}

function IconFrame({ children }: { children: React.ReactNode }) {
  return (
    <span className="grid h-8 w-8 place-items-center rounded-full bg-white/5 text-white/80">
      {children}
    </span>
  );
}

type IconProps = React.SVGProps<SVGSVGElement>;

function UserIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path strokeWidth="1.7" d="M12 12c2.8 0 5-2.2 5-5s-2.2-5-5-5-5 2.2-5 5 2.2 5 5 5Z" />
      <path strokeWidth="1.7" d="M2.5 21.5c1.7-4.2 6-6.5 9.5-6.5s7.8 2.3 9.5 6.5" />
    </svg>
  );
}
function WalletIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <rect x="3" y="6" width="18" height="12" rx="2.5" strokeWidth="1.7" />
      <path strokeWidth="1.7" d="M21 10h-5a2 2 0 0 0 0 4h5z" />
      <circle cx="16.5" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}
function UsersIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <circle cx="8" cy="8" r="3.5" strokeWidth="1.7" />
      <path strokeWidth="1.7" d="M1.5 18c1.1-3 4-5 6.5-5s5.4 2 6.5 5" />
      <circle cx="17.5" cy="9.5" r="2.5" strokeWidth="1.7" />
      <path strokeWidth="1.7" d="M14.5 18c.6-1.6 2.1-2.9 3.9-3.5" />
    </svg>
  );
}
function PhoneIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path strokeWidth="1.7" d="M6 2h6l-2 6 4 4 6-2v6a2 2 0 0 1-2 2c-8 0-14-6-14-14a2 2 0 0 1 2-2Z" />
    </svg>
  );
}
function GearIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <circle cx="12" cy="12" r="3" strokeWidth="1.7" />
      <path
        strokeWidth="1.7"
        d="M19 12a7 7 0 0 0-.2-1.7l2-1.5-2-3.4-2.3.8A7 7 0 0 0 14 4l-.4-2h-3.2L10 4a7 7 0 0 0-2.5 1.2L5.2 4.4 3.2 7.8l2 1.5A7 7 0 0 0 5 12c0 .6.1 1.2.2 1.7l-2 1.5 2 3.4 2.3-.8A7 7 0 0 0 10 20l.4 2h3.2l.4-2a7 7 0 0 0 2.5-1.2l2.3.8 2-3.4-2-1.5c.1-.5.2-1.1.2-1.7Z"
      />
    </svg>
  );
}
function UserPlusIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <circle cx="10" cy="8" r="3.5" strokeWidth="1.7" />
      <path strokeWidth="1.7" d="M2.5 19.5c1.7-4 5.8-6 9.5-6" />
      <path strokeWidth="1.7" d="M19 7v6M16 10h6" />
    </svg>
  );
}
function QuestionIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path strokeWidth="1.7" d="M12 18v-2.2c0-2.2 3.5-2.3 3.5-5A3.5 3.5 0 0 0 8 9" />
      <circle cx="12" cy="20" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="9" strokeWidth="1.7" />
    </svg>
  );
}
function SunIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <circle cx="12" cy="12" r="4" strokeWidth="1.7" />
      <path strokeWidth="1.7" d="M12 1v3m0 16v3M1 12h3m16 0h3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1m0-15.6-2.1 2.1M6.3 17.7 4.2 19.8" />
    </svg>
  );
}
function ChevronDown(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path strokeWidth="1.7" d="M6 9l6 6 6-6" />
    </svg>
  );
}

/* ====== Tiny inline fallback for QScoreBanner (prevents ReferenceError) ====== */
function QScoreBanner() {
  return (
    <div className="w-full h-full grid place-items-center bg-gradient-to-br from-yellow-300/10 to-white/5 text-white">
      <div className="text-center px-6">
        <h2 className="text-2xl font-semibold mb-2">Your Q-Score</h2>
        <p className="text-white/70 max-w-md">
          This is a placeholder for <code>QScoreBanner</code>. Replace with your full component when ready.
        </p>
      </div>
    </div>
  );
}

/* ================= MAIN ================= */
export default function Home() {
  const router = useRouter();
  const userId = getOrCreateUserId();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  // ✅ Fixed the stray "the" token below
  const [isInputFocused, setIsInputFocused] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(OPEN_STATE_KEY) === "true";
  });
  const [activated, setActivated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [docked, setDocked] = useState(false);
  const [qscore, setQscore] = useState<QScoreResult | null>(null);
  const [toast, setToast] = useState<{ open: boolean; text: string }>({ open: false, text: "" });
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);

  // --- Voice/WebRTC refs & state ---
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const [voiceOn, setVoiceOn] = useState(false);
  const greetingSentRef = useRef(false);

  // --- Screen share refs & state ---
  const screenStreamRef = useRef<MediaStream | null>(null);
  const [screenOn, setScreenOn] = useState(false);

  // 🆕 file input ref for image uploads
  const fileRef = useRef<HTMLInputElement | null>(null);

  function notify(msg: string, ms = 2400) {
    setToast({ open: true, text: msg });
    // @ts-expect-error store timer id
    window.clearTimeout((notify as any)._t);
    // @ts-expect-error store timer id
    (notify as any)._t = window.setTimeout(() => setToast((t) => ({ ...t, open: false })), ms);
  }

  // 🆕 helpers for image handling
  function fileToBase64(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
  }
  function extFromMime(mime: string) {
    if (mime.includes("png")) return "png";
    if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
    if (mime.includes("gif")) return "gif";
    if (mime.includes("webp")) return "webp";
    return "bin";
  }

  // 🆕 central image upload handler
  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;

    // 1) optimistic preview message
    const base64 = await fileToBase64(file);
    const now = Date.now();
    const optimistic: Message = {
      id: now,
      role: "user",
      text: "",
      timestamp: now,
      imagePreview: base64,
      status: "uploading",
    };
    const withPreview = [...messages, optimistic];
    setMessages(withPreview);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(withPreview));

    // 2) upload to Supabase Storage
    try {
      if (!supabase) throw new Error("Supabase client not available");
      const path = `user_${userId}_${now}.${extFromMime(file.type)}`;

      const { data: up, error: upErr } = await supabase.storage
        .from("chat_uploads") // ensure this public bucket exists
        .upload(path, file, { cacheControl: "3600", contentType: file.type, upsert: false });

      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("chat_uploads").getPublicUrl(up!.path);
      const publicUrl = pub.publicUrl;

      // 3) swap preview → final URL
      const finalized = withPreview.map((m) =>
        m.id === now ? { ...m, imagePreview: undefined, imageUrl: publicUrl, status: "sent" } : m
      );
      setMessages(finalized);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(finalized));
    } catch (e: any) {
      console.error(e);
      const errored = withPreview.map((m) =>
        m.id === now ? { ...m, status: "error" } : m
      );
      setMessages(errored);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(errored));
      notify(`Upload failed: ${e?.message || "unknown error"}`);
    }
  }

  // 🧠 How to Use It (Example in a Client Component)
  // Call startScreenShare() to prompt the user and begin sharing immediately.
  // If a WebRTC RTCPeerConnection (pcRef) exists, the screen track is attached/replaced.
  // Call stopScreenShare() to stop.
  async function startScreenShare() {
    if (screenOn) return;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      notify("Screen share not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30, width: { ideal: 1920 }, height: { ideal: 1080 }, cursor: "always" },
        audio: false,
      });
      screenStreamRef.current = stream;
      setScreenOn(true);
      notify("🟡 Screen sharing started");

      const [videoTrack] = stream.getVideoTracks();
      if (videoTrack) {
        videoTrack.addEventListener("ended", () => {
          stopScreenShare();
        });
      }

      const pc = pcRef.current;
      if (pc && videoTrack) {
        const existing = pc.getSenders().find((s) => s.track && s.track.kind === "video");
        if (existing) {
          await existing.replaceTrack(videoTrack);
        } else {
          pc.addTrack(videoTrack, stream);
        }
      }
    } catch (err: any) {
      notify(`Screen share error: ${err?.message || "permission denied"}`);
      setScreenOn(false);
      screenStreamRef.current = null;
    }
  }

  function stopScreenShare() {
    try {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    screenStreamRef.current = null;
    setScreenOn(false);
    notify("🟢 Screen sharing ended");
  }

  async function startVoiceChat() {
    if (voiceOn) return;
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      notify("Voice not supported in this browser context.");
      return;
    }
    try {
      // Get ephemeral key + TURN servers first
      const sessionResp = await fetchWithTimeout("/api/realtime", { method: "POST" }, 15000);
      if (!sessionResp.ok) {
        const text = await sessionResp.text().catch(() => "");
        throw new Error(`/api/realtime failed: ${sessionResp.status} ${text}`);
      }
      const session = await sessionResp.json().catch(() => ({}));
      const ephemeralKey = session?.client_secret?.value;
      const iceServers: RTCIceServer[] = Array.isArray(session?.ice_servers)
        ? session.ice_servers
        : [{ urls: ["stun:stun.l.google.com:19302"] }];
      if (!ephemeralKey) throw new Error("No client_secret returned from /api/realtime");

      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;

      pc.ontrack = (e) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = e.streams[0];
          remoteAudioRef.current.play().catch(() => {});
        }
      };

      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      for (const track of mic.getTracks()) pc.addTrack(track, mic);

      const dc = pc.createDataChannel("oai-events");
      const sendGreeting = () => {
        if (greetingSentRef.current || dc.readyState !== "open") return;
        try {
          dc.send(
            JSON.stringify({
              type: "response.create",
              response: {
                modalities: ["audio"],
                instructions:
                  "Greet the user briefly as Quossi and confirm the voice line is live. Keep it short and friendly.",
              },
            })
          );
          greetingSentRef.current = true;
        } catch {}
      };
      dc.onopen = () => {
        sendGreeting();
        setTimeout(sendGreeting, 250);
      };

      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      await waitForIceGatheringComplete(pc);

      const sdpResp = await fetchWithTimeout(
        `https://api.openai.com/v1/realtime?model=${encodeURIComponent(REALTIME_MODEL)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ephemeralKey}`,
            "Content-Type": "application/sdp",
            "OpenAI-Beta": "realtime=v1",
          },
          body: pc.localDescription?.sdp || offer.sdp || "",
        },
        20000
      );

      if (!sdpResp.ok) {
        const t = await sdpResp.text().catch(() => "");
        throw new Error(`OpenAI SDP exchange failed: ${sdpResp.status} ${t}`);
      }

      const answerSdp = await sdpResp.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "connected") {
          setTimeout(sendGreeting, 150);
        }
      };

      setVoiceOn(true);
      notify(`🎙️ Voice with ${process.env.NEXT_PUBLIC_QUOSSI_NAME ?? "Quossi"} is live`);
    } catch (err: any) {
      console.error("startVoiceChat error:", err);
      notify(`Voice error: ${err?.message ?? "Failed to start"}`);
      try { pcRef.current?.getSenders().forEach((s) => s.track?.stop()); } catch {}
      try { pcRef.current?.close(); } catch {}
      pcRef.current = null;
      setVoiceOn(false);
    }
  }

  function stopVoiceChat() {
    setVoiceOn(false);
    try { pcRef.current?.getSenders().forEach((s) => s.track?.stop()); } catch {}
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  }

  // Small helper to open the auth modal (fixes undefined openAuthModalNow)
  function openAuthModalNow() {
    setAuthPromptOpen(true);
  }

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        stopVoiceChat();
        stopScreenShare();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      stopVoiceChat();
      stopScreenShare();
    };
  }, []);

  /* === Initialize Capacitor StatusBar: Option A === */
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;
    (async () => {
      try {
        await StatusBar.setOverlaysWebView({ overlay: false });
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: "#000000" });
      } catch {}
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

  /* Clear any stale "last shown" */
  useEffect(() => {
    try { localStorage.removeItem(AUTH_LAST_SHOWN_KEY); } catch {}
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const interfaceRef = useRef<HTMLElement>(null);
  const deskMessagesRef = useRef<HTMLDivElement>(null);
  const mobileMessagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasValidatedOnceRef = useRef(false);
  const [qscoreModalOpen, setQscoreModalOpen] = useState(false);

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

  /* Show QScore card once after 10s */
  useEffect(() => {
    try {
      const shown = localStorage.getItem(QSCORE_CARD_SHOWN_KEY);
      if (shown === "1") return;
      const id = window.setTimeout(() => {
        setQscoreModalOpen(true);
        try { localStorage.setItem(QSCORE_CARD_SHOWN_KEY, "1"); } catch {}
      }, 10000);
      return () => window.clearTimeout(id);
    } catch {}
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
  }, [messages.length]);

  /* Persist composer open state */
  useEffect(() => {
    localStorage.setItem(OPEN_STATE_KEY, String(isInputFocused));
  }, [isInputFocused]);

  /* Autoscroll on new messages */
  useEffect(() => {
    jumpToBottom(deskMessagesRef.current, true);
    jumpToBottom(mobileMessagesRef.current, true);
  }, [messages]);

  /* Auto-focus textarea on mount for mobile */
  useEffect(() => {
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    if (isMobile) {
      setActivated(true);
      setIsInputFocused(true);
      setTimeout(() => textareaRef.current?.focus(), 120);
    }
  }, []);

  useEffect(() => {
    if (isInputFocused) {
      const id = requestAnimationFrame(() => {
        jumpToBottom(deskMessagesRef.current, false);
        jumpToBottom(mobileMessagesRef.current, false);
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
    } catch {}
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
      // history uses text only; image-only messages have empty text (fine)
      const history = updated.map((m) => ({ role: m.role, content: m.text }));
      const res = await fetchWithTimeout(
        "/api/chat",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: userText, history }),
        },
        30000
      );

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
      const next = Math.min(textareaRef.current.scrollHeight, 240);
      textareaRef.current.style.height = `${next}px`;
      textareaRef.current.style.overflowY =
        textareaRef.current.scrollHeight > 240 ? "auto" : "hidden";
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
    openAuthModalNow();
  };

  return (
    <main className="relative min-h-screen bg-black text-white font-sans">
      {/* 🔊 Hidden audio sink for WebRTC */}
      <audio ref={remoteAudioRef} className="hidden" autoPlay playsInline />

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

      {/* Live screen-share pill */}
      {screenOn && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[85]">
          <div className="px-3 py-1.5 rounded-full bg-white/95 text-black text-sm font-medium shadow">
            Sharing screen • <button onClick={stopScreenShare} className="underline">Stop</button>
          </div>
        </div>
      )}

      {/* ===== DESKTOP TOP-RIGHT TOOLBAR ===== */}
      <div className="hidden md:flex fixed top-3 right-3 z-[70] gap-2">
        <button
          type="button"
          onClick={() => (voiceOn ? stopVoiceChat() : startVoiceChat())}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/15 backdrop-blur-md active:scale-95 transition ${voiceOn ? "bg-rose-500/80 text-white" : "bg-white/10 hover:bg-white/15"}`}
          title={voiceOn ? "End voice" : "Start voice"}
        >
          <span className="text-sm font-semibold">{voiceOn ? "End voice" : "Voice chat"}</span>
        </button>

        {/* Optional desktop Share Screen button */}
        <button
          type="button"
          onClick={() => (screenOn ? stopScreenShare() : startScreenShare())}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/15 backdrop-blur-md active:scale-95 transition ${screenOn ? "bg-emerald-500/80 text-white" : "bg-white/10 hover:bg-white/15"}`}
          title={screenOn ? "Stop sharing" : "Share screen"}
        >
          <span className="text-sm font-semibold">{screenOn ? "Stop sharing" : "Share screen"}</span>
        </button>

        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/15 bg-white/10 backdrop-blur-md hover:bg-white/15 active:scale-95 transition"
          title="Log out"
        >
          <span className="text-sm font-semibold">log out</span>
        </button>
      </div>

      {/* ===== MOBILE: FIXED TOP BAR ===== */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-[30] bg-black/60 backdrop-blur-xl border-b border-white/10 pt-2">
        <div className="flex items-center justify-between px-3 py-3 translate-y-[2%]">
          {/* Left */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={mobileMenuOpen}
              onClick={(e) => {
                e.stopPropagation();
                setMobileMenuOpen(true);
              }}
              className="relative inline-flex items-center justify-center w-10 h-10 rounded-full bg-yellow-400/10 hover:bg-yellow-400/20 active:scale-95 transition overflow-hidden group"
            >
              {/* Outer glowing ring */}
              <span className="absolute inset-0 rounded-full border-2 border-yellow-400/60 group-hover:border-yellow-300/80 animate-pulse" />
              {/* Soft glow behind */}
              <span className="absolute inset-0 rounded-full blur-md bg-yellow-400/20 group-hover:bg-yellow-400/30 transition" />
              {/* Icon */}
              <Image
                src="/send.png"
                alt="Open menu"
                width={24}
                height={24}
                className="relative z-10 select-none pointer-events-none w-6 h-6 brightness-150 hue-rotate-15 saturate-150"
                style={{
                  filter:
                    "invert(76%) sepia(98%) saturate(2378%) hue-rotate(3deg) brightness(104%) contrast(101%)",
                }}
              />
            </button>

            <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center">
              <span className="text-sm font-semibold text-yellow-400 tracking-wide">QUOSSI</span>
              <span className="text-[11px] font-medium text-yellow-300 mt-[2px] tracking-wide">Always Active</span>
            </div>
          </div>

          {/* Right: Voice */}
          <button
            type="button"
            aria-label="Voice"
            onClick={(e) => {
              e.stopPropagation();
              setMobileMenuOpen(false);
              voiceOn ? stopVoiceChat() : startVoiceChat();
            }}
            className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${voiceOn ? "bg-rose-500/80" : "bg-yellow-400/10 hover:bg-yellow-400/20"} active:scale-95 transition`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-6 h-6 text-yellow-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 6.75c0 8.284 6.716 15 15 15h1.5A2.25 2.25 0 0021 19.5v-2.25a.75.75 0 00-.75-.75h-3.007a.75.75 0 00-.705.516l-.724 2.172a.75.75 0 01-.696.516 12.035 12.035 0 01-11.27-11.27.75.75 0 01.516-.696l2.172-.724a.75.75 0 00.516-.705V3.75A.75.75 0 007.5 3H5.25A2.25 2.25 0 003 5.25v1.5z"
              />
            </svg>
          </button>
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
        <div
          className={`absolute top-0 left-0 h-full transform transition-transform duration-300 ${
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <TelegramDrawer
            onShareScreen={() => {
              setMobileMenuOpen(false);
              screenOn ? stopScreenShare() : startScreenShare();
            }}
            onVoiceCall={() => {
              setMobileMenuOpen(false);
              voiceOn ? stopVoiceChat() : startVoiceChat();
            }}
            onLogout={() => {
              setMobileMenuOpen(false);
              handleLogout();
            }}
            onOpenComponents={() => {          // ✅ NEW: close drawer + go to /components
              setMobileMenuOpen(false);
              router.push("/components");
            }}
          />
        </div>
      </div>

      {/* ===== MOBILE CHAT ===== */}
      <section className="md:hidden fixed inset-0 z-[25]">
        <div className="flex flex-col h-[100dvh] bg-transparent">
          {/* Fixed the class here: pt-[72px] */}
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

          {/* 🆕 Hidden global file input for image uploads (mobile+desktop) */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          {/* Composer (MOBILE) */}
          <div className=" bottom-0 left-0 right-0 z-[26] bg-black/70 backdrop-blur-md border-t border-white/10 px-3 pt-2 pb-3">
            <ChatComposer
              value={input}
              disabled={isLoading}
              onChange={handleInputChange}
              onKeyDown={handleKeyPress}
              onSend={handleSendMessage}
              // 🆕 open image picker on +
              onPlus={() => {
                setActivated(true);
                fileRef.current?.click();
              }}
              micOn={voiceOn}
              onMicToggle={() => (voiceOn ? stopVoiceChat() : startVoiceChat())}
              textareaRef={textareaRef}
              loadingDot={isLoading}
            />
          </div>
        </div>
      </section>

      {/* ===== DESKTOP CHAT ===== */}
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
              window.setTimeout(() => setDocked(true), DOCK_DELAY_MS);
            }
          }}
        >
          {(isInputFocused || activated) && (
            <div
              className="flex justify-center pt-2 pb-1 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                handleSlideUp(e);
                setDocked(false);
              }}
            >
              <div className="w-12 h-1 bg-white/30 rounded-full" />
            </div>
          )}

          {!activated && (
            <div className="relative flex-1 grid place-items-center py-10">
              <div className="text-center px-6">
                <h2 className="text-3xl font-semibold text-white/90 mb-6">Whats on your mind?</h2>

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

          {activated && (
            <>
              {qscore && (
                <div className="px-4 pt-3 shrink-0">
                  <QScorePanel q={qscore} />
                </div>
              )}

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

              {/* Composer (DESKTOP) */}
              <div className="relative p-2 bg-transparent border-t border-white/10 shrink-0">
                <ChatComposer
                  value={input}
                  disabled={isLoading}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyPress}
                  onSend={handleSendMessage}
                  // 🆕 open image picker on +
                  onPlus={() => {
                    setActivated(true);
                    fileRef.current?.click();
                  }}
                  micOn={voiceOn}
                  onMicToggle={() => (voiceOn ? stopVoiceChat() : startVoiceChat())}
                  textareaRef={textareaRef}
                  loadingDot={isLoading}
                />
              </div>
            </>
          )}
        </div>
      </section>

      {/* ===== Auth popup modal (manual only) ===== */}
      <AuthPromptModal
        open={!!authPromptOpen}
        onClose={() => setAuthPromptOpen(false)}
        onSignin={handleGoSignin}
        onSignup={handleGoSignup}
      />

      {/* ===== QScore card modal (show once) ===== */}
      {qscoreModalOpen && (
        <div role="dialog" aria-modal="true" aria-label="Your QScore" className="fixed inset-0 z-[110] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setQscoreModalOpen(false)} />
          <div className="relative z-[111] w-full h-full md:w-[92%] md:h-[92%] rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setQscoreModalOpen(false)}
              aria-label="Close QScore"
              className="absolute top-4 right-4 z-[112] w-10 h-10 grid place-items-center rounded-lg border border-white/20 bg-white/10 hover:bg-white/15 text-white"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
            <QScoreBanner />
          </div>
        </div>
      )}

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
      `}</style>
    </main>
  );
}

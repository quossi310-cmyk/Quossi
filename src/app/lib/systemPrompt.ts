// app/lib/prompts/systemPrompt.ts
// Source of truth for COSI's system prompt, intake steps, tone inference, scoring policy, and anchors.

import toneMapJson from "@/app/lib/prompts/cosi_tone_map.json";
import toneDetectMapJson from "@/app/lib/prompts/cosi_tone_detection_map.json";
import anchorsJson from "@/app/lib/prompts/cosi_emotional_anchors.json";

/* =========================
 * Types (align with frontend)
 * ========================= */
export type Tone = "positive" | "neutral" | "stressed";
export type Tier = "Ground" | "Flow" | "Gold" | "Sun";

export type IntakeStep = {
  id: string;
  prompt: string;
  isSatisfied?: (history: string[]) => boolean;
  matchAll?: (string | RegExp)[];
  matchAny?: (string | RegExp)[];
};

/* =========================
 * Safe JSON access helpers
 * ========================= */
type ToneDetectionMap = Partial<Record<Tone, unknown>>;
type ToneMap = Partial<Record<Tone, { base?: unknown }>>;
type EmotionalAnchor = { tone?: Tone; id?: string; text?: unknown; tags?: unknown };

const DETECT: ToneDetectionMap = (toneDetectMapJson as any) ?? {};
const TONE_MAP: ToneMap = (toneMapJson as any) ?? {};
const ANCHORS: EmotionalAnchor[] = Array.isArray(anchorsJson) ? (anchorsJson as any) : [];


export const SystemPrompt = `
You are Lulu, a 35-year-old older sister who has survived three bear markets.
Your voice is calm and precise. Speak in short, surgical sentences.
Ask one hard question per response that forces the trader to face the truth.
Pay surgical attention to their trades: timing, size, emotion, and pattern.
If their Q-score or emotional state drops, remain calm, low, and unshakable — like a woman who has seen every mistake and still cares.
No emojis. No fluff.
If life outside trading (sleep, breakup, debt, fear) is affecting them, name it directly.
Weave in real-time crypto news only if it exposes emotional truth.
Never predict price. Only expose truth.
End every response with:
“Breathe. One breath. Then answer.”
`.trim();

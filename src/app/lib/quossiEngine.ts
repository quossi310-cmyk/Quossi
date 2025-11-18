/**
 * QUOSSI Q-SCORE ENGINE (Behavioral Layer)
 * ----------------------------------------
 * Calculates emotional stability around money/trading behavior.
 * Produces Q-Score (100–600), Range, and Reflection.
 */

/* ================= Public Types ================= */
export type QScoreData = {
  qScore: number;
  range: string;
  archetype: string;
  reflection: string;
};

/* ================= Internals ================= */
const ranges = [
  { name: "🌪 Storm", min: 100, max: 199, archetype: "The Reactor", motto: "Emotion first, logic later." },
  { name: "🌍 Ground", min: 200, max: 299, archetype: "The Builder", motto: "Steady hands make heavy bags." },
  { name: "🌊 Flow", min: 300, max: 399, archetype: "The Surfer", motto: "Don’t fight the wave — ride it." },
  { name: "🏆 Gold", min: 400, max: 499, archetype: "The Strategist", motto: "Silence wins faster." },
  { name: "☀️ Sun",  min: 500, max: 600, archetype: "The Oracle",    motto: "Peace is the ultimate edge." }
];

function detectTone(text: string): string {
  const lower = text.toLowerCase();
  if (/(happy|calm|peace|grateful|good|confident)/.test(lower)) return "positive";
  if (/(anxious|worried|nervous|fear|scared)/.test(lower)) return "anxious";
  if (/(angry|mad|frustrated|furious|revenge)/.test(lower)) return "over-confident";
  return "neutral";
}

function detectSelfAwareness(text: string): number {
  return /i (noticed|realized|learned|understand|see|reflect)/i.test(text) ? 1 : 0;
}

function detectImpulse(text: string): number {
  return /(immediately|couldn’t wait|had to|revenge|all in|double down|panic)/i.test(text) ? 1 : 0;
}

function analyzeMessages(messages: string[]): number {
  const tones = messages.map(detectTone);
  const impulses = messages.map(detectImpulse);
  const awareness = messages.map(detectSelfAwareness);

  const uniqueTones = new Set(tones);
  const stabilityScore = Math.max(0, 1 - (uniqueTones.size - 1) / 3);

  const toneScore =
    tones.filter(t => t === "positive").length * 1 +
    tones.filter(t => t === "neutral").length * 0.8 -
    tones.filter(t => t === "anxious" || t === "over-confident").length * 0.5;

  const impulseScore = 1 - impulses.filter(Boolean).length / messages.length;
  const selfAwarenessScore = awareness.filter(Boolean).length / messages.length;

  const composite =
    stabilityScore * 0.3 +
    (toneScore / messages.length) * 0.3 +
    selfAwarenessScore * 0.25 +
    impulseScore * 0.15;

  return Math.min(1, Math.max(0, composite));
}

function generateReflection(range: { name: string; archetype: string }, ratio: number): string {
  const vibe =
    ratio > 0.8 ? "calm and centered" :
    ratio > 0.6 ? "balanced and aware" :
    ratio > 0.4 ? "finding your rhythm" :
    ratio > 0.2 ? "learning to slow the reaction" :
    "in emotional overdrive";

  const next =
    range.name === "🌪 Storm" ? "Let’s build that Ground next." :
    range.name === "🌍 Ground" ? "Keep stacking that Flow energy." :
    range.name === "🌊 Flow" ? "You’re smooth — aim for that Gold edge." :
    range.name === "🏆 Gold" ? "Refine the peace, Sun is near." :
    "You’re glowing — protect your clarity.";

  return `You sound ${vibe} — ${range.archetype} energy. ${next}`;
}

/* ================= Public pure function (kept) ================= */
export function computeQScore(messages: string[]): QScoreData {
  const ratio = analyzeMessages(messages);
  const qScore = Math.round(100 + ratio * 500);
  const range = ranges.find(r => qScore >= r.min && qScore <= r.max) ?? ranges[0];
  const reflection = generateReflection(range, ratio);

  return {
    qScore,
    range: range.name,
    archetype: range.archetype,
    reflection,
  };
}

/* ================= New: exported API-style function =================
   - Name matches how your API routes import & call it: QScoreResult(...)
   - Accepts either string[] or chat-style {role, content}[]
   - Async so callers can safely `await` it (matches your usage).
*/
type ChatLike = Array<{ role: "user" | "assistant"; content: string }>;

export async function QScoreResult(
  input: string[] | ChatLike,
  _userHint?: string
): Promise<QScoreData> {
  // Normalize to string[]
  const messages: string[] = Array.isArray(input)
    ? (typeof input[0] === "string"
        ? (input as string[])
        : (input as ChatLike).map(m => (typeof m?.content === "string" ? m.content : "")).filter(Boolean))
    : [];

  if (messages.length === 0) {
    // safe default
    return { qScore: 250, range: "🌍 Ground", archetype: "The Builder", reflection: "Say a bit more and I’ll calibrate your Q-Score." };
  }

  // Use the pure function
  const result = computeQScore(messages);
  return result;
}

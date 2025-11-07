// app/lib/cheapSummary.ts
// Very lightweight, local summary used to store a short recap of recent turns.

export type Turn = { role: "user" | "assistant"; content: string };

/**
 * Builds a tiny summary by concatenating recent turns and trimming
 * to a maximum number of characters. This avoids any external calls.
 */
export function cheapSummary(turns: Turn[], maxChars = 240): string {
  const cleaned = turns
    .map((t) => `${t.role === "user" ? "U" : "A"}: ${t.content}`.replace(/\s+/g, " ").trim())
    .join(" | ");
  if (cleaned.length <= maxChars) return cleaned;
  return cleaned.slice(0, Math.max(0, maxChars - 1)).trimEnd() + "…";
}


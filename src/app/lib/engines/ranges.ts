export function getRange(qScore: number) {
  if (qScore < 40) return "Storm";
  if (qScore < 70) return "Flow";
  return "Gold";
}
export type Range = "Storm" | "Flow" | "Gold";

export function calculateQScore(clarityPulse: number, confidenceIndex: number) {
  const Q = (clarityPulse * 0.6 + confidenceIndex * 0.4);
  return Math.round(Q * 100) / 100;
}
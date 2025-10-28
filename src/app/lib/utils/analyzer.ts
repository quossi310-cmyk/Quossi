export function analyzeConversation(text: string) {
  // Simple keyword heuristics (replace with real NLP later)
  const clarityPulse = /budget|plan|aware|reflect/i.test(text) ? 70 : 45;
  const confidenceIndex = /try|can|will|confident/i.test(text) ? 65 : 40;
  return { clarityPulse, confidenceIndex };
}

// lib/data/userProfiles.ts
export type Tone = "positive" | "neutral" | "stressed";
export type Tier = "Ground" | "Flow" | "Gold" | "Sun";

export interface QScoreData {
  tone: Tone;
  qScore: number;
  tier: Tier;
  task: string;
  runAt: string; // timestamp for when it was generated
}

export interface LocalUserProfile {
  id: string; // stable local ID
  nickname?: string;
  qscore?: QScoreData;
  lastUpdated?: number;
}

// Local Storage Key
const STORAGE_KEY = "quossi_user_profile";

export function getOrCreateLocalProfile(): LocalUserProfile {
  if (typeof window === "undefined") return { id: "local" };

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return JSON.parse(stored);

  const newProfile: LocalUserProfile = {
    id: `quossi-${Math.random().toString(36).slice(2, 10)}`,
    lastUpdated: Date.now(),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(newProfile));
  return newProfile;
}

export function updateLocalProfile(updates: Partial<LocalUserProfile>) {
  const profile = getOrCreateLocalProfile();
  const updated = { ...profile, ...updates, lastUpdated: Date.now() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export function saveQScore(qscore: QScoreData) {
  return updateLocalProfile({ qscore });
}

export function getQScore(): QScoreData | null {
  const profile = getOrCreateLocalProfile();
  return profile.qscore || null;
}

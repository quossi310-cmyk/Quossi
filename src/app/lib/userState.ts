// src/lib/userState.ts
import { getServiceSupabase } from "@/app/lib/supabase/service";

export type UserState = {
  user_id: string;
  system_sent: boolean;
  last_summary: string | null;
  updated_at: string;
};

export async function getUserState(userId: string): Promise<UserState | null> {
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("user_state")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as UserState) ?? null;
}

export async function markSystemSent(userId: string) {
  const sb = getServiceSupabase();
  const { error } = await sb
    .from("user_state")
    .upsert({ user_id: userId, system_sent: true, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function saveSummary(userId: string, summary: string) {
  const sb = getServiceSupabase();
  const { error } = await sb
    .from("user_state")
    .upsert({ user_id: userId, last_summary: summary, updated_at: new Date().toISOString() });
  if (error) throw error;
}

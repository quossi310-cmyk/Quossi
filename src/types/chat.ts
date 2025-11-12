export type Role = "user" | "assistant";

export interface Message {
  id: string;                 // uuid or Date.now().toString()
  role: Role;
  text?: string;              // optional text
  imageUrl?: string;          // final URL (Supabase public URL)
  imagePreview?: string;      // base64 preview while uploading
  timestamp: number;          // Date.now()
  status?: "sending" | "sent" | "error" | "uploading";
}

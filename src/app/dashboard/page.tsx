// src/app/dashboard/page.tsx
import { createClient } from "@/app/lib/supabase/server";
import ClientDashboard from "./ClientDashboard";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // middleware already protects this route; keep it extra safe:
  if (!user) return null;

  return <ClientDashboard user={user} />;
}

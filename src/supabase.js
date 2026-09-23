import { createClient } from "@supabase/supabase-js";

// Temporary production failover while the original Supabase project is unstable.
const supabaseUrl = "https://kkmbiiiglgevwehhmtzq.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrbWJpaWlnbGdldndlaGhtdHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMDYwNzIsImV4cCI6MjEwNTU4MjA3Mn0.IqMb469tGShmoN6UNRXaU-Cy6MsGbXygOXEdW_2CML8";

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        realtime: { params: { eventsPerSecond: 20 } },
      })
    : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase ma mconfigurach. Zid VITE_SUPABASE_URL w VITE_SUPABASE_ANON_KEY f .env",
    );
  }
  return supabase;
}

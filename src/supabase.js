import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

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

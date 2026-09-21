import { createClient } from "@supabase/supabase-js";

// Temporary production failover while the original Supabase project is unstable.
const supabaseUrl = "https://kkmbiiiglgevwehhmtzq.supabase.co";
const supabaseAnonKey = "sb_publishable_cqSPEkE8JbyIu9NasnOMng_GwRMKVFO";

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

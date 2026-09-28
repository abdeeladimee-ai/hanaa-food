import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = "https://grkezxhswfocqlvujzdy.supabase.co";
export const supabaseAnonKey = "sb_publishable_P_ADKKjVA91hIFkgFN4H6Q_OH1rxmSX";

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
        realtime: { params: { eventsPerSecond: 10 } },
      })
    : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase ma mconfigurach.");
  }
  return supabase;
}

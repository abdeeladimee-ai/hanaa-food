export const supabaseUrl = "";
export const supabaseAnonKey = "";
export const supabase = null;

export function requireSupabase() {
  throw new Error("Direct browser Supabase access is disabled.");
}

const fallbackUrl = "https://example.supabase.co";
const fallbackAnonKey = "supabase-anon-key";

export const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || fallbackUrl;

export const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || fallbackAnonKey;

export const hasSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
);

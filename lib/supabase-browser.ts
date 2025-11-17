import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

const missingEnvMessage =
  "Supabase URL or anon key is missing. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.";

export const getSupabaseBrowserClient = () => {
  if (browserClient) {
    return browserClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(missingEnvMessage);
  }

  browserClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false }
  });

  return browserClient;
};

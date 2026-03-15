import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config.js";

export const createBrowserSupabaseClient = () => {
  const config = getSupabaseConfig();
  return createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });
};

export const createServiceSupabaseClient = () => {
  const config = getSupabaseConfig();

  if (!config.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for service client usage.");
  }

  return createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
};

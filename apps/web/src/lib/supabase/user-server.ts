import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

export function createUserClient(authorization: string) {
  const env = serverEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
}

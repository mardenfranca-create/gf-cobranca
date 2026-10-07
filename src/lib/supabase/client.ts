"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";

import { supabaseEnv } from "@/lib/config/supabase-env";
export function supabaseBrowser() {
  return createBrowserClient<Database>(
    supabaseEnv().url,
    supabaseEnv().anon,
  );
}

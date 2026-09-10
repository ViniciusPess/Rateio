"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicSupabaseConfig } from "@/lib/supabase/config";

export function createClient() {
  const { url, publishableKey } = publicSupabaseConfig();
  return createBrowserClient(url, publishableKey);
}

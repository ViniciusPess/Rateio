import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicSupabaseConfig } from "@/lib/supabase/config";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = publicSupabaseConfig();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components não podem gravar cookies; o proxy renova a sessão.
        }
      },
    },
  });
}

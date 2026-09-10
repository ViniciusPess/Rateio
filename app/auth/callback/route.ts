import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicSupabaseConfig } from "@/lib/supabase/config";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const flowId = url.searchParams.get("sb_flow_id");
  const nextValue = url.searchParams.get("next");
  const next = nextValue?.startsWith("/") && !nextValue.startsWith("//") ? nextValue : "/";
  const destination = next === "/" ? "/auth/continuar" : next;

  if (code) {
    const { url: supabaseUrl, publishableKey } = publicSupabaseConfig();
    const redirectResponse = NextResponse.redirect(new URL(destination, url.origin), 303);
    const supabase = createServerClient(supabaseUrl, publishableKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
            redirectResponse.cookies.set(name, value, options);
          }
        },
      },
    });
    const { error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (!error) return redirectResponse;
  }

  return NextResponse.redirect(new URL("/login?erro=oauth", url.origin));
}

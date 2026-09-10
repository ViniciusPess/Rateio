import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const flowId = url.searchParams.get("sb_flow_id");
  const nextValue = url.searchParams.get("next");
  const next = nextValue?.startsWith("/") && !nextValue.startsWith("//") ? nextValue : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }

  return NextResponse.redirect(new URL("/login?erro=oauth", url.origin));
}

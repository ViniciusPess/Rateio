import { publicSupabaseConfig } from "@/lib/supabase/config";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const requestUrl = new URL(request.url);
  const { url, publishableKey } = publicSupabaseConfig();
  const upstream = await fetch(`${url}/functions/v1/participant-access?month=${encodeURIComponent(requestUrl.searchParams.get("month") ?? "")}`, {
    headers: {
      apikey: publishableKey,
      "x-rateio-access-token": token,
    },
    cache: "no-store",
  });
  return relay(upstream);
}

async function relay(upstream: Response) {
  return new Response(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json", "Cache-Control": "private, no-store" },
  });
}

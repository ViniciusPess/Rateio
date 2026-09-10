import { publicSupabaseConfig } from "@/lib/supabase/config";

export async function POST(request: Request, context: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await context.params;
  const form = await request.formData();
  form.set("chargeId", id);
  const { url, publishableKey } = publicSupabaseConfig();
  const upstream = await fetch(`${url}/functions/v1/participant-access`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      "x-rateio-access-token": token,
    },
    body: form,
    cache: "no-store",
  });
  return new Response(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json", "Cache-Control": "private, no-store" },
  });
}

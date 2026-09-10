import { createAccessToken, hashAccessToken, postgresBytea } from "@/lib/access-token";
import { getAdminContext } from "@/lib/auth";
import { errorResponse } from "@/lib/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getAdminContext();
    if (!actor) throw new Response("Autenticação necessária.", { status: 401 });
    const { id } = await context.params;
    const token = createAccessToken();
    const tokenHash = postgresBytea(hashAccessToken(token));
    const supabase = await createClient();
    const { error } = await supabase.rpc("rotate_participant_link", {
      p_participant_id: id,
      p_token_hash: tokenHash,
      p_token_last_four: token.slice(-4),
    });
    if (error) throw error;

    const origin = new URL(request.url).origin;
    return Response.json({ url: `${origin}/acesso/${token}` }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

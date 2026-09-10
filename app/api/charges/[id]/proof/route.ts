import { getAdminContext } from "@/lib/auth";
import { errorResponse } from "@/lib/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getAdminContext();
    if (!actor) throw new Response("Autenticação necessária.", { status: 401 });
    const { id } = await context.params;
    const supabase = await createClient();
    const { data: proof, error } = await supabase.from("payment_proofs")
      .select("storage_key")
      .eq("workspace_id", actor.workspaceId)
      .eq("charge_id", id)
      .maybeSingle();
    if (error) throw error;
    if (!proof) throw new Response("Comprovante não encontrado.", { status: 404 });
    const { data, error: signedError } = await supabase.storage.from("payment-proofs").createSignedUrl(proof.storage_key, 60);
    if (signedError) throw signedError;
    return Response.redirect(data.signedUrl, 302);
  } catch (error) {
    return errorResponse(error);
  }
}

import { getAdminContext } from "@/lib/auth";
import { normalizeWhatsApp } from "@/lib/domain";
import { errorResponse } from "@/lib/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getAdminContext();
    if (!actor) throw new Response("Autenticação necessária.", { status: 401 });
    const { id } = await context.params;
    const body = await request.json() as { whatsapp?: string };
    const whatsapp = normalizeWhatsApp(body.whatsapp);
    const supabase = await createClient();
    const { data, error } = await supabase.from("participants")
      .update({ whatsapp })
      .eq("workspace_id", actor.workspaceId)
      .eq("id", id)
      .eq("is_owner", false)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Response("Participante não encontrado.", { status: 404 });
    return Response.json({ ok: true, whatsapp });
  } catch (error) {
    return errorResponse(error);
  }
}

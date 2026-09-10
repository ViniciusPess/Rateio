import { getAdminContext } from "@/lib/auth";
import { errorResponse } from "@/lib/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request) {
  try {
    const actor = await getAdminContext();
    if (!actor) throw new Response("Autenticação necessária.", { status: 401 });
    const body = await request.json() as { name?: string };
    const name = body.name?.trim();
    if (!name || name.length > 80) throw new Error("Informe um nome de até 80 caracteres.");
    const supabase = await createClient();
    const [{ error: profileError }, { error: participantError }] = await Promise.all([
      supabase.from("profiles").update({ display_name: name }).eq("id", actor.authUserId),
      supabase.from("participants").update({ name }).eq("workspace_id", actor.workspaceId).eq("id", actor.participantId),
    ]);
    if (profileError || participantError) throw profileError ?? participantError;
    return Response.json({ ok: true, name });
  } catch (error) {
    return errorResponse(error);
  }
}

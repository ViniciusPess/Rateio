import { getAdminContext } from "@/lib/auth";
import { errorResponse } from "@/lib/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getAdminContext();
    if (!actor) throw new Response("Autenticação necessária.", { status: 401 });
    const { id } = await context.params;
    const body = await request.json() as { action?: string; channel?: string; reason?: string };
    const supabase = await createClient();

    if (body.action === "confirm") {
      const { data, error } = await supabase.from("charges").update({
        status: "confirmed", confirmed_at: new Date().toISOString(), reviewed_by: actor.authUserId, return_reason: null,
      }).eq("workspace_id", actor.workspaceId).eq("id", id).eq("status", "reported").select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Somente pagamentos informados podem ser confirmados.");
      await recordAudit(supabase, actor, id, "receipt_confirmed");
    } else if (body.action === "return_pending") {
      const reason = body.reason?.trim();
      if (!reason || reason.length > 500) throw new Error("Informe uma justificativa de até 500 caracteres.");
      const { data, error } = await supabase.from("charges").update({
        status: "pending", confirmed_at: null, reviewed_by: actor.authUserId, return_reason: reason,
      }).eq("workspace_id", actor.workspaceId).eq("id", id).eq("status", "reported").select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Somente pagamentos aguardando conferência podem ser devolvidos.");
      await recordAudit(supabase, actor, id, "payment_returned", { reason });
    } else if (body.action === "record_notice") {
      const channel = body.channel?.toLowerCase() === "whatsapp" ? "whatsapp" : "other";
      const { data: charge, error: chargeError } = await supabase.from("charges").select("id")
        .eq("workspace_id", actor.workspaceId).eq("id", id).maybeSingle();
      if (chargeError) throw chargeError;
      if (!charge) throw new Response("Cobrança não encontrada.", { status: 404 });
      const { error } = await supabase.from("notices").insert({
        workspace_id: actor.workspaceId, charge_id: id, channel,
        sent_at: new Date().toISOString(), recorded_by: actor.authUserId,
      });
      if (error) throw error;
      await recordAudit(supabase, actor, id, "notice_recorded", { channel, manualRecord: true });
    } else {
      throw new Error("Ação inválida.");
    }

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

async function recordAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actor: NonNullable<Awaited<ReturnType<typeof getAdminContext>>>,
  entityId: string,
  action: string,
  details: Record<string, unknown> = {},
) {
  const { error } = await supabase.from("audit_events").insert({
    workspace_id: actor.workspaceId,
    actor_user_id: actor.authUserId,
    actor_label: actor.name,
    entity_type: "charge",
    entity_id: entityId,
    action,
    details,
  });
  if (error) throw error;
}

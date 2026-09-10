import { getAdminContext } from "@/lib/auth";
import { normalizeWhatsApp, validateMonth } from "@/lib/domain";
import { errorResponse } from "@/lib/server";
import { createClient } from "@/lib/supabase/server";

type MemberInput = { userId?: string; name?: string; email?: string; whatsapp?: string; shareCents?: number };

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getAdminContext();
    if (!actor) throw new Response("Autenticação necessária.", { status: 401 });
    const { id } = await context.params;
    const body = await request.json() as {
      action?: string; effectiveMonth?: string; totalCents?: number; dueDay?: number;
      splitMode?: "equal" | "custom"; members?: MemberInput[];
    };
    const supabase = await createClient();

    if (body.action === "archive") {
      const { data, error } = await supabase.from("subscriptions")
        .update({ archived_at: new Date().toISOString() })
        .eq("workspace_id", actor.workspaceId)
        .eq("id", id)
        .is("archived_at", null)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Response("Assinatura não encontrada.", { status: 404 });
      await supabase.from("audit_events").insert({
        workspace_id: actor.workspaceId,
        actor_user_id: actor.authUserId,
        actor_label: actor.name,
        entity_type: "subscription",
        entity_id: id,
        action: "subscription_archived",
      });
      return Response.json({ ok: true });
    }

    if (body.action !== "update_future") throw new Error("Ação inválida.");
    const effectiveMonth = validateMonth(body.effectiveMonth ?? "");
    const members = (body.members ?? []).map((member) => member.userId ? {
      participantId: member.userId,
      shareCents: member.shareCents,
    } : {
      name: member.name?.trim(),
      email: member.email?.trim().toLowerCase(),
      whatsapp: normalizeWhatsApp(member.whatsapp),
      shareCents: member.shareCents,
    });
    const { error } = await supabase.rpc("update_rateio_subscription_future", {
      p_subscription_id: id,
      p_effective_month: effectiveMonth,
      p_total_cents: Number(body.totalCents),
      p_due_day: Number(body.dueDay),
      p_split_mode: body.splitMode === "custom" ? "custom" : "equal",
      p_members: members,
    });
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

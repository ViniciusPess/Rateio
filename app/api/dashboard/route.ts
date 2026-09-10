import { chargeIsLate, currentMonth, validateMonth } from "@/lib/domain";
import { getAdminContext } from "@/lib/auth";
import { errorResponse } from "@/lib/server";
import { createClient } from "@/lib/supabase/server";

type Row = Record<string, unknown>;

export async function GET(request: Request) {
  try {
    const actorContext = await getAdminContext();
    if (!actorContext) throw new Response("Autenticação necessária.", { status: 401 });
    const supabase = await createClient();
    const month = validateMonth(new URL(request.url).searchParams.get("month") ?? currentMonth());
    const { error: generationError } = await supabase.rpc("ensure_month_charges", { p_month: month });
    if (generationError) throw generationError;

    const workspaceId = actorContext.workspaceId;
    const [chargesResult, subscriptionsResult, participantsResult, membershipsResult, versionsResult, proofsResult, noticesResult, auditResult] = await Promise.all([
      supabase.from("charges").select("*").eq("workspace_id", workspaceId).eq("billing_month", month).order("due_date"),
      supabase.from("subscriptions").select("*").eq("workspace_id", workspaceId).order("name"),
      supabase.from("participants").select("*").eq("workspace_id", workspaceId),
      supabase.from("subscription_participants").select("*").eq("workspace_id", workspaceId),
      supabase.from("subscription_versions").select("*").eq("workspace_id", workspaceId).lte("effective_month", month).order("effective_month"),
      supabase.from("payment_proofs").select("charge_id").eq("workspace_id", workspaceId),
      supabase.from("notices").select("charge_id,channel,sent_at").eq("workspace_id", workspaceId).order("sent_at", { ascending: false }),
      supabase.from("audit_events").select("id,action,actor_label,created_at,details").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(20),
    ]);
    const failure = [chargesResult, subscriptionsResult, participantsResult, membershipsResult, versionsResult, proofsResult, noticesResult, auditResult].find((result) => result.error)?.error;
    if (failure) throw failure;

    const participants = (participantsResult.data ?? []) as Row[];
    const participantById = new Map(participants.map((row) => [String(row.id), row]));
    const subscriptionsRaw = (subscriptionsResult.data ?? []) as Row[];
    const subscriptionById = new Map(subscriptionsRaw.map((row) => [String(row.id), row]));
    const versionBySubscription = new Map<string, Row>();
    for (const version of (versionsResult.data ?? []) as Row[]) versionBySubscription.set(String(version.subscription_id), version);
    const proofChargeIds = new Set(((proofsResult.data ?? []) as Row[]).map((row) => String(row.charge_id)));
    const latestNotice = new Map<string, Row>();
    for (const notice of (noticesResult.data ?? []) as Row[]) {
      const chargeId = String(notice.charge_id);
      if (!latestNotice.has(chargeId)) latestNotice.set(chargeId, notice);
    }

    const charges = ((chargesResult.data ?? []) as Row[]).map((row) => {
      const subscription = subscriptionById.get(String(row.subscription_id)) ?? {};
      const participant = participantById.get(String(row.participant_id)) ?? {};
      const notice = latestNotice.get(String(row.id));
      const hasProof = proofChargeIds.has(String(row.id));
      return {
        id: row.id,
        subscriptionId: row.subscription_id,
        subscriptionName: subscription.name ?? "Assinatura",
        userId: row.participant_id,
        participantName: participant.name ?? "Participante",
        participantWhatsApp: participant.whatsapp ?? null,
        billingMonth: row.billing_month,
        amountCents: row.amount_cents,
        dueDate: row.due_date,
        status: row.status,
        acknowledgedAt: row.acknowledged_at,
        paymentReportedAt: row.payment_reported_at,
        paymentDate: row.payment_date,
        confirmedAt: row.confirmed_at,
        returnReason: row.return_reason,
        pixKey: subscription.pix_key ?? "",
        paymentInstructions: subscription.payment_instructions ?? "",
        isLate: chargeIsLate(String(row.due_date), String(row.status)),
        hasProof,
        proofUrl: hasProof ? `/api/charges/${row.id}/proof` : null,
        noticeSentAt: notice?.sent_at ?? null,
        noticeChannel: notice?.channel ?? null,
      };
    });

    const memberships = (membershipsResult.data ?? []) as Row[];
    const subscriptions = subscriptionsRaw.map((subscription) => {
      const version = versionBySubscription.get(String(subscription.id));
      const activeMemberships = memberships.filter((membership) =>
        membership.subscription_id === subscription.id &&
        String(membership.start_month) <= month &&
        (!membership.end_month || String(membership.end_month) >= month));
      return {
        id: subscription.id,
        name: subscription.name,
        totalCents: version?.total_cents ?? subscription.total_cents,
        dueDay: version?.due_day ?? subscription.due_day,
        splitMode: version?.split_mode ?? subscription.split_mode,
        paymentInstructions: subscription.payment_instructions,
        pixKey: subscription.pix_key,
        archivedAt: subscription.archived_at,
        isDemo: false,
        members: activeMemberships.map((membership) => {
          const participant = participantById.get(String(membership.participant_id)) ?? {};
          return {
            id: participant.id,
            name: participant.name ?? "Participante",
            email: participant.email ?? null,
            whatsapp: participant.whatsapp ?? null,
            shareCents: membership.share_cents ?? null,
            startMonth: membership.start_month,
            endMonth: membership.end_month ?? null,
          };
        }),
      };
    });

    const financialCharges = charges.filter((charge) => charge.userId !== actorContext.participantId);
    const summary = {
      totalCents: financialCharges.reduce((sum, charge) => sum + Number(charge.amountCents), 0),
      receivedCents: financialCharges.filter((charge) => charge.status === "confirmed").reduce((sum, charge) => sum + Number(charge.amountCents), 0),
      pendingCents: financialCharges.filter((charge) => charge.status !== "confirmed").reduce((sum, charge) => sum + Number(charge.amountCents), 0),
      lateCount: financialCharges.filter((charge) => charge.isLate).length,
      reviewCount: financialCharges.filter((charge) => charge.status === "reported").length,
      unacknowledgedCount: financialCharges.filter((charge) => !charge.acknowledgedAt).length,
    };
    const audit = ((auditResult.data ?? []) as Row[]).map((row) => ({
      id: row.id,
      action: row.action,
      actorName: row.actor_label,
      createdAt: row.created_at,
      detailsJson: JSON.stringify(row.details ?? {}),
    }));

    return Response.json({
      actor: { id: actorContext.participantId, email: actorContext.email, name: actorContext.name, role: "admin", isDemo: false },
      month,
      summary,
      charges,
      subscriptions,
      audit,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

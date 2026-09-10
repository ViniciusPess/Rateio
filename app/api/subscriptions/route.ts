import { getAdminContext } from "@/lib/auth";
import { normalizeWhatsApp } from "@/lib/domain";
import { errorResponse } from "@/lib/server";
import { createClient } from "@/lib/supabase/server";

type ParticipantInput = { name?: string; email?: string; whatsapp?: string; shareCents?: number };

export async function POST(request: Request) {
  try {
    const actor = await getAdminContext();
    if (!actor) throw new Response("Autenticação necessária.", { status: 401 });
    const body = await request.json() as {
      name?: string; totalCents?: number; dueDay?: number; splitMode?: "equal" | "custom";
      pixKey?: string; paymentInstructions?: string; includeSelf?: boolean; participants?: ParticipantInput[];
    };
    const participants = (body.participants ?? []).map((participant) => ({
      name: participant.name?.trim(),
      email: participant.email?.trim().toLowerCase(),
      whatsapp: normalizeWhatsApp(participant.whatsapp),
      shareCents: participant.shareCents,
    }));
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_rateio_subscription", {
      p_name: body.name?.trim() ?? "",
      p_total_cents: Number(body.totalCents),
      p_due_day: Number(body.dueDay),
      p_split_mode: body.splitMode === "custom" ? "custom" : "equal",
      p_pix_key: body.pixKey?.trim() ?? "",
      p_payment_instructions: body.paymentInstructions?.trim() ?? "",
      p_include_self: body.includeSelf !== false,
      p_participants: participants,
    });
    if (error) throw error;
    return Response.json({ id: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

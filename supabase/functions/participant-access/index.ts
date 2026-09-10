import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MONTH_PATTERN = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_BYTES = 5 * 1024 * 1024;

Deno.serve(async (request) => {
  try {
    const token = request.headers.get("x-rateio-access-token") ?? "";
    if (!TOKEN_PATTERN.test(token)) return json({ error: "Link de acesso inválido." }, 404);
    const url = new URL(request.url);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Configuração interna indisponível.");
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const tokenHash = `\\x${await sha256(token)}`;
    const { data: link, error: linkError } = await supabase.from("participant_access_links")
      .select("id,workspace_id,participant_id")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .maybeSingle();
    if (linkError) throw linkError;
    if (!link) return json({ error: "Este link não existe ou foi revogado." }, 404);
    await supabase.from("participant_access_links").update({ last_used_at: new Date().toISOString() }).eq("id", link.id);

    if (request.method === "GET") return dashboard(supabase, link, url.searchParams.get("month"));
    if (request.method === "POST") return chargeAction(supabase, link, request);
    return json({ error: "Método não permitido." }, 405);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Não foi possível concluir a operação.";
    return json({ error: message }, 500);
  }
});

async function dashboard(supabase: ReturnType<typeof createClient>, link: Link, requestedMonth: string | null) {
  const month = requestedMonth ?? new Date().toISOString().slice(0, 7);
  if (!MONTH_PATTERN.test(month)) return json({ error: "Mês inválido." }, 400);
  const [participantResult, workspaceResult, chargesResult] = await Promise.all([
    supabase.from("participants").select("id,name").eq("workspace_id", link.workspace_id).eq("id", link.participant_id).single(),
    supabase.from("workspaces").select("name").eq("id", link.workspace_id).single(),
    supabase.from("charges").select("*").eq("workspace_id", link.workspace_id).eq("participant_id", link.participant_id).eq("billing_month", month).order("due_date"),
  ]);
  const failure = participantResult.error ?? workspaceResult.error ?? chargesResult.error;
  if (failure) throw failure;
  const chargeRows = chargesResult.data ?? [];
  const subscriptionIds = [...new Set(chargeRows.map((row) => row.subscription_id))];
  const [subscriptionsResult, proofsResult] = await Promise.all([
    subscriptionIds.length
      ? supabase.from("subscriptions").select("id,name,pix_key,payment_instructions").eq("workspace_id", link.workspace_id).in("id", subscriptionIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("payment_proofs").select("charge_id,storage_key").eq("workspace_id", link.workspace_id).eq("participant_id", link.participant_id),
  ]);
  if (subscriptionsResult.error ?? proofsResult.error) throw subscriptionsResult.error ?? proofsResult.error;
  const subscriptions = new Map((subscriptionsResult.data ?? []).map((row) => [row.id, row]));
  const proofs = new Map((proofsResult.data ?? []).map((row) => [row.charge_id, row]));
  const today = new Date().toISOString().slice(0, 10);
  const charges = await Promise.all(chargeRows.map(async (row) => {
    const subscription = subscriptions.get(row.subscription_id);
    const proof = proofs.get(row.id);
    let proofUrl: string | null = null;
    if (proof?.storage_key) {
      const signed = await supabase.storage.from("payment-proofs").createSignedUrl(proof.storage_key, 60);
      proofUrl = signed.data?.signedUrl ?? null;
    }
    return {
      id: row.id,
      subscriptionName: subscription?.name ?? "Assinatura",
      amountCents: row.amount_cents,
      dueDate: row.due_date,
      status: row.status,
      acknowledgedAt: row.acknowledged_at,
      paymentReportedAt: row.payment_reported_at,
      paymentDate: row.payment_date,
      confirmedAt: row.confirmed_at,
      returnReason: row.return_reason,
      pixKey: subscription?.pix_key ?? "",
      paymentInstructions: subscription?.payment_instructions ?? "",
      isLate: row.status !== "confirmed" && row.due_date < today,
      proofUrl,
    };
  }));
  return json({ participant: participantResult.data, workspaceName: workspaceResult.data?.name, month, charges }, 200);
}

async function chargeAction(supabase: ReturnType<typeof createClient>, link: Link, request: Request) {
  const form = await request.formData();
  const chargeId = String(form.get("chargeId") ?? "");
  const action = String(form.get("action") ?? "");
  const { data: charge, error: chargeError } = await supabase.from("charges").select("id,status")
    .eq("workspace_id", link.workspace_id).eq("participant_id", link.participant_id).eq("id", chargeId).maybeSingle();
  if (chargeError) throw chargeError;
  if (!charge) return json({ error: "Cobrança não encontrada para este link." }, 404);

  if (action === "acknowledge") {
    const update = await supabase.from("charges").update({ acknowledged_at: new Date().toISOString() })
      .eq("workspace_id", link.workspace_id).eq("participant_id", link.participant_id).eq("id", chargeId).is("acknowledged_at", null);
    if (update.error) throw update.error;
    await audit(supabase, link, chargeId, "awareness_confirmed");
    return json({ ok: true }, 200);
  }
  if (action !== "report_payment") return json({ error: "Ação inválida." }, 400);
  if (charge.status === "confirmed") return json({ error: "Este pagamento já foi confirmado pelo administrador." }, 409);

  const paymentDate = String(form.get("paymentDate") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) return json({ error: "Informe a data do pagamento." }, 400);
  const file = form.get("proof");
  let uploadedKey: string | null = null;
  let previousKey: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (!ALLOWED_TYPES.has(file.type)) return json({ error: "O comprovante deve ser JPG, PNG, WEBP ou PDF." }, 400);
    if (file.size > MAX_BYTES) return json({ error: "O comprovante deve ter no máximo 5 MB." }, 400);
    const extension = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];
    uploadedKey = `${link.workspace_id}/${link.participant_id}/${chargeId}/${crypto.randomUUID()}.${extension}`;
    const prior = await supabase.from("payment_proofs").select("storage_key").eq("workspace_id", link.workspace_id).eq("charge_id", chargeId).maybeSingle();
    if (prior.error) throw prior.error;
    previousKey = prior.data?.storage_key ?? null;
    const upload = await supabase.storage.from("payment-proofs").upload(uploadedKey, file, { contentType: file.type, upsert: false });
    if (upload.error) throw upload.error;
    const proof = await supabase.from("payment_proofs").upsert({
      workspace_id: link.workspace_id, charge_id: chargeId, participant_id: link.participant_id,
      storage_key: uploadedKey, file_name: file.name.slice(0, 180) || `comprovante.${extension}`,
      mime_type: file.type, size_bytes: file.size,
    }, { onConflict: "charge_id" });
    if (proof.error) {
      await supabase.storage.from("payment-proofs").remove([uploadedKey]);
      throw proof.error;
    }
  }

  const update = await supabase.from("charges").update({
    status: "reported", acknowledged_at: new Date().toISOString(), payment_reported_at: new Date().toISOString(),
    payment_date: paymentDate, confirmed_at: null, reviewed_by: null, return_reason: null,
  }).eq("workspace_id", link.workspace_id).eq("participant_id", link.participant_id).eq("id", chargeId);
  if (update.error) {
    if (uploadedKey) await supabase.storage.from("payment-proofs").remove([uploadedKey]);
    throw update.error;
  }
  if (previousKey && uploadedKey && previousKey !== uploadedKey) await supabase.storage.from("payment-proofs").remove([previousKey]);
  await audit(supabase, link, chargeId, "payment_reported", { paymentDate, proofAttached: Boolean(uploadedKey) });
  return json({ ok: true }, 200);
}

async function audit(supabase: ReturnType<typeof createClient>, link: Link, entityId: string, action: string, details: Record<string, unknown> = {}) {
  const participant = await supabase.from("participants").select("name").eq("workspace_id", link.workspace_id).eq("id", link.participant_id).single();
  if (participant.error) throw participant.error;
  const result = await supabase.from("audit_events").insert({
    workspace_id: link.workspace_id, actor_participant_id: link.participant_id, actor_label: participant.data.name,
    entity_type: "charge", entity_id: entityId, action, details,
  });
  if (result.error) throw result.error;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}

type Link = { id: string; workspace_id: string; participant_id: string };

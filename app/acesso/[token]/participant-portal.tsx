"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, CheckCircle2, Clipboard, CreditCard, FileCheck2, Loader2, ReceiptText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast, Toaster } from "sonner";

type Charge = {
  id: string; subscriptionName: string; amountCents: number; dueDate: string;
  status: "pending" | "reported" | "confirmed"; acknowledgedAt: string | null;
  paymentReportedAt: string | null; paymentDate: string | null; confirmedAt: string | null;
  returnReason: string | null; pixKey: string; paymentInstructions: string; isLate: boolean; proofUrl: string | null;
};
type PortalData = { participant: { id: string; name: string }; workspaceName: string; month: string; charges: Charge[] };

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const dateLabel = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
function localDate(value: string) { return new Date(`${value}T12:00:00`); }

export function ParticipantPortal({ token }: { token: string }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/public/access/${encodeURIComponent(token)}?month=${month}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Não foi possível abrir este Rateio.");
      setData(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível abrir este Rateio.");
    } finally {
      setLoading(false);
    }
  }, [month, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const pendingTotal = useMemo(() => data?.charges.filter((charge) => charge.status !== "confirmed").reduce((sum, charge) => sum + charge.amountCents, 0) ?? 0, [data]);

  async function acknowledge(chargeId: string) {
    const form = new FormData(); form.set("action", "acknowledge");
    try {
      const response = await fetch(`/api/public/access/${encodeURIComponent(token)}/charges/${chargeId}`, { method: "POST", body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Não foi possível registrar sua ciência.");
      toast.success("Ciência registrada.");
      await load();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Falha na operação."); }
  }

  if (loading && !data) return <main className="public-state"><Loader2 className="spinner" /><h1>Abrindo seu Rateio</h1><p>Carregando somente as informações vinculadas ao seu link.</p></main>;
  if (error && !data) return <main className="public-state"><span className="public-lock"><ShieldCheck /></span><h1>Este link não está disponível</h1><p>{error}</p><Button onClick={() => void load()}>Tentar novamente</Button></main>;
  if (!data) return null;

  return (
    <main className="public-portal">
      <header className="public-header">
        <div className="brand"><span className="brand-mark" aria-hidden="true" /><span>Rateio</span></div>
        <label className="month-control"><span>Mês</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
      </header>
      <section className="public-content">
        <p className="eyebrow">{data.workspaceName}</p>
        <h1>Olá, {data.participant.name.split(" ")[0]}</h1>
        <p className="public-intro">Este é o seu espaço privado. Você não precisa criar conta nem senha; guarde o link enviado pelo administrador.</p>
        <div className="public-summary">
          <span><ReceiptText /></span>
          <div><small>Pendente em {monthLabel.format(localDate(`${month}-01`))}</small><strong>{money.format(pendingTotal / 100)}</strong></div>
        </div>
        <section className="public-charge-list" aria-label="Suas cobranças">
          {data.charges.length ? data.charges.map((charge) => (
            <article className="public-charge" key={charge.id}>
              <div className="public-charge-title"><span><CreditCard /></span><div><h2>{charge.subscriptionName}</h2><p>Vence em {dateLabel.format(localDate(charge.dueDate))}</p></div><strong>{money.format(charge.amountCents / 100)}</strong></div>
              <div className={`public-status ${charge.status === "confirmed" ? "paid" : charge.status === "reported" ? "review" : charge.isLate ? "late" : "pending"}`}>
                {charge.status === "confirmed" ? <><CheckCircle2 /> Pagamento confirmado</> : charge.status === "reported" ? <><FileCheck2 /> Pagamento aguardando conferência</> : charge.isLate ? <><CalendarClock /> Cobrança vencida</> : <><CalendarClock /> Aguardando pagamento</>}
              </div>
              {charge.returnReason && <p className="return-reason"><strong>Pagamento devolvido:</strong> {charge.returnReason}</p>}
              <div className="public-payment-box"><small>Chave Pix</small><strong>{charge.pixKey || "Consulte o administrador"}</strong>{charge.pixKey && <button type="button" onClick={() => { void navigator.clipboard.writeText(charge.pixKey); toast.success("Chave Pix copiada."); }}><Clipboard /> Copiar</button>}<p>{charge.paymentInstructions || "Faça o pagamento e informe abaixo."}</p></div>
              <div className="public-actions">
                {!charge.acknowledgedAt && <Button variant="outline" onClick={() => void acknowledge(charge.id)}><Check /> Estou ciente</Button>}
                {charge.status !== "confirmed" && <PaymentDialog charge={charge} token={token} reload={load} />}
                {charge.proofUrl && <Button variant="outline" asChild><a href={charge.proofUrl} target="_blank" rel="noreferrer"><FileCheck2 /> Ver comprovante</a></Button>}
              </div>
            </article>
          )) : <div className="public-empty"><CheckCircle2 /><h2>Nada pendente neste mês</h2><p>Não há cobranças vinculadas a você no período escolhido.</p></div>}
        </section>
      </section>
      <footer className="public-footer"><ShieldCheck /> Este link mostra somente os seus dados dentro deste Rateio.</footer>
      <Toaster richColors position="top-center" />
    </main>
  );
}

function PaymentDialog({ charge, token, reload }: { charge: Charge; token: string; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    const form = new FormData(event.currentTarget); form.set("action", "report_payment");
    try {
      const response = await fetch(`/api/public/access/${encodeURIComponent(token)}/charges/${charge.id}`, { method: "POST", body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Não foi possível informar o pagamento.");
      toast.success("Pagamento informado. Aguarde a conferência do administrador.");
      setOpen(false); await reload();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Falha na operação."); }
    finally { setSaving(false); }
  }
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button>Já paguei</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Informar pagamento</DialogTitle><DialogDescription>Isso avisa o administrador; o recebimento só ficará confirmado após a conferência dele.</DialogDescription></DialogHeader><form className="form-stack" onSubmit={submit}><label>Data do pagamento<input name="paymentDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label><label>Comprovante opcional<input name="proof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" /></label><small>JPG, PNG, WEBP ou PDF de até 5 MB.</small><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving && <Loader2 className="spinner-inline" />} Informar pagamento</Button></DialogFooter></form></DialogContent></Dialog>;
}

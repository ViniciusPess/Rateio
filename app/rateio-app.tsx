"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, BellRing, CalendarClock, Check, CheckCircle2, ChevronRight,
  CircleDollarSign, Clipboard, CreditCard, FileCheck2, History, LayoutDashboard,
  Link2, Loader2, LogOut, Menu, MessageCircle, Phone, Plus, ReceiptText, Send, Settings, ShieldCheck, Users, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

type Actor = { id: string; email: string; name: string; role: "admin" | "participant"; isDemo: boolean };
type Charge = {
  id: string; subscriptionId: string; subscriptionName: string; userId: string; participantName: string;
  billingMonth: string; amountCents: number; dueDate: string; status: "pending" | "reported" | "confirmed";
  acknowledgedAt: string | null; paymentReportedAt: string | null; paymentDate: string | null;
  confirmedAt: string | null; returnReason: string | null; pixKey: string; paymentInstructions: string; participantWhatsApp: string | null;
  isLate: boolean; hasProof: boolean; proofUrl: string | null; noticeSentAt: string | null; noticeChannel: string | null;
};
type Member = { id: string; name: string; email: string | null; whatsapp: string | null; shareCents: number | null; startMonth: string; endMonth: string | null };
type Subscription = { id: string; name: string; totalCents: number; dueDay: number; splitMode: string; paymentInstructions: string; pixKey: string; archivedAt: string | null; isDemo: boolean; members: Member[] };
type Dashboard = {
  actor: Actor; month: string; summary: { totalCents: number; receivedCents: number; pendingCents: number; lateCount: number; reviewCount: number; unacknowledgedCount: number };
  charges: Charge[]; subscriptions: Subscription[]; audit: Array<{ id: string; action: string; actorName: string; createdAt: string; detailsJson: string }>;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fullDate = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

function parseLocalDate(value: string) { return new Date(`${value}T12:00:00`); }
function initials(name: string) { return name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function formatWhatsApp(value: string | null) {
  if (!value) return null;
  const national = value.startsWith("55") ? value.slice(2) : value;
  return national.length === 11 ? `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}` : `(${national.slice(0, 2)}) ${national.slice(2, 6)}-${national.slice(6)}`;
}
function statusText(charge: Charge) {
  if (charge.status === "confirmed") return "Pagamento confirmado";
  if (charge.status === "reported") return "Pagamento informado";
  if (charge.isLate) return "Vencida — aguardando pagamento";
  return "Aguardando pagamento";
}
function statusTone(charge: Charge) { return charge.status === "confirmed" ? "paid" : charge.status === "reported" ? "review" : charge.isLate ? "late" : "pending"; }

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Não foi possível concluir a operação.");
  return payload;
}

export function RateioApp() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [tab, setTab] = useState("overview");
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await requestJson(`/api/dashboard?month=${month}`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar seus dados."); }
    finally { setLoading(false); }
  }, [month]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!data) return;
    type ToolSpec = { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute: (input: unknown) => unknown | Promise<unknown> };
    type ModelContext = { registerTool: (tool: ToolSpec, options?: { signal?: AbortSignal }) => void | Promise<void> };
    const context = (document as unknown as { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "consultar_resumo_rateio",
      title: "Consultar resumo do Rateio",
      description: "Consulta os totais e pendências exibidos para o usuário no mês selecionado.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: (input) => {
        if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input as Record<string, unknown>).length) throw new Error("Esta consulta não aceita parâmetros.");
        return { month: data.month, role: data.actor.role, summary: data.summary };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    if (data.actor.role === "participant") {
      void Promise.resolve(context.registerTool({
        name: "confirmar_ciencia_cobranca",
        title: "Confirmar ciência de cobrança",
        description: "Registra a ciência do participante na própria cobrança informada. Não informa nem confirma pagamento.",
        inputSchema: { type: "object", properties: { chargeId: { type: "string" } }, required: ["chargeId"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async (input) => {
          if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input as Record<string, unknown>).some((key) => key !== "chargeId")) throw new Error("Parâmetros inválidos.");
          const chargeId = (input as { chargeId?: unknown })?.chargeId;
          if (typeof chargeId !== "string" || !data.charges.some((charge) => charge.id === chargeId && charge.userId === data.actor.id)) throw new Error("Cobrança inválida ou sem acesso.");
          await requestJson(`/api/charges/${chargeId}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "acknowledge" }) });
          await load();
          return { chargeId, awarenessConfirmed: true, paymentStatusChanged: false };
        },
      }, { signal: lifecycle.signal })).catch(() => undefined);
    }
    return () => lifecycle.abort();
  }, [data, load]);

  async function action(chargeId: string, name: string, extras: Record<string, unknown> = {}) {
    try {
      await requestJson(`/api/charges/${chargeId}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: name, ...extras }) });
      toast.success(name === "acknowledge" ? "Ciência registrada." : name === "confirm" ? "Recebimento confirmado." : name === "record_notice" ? "Envio registrado manualmente." : "Pagamento devolvido para pendente.");
      await load();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Falha na operação."); }
  }

  async function switchDemo(userId: string) {
    try { await requestJson("/api/dev/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) }); await load(); setTab("overview"); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Não foi possível trocar de perfil."); }
  }

  if (loading && !data) return <LoadingScreen />;
  if (error && !data) return <ErrorScreen message={error} retry={load} />;
  if (!data) return null;

  const actor = data.actor;
  const admin = actor.role === "admin";
  const nav = admin ? [
    ["overview", "Visão geral", LayoutDashboard], ["subscriptions", "Assinaturas", CreditCard], ["review", "Conferir pagamentos", ReceiptText], ["people", "Participantes", Users], ["history", "Atividades", History], ["profile", "Meu perfil", Settings],
  ] as const : [
    ["overview", "Minha situação", LayoutDashboard], ["subscriptions", "Assinaturas", CreditCard], ["people", "Integrantes", Users], ["history", "Histórico", History], ["profile", "Meu perfil", Settings],
  ] as const;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark" aria-hidden="true" /><span>Rateio</span></div>
        <nav aria-label="Navegação principal">
          {nav.map(([value, label, Icon]) => <button key={value} className={`nav-item ${tab === value ? "active" : ""}`} onClick={() => setTab(value)}><Icon />{label}</button>)}
        </nav>
        <div className="sidebar-account"><span className="person-avatar dark-avatar">{initials(actor.name)}</span><span><strong>{actor.name}</strong><small>{admin ? "Administrador" : "Participante"}</small></span></div>
      </aside>

      <section className="workspace">
        {actor.isDemo && <DemoBar actor={actor} onSwitch={switchDemo} />}
        <header className="topbar">
          <div className="topbar-title">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild><Button className="menu-button" size="icon" variant="outline" aria-label="Abrir menu"><Menu /></Button></SheetTrigger>
              <SheetContent side="left" className="nav-sheet" showCloseButton={false}>
                <SheetHeader className="nav-sheet-header"><SheetTitle><span className="brand-mark" aria-hidden="true" /> Rateio</SheetTitle><SheetDescription>Menu principal</SheetDescription><SheetClose asChild><Button className="nav-close" size="icon" variant="ghost" aria-label="Fechar menu"><X /></Button></SheetClose></SheetHeader>
                <nav aria-label="Navegação completa">
                  {nav.map(([value, label, Icon]) => <button key={value} className={`nav-item ${tab === value ? "active" : ""}`} onClick={() => { setTab(value); setMenuOpen(false); }}><Icon />{label}</button>)}
                </nav>
                <div className="sidebar-account"><span className="person-avatar dark-avatar">{initials(actor.name)}</span><span><strong>{actor.name}</strong><small>{admin ? "Administrador" : "Participante"}</small></span></div>
              </SheetContent>
            </Sheet>
            <div><p className="eyebrow">{admin ? "Painel do administrador" : "Painel do participante"}</p><h1>{tab === "overview" ? `Olá, ${actor.name.split(" ")[0]}` : nav.find(([value]) => value === tab)?.[1]}</h1></div>
          </div>
          <div className="header-actions"><label className="month-control"><span>Mês</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label><button className="avatar" aria-label="Editar meu perfil" title="Meu perfil" onClick={() => setTab("profile")}>{initials(actor.name)}</button></div>
        </header>

        <Tabs value={tab} onValueChange={setTab} className="content">
          <TabsList className="sr-only">{nav.map(([value, label]) => <TabsTrigger key={value} value={value}>{label}</TabsTrigger>)}</TabsList>
          <TabsContent value="overview"><Overview data={data} admin={admin} onAction={action} reload={load} /></TabsContent>
          <TabsContent value="subscriptions"><Subscriptions data={data} admin={admin} reload={load} /></TabsContent>
          {admin && <TabsContent value="review"><PaymentReview data={data} onAction={action} /></TabsContent>}
          <TabsContent value="people"><People data={data} reload={load} /></TabsContent>
          <TabsContent value="history"><Activity data={data} admin={admin} /></TabsContent>
          <TabsContent value="profile"><Profile key={actor.name} actor={actor} reload={load} /></TabsContent>
        </Tabs>
      </section>

      <nav className="mobile-nav" aria-label="Navegação móvel">
        {nav.slice(0, 4).map(([value, label, Icon]) => <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}><Icon /><span>{label.replace("Conferir pagamentos", "Conferir")}</span></button>)}
      </nav>
      <Toaster richColors position="top-center" />
    </main>
  );
}

function LoadingScreen() { return <main className="state-screen"><div className="brand"><span className="brand-mark" aria-hidden="true" /><span>Rateio</span></div><Loader2 className="spinner" /><h1>Carregando seus rateios</h1><p>Estamos buscando cobranças e pagamentos.</p></main>; }
function ErrorScreen({ message, retry }: { message: string; retry: () => void }) { return <main className="state-screen"><span className="state-icon error"><AlertTriangle /></span><h1>Não foi possível abrir o Rateio</h1><p>{message}</p><Button onClick={retry}>Tentar novamente</Button></main>; }

function DemoBar({ actor, onSwitch }: { actor: Actor; onSwitch: (id: string) => void }) {
  return <div className="demo-bar"><span><ShieldCheck /> Ambiente de demonstração — nenhuma mensagem real será enviada.</span><label>Ver como <select value={actor.id} onChange={(event) => onSwitch(event.target.value)}><option value="demo-admin">Vinicius (administrador)</option><option value="demo-marina">Marina (participante)</option><option value="demo-rafael">Rafael (participante)</option></select></label></div>;
}

function PageHeading({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return <div className="section-heading"><div><h2>{title}</h2><p>{subtitle}</p></div>{action}</div>;
}

function Overview({ data, admin, onAction, reload }: { data: Dashboard; admin: boolean; onAction: (id: string, action: string, extras?: Record<string, unknown>) => void; reload: () => Promise<void> }) {
  const ownCharges = admin ? data.charges : data.charges.filter((charge) => charge.userId === data.actor.id);
  const financialCharges = admin ? data.charges.filter((charge) => charge.userId !== data.actor.id) : ownCharges;
  const metrics = admin ? [
    { label: "A receber no mês", value: money.format(data.summary.totalCents / 100), detail: `${financialCharges.length} cobranças de participantes`, icon: CircleDollarSign },
    { label: "Recebido", value: money.format(data.summary.receivedCents / 100), detail: `${financialCharges.filter((c) => c.status === "confirmed").length} confirmados`, icon: CheckCircle2 },
    { label: "Pendente", value: money.format(data.summary.pendingCents / 100), detail: `${data.summary.lateCount} vencida(s)`, icon: CalendarClock },
  ] : [
    { label: "Minha parte no mês", value: money.format(data.summary.totalCents / 100), detail: `${ownCharges.length} assinaturas`, icon: CircleDollarSign },
    { label: "Confirmado", value: money.format(data.summary.receivedCents / 100), detail: "recebimento conferido", icon: CheckCircle2 },
    { label: "Ainda pendente", value: money.format(data.summary.pendingCents / 100), detail: `${data.summary.lateCount} vencida(s)`, icon: CalendarClock },
  ];
  return <>
    <PageHeading title={admin ? "Resumo do mês" : "Minha situação"} subtitle={`${monthLabel.format(parseLocalDate(`${data.month}-01`))}. Valores e confirmações atualizados no portal.`} action={admin ? <CreateSubscription reload={reload} actor={data.actor} /> : undefined} />
    <div className="metrics-grid">{metrics.map(({ label, value, detail, icon: Icon }) => <article className="metric-card" key={label}><div className="metric-icon"><Icon /></div><p>{label}</p><strong>{value}</strong><span>{detail}</span></article>)}</div>
    <div className="dashboard-grid">
      <section className="panel charge-panel"><div className="panel-heading"><div><h3>{admin ? "Cobranças do mês" : "Meus vencimentos"}</h3><p>{ownCharges.length ? `${ownCharges.length} registro(s)` : "Nenhuma cobrança"}</p></div></div>
        {ownCharges.length ? <div className="charge-list">{ownCharges.map((charge) => <ChargeRow key={charge.id} charge={charge} actor={data.actor} admin={admin} onAction={onAction} reload={reload} />)}</div> : <EmptyState icon={CheckCircle2} title="Tudo em dia por aqui" text="Não há cobranças para este mês." />}
      </section>
      <aside className="panel attention-panel"><div className="panel-heading"><div><h3>Precisa de atenção</h3><p>{admin ? "Pendências do grupo" : "Próximos passos"}</p></div></div>
        {admin && data.summary.reviewCount > 0 && <button className="attention-item"><span className="attention-icon info"><ReceiptText /></span><span><strong>{data.summary.reviewCount} pagamento(s) para conferir</strong><small>Informados pelos participantes</small></span><ChevronRight /></button>}
        {data.summary.lateCount > 0 && <div className="attention-item"><span className="attention-icon warning"><CalendarClock /></span><span><strong>{data.summary.lateCount} cobrança(s) vencida(s)</strong><small>Ainda sem recebimento confirmado</small></span><ChevronRight /></div>}
        {data.summary.unacknowledgedCount > 0 && <div className="attention-item"><span className="attention-icon neutral"><BellRing /></span><span><strong>{data.summary.unacknowledgedCount} sem ciência</strong><small>Ciência depende do clique da pessoa</small></span><ChevronRight /></div>}
        {!data.summary.reviewCount && !data.summary.lateCount && !data.summary.unacknowledgedCount && <EmptyState icon={CheckCircle2} title="Nenhuma pendência" text="Tudo conferido neste mês." />}
      </aside>
    </div>
  </>;
}

function ChargeRow({ charge, actor, admin, onAction, reload }: { charge: Charge; actor: Actor; admin: boolean; onAction: (id: string, action: string, extras?: Record<string, unknown>) => void; reload: () => Promise<void> }) {
  return <article className="charge-row detailed">
    <div className="person-avatar">{initials(charge.participantName)}</div>
    <div className="charge-person"><strong>{admin ? charge.participantName : charge.subscriptionName}</strong><span>{admin ? charge.subscriptionName : fullDate.format(parseLocalDate(charge.dueDate))}</span></div>
    <div className="charge-value"><strong>{money.format(charge.amountCents / 100)}</strong><span>{charge.isLate ? `Venceu em ${fullDate.format(parseLocalDate(charge.dueDate))}` : `Vence em ${fullDate.format(parseLocalDate(charge.dueDate))}`}</span></div>
    <span className={`status status-${statusTone(charge)}`}>{statusText(charge)}</span>
    <div className="charge-actions">
      {!admin && charge.userId === actor.id && !charge.acknowledgedAt && <Button size="sm" variant="outline" onClick={() => onAction(charge.id, "acknowledge")}><Check /> Estou ciente</Button>}
      {!admin && charge.userId === actor.id && charge.status !== "confirmed" && <PaymentDialog charge={charge} reload={reload} />}
      {admin && charge.status !== "confirmed" && <NoticeMenu charge={charge} onAction={onAction} />}
      {charge.proofUrl && <Button size="sm" variant="ghost" asChild><a href={charge.proofUrl} target="_blank" rel="noreferrer"><FileCheck2 /> Comprovante</a></Button>}
    </div>
  </article>;
}

function NoticeMenu({ charge, onAction }: { charge: Charge; onAction: (id: string, action: string, extras?: Record<string, unknown>) => void }) {
  const message = `Olá, ${charge.participantName}! A cobrança de ${charge.subscriptionName} referente a ${charge.billingMonth} é de ${money.format(charge.amountCents / 100)}, com vencimento em ${fullDate.format(parseLocalDate(charge.dueDate))}. Consulte: ${typeof window === "undefined" ? "" : window.location.origin}`;
  return <div className="notice-actions">{charge.participantWhatsApp ? <Button size="sm" variant="outline" asChild><a aria-label={`Abrir conversa de ${charge.participantName} no WhatsApp`} href={`https://wa.me/${charge.participantWhatsApp}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer"><MessageCircle /> Abrir WhatsApp</a></Button> : <Button size="sm" variant="outline" disabled title="Cadastre o WhatsApp na tela de participantes"><Phone /> Cadastre o WhatsApp</Button>}<Button size="sm" variant="ghost" onClick={() => onAction(charge.id, "record_notice", { channel: "WhatsApp" })}><Check /> Registrar envio</Button>{charge.noticeSentAt && <small>Registrado em {fullDate.format(new Date(charge.noticeSentAt))}. Não comprova entrega.</small>}</div>;
}

function PaymentDialog({ charge, reload }: { charge: Charge; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false); const [saving, setSaving] = useState(false);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10)); const [file, setFile] = useState<File | null>(null);
  async function submit(event: React.FormEvent) { event.preventDefault(); setSaving(true); try { const form = new FormData(); form.set("paymentDate", paymentDate); if (file) form.set("proof", file); await requestJson(`/api/charges/${charge.id}/payment`, { method: "POST", body: form }); toast.success("Pagamento informado. Agora aguarde a conferência."); setOpen(false); await reload(); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Não foi possível informar o pagamento."); } finally { setSaving(false); } }
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button size="sm"><ReceiptText /> Já paguei</Button></DialogTrigger><DialogContent className="payment-dialog"><DialogHeader><DialogTitle>Informar pagamento</DialogTitle><DialogDescription>Isso não confirma o recebimento. O administrador ainda precisará conferir.</DialogDescription></DialogHeader><form onSubmit={submit} className="form-stack"><label>Data do pagamento<input required type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></label><label>Comprovante (opcional)<input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><small>JPG, PNG ou PDF, até 3 MB. Visível apenas para você e o administrador.</small></label><DialogFooter><Button type="submit" disabled={saving}>{saving && <Loader2 className="spinner-inline" />} Informar pagamento</Button></DialogFooter></form></DialogContent></Dialog>;
}

function CreateSubscription({ reload, actor }: { reload: () => Promise<void>; actor: Actor }) {
  const [open, setOpen] = useState(false); const [saving, setSaving] = useState(false); const [mode, setMode] = useState<"equal" | "custom">("equal");
  const [participants, setParticipants] = useState([{ name: "", email: "", whatsapp: "", value: "" }]);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); setSaving(true); try { const totalCents = Math.round(Number(String(form.get("total")).replace(",", ".")) * 100); const includeSelf = form.get("includeSelf") === "on"; const payloadParticipants = participants.filter((p) => p.email.trim()).map((p) => ({ name: p.name, email: p.email, whatsapp: p.whatsapp, shareCents: mode === "custom" ? Math.round(Number(p.value.replace(",", ".")) * 100) : undefined })); if (includeSelf && mode === "custom") payloadParticipants.push({ name: actor.name, email: actor.email, whatsapp: "", shareCents: Math.round(Number(String(form.get("selfValue")).replace(",", ".")) * 100) }); await requestJson("/api/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.get("name"), totalCents, dueDay: Number(form.get("dueDay")), splitMode: mode, pixKey: form.get("pixKey"), paymentInstructions: form.get("instructions"), includeSelf, participants: payloadParticipants }) }); toast.success("Assinatura criada e cobranças do mês geradas."); setOpen(false); await reload(); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Não foi possível criar a assinatura."); } finally { setSaving(false); } }
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus /> Nova assinatura</Button></DialogTrigger><DialogContent className="wide-dialog"><DialogHeader><DialogTitle>Nova assinatura</DialogTitle><DialogDescription>Defina o rateio. As cobranças geradas guardarão estes valores como histórico.</DialogDescription></DialogHeader><form onSubmit={submit} className="form-grid"><label>Nome<input name="name" required maxLength={80} placeholder="Ex.: Netflix Família" /></label><label>Valor total (R$)<input name="total" required inputMode="decimal" placeholder="54,90" /></label><label>Dia do vencimento<input name="dueDay" required type="number" min="1" max="31" /></label><label>Chave Pix<input name="pixKey" placeholder="E-mail, telefone ou chave aleatória" /></label><label className="full-field">Instruções de pagamento<textarea name="instructions" rows={2} placeholder="Orientações que todos os integrantes podem ver" /></label><fieldset className="full-field split-field"><legend>Forma de divisão</legend><label><input type="radio" checked={mode === "equal"} onChange={() => setMode("equal")} /> Igual</label><label><input type="radio" checked={mode === "custom"} onChange={() => setMode("custom")} /> Valores personalizados</label></fieldset><label className="checkbox-field full-field"><input name="includeSelf" type="checkbox" defaultChecked /> Incluir minha parte {mode === "custom" && <input className="inline-value" name="selfValue" required placeholder="R$" />}</label><div className="full-field participants-editor"><div className="participants-title"><strong>Participantes</strong><Button type="button" size="sm" variant="outline" onClick={() => setParticipants([...participants, { name: "", email: "", whatsapp: "", value: "" }])}><Plus /> Adicionar</Button></div>{participants.map((participant, index) => <div className="participant-fields" key={index}><input aria-label={`Nome do participante ${index + 1}`} placeholder="Nome" value={participant.name} onChange={(event) => setParticipants(participants.map((p, i) => i === index ? { ...p, name: event.target.value } : p))} /><input aria-label={`E-mail do participante ${index + 1}`} placeholder="E-mail" type="email" value={participant.email} onChange={(event) => setParticipants(participants.map((p, i) => i === index ? { ...p, email: event.target.value } : p))} /><input aria-label={`WhatsApp do participante ${index + 1}`} placeholder="WhatsApp com DDD" inputMode="tel" value={participant.whatsapp} onChange={(event) => setParticipants(participants.map((p, i) => i === index ? { ...p, whatsapp: event.target.value } : p))} />{mode === "custom" && <input aria-label={`Parte do participante ${index + 1}`} placeholder="R$" value={participant.value} onChange={(event) => setParticipants(participants.map((p, i) => i === index ? { ...p, value: event.target.value } : p))} />}<Button type="button" size="icon-sm" variant="ghost" aria-label="Remover participante" onClick={() => setParticipants(participants.filter((_, i) => i !== index))}><X /></Button></div>)}</div><DialogFooter className="full-field"><Button type="submit" disabled={saving}>{saving && <Loader2 className="spinner-inline" />} Criar assinatura</Button></DialogFooter></form></DialogContent></Dialog>;
}

function Subscriptions({ data, admin, reload }: { data: Dashboard; admin: boolean; reload: () => Promise<void> }) {
  const active = data.subscriptions.filter((sub) => !sub.archivedAt); const archived = data.subscriptions.filter((sub) => sub.archivedAt);
  async function archive(id: string) { if (!confirm("Arquivar esta assinatura? O histórico será preservado e novas cobranças serão interrompidas.")) return; try { await requestJson(`/api/subscriptions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "archive" }) }); toast.success("Assinatura arquivada; o histórico foi preservado."); await reload(); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Falha ao arquivar."); } }
  return <><PageHeading title="Assinaturas" subtitle={admin ? "Gerencie valores e integrantes. Reajustes não alteram cobranças anteriores." : "Você vê somente as assinaturas das quais participa."} action={admin ? <CreateSubscription reload={reload} actor={data.actor} /> : undefined} /><div className="subscription-grid">{active.map((sub) => <article className="subscription-card panel" key={sub.id}><div className="subscription-title"><span className="subscription-icon"><CreditCard /></span><div><h3>{sub.name}</h3><p>{money.format(sub.totalCents / 100)} · vence todo dia {sub.dueDay}</p></div></div><div className="pix-box"><span>Chave Pix</span><strong>{sub.pixKey || "Não informada"}</strong>{sub.pixKey && <button onClick={() => { navigator.clipboard.writeText(sub.pixKey); toast.success("Chave Pix copiada."); }}><Clipboard /> Copiar</button>}</div><p className="instructions">{sub.paymentInstructions || "Sem instruções adicionais."}</p><div className="member-stack"><span>Integrantes</span>{sub.members.filter((member, index, all) => all.findIndex((m) => m.id === member.id) === index).map((member) => <div key={member.id}><span className="person-avatar mini">{initials(member.name)}</span><strong>{member.name}</strong>{member.shareCents != null && <small>{money.format(member.shareCents / 100)}</small>}</div>)}</div>{admin && <div className="card-footer"><FutureUpdate subscription={sub} reload={reload} /><Button variant="ghost" size="sm" onClick={() => archive(sub.id)}>Arquivar</Button></div>}</article>)}</div>{!active.length && <EmptyState icon={CreditCard} title="Nenhuma assinatura ativa" text={admin ? "Crie sua primeira assinatura compartilhada." : "Você ainda não participa de nenhuma assinatura."} />}{archived.length > 0 && <details className="archived-section"><summary>Arquivadas ({archived.length})</summary>{archived.map((sub) => <p key={sub.id}>{sub.name} — histórico preservado</p>)}</details>}</>;
}

function FutureUpdate({ subscription, reload }: { subscription: Subscription; reload: () => Promise<void> }) {
  const currentMembers = useMemo(() => subscription.members.filter((member, index, all) => !member.endMonth && all.findIndex((m) => m.id === member.id && !m.endMonth) === index), [subscription.members]);
  const [open, setOpen] = useState(false); const [total, setTotal] = useState(String(subscription.totalCents / 100).replace(".", ",")); const [dueDay, setDueDay] = useState(String(subscription.dueDay)); const [selected, setSelected] = useState(() => new Set(currentMembers.map((m) => m.id)));
  const [newMembers, setNewMembers] = useState<Array<{ name: string; email: string; whatsapp: string }>>([]);
  const next = (() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 7); })();
  async function submit(event: React.FormEvent) { event.preventDefault(); try { const totalCents = Math.round(Number(total.replace(",", ".")) * 100); const members = [...currentMembers.filter((m) => selected.has(m.id)).map((m) => ({ userId: m.id })), ...newMembers.filter((m) => m.email.trim()).map((m) => ({ name: m.name, email: m.email, whatsapp: m.whatsapp }))]; await requestJson(`/api/subscriptions/${subscription.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_future", effectiveMonth: next, totalCents, dueDay: Number(dueDay), splitMode: "equal", members }) }); toast.success("Valor e vencimento programados para o próximo mês."); setOpen(false); await reload(); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Não foi possível programar o rateio."); } }
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="outline" size="sm"><Settings /> Próximo mês</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Rateio a partir de {monthLabel.format(parseLocalDate(`${next}-01`))}</DialogTitle><DialogDescription>Valor, vencimento e integrantes anteriores não serão alterados. Desmarque alguém para encerrar sua participação a partir deste mês.</DialogDescription></DialogHeader><form className="form-stack" onSubmit={submit}><label>Novo valor total (R$)<input required value={total} onChange={(e) => setTotal(e.target.value)} /></label><label>Novo dia do vencimento<input required type="number" min="1" max="31" value={dueDay} onChange={(event) => setDueDay(event.target.value)} /></label><fieldset><legend>Integrantes do próximo rateio</legend>{currentMembers.map((member) => <label className="checkbox-field" key={member.id}><input type="checkbox" checked={selected.has(member.id)} onChange={() => { const copy = new Set(selected); if (copy.has(member.id)) copy.delete(member.id); else copy.add(member.id); setSelected(copy); }} /> {member.name}</label>)}</fieldset><div className="future-members"><div className="participants-title"><strong>Adicionar participante</strong><Button type="button" size="sm" variant="outline" onClick={() => setNewMembers([...newMembers, { name: "", email: "", whatsapp: "" }])}><Plus /> Adicionar</Button></div>{newMembers.map((member, index) => <div className="participant-fields" key={index}><input required aria-label={`Nome do novo participante ${index + 1}`} placeholder="Nome" value={member.name} onChange={(event) => setNewMembers(newMembers.map((m, i) => i === index ? { ...m, name: event.target.value } : m))} /><input required aria-label={`E-mail do novo participante ${index + 1}`} type="email" placeholder="E-mail" value={member.email} onChange={(event) => setNewMembers(newMembers.map((m, i) => i === index ? { ...m, email: event.target.value } : m))} /><input aria-label={`WhatsApp do novo participante ${index + 1}`} inputMode="tel" placeholder="WhatsApp com DDD" value={member.whatsapp} onChange={(event) => setNewMembers(newMembers.map((m, i) => i === index ? { ...m, whatsapp: event.target.value } : m))} /><Button type="button" size="icon-sm" variant="ghost" aria-label="Remover novo participante" onClick={() => setNewMembers(newMembers.filter((_, i) => i !== index))}><X /></Button></div>)}</div><DialogFooter><Button type="submit">Salvar para o próximo mês</Button></DialogFooter></form></DialogContent></Dialog>;
}

function Profile({ actor, reload }: { actor: Actor; reload: () => Promise<void> }) {
  const [name, setName] = useState(actor.name);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true);
    try {
      await requestJson("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      toast.success("Nome do perfil atualizado.");
      await reload();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Não foi possível atualizar o perfil."); }
    finally { setSaving(false); }
  }

  return <><PageHeading title="Meu perfil" subtitle="Escolha como seu nome aparece no Rateio." /><section className="panel profile-panel"><div><div className="profile-summary"><span className="person-avatar">{initials(actor.name)}</span><div><strong>{actor.name}</strong><small>{actor.role === "admin" ? "Administrador" : "Participante"}</small></div></div><form method="post" action="/auth/logout" className="logout-form"><Button type="submit" variant="outline"><LogOut /> Sair da conta</Button></form></div><form className="form-stack" onSubmit={submit}><label>Nome exibido<input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Como você quer ser chamado" /></label><label>E-mail da conta<input value={actor.email} readOnly aria-readonly="true" /></label><small>O e-mail identifica sua conta e não pode ser alterado por aqui.</small><DialogFooter><Button type="submit" disabled={saving || name.trim() === actor.name}>{saving && <Loader2 className="spinner-inline" />} Salvar nome</Button></DialogFooter></form></section></>;
}

function PaymentReview({ data, onAction }: { data: Dashboard; onAction: (id: string, action: string, extras?: Record<string, unknown>) => void }) {
  const queue = data.charges.filter((charge) => charge.status === "reported");
  return <><PageHeading title="Pagamentos para conferir" subtitle="“Já paguei” e comprovante não equivalem a recebimento confirmado." />{queue.length ? <div className="review-list">{queue.map((charge) => <article className="panel review-card" key={charge.id}><div><span className="status status-review">Pagamento informado</span><h3>{charge.participantName}</h3><p>{charge.subscriptionName} · {money.format(charge.amountCents / 100)}</p><small>Data informada: {charge.paymentDate ? fullDate.format(parseLocalDate(charge.paymentDate)) : "não informada"}</small></div><div className="review-actions">{charge.proofUrl ? <Button variant="outline" asChild><a href={charge.proofUrl} target="_blank" rel="noreferrer"><FileCheck2 /> Ver comprovante</a></Button> : <span className="no-proof">Sem comprovante</span>}<Button onClick={() => onAction(charge.id, "confirm")}><CheckCircle2 /> Confirmar recebimento</Button><Button variant="outline" onClick={() => { const reason = prompt("Por que o pagamento deve voltar para pendente?"); if (reason) onAction(charge.id, "return_pending", { reason }); }}><LogOut /> Devolver para pendente</Button></div></article>)}</div> : <EmptyState icon={CheckCircle2} title="Fila vazia" text="Nenhum pagamento está aguardando conferência." />}</>;
}

function ContactDialog({ member, reload }: { member: Member; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(formatWhatsApp(member.whatsapp) ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await requestJson(`/api/users/${member.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ whatsapp: value }) });
      toast.success("WhatsApp atualizado.");
      setOpen(false);
      await reload();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Não foi possível atualizar o WhatsApp."); }
    finally { setSaving(false); }
  }

  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="outline" size="sm"><Phone /> {member.whatsapp ? "Editar WhatsApp" : "Cadastrar WhatsApp"}</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>WhatsApp de {member.name}</DialogTitle><DialogDescription>Este número será usado para abrir a conversa direta no botão de cobrança.</DialogDescription></DialogHeader><form className="form-stack" onSubmit={submit}><label>WhatsApp com DDD<input autoFocus inputMode="tel" placeholder="(21) 99999-9999" value={value} onChange={(event) => setValue(event.target.value)} /></label><DialogFooter><Button type="submit" disabled={saving}>{saving && <Loader2 className="spinner-inline" />} Salvar WhatsApp</Button></DialogFooter></form></DialogContent></Dialog>;
}

function AccessLinkDialog({ member }: { member: Member }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    if (url && !confirm("Gerar outro link? O link anterior deixará de funcionar.")) return;
    setLoading(true);
    try {
      const payload = await requestJson(`/api/participants/${member.id}/access-link`, { method: "POST" }) as { url: string };
      setUrl(payload.url);
      toast.success("Link pessoal gerado.");
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Não foi possível gerar o link."); }
    finally { setLoading(false); }
  }

  const whatsappText = url ? encodeURIComponent(`Olá, ${member.name.split(" ")[0]}! Este é o seu link pessoal do Rateio: ${url}`) : "";
  return <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setUrl(null); }}><DialogTrigger asChild><Button variant="outline" size="sm"><Link2 /> Link de acesso</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Link pessoal de {member.name}</DialogTitle><DialogDescription>A pessoa abre este link sem conta e vê somente as próprias cobranças. Ao gerar outro, o anterior é revogado.</DialogDescription></DialogHeader>{url ? <div className="access-link-result"><label>Link privado<input value={url} readOnly /></label><div><Button variant="outline" onClick={() => { void navigator.clipboard.writeText(url); toast.success("Link copiado."); }}><Clipboard /> Copiar</Button>{member.whatsapp && <Button asChild><a href={`https://wa.me/${member.whatsapp}?text=${whatsappText}`} target="_blank" rel="noreferrer"><Send /> Enviar no WhatsApp</a></Button>}</div><small>Por segurança, copie agora. O sistema guarda apenas o hash e não consegue mostrar este endereço novamente.</small></div> : <p className="access-link-note"><ShieldCheck /> O link terá 256 bits de aleatoriedade e continuará válido até você gerar outro.</p>}<DialogFooter><Button onClick={() => void generate()} disabled={loading}>{loading && <Loader2 className="spinner-inline" />}{url ? "Gerar outro link" : "Gerar link pessoal"}</Button></DialogFooter></DialogContent></Dialog>;
}

function People({ data, reload }: { data: Dashboard; reload: () => Promise<void> }) {
  const grouped = data.subscriptions.filter((s) => !s.archivedAt);
  return <><PageHeading title={data.actor.role === "admin" ? "Participantes" : "Integrantes"} subtitle="E-mails, WhatsApp e links pessoais são privados dentro do seu Rateio." /><div className="people-groups">{grouped.map((sub) => <section className="panel people-panel" key={sub.id}><h3>{sub.name}</h3>{sub.members.filter((member, index, all) => all.findIndex((m) => m.id === member.id) === index).map((member) => { const charge = data.charges.find((c) => c.subscriptionId === sub.id && c.userId === member.id); const canSeeContact = data.actor.role === "admin" || member.id === data.actor.id; return <article key={member.id}><span className="person-avatar">{initials(member.name)}</span><div className="contact-lines"><strong>{member.name}{member.id === data.actor.id ? " (você)" : ""}</strong>{canSeeContact ? <><small>{member.email || "E-mail não cadastrado"}</small><small><Phone /> {formatWhatsApp(member.whatsapp) || "WhatsApp não cadastrado"}</small></> : <small>Dados de contato privados</small>}</div><div className="person-actions">{data.actor.role === "admin" && member.id !== data.actor.id && <><ContactDialog member={member} reload={reload} /><AccessLinkDialog member={member} /></>}{charge ? <span className={`status status-${statusTone(charge)}`}>{statusText(charge)}</span> : <span className="status">Sem cobrança neste mês</span>}</div></article>; })}</section>)}</div></>;
}

function Activity({ data, admin }: { data: Dashboard; admin: boolean }) {
  if (!admin) { const own = data.charges.filter((c) => c.userId === data.actor.id); return <><PageHeading title="Histórico do mês" subtitle="Aviso, ciência, pagamento informado e recebimento confirmado são registros independentes." /><div className="timeline-list">{own.map((charge) => <article className="panel timeline-card" key={charge.id}><h3>{charge.subscriptionName}</h3><TimelineLine done={Boolean(charge.noticeSentAt)} title="Aviso enviado" detail={charge.noticeSentAt ? `${charge.noticeChannel}, registro manual em ${fullDate.format(new Date(charge.noticeSentAt))}` : "Sem registro de envio"} /><TimelineLine done={Boolean(charge.acknowledgedAt)} title="Ciência confirmada" detail={charge.acknowledgedAt ? fullDate.format(new Date(charge.acknowledgedAt)) : "Aguardando seu clique"} /><TimelineLine done={Boolean(charge.paymentReportedAt)} title="Pagamento informado" detail={charge.paymentReportedAt ? fullDate.format(new Date(charge.paymentReportedAt)) : "Ainda não informado"} /><TimelineLine done={Boolean(charge.confirmedAt)} title="Recebimento confirmado" detail={charge.confirmedAt ? fullDate.format(new Date(charge.confirmedAt)) : "Aguardando conferência do administrador"} /></article>)}</div></>; }
  const labels: Record<string, string> = { subscription_created: "Assinatura criada", subscription_archived: "Assinatura arquivada", future_split_updated: "Rateio futuro alterado", participant_whatsapp_updated: "WhatsApp do participante atualizado", profile_name_updated: "Nome do perfil atualizado", awareness_confirmed: "Ciência confirmada", payment_reported: "Pagamento informado", receipt_confirmed: "Recebimento confirmado", payment_returned: "Pagamento devolvido", notice_recorded: "Envio de aviso registrado" };
  return <><PageHeading title="Atividades" subtitle="Registro de quem alterou cada etapa e quando." />{data.audit.length ? <div className="audit-list">{data.audit.map((event) => <article key={event.id}><span className="audit-dot" /><div><strong>{labels[event.action] ?? event.action}</strong><p>{event.actorName}</p></div><time>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(event.createdAt))}</time></article>)}</div> : <EmptyState icon={History} title="Sem atividades" text="As próximas alterações aparecerão aqui." />}</>;
}

function TimelineLine({ done, title, detail }: { done: boolean; title: string; detail: string }) { return <div className={`timeline-line ${done ? "done" : ""}`}><span>{done ? <Check /> : <span />}</span><div><strong>{title}</strong><small>{detail}</small></div></div>; }
function EmptyState({ icon: Icon, title, text }: { icon: typeof CreditCard; title: string; text: string }) { return <div className="empty-state"><span><Icon /></span><strong>{title}</strong><p>{text}</p></div>; }

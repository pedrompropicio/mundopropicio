import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { onActiveCompanyChanged } from "@/lib/permissions";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useIsMobile } from "@/hooks/use-mobile";
import DocumentAnalysisPanel from "./DocumentAnalysisPanel";
import AssistantConversation from "./AssistantConversation";
import GmailAttachmentPicker from "./GmailAttachmentPicker";
import { prepareDataEntryScannerFile } from "@/lib/data-entry-scanner-file";
import { applyAnalysisCandidate } from "@/lib/data-entry-analysis";
import {
  edgeDataEntryAdapter, parseAmount, DataEntryError,
  type DataEntryContext, type DataEntryAdapter, type DataEntryFields, type DataEntryState, type ExecuteOutcome,
} from "@/lib/data-entry-client";

const PENDING = ["Análise automática do documento (IA)", "Google Drive", "Transações e grupos de fatura", "Linhas do BP e Formalidade", "Pagamentos já efetuados", "Extratos e conciliação", "Fechos de bilheteira"];
const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";
const lastKey = (c: DataEntryContext) => `de333:last:${c.user_id}:${c.company_id}`;
const pendingKey = (c: DataEntryContext, session: string) => `de333:pending:${c.user_id}:${c.company_id}:${session}`;
type Form = { supplier_name: string; supplier_nif: string; invoice_number: string; invoice_date: string; total: string; iva: string; customer_nif: string; payer: string; notes: string };
const EMPTY: Form = { supplier_name: "", supplier_nif: "", invoice_number: "", invoice_date: "", total: "", iva: "", customer_nif: "", payer: "", notes: "" };
const eur = (n: number) => n.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });

type Props = { open: boolean; onOpenChange: (o: boolean) => void; adapter?: DataEntryAdapter };
export default function DataEntryDialog(props: Props) {
  const { user, loading } = useAuth();
  const [epoch, setEpoch] = useState(0);
  useEffect(() => onActiveCompanyChanged(() => setEpoch((n) => n + 1)), []);
  // Remount synchronously discards all fields, authorization and pending UI on context/close.
  return <DataEntrySession key={`${user?.id ?? "signed-out"}:${loading}:${props.open}:${epoch}`} {...props} userId={user?.id ?? null} resolving={loading} />;
}

function DataEntrySession({ open, onOpenChange, adapter = edgeDataEntryAdapter, userId, resolving }: Props & { userId: string | null; resolving: boolean }) {
  const isMobile = useIsMobile();
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [context, setContext] = useState<DataEntryContext | null>(null);
  const [state, setState] = useState<DataEntryState | null>(null);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [confirmed, setConfirmed] = useState(false);
  const [previewValid, setPreviewValid] = useState(false);
  const [outcome, setOutcome] = useState<ExecuteOutcome | null>(null);
  const [analysisEnabled, setAnalysisEnabled] = useState(false);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [gmailEnabled, setGmailEnabled] = useState(false);
  // #333 fase11d: com o envio fechado, só ligar/estado/desligar do Gmail (sem lote, pesquisa ou importação).
  const [gmailOnly, setGmailOnly] = useState<DataEntryContext | null>(null);
  const [gmailOnlyCompany, setGmailOnlyCompany] = useState<string | null>(null);
  const [assistantCtx, setAssistantCtx] = useState<DataEntryContext | null>(null);
  const generation = useRef(0);
  const inFlight = useRef(false);
  useLayoutEffect(() => () => { generation.current += 1; }, []);

  useEffect(() => {
    if (!open || resolving || !userId) return;
    const gen = generation.current;
    adapter.status().then((s) => {
      if (gen !== generation.current) return;
      if (s.user_id !== userId) { setUnavailable("Sessão alterada; reabre o assistente."); return; }
      setAssistantCtx(s.capabilities.assistant === true ? { user_id: s.user_id, company_id: s.company_id } : null);
      if (!s.capabilities.upload) {
        setGmailOnly(s.capabilities.gmail === true ? { user_id: s.user_id, company_id: s.company_id } : null);
        setGmailOnlyCompany(typeof s.company_name === "string" && s.company_name.trim() ? s.company_name.trim() : null);
        setUnavailable("O envio de documentos ainda não foi ativado neste ambiente. Nada foi guardado nem lançado."); return;
      }
      const c = { user_id: s.user_id, company_id: s.company_id };
      setAnalysisEnabled(s.capabilities.analysis === true);
      setGmailEnabled(s.capabilities.gmail === true);
      setContext(c); setResumeId(localStorage.getItem(lastKey(c)));
    }).catch((e) => { if (gen === generation.current) setUnavailable(e instanceof DataEntryError ? e.message : "O assistente está indisponível."); });
    return () => { generation.current += 1; };
  }, [open, adapter, userId, resolving]);

  const run = async (label: string, fn: (valid: () => boolean, c: DataEntryContext) => Promise<void>) => {
    if (!context || inFlight.current || analysisBusy) return;
    const gen = generation.current;
    const valid = () => gen === generation.current;
    inFlight.current = true; setBusy(label); setError(null);
    try { await fn(valid, context); }
    catch (e) { if (valid()) setError(e instanceof Error ? e.message : "Operação interrompida."); }
    finally { if (valid()) { inFlight.current = false; setBusy(null); } }
  };
  const restoreFields = (s: DataEntryState) => {
    const f = s.preview?.snapshot.fields;
    setForm(f ? { supplier_name: f.supplier_name, supplier_nif: f.supplier_nif, invoice_number: f.invoice_number,
      invoice_date: f.invoice_date, total: String(f.total_amount), iva: String(f.iva_amount), customer_nif: f.customer_nif,
      payer: f.paid_by_partner_id, notes: f.notes } : EMPTY);
    setPreviewValid(!!f); setConfirmed(false);
  };
  const check = async (session: string, previewId: string, c: DataEntryContext, valid: () => boolean) => {
    setOutcome({ status: "por_confirmar", error: "A conferir o registo e o documento guardado. Não faças novo lançamento." });
    try {
      const out = await adapter.check(session, previewId, c);
      if (!valid()) return;
      setOutcome(out);
      if (out.status === "conferido") localStorage.removeItem(pendingKey(c, session));
    } catch {
      if (valid()) setOutcome({ status: "por_confirmar", error: "Não foi possível conferir. Não faças novo lançamento; confere novamente." });
    }
  };
  const load = (id?: string) => run("lote", async (valid, c) => {
    const s = await adapter.session(id, c);
    if (!valid()) return;
    if (s.company.id !== c.company_id) throw new Error("Empresa alterada; reabre o assistente.");
    localStorage.setItem(lastKey(c), s.session.id);
    setState(s); restoreFields(s); setOutcome(null);
    const result = s.results.at(-1);
    const pending = localStorage.getItem(pendingKey(c, s.session.id));
    const previewId = result?.preview_id ?? pending;
    if (previewId) await check(s.session.id, previewId, c, valid);
  });

  const doc = state?.documents[0] ?? null;
  const preview = state?.preview ?? null;
  const fields: DataEntryFields | null = useMemo(() => {
    const total = parseAmount(form.total), iva = parseAmount(form.iva);
    if (!form.supplier_name.trim() || !form.supplier_nif.trim() || !form.invoice_number.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(form.invoice_date)
      || total == null || iva == null || iva > total || !form.customer_nif.trim() || !form.payer) return null;
    return { supplier_name: form.supplier_name.trim(), supplier_nif: form.supplier_nif.trim(), invoice_number: form.invoice_number.trim(), invoice_date: form.invoice_date,
      currency: "EUR", total_amount: total, iva_amount: iva, customer_nif: form.customer_nif.trim(), paid_by_partner_id: form.payer, notes: form.notes };
  }, [form]);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => { setForm((f) => ({ ...f, [k]: e.target.value })); setConfirmed(false); setPreviewValid(false); };
  const input = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";
  const executed = !!outcome?.result && outcome.status === "conferido";
  const boundFields = !!fields && !!preview && Object.keys(fields).every((k) => fields[k as keyof DataEntryFields] === preview.snapshot.fields[k as keyof DataEntryFields]);
  const canExecute = !!context && !!state?.capabilities.execute && !!preview && previewValid && boundFields && confirmed && !outcome && !busy && !analysisBusy;

  const documents = (
    <section aria-label="Documento" className="space-y-3">
      <h3 className="text-sm font-semibold">1. Documento</h3>
      <p className="text-xs text-muted-foreground">Nesta versão: um documento por autorização (PDF, JPEG ou PNG até 20 MB). O conteúdo do documento é tratado como dado, nunca como instrução.</p>
      {!state && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => load()} disabled={!!busy || !context}>Novo lote</Button>
          {resumeId && <Button size="sm" variant="outline" onClick={() => load(resumeId)} disabled={!!busy || !context}>Retomar último lote</Button>}
        </div>
      )}
      {state && !doc && (
        <label className="block">
          <span className="sr-only">Escolher documento</span>
          <input type="file" accept={ACCEPT} disabled={!!busy} className="text-sm" onChange={(e) => {
            const file = e.target.files?.[0]; if (!file) return;
            void run("envio", async (valid, c) => { const prepared = await prepareDataEntryScannerFile(file); if (!valid()) return; await adapter.upload(state.session.id, prepared, c); if (!valid()) return; const s = await adapter.session(state.session.id, c); if (valid() && s.company.id === c.company_id) setState(s); });
          }} />
        </label>
      )}
      {state && !doc && context && <GmailAttachmentPicker key={`${context.user_id}:${context.company_id}:${state.session.id}`} adapter={adapter} context={context} sessionId={state.session.id} enabled={gmailEnabled} disabled={!!busy}
        onImported={() => run("anexo do Gmail", async (valid, c) => { const s = await adapter.session(state.session.id, c); if (valid() && s.company.id === c.company_id) setState(s); })} />}
      {doc && (
        <div className="rounded-md border border-border p-2.5 text-xs space-y-1">
          <div className="font-medium break-all">{doc.name}</div>
          <div className="text-muted-foreground">{(doc.size_bytes / 1024).toFixed(0)} KB · {doc.mime}</div>
          <div className="text-muted-foreground font-mono break-all">SHA-256 {doc.sha256.slice(0, 16)}…</div>
        </div>
      )}
      {doc && state && context && <DocumentAnalysisPanel key={`${state.session.id}:${doc.id}:${doc.sha256}`} adapter={adapter} context={context} sessionId={state.session.id} doc={doc} enabled={analysisEnabled} locked={!!busy || !!outcome || executed} onBusy={setAnalysisBusy} onCandidate={(candidate) => {
        setForm((f) => applyAnalysisCandidate(f, candidate, true)); setConfirmed(false); setPreviewValid(false);
      }} />}
    </section>
  );

  const previewPanel = (
    <section aria-label="Prévia" className="space-y-3">
      <h3 className="text-sm font-semibold">2. Fatura Avulsa — dados confirmados por ti</h3>
      <p className="text-xs text-muted-foreground">Só documento e metadados: nunca cria transação, BP, conta, lista ou reembolso. Só EUR nesta versão.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs space-y-1"><span>Fornecedor</span><input className={input} value={form.supplier_name} onChange={set("supplier_name")} disabled={!doc || executed || !!outcome || !!busy} /></label>
        <label className="text-xs space-y-1"><span>NIF do fornecedor</span><input className={input} value={form.supplier_nif} onChange={set("supplier_nif")} disabled={!doc || executed || !!outcome || !!busy} /></label>
        <label className="text-xs space-y-1"><span>Número da fatura</span><input className={input} value={form.invoice_number} onChange={set("invoice_number")} disabled={!doc || executed || !!outcome || !!busy} /></label>
        <label className="text-xs space-y-1"><span>Data da fatura</span><input type="date" className={input} value={form.invoice_date} onChange={set("invoice_date")} disabled={!doc || executed || !!outcome || !!busy} /></label>
        <label className="text-xs space-y-1"><span>Total (EUR)</span><input inputMode="decimal" className={input} value={form.total} onChange={set("total")} disabled={!doc || executed || !!outcome || !!busy} /></label>
        <label className="text-xs space-y-1"><span>IVA (EUR)</span><input inputMode="decimal" className={input} value={form.iva} onChange={set("iva")} disabled={!doc || executed || !!outcome || !!busy} /></label>
        <label className="text-xs space-y-1"><span>NIF do destinatário no documento</span><input className={input} value={form.customer_nif} onChange={set("customer_nif")} disabled={!doc || executed || !!outcome || !!busy} /></label>
        <label className="text-xs space-y-1"><span>Quem pagou</span>
          <select className={input} value={form.payer} onChange={set("payer")} disabled={!doc || executed || !!outcome || !!busy}>
            <option value="">Escolher…</option>
            {state?.payers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="text-xs space-y-1 sm:col-span-2"><span>Nota (opcional)</span><textarea maxLength={2000} rows={2} className={input} value={form.notes} onChange={set("notes")} disabled={!doc || executed || !!outcome || !!busy} /></label>
      </div>
      {state?.company.tax_id && <p className="text-xs text-muted-foreground">NIF da empresa no ERP: {state.company.tax_id}. O servidor recusa se o destinatário for outro.</p>}
      <Button size="sm" disabled={!doc || !fields || !!busy || !!outcome || analysisBusy} onClick={() => {
        if (!doc || !fields || !state) return;
        void run("prévia", async (valid, c) => {
          await adapter.preview(state.session.id, doc.id, fields, c); if (!valid()) return;
          const s = await adapter.session(state.session.id, c); if (!valid()) return;
          if (s.company.id !== c.company_id) throw new Error("Empresa alterada; reabre o assistente.");
          setState(s); restoreFields(s);
        });
      }}>Preparar prévia</Button>
    </section>
  );

  const authPanel = (
    <section aria-label="Autorização" className="space-y-3">
      <h3 className="text-sm font-semibold">3. Prévia, autorização e conferência</h3>
      {!preview && <p className="text-xs text-muted-foreground">Ainda sem prévia.</p>}
      {preview && (
        <div className="rounded-md border border-border p-2.5 text-xs space-y-2">
          <div className="flex justify-between"><span>Versão da prévia</span><span className="font-mono">v{preview.version} · {preview.snapshot_hash.slice(0, 12)}</span></div>
          <div><span className="font-medium">Confirmado por ti:</span> {preview.snapshot.fields.supplier_name} ({preview.snapshot.fields.supplier_nif}) · n.º {preview.snapshot.fields.invoice_number} · {preview.snapshot.fields.invoice_date.split("-").reverse().join("/")} · {eur(preview.snapshot.fields.total_amount)} (IVA {eur(preview.snapshot.fields.iva_amount)})</div>
          <div><span className="font-medium">Do ERP:</span> empresa {state?.company.name} (NIF {preview.snapshot.company_tax}) · pagou {preview.snapshot.payer_name} · evento {state?.event?.name ?? "nenhum"}</div>
          <div><span className="font-medium">Efeitos exatos:</span><ul className="list-disc pl-4">{preview.snapshot.effects.map((e) => <li key={e}>{e}</li>)}</ul></div>
        </div>
      )}
      {preview && !executed && !outcome && (
        <>
          <label className="flex items-start gap-2 text-xs"><Checkbox disabled={!!busy || !previewValid || !boundFields} checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} /><span>Revi esta versão da prévia e autorizo exatamente estes efeitos, em meu nome ({state?.actor.name}).</span></label>
          {!state?.capabilities.execute && <p role="status" className="text-xs text-warning">A execução ainda não foi validada neste ambiente. A prévia fica guardada e nada é lançado.</p>}
          {(!previewValid || !boundFields) && <p role="status" className="text-xs text-warning">Os dados mudaram. Prepara uma nova prévia antes de autorizar.</p>}
          <Button size="sm" disabled={!canExecute} onClick={() => {
            if (!canExecute || !state) return;
            void run("execução", async (valid, c) => {
              const current = await adapter.status(); if (!valid()) return;
              if (current.user_id !== c.user_id || current.company_id !== c.company_id) {
                setState(null); setForm(EMPTY); setConfirmed(false); setPreviewValid(false); setResumeId(null); setContext(null);
                setUnavailable("Empresa ou sessão alterada. Reabre o assistente."); return;
              }
              // Persist uncertainty BEFORE the request: close/abort cannot prove rollback.
              localStorage.setItem(pendingKey(c, state.session.id), preview.id);
              setConfirmed(false); setOutcome({ status: "por_confirmar", error: "Resultado por confirmar. Não faças novo lançamento." });
              try {
                const out = await adapter.execute(state.session.id, preview.id, preview.snapshot_hash, c);
                if (!valid()) return;
                setOutcome(out); if (out.status === "conferido") localStorage.removeItem(pendingKey(c, state.session.id));
              } catch { if (valid()) setOutcome({ status: "por_confirmar", error: "Resultado por confirmar. Confere novamente; não faças novo lançamento." }); }
            });
          }}>Autorizar e executar este lote</Button>
        </>
      )}
      {outcome && (
        <div role="status" className="rounded-md border border-border p-2.5 text-xs space-y-1">
          <div className="font-medium">{outcome.status === "conferido" ? "Registado e conferido" : outcome.status === "por_confirmar" ? "Resultado por confirmar" : "Conferência pendente"}</div>
          {outcome.error && <div>{outcome.error}</div>}
          {outcome.status !== "conferido" && state && preview && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("conferência", async (valid, c) => {
            const result = state.results.at(-1);
            const previewId = result?.preview_id ?? localStorage.getItem(pendingKey(c, state.session.id)) ?? preview.id;
            await check(state.session.id, previewId, c, valid);
          })}>Conferir novamente</Button>}
          {outcome.result && (<>
            <div>{outcome.result.observation}</div>
            <div>Total {eur(Number(outcome.result.total_amount))} · data {String(outcome.result.invoice_date).split("-").reverse().join("/")} · estado original {outcome.result.status} · estado atual {outcome.persisted?.status ?? "por confirmar"}</div>
            <Link className="text-primary underline" to="/scanner-faturas">Abrir Faturas Avulsas</Link>
          </>)}
        </div>
      )}
      <div className="pt-2">
        <h4 className="text-xs font-semibold">Ainda não disponível</h4>
        <ul className="list-disc pl-4 text-xs text-muted-foreground">{PENDING.map((p) => <li key={p}>{p}</li>)}</ul>
      </div>
    </section>
  );

  const stateLabel = !context && !unavailable ? "A resolver sessão e empresa" : unavailable ? (gmailOnly ? "Gmail disponível · Documentos ainda desativados" : "Indisponível") : executed ? "Concluído" : busy ? `A tratar: ${busy}` : preview ? "Prévia pronta" : state ? "Lote aberto" : "Pronto";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90dvh] flex flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-6 pt-6 pb-3 pr-14">
          <DialogTitle>Assistente de Entrada de Dados</DialogTitle>
          <DialogDescription>Documento → dados confirmados → prévia → autorização expressa → conferência.</DialogDescription>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Badge variant="outline">Empresa: {state?.company.name ?? (gmailOnly ? gmailOnlyCompany : null) ?? "—"}</Badge>
            <Badge variant="outline">Evento: {state?.event?.name ?? "nenhum"}</Badge>
            <Badge variant={unavailable && !gmailOnly ? "destructive" : "secondary"}>Estado: {stateLabel}</Badge>
          </div>
        </DialogHeader>
        <div data-testid="data-entry-body" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
        {unavailable ? (
          <div className="space-y-3 text-sm">
            {assistantCtx ? <AssistantConversation adapter={adapter} context={assistantCtx} />
              : <p role="status" className="text-xs text-muted-foreground">Assistente conversacional (texto livre): em preparação, ainda não ativado.</p>}
            <p role={gmailOnly ? "status" : "alert"}>{unavailable}</p>
            {gmailOnly && <GmailAttachmentPicker key={`${gmailOnly.user_id}:${gmailOnly.company_id}:ligacao`} adapter={adapter} context={gmailOnly} sessionId="" enabled connectionOnly disabled={false} onImported={() => undefined} />}
            <div><h4 className="text-xs font-semibold">Ainda não disponível</h4><ul className="list-disc pl-4 text-xs text-muted-foreground">{PENDING.map((p) => <li key={p}>{p}</li>)}</ul></div>
          </div>
        ) : (
          <div className="space-y-3">
            {assistantCtx && <AssistantConversation adapter={adapter} context={assistantCtx} />}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {isMobile ? (
              <Tabs defaultValue="doc">
                <TabsList className="grid w-full grid-cols-3"><TabsTrigger value="doc">Documento</TabsTrigger><TabsTrigger value="prev">Dados</TabsTrigger><TabsTrigger value="auth">Autorizar</TabsTrigger></TabsList>
                <TabsContent value="doc">{documents}</TabsContent>
                <TabsContent value="prev">{previewPanel}</TabsContent>
                <TabsContent value="auth">{authPanel}</TabsContent>
              </Tabs>
            ) : (
              <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr_1.2fr]">{documents}{previewPanel}{authPanel}</div>
            )}
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

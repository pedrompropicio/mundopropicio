import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  edgeDataEntryAdapter, parseAmount, DataEntryError,
  type DataEntryAdapter, type DataEntryFields, type DataEntryState, type ExecuteOutcome,
} from "@/lib/data-entry-client";

const PENDING = ["Análise automática do documento (IA)", "Gmail e Google Drive", "Transações e grupos de fatura", "Linhas do BP e Formalidade", "Pagamentos já efetuados", "Extratos e conciliação", "Fechos de bilheteira"];
const ACCEPT = "application/pdf,image/jpeg,image/png";
const lastKey = (company: string) => `de333:last:${company}`;
type Form = { supplier_name: string; supplier_nif: string; invoice_number: string; invoice_date: string; total: string; iva: string; customer_nif: string; payer: string; notes: string };
const EMPTY: Form = { supplier_name: "", supplier_nif: "", invoice_number: "", invoice_date: "", total: "", iva: "", customer_nif: "", payer: "", notes: "" };
const eur = (n: number) => n.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });

export default function DataEntryDialog({ open, onOpenChange, adapter = edgeDataEntryAdapter }: { open: boolean; onOpenChange: (o: boolean) => void; adapter?: DataEntryAdapter }) {
  const isMobile = useIsMobile();
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [state, setState] = useState<DataEntryState | null>(null);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [confirmed, setConfirmed] = useState(false);
  const [outcome, setOutcome] = useState<ExecuteOutcome | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setUnavailable(null); setError(null); setState(null); setOutcome(null);
    adapter.status().then((s) => {
      if (!alive) return;
      if (!s.capabilities.upload) { setUnavailable("O envio de documentos ainda não foi ativado neste ambiente. Nada foi guardado nem lançado."); return; }
      setResumeId(localStorage.getItem(lastKey(s.company_id)));
    }).catch((e) => alive && setUnavailable(e instanceof DataEntryError ? e.message : "O assistente está indisponível."));
    return () => { alive = false; };
  }, [open, adapter]);

  const run = async <T,>(label: string, fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(label); setError(null);
    try { return await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Operação interrompida."); } finally { setBusy(null); }
  };
  const load = (id?: string) => run("lote", async () => {
    const s = await adapter.session(id);
    localStorage.setItem(lastKey(s.company.id), s.session.id);
    setState(s); setConfirmed(false); setOutcome(null);
    const last = s.preview && s.results.find((r) => r.preview_id === s.preview!.id);
    if (last) setOutcome({ status: "conferido", result: last.result });
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
  const set = (k: keyof Form) => (e: { target: { value: string } }) => { setForm((f) => ({ ...f, [k]: e.target.value })); setConfirmed(false); };
  const input = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";
  const executed = !!outcome?.result && outcome.status === "conferido";
  const canExecute = !!state?.capabilities.execute && !!preview && confirmed && !executed && !busy;

  const documents = (
    <section aria-label="Documento" className="space-y-3">
      <h3 className="text-sm font-semibold">1. Documento</h3>
      <p className="text-xs text-muted-foreground">Nesta versão: um documento por autorização (PDF, JPEG ou PNG até 20 MB). O conteúdo do documento é tratado como dado, nunca como instrução.</p>
      {!state && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => load()} disabled={!!busy}>Novo lote</Button>
          {resumeId && <Button size="sm" variant="outline" onClick={() => load(resumeId)} disabled={!!busy}>Retomar último lote</Button>}
        </div>
      )}
      {state && !doc && (
        <label className="block">
          <span className="sr-only">Escolher documento</span>
          <input type="file" accept={ACCEPT} disabled={!!busy} className="text-sm" onChange={(e) => {
            const file = e.target.files?.[0]; if (!file) return;
            void run("envio", async () => { await adapter.upload(state.session.id, file); const s = await adapter.session(state.session.id); setState(s); });
          }} />
        </label>
      )}
      {doc && (
        <div className="rounded-md border border-border p-2.5 text-xs space-y-1">
          <div className="font-medium break-all">{doc.name}</div>
          <div className="text-muted-foreground">{(doc.size_bytes / 1024).toFixed(0)} KB · {doc.mime}</div>
          <div className="text-muted-foreground font-mono break-all">SHA-256 {doc.sha256.slice(0, 16)}…</div>
        </div>
      )}
    </section>
  );

  const previewPanel = (
    <section aria-label="Prévia" className="space-y-3">
      <h3 className="text-sm font-semibold">2. Fatura Avulsa — dados confirmados por ti</h3>
      <p className="text-xs text-muted-foreground">Só documento e metadados: nunca cria transação, BP, conta, lista ou reembolso. Só EUR nesta versão.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs space-y-1"><span>Fornecedor</span><input className={input} value={form.supplier_name} onChange={set("supplier_name")} disabled={!doc || executed} /></label>
        <label className="text-xs space-y-1"><span>NIF do fornecedor</span><input className={input} value={form.supplier_nif} onChange={set("supplier_nif")} disabled={!doc || executed} /></label>
        <label className="text-xs space-y-1"><span>Número da fatura</span><input className={input} value={form.invoice_number} onChange={set("invoice_number")} disabled={!doc || executed} /></label>
        <label className="text-xs space-y-1"><span>Data da fatura</span><input type="date" className={input} value={form.invoice_date} onChange={set("invoice_date")} disabled={!doc || executed} /></label>
        <label className="text-xs space-y-1"><span>Total (EUR)</span><input inputMode="decimal" className={input} value={form.total} onChange={set("total")} disabled={!doc || executed} /></label>
        <label className="text-xs space-y-1"><span>IVA (EUR)</span><input inputMode="decimal" className={input} value={form.iva} onChange={set("iva")} disabled={!doc || executed} /></label>
        <label className="text-xs space-y-1"><span>NIF do destinatário no documento</span><input className={input} value={form.customer_nif} onChange={set("customer_nif")} disabled={!doc || executed} /></label>
        <label className="text-xs space-y-1"><span>Quem pagou</span>
          <select className={input} value={form.payer} onChange={set("payer")} disabled={!doc || executed}>
            <option value="">Escolher…</option>
            {state?.payers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="text-xs space-y-1 sm:col-span-2"><span>Nota (opcional)</span><textarea maxLength={2000} rows={2} className={input} value={form.notes} onChange={set("notes")} disabled={!doc || executed} /></label>
      </div>
      {state?.company.tax_id && <p className="text-xs text-muted-foreground">NIF da empresa no ERP: {state.company.tax_id}. O servidor recusa se o destinatário for outro.</p>}
      <Button size="sm" disabled={!doc || !fields || !!busy || executed} onClick={() => doc && fields && run("prévia", async () => {
        await adapter.preview(state!.session.id, doc.id, fields); setState(await adapter.session(state!.session.id)); setConfirmed(false);
      })}>Preparar prévia</Button>
    </section>
  );

  const authPanel = (
    <section aria-label="Autorização" className="space-y-3">
      <h3 className="text-sm font-semibold">3. Prévia, autorização e conferência</h3>
      {!preview && <p className="text-xs text-muted-foreground">Ainda sem prévia.</p>}
      {preview && (
        <div className="rounded-md border border-border p-2.5 text-xs space-y-2">
          <div className="flex justify-between"><span>Versão da prévia</span><span className="font-mono">v{preview.version} · {preview.snapshot_hash.slice(0, 12)}</span></div>
          <div><span className="font-medium">Do documento:</span> {preview.snapshot.fields.supplier_name} ({preview.snapshot.fields.supplier_nif}) · n.º {preview.snapshot.fields.invoice_number} · {preview.snapshot.fields.invoice_date.split("-").reverse().join("/")} · {eur(preview.snapshot.fields.total_amount)} (IVA {eur(preview.snapshot.fields.iva_amount)})</div>
          <div><span className="font-medium">Do ERP:</span> empresa {state?.company.name} (NIF {preview.snapshot.company_tax}) · pagou {preview.snapshot.payer_name} · evento {state?.event?.name ?? "nenhum"}</div>
          <div><span className="font-medium">Efeitos exatos:</span><ul className="list-disc pl-4">{preview.snapshot.effects.map((e) => <li key={e}>{e}</li>)}</ul></div>
        </div>
      )}
      {preview && !executed && (
        <>
          <label className="flex items-start gap-2 text-xs"><Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} /><span>Revi esta versão da prévia e autorizo exatamente estes efeitos, em meu nome ({state?.actor.name}).</span></label>
          {!state?.capabilities.execute && <p role="status" className="text-xs text-warning">A execução ainda não foi validada neste ambiente. A prévia fica guardada e nada é lançado.</p>}
          <Button size="sm" disabled={!canExecute} onClick={() => run("execução", async () => {
            const out = await adapter.execute(state!.session.id, preview.id, preview.snapshot_hash); setOutcome(out);
          })}>Autorizar e executar este lote</Button>
        </>
      )}
      {outcome && (
        <div role="status" className="rounded-md border border-border p-2.5 text-xs space-y-1">
          <div className="font-medium">{outcome.status === "conferido" ? "Registado e conferido" : outcome.status === "por_confirmar" ? "Resultado por confirmar" : "Conferência pendente"}</div>
          {outcome.error && <div>{outcome.error}</div>}
          {outcome.result && (<>
            <div>{outcome.result.observation}</div>
            <div>Total {eur(Number(outcome.result.total_amount))} · data {String(outcome.result.invoice_date).split("-").reverse().join("/")} · estado {outcome.result.status}</div>
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

  const stateLabel = unavailable ? "Indisponível" : executed ? "Concluído" : busy ? `A tratar: ${busy}` : preview ? "Prévia pronta" : state ? "Lote aberto" : "Pronto";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Assistente de Entrada de Dados</DialogTitle>
          <DialogDescription className="flex flex-wrap gap-1.5 pt-1">
            <Badge variant="outline">Empresa: {state?.company.name ?? "—"}</Badge>
            <Badge variant="outline">Evento: {state?.event?.name ?? "nenhum"}</Badge>
            <Badge variant={unavailable ? "destructive" : "secondary"}>Estado: {stateLabel}</Badge>
          </DialogDescription>
        </DialogHeader>
        {unavailable ? (
          <div className="space-y-3 text-sm">
            <p role="alert">{unavailable}</p>
            <div><h4 className="text-xs font-semibold">Ainda não disponível</h4><ul className="list-disc pl-4 text-xs text-muted-foreground">{PENDING.map((p) => <li key={p}>{p}</li>)}</ul></div>
          </div>
        ) : (
          <div className="space-y-3">
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
      </DialogContent>
    </Dialog>
  );
}

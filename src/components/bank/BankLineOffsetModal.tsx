/**
 * #335 fase 3b — modal "Encontro de contas" a partir de uma linha do banco por conciliar.
 *
 * Passos: entidade → documentos → ordem do dinheiro → prévia → confirmar → resultado.
 * Conta, data e sinal vêm do extracto (servidor); o cliente só envia ids, modo, cash_order
 * e expected_open_cents (nunca amount/paid_amount/iva_rate). Valores não editáveis.
 * Não é <form>: Enter nunca grava. Cabeçalho e rodapé fora da área de scroll.
 */
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Scale } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatDatePT } from "@/lib/utils";
import { lisbonTodayISO } from "@/lib/date-lisbon";
import { buildOffsetPlan, formatEurCents, offsetErrorMessage } from "@/lib/offset-plan";
import { canApplyOffset, type OffsetControlRow } from "@/lib/offset-plan/contracts";
import {
  applyBankLineOffset,
  findGroupByRequest,
  newRequestId,
  readOffsetControl,
  type OffsetFailure,
  type OffsetGroupSummary,
  type OffsetRpcClient,
} from "@/lib/offset-plan/rpc";
import {
  candidateToPlanInput,
  invalidateAfterOffset,
  loadForecastCandidates,
  loadSupplierDocuments,
  readAllPages,
  type OffsetCandidate,
} from "@/lib/offset-plan/load";
import type { OffsetContractItem } from "@/lib/offset-plan";

export const OFFSET_DISABLED_MESSAGE = "Encontros de contas estão temporariamente desativados.";

export interface OffsetBankLine {
  id: string;
  amount: number;
  booking_date: string;
  value_date?: string | null;
  description?: string | null;
  status?: string;
}

export interface OffsetModalServices {
  client: OffsetRpcClient;
  readControl: () => Promise<OffsetControlRow & { readable?: boolean }>;
  loadSuppliers: () => Promise<{ id: string; name: string }[]>;
  loadDocuments: (supplierId: string) => Promise<OffsetCandidate[]>;
  loadEvents: () => Promise<{ id: string; name: string }[]>;
  loadForecasts: (eventId: string) => Promise<OffsetCandidate[]>;
  apply: typeof applyBankLineOffset;
  newRequestId: () => string;
  today: () => string;
}

const db = supabase as any;

export const defaultOffsetServices: OffsetModalServices = {
  client: db,
  readControl: () => readOffsetControl(db),
  loadSuppliers: () =>
    readAllPages<any>("entidades", (from, to) =>
      db.from("suppliers").select("id, name").order("id", { ascending: true }).range(from, to),
    ).then((r) => r.sort((a, b) => String(a.name).localeCompare(String(b.name), "pt"))),
  loadDocuments: (s) => loadSupplierDocuments(db, s),
  loadEvents: () =>
    readAllPages<any>("eventos", (from, to) =>
      db.from("events").select("id, name, status").not("status", "in", "(completed,cancelled)").order("id", { ascending: true }).range(from, to),
    ).then((r) => r.sort((a, b) => String(a.name).localeCompare(String(b.name), "pt"))),
  loadForecasts: (e) => loadForecastCandidates(db, e),
  apply: applyBankLineOffset,
  newRequestId,
  today: lisbonTodayISO,
};

function useServices(over?: Partial<OffsetModalServices>): OffsetModalServices {
  return { ...defaultOffsetServices, ...(over ?? {}) };
}

/** Controlo + papel → pode aplicar? Leitura falhada = fechado. */
export function useCanApplyOffset(services?: Partial<OffsetModalServices>) {
  const s = useServices(services);
  const { role } = useAuth();
  const { data: control, isLoading } = useQuery({
    queryKey: ["offset-control"],
    staleTime: 30_000,
    queryFn: () => s.readControl().catch(() => ({ enabled: false, reverse_enabled: false, readable: false })),
  });
  const ctl = control ?? { enabled: false, reverse_enabled: false };
  return { canApply: !isLoading && canApplyOffset(role ? [role] : [], ctl), control: ctl, loading: isLoading };
}

/** Terceiro botão da linha unmatched. Desactivado com mensagem em N1/N2/controlo ilegível/sem papel. */
export function OffsetLineButton({ onOpen, services }: { onOpen: () => void; services?: Partial<OffsetModalServices> }) {
  const { canApply, control } = useCanApplyOffset(services);
  const title = canApply
    ? "Encontro de contas"
    : control.enabled
      ? "Não tem permissão para esta operação."
      : OFFSET_DISABLED_MESSAGE;
  return (
    <Button size="sm" variant="outline" className="ml-1" disabled={!canApply} title={title} aria-label="Encontro de contas" onClick={onOpen}>
      <Scale className="mr-1 h-3.5 w-3.5" /> Encontro de contas
    </Button>
  );
}

type Step = "supplier" | "documents" | "order" | "preview" | "result";

interface Props {
  line: OffsetBankLine;
  accountName?: string;
  onClose: () => void;
  onDone?: () => void;
  services?: Partial<OffsetModalServices>;
  /** Entidade pré-escolhida (testes). */
  initialSupplierId?: string;
}

export function BankLineOffsetModal({ line, accountName, onClose, onDone, services, initialSupplierId }: Props) {
  const s = useServices(services);
  const qc = useQueryClient();
  const { canApply } = useCanApplyOffset(services);
  const [step, setStep] = useState<Step>("supplier");
  const [supplierId, setSupplierId] = useState(initialSupplierId ?? "");
  const [eventId, setEventId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [cashOrder, setCashOrder] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<OffsetFailure | null>(null);
  const [group, setGroup] = useState<OffsetGroupSummary | null>(null);
  const [needsReload, setNeedsReload] = useState(false);
  const sendingRef = useRef(false);
  /** Pedido congelado na 1.ª tentativa; repetido tal-e-qual após resposta incerta. */
  const pendingRef = useRef<{ requestId: string; supplierId: string; items: OffsetContractItem[] } | null>(null);

  const movementCents = Math.abs(Math.round(Number(line.amount) * 100));
  const direction = Number(line.amount) >= 0 ? "in" : "out";
  const settleSign = direction === "in" ? "income" : "expense";
  const lineDate = line.value_date || line.booking_date;
  const futureDate = !!lineDate && lineDate > s.today();

  const suppliers = useQuery({ queryKey: ["offset-suppliers"], queryFn: s.loadSuppliers, staleTime: 60_000 });
  const docs = useQuery({
    queryKey: ["offset-candidates", supplierId],
    enabled: !!supplierId,
    queryFn: () => s.loadDocuments(supplierId),
  });
  const events = useQuery({ queryKey: ["offset-events"], enabled: step === "documents", queryFn: s.loadEvents, staleTime: 60_000 });
  const forecasts = useQuery({
    queryKey: ["offset-forecasts", eventId],
    enabled: !!eventId,
    queryFn: () => s.loadForecasts(eventId),
  });

  const candidates: OffsetCandidate[] = useMemo(
    () => [...(docs.data ?? []), ...(forecasts.data ?? [])],
    [docs.data, forecasts.data],
  );
  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const chosen = selected.map((id) => byId.get(id)).filter(Boolean) as OffsetCandidate[];
  const settleChosen = chosen.filter((c) => c.sign === settleSign);
  const orderedSettle = useMemo(() => {
    const rank = new Map(cashOrder.map((id, i) => [id, i]));
    return [...settleChosen].sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
  }, [settleChosen, cashOrder]);

  const plan = useMemo(
    () =>
      buildOffsetPlan(
        { amount_cents: movementCents, direction },
        chosen.map(candidateToPlanInput),
        orderedSettle.map((c) => c.id),
      ),
    [movementCents, direction, chosen, orderedSettle],
  );

  const toggle = (c: OffsetCandidate) => {
    if (!c.eligibility.eligible) return;
    setSelected((prev) => (prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]));
    setCashOrder((prev) => (prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]));
  };
  const move = (id: string, delta: number) => {
    const ids = orderedSettle.map((c) => c.id);
    const i = ids.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setCashOrder(ids);
  };

  const reloadPreview = async () => {
    pendingRef.current = null;
    setFailure(null);
    setNeedsReload(false);
    await Promise.all([docs.refetch(), eventId ? forecasts.refetch() : Promise.resolve()]);
    setStep("documents");
  };

  const confirm = async () => {
    if (sendingRef.current) return; // um só pedido por clique
    if (!plan.ok || !canApply || futureDate || needsReload) return;
    sendingRef.current = true;
    setSending(true);
    setFailure(null);
    try {
      if (!pendingRef.current) {
        pendingRef.current = { requestId: s.newRequestId(), supplierId, items: plan.contract_items };
      }
      const req = pendingRef.current;
      const r = await s.apply(s.client, { lineId: line.id, requestId: req.requestId, supplierId: req.supplierId, items: req.items });
      if (r.ok) {
        pendingRef.current = null;
        setGroup(r.group ?? (await findGroupByRequest(s.client, req.requestId)));
        setStep("result");
        invalidateAfterOffset(qc);
        onDone?.();
        return;
      }
      const f = r as OffsetFailure;
      setFailure(f);
      if (f.reload) setNeedsReload(true);
      // Resposta incerta: mantém o pedido congelado (mesmo request_id). Outro erro: nova tentativa = novo pedido.
      if (!f.uncertain) pendingRef.current = null;
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const supplierName = suppliers.data?.find((x) => x.id === supplierId)?.name ?? "";

  return (
    <Dialog open onOpenChange={(o) => !o && !sending && onClose()}>
      <DialogContent className="manual-modal-shell mobile-dialog-content sm:max-w-3xl p-0 gap-0">
        <DialogHeader className="manual-modal-header border-b p-4">
          <DialogTitle>Encontro de contas</DialogTitle>
          <DialogDescription>
            {formatDatePT(lineDate)} · {line.description ?? ""} · {direction === "in" ? "Crédito" : "Débito"}{" "}
            {formatEurCents(movementCents)}
            {accountName ? ` · ${accountName}` : ""} — conta, data e valor vêm do banco.
          </DialogDescription>
        </DialogHeader>

        <div className="manual-modal-body space-y-4 p-4 text-sm" data-testid="offset-step" data-step={step}>
          {!canApply && <p className="text-destructive">{OFFSET_DISABLED_MESSAGE}</p>}
          {futureDate && (
            <p className="text-destructive">A data do movimento é futura; um pagamento nunca pode ter data futura.</p>
          )}

          {step === "supplier" && (
            <div className="space-y-2">
              <p className="font-medium">1. Entidade</p>
              <SearchableSelect
                options={(suppliers.data ?? []).map((x) => ({ value: x.id, label: x.name }))}
                value={supplierId}
                onValueChange={(v) => {
                  setSupplierId(v);
                  setSelected([]);
                  setCashOrder([]);
                }}
                placeholder={suppliers.isLoading ? "A carregar…" : "Escolha a entidade"}
              />
            </div>
          )}

          {step === "documents" && (
            <div className="space-y-3">
              <p className="font-medium">2. Documentos em aberto · {supplierName}</p>
              {docs.isLoading && <p className="text-muted-foreground">A carregar documentos…</p>}
              {docs.error && <p className="text-destructive">{String((docs.error as any)?.message ?? docs.error)}</p>}
              <CandidateTable candidates={docs.data ?? []} selected={selected} onToggle={toggle} />
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs text-muted-foreground">Linhas de BP aprovadas sem transação (opcional)</p>
                <SearchableSelect
                  options={(events.data ?? []).map((x) => ({ value: x.id, label: x.name }))}
                  value={eventId}
                  onValueChange={setEventId}
                  placeholder="Evento do BP"
                />
                {forecasts.error && <p className="text-destructive">{String((forecasts.error as any)?.message)}</p>}
                {eventId && <CandidateTable candidates={forecasts.data ?? []} selected={selected} onToggle={toggle} />}
              </div>
            </div>
          )}

          {step === "order" && (
            <div className="space-y-2">
              <p className="font-medium">3. Ordem do dinheiro ({direction === "in" ? "receitas" : "despesas"})</p>
              <p className="text-xs text-muted-foreground">O dinheiro do banco cobre os documentos por esta ordem até esgotar.</p>
              {orderedSettle.map((c, i) => (
                <div key={c.id} className="flex items-center gap-2 rounded border p-2" data-testid="cash-order-row">
                  <span className="w-6 text-muted-foreground">{i + 1}.</span>
                  <span className="flex-1 truncate">{c.label}</span>
                  <span className="font-mono">{formatEurCents(c.open_cents)}</span>
                  <Button type="button" size="icon" variant="ghost" aria-label="Subir" disabled={i === 0} onClick={() => move(c.id, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" aria-label="Descer" disabled={i === orderedSettle.length - 1} onClick={() => move(c.id, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-3">
              <p className="font-medium">4. Prévia</p>
              <div>
                <table className="w-full table-fixed text-xs" data-testid="preview-table">
                  <colgroup>
                    <col />
                    <col className="w-[6.75rem]" />
                    <col className="w-[6.75rem]" />
                    <col className="w-[6.75rem]" />
                  </colgroup>
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="break-words px-1 text-left align-bottom">Documento</th>
                      <th className="break-words px-1 text-right align-bottom">Em aberto</th>
                      <th className="break-words px-1 text-right align-bottom">Dinheiro</th>
                      <th className="break-words px-1 text-right align-bottom">Compensação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(plan.ok ? plan.items : []).map((it) => (
                      <tr key={it.document_id} data-testid="preview-row" className="align-top">
                        <td className="whitespace-normal break-words px-1 py-1">
                          {it.sign === "income" ? "Receita" : "Despesa"} · {byId.get(it.document_id)?.label}
                        </td>
                        <td className="whitespace-nowrap px-1 py-1 text-right font-mono">{formatEurCents(it.open_cents)}</td>
                        <td className="whitespace-nowrap px-1 py-1 text-right font-mono">{formatEurCents(it.cash_cents)}</td>
                        <td className="whitespace-nowrap px-1 py-1 text-right font-mono">{formatEurCents(it.offset_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {plan.ok && plan.totals && (
                <p className="text-xs">
                  Movimento {formatEurCents(plan.totals.movement_cents)} · compensação{" "}
                  {formatEurCents(plan.totals.offset_settle_cents)} = {formatEurCents(plan.totals.offset_opposite_cents)} · diferença{" "}
                  {formatEurCents(plan.totals.difference_cents)}
                </p>
              )}
              {!plan.ok && (
                <ul className="text-destructive" data-testid="plan-errors">
                  {plan.errors.map((e, i) => (
                    <li key={i}>{e.message}</li>
                  ))}
                </ul>
              )}
              {failure && (
                <div className="rounded border border-destructive p-2 text-destructive" role="alert">
                  {failure.message}
                  {failure.reload && <p className="mt-1">É preciso recarregar a prévia antes de voltar a confirmar.</p>}
                </div>
              )}
            </div>
          )}

          {step === "result" && (
            <div className="space-y-2" role="status">
              <p className="font-medium">Encontro aplicado.</p>
              <p>
                Entidade {supplierName} · líquido {formatEurCents(movementCents)}
                {group ? ` · grupo ${group.id.slice(0, 8)} (${group.status})` : ""}
              </p>
            </div>
          )}
        </div>

        <div className="manual-modal-header flex flex-wrap justify-end gap-2 border-t p-4">
          {step !== "result" && (
            <Button type="button" variant="ghost" disabled={sending} onClick={onClose}>
              Cancelar
            </Button>
          )}
          {step === "supplier" && (
            <Button type="button" disabled={!supplierId} onClick={() => setStep("documents")}>
              Seguinte
            </Button>
          )}
          {step === "documents" && (
            <>
              <Button type="button" variant="outline" onClick={() => setStep("supplier")}>Voltar</Button>
              <Button type="button" disabled={selected.length < 2 || docs.isLoading} onClick={() => setStep("order")}>
                Seguinte
              </Button>
            </>
          )}
          {step === "order" && (
            <>
              <Button type="button" variant="outline" onClick={() => setStep("documents")}>Voltar</Button>
              <Button type="button" onClick={() => setStep("preview")}>Ver prévia</Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button type="button" variant="outline" disabled={sending} onClick={() => setStep("order")}>Voltar</Button>
              {needsReload ? (
                <Button type="button" onClick={reloadPreview}>Recarregar prévia</Button>
              ) : (
                <Button
                  type="button"
                  disabled={!plan.ok || !canApply || futureDate || sending}
                  onClick={confirm}
                >
                  {sending ? "A enviar…" : failure?.uncertain ? "Repetir o mesmo pedido" : "Confirmar encontro"}
                </Button>
              )}
            </>
          )}
          {step === "result" && (
            <Button type="button" onClick={onClose}>Fechar</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CandidateTable({
  candidates,
  selected,
  onToggle,
}: {
  candidates: OffsetCandidate[];
  selected: string[];
  onToggle: (c: OffsetCandidate) => void;
}) {
  if (!candidates.length) return <p className="text-xs text-muted-foreground">Sem documentos em aberto.</p>;
  return (
    <div className="space-y-1">
      {candidates.map((c) => (
        <div key={c.id} className="rounded border p-2" data-testid="candidate-row">
          <label className="flex items-start gap-2">
            <Checkbox
              checked={selected.includes(c.id)}
              disabled={!c.eligibility.eligible}
              onCheckedChange={() => onToggle(c)}
              aria-label={c.label}
            />
            <span className="flex-1 min-w-0">
              <span className="flex flex-wrap items-center gap-1">
                <Badge variant={c.sign === "income" ? "default" : "secondary"}>{c.sign === "income" ? "Receita" : "Despesa"}</Badge>
                <span className="truncate">{c.label}</span>
                {c.invoice_ref && <span className="text-muted-foreground">· {c.invoice_ref}</span>}
                {c.event_name && <span className="text-muted-foreground">· {c.event_name}</span>}
              </span>
              <span className="block text-xs text-muted-foreground font-mono">
                bruto {formatEurCents(c.gross_cents)} · já pago {formatEurCents(c.paid_cents)} · em aberto {formatEurCents(c.open_cents)}
              </span>
              {!c.eligibility.eligible && (
                <span className="block text-xs text-destructive">
                  {c.eligibility.message ?? offsetErrorMessage(c.eligibility.code ?? "invalid_document")}
                </span>
              )}
              {c.eligibility.checklist.length > 0 && (
                <ul className="ml-4 list-disc text-xs text-muted-foreground">
                  {c.eligibility.checklist.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              )}
            </span>
          </label>
        </div>
      ))}
    </div>
  );
}

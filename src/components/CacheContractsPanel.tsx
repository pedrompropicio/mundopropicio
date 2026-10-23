import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/mock-data";
import { formatDatePT } from "@/lib/utils";
import { OverlayLayer } from "@/components/ui/overlay-layer";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, FileSignature, Plus, Wallet, X, Pencil, Ban, Link2 } from "lucide-react";
import {
  useCacheContractContext, useInvalidateCacheContracts,
  type CacheContextContract, type CacheContractContext,
} from "@/hooks/useCacheContractContext";
import { MAX_CACHE_CONTRACTS, previewContract, remainingToContract, inputToEuros, type AmountUnit, cacheErrorMessage, cachePaymentGates, type CacheStatus, previewAttachAdvance, needsBeneficiaryConfirmation, cityCapCheck, ATTACH_PROBLEM_TEXT } from "@/lib/cache-contracts";

interface Props {
  eventId: string;
  config: any;
  canEdit: boolean;
  /** Escolha inicial de linha de cachê por cidade ({event_id: forecast_id}), ex.: a linha clicada no BP. */
  initialLineChoices?: Record<string, string>;
}

const newKey = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
const errText = (e: any) => cacheErrorMessage(e);

/**
 * Contratos de pagamento do cachê (revê D15). Âncora: turnê/evento + artista; até 4 contratos que
 * dividem o cachê total por todas as cidades. Toda a gravação é feita pelas RPCs atómicas.
 */
export function CacheContractsPanel({ eventId, config, canEdit, initialLineChoices }: Props) {
  const artistId: string | null = config.supplier_id ?? null;
  const { data: ctx, isLoading, error } = useCacheContractContext(eventId, artistId);
  const [lineChoices, setLineChoices] = useState<Record<string, string>>(initialLineChoices ?? {});
  const choicesArg = Object.keys(lineChoices).length ? lineChoices : null;
  const { data: status, error: statusError } = useQuery({
    queryKey: ["cache_contract_context", "status", eventId, artistId ?? "", JSON.stringify(lineChoices)],
    enabled: !!eventId && !!artistId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("cache_contract_status" as any, {
        p_event_id: eventId, p_artist_supplier_id: artistId, p_line_choices: choicesArg,
      });
      if (error) throw error;
      return data as unknown as CacheStatus;
    },
  });
  const invalidate = useInvalidateCacheContracts();
  const [dialog, setDialog] = useState<null | { kind: "contract"; edit?: CacheContextContract } | { kind: "advance"; contract?: CacheContextContract } | { kind: "attach"; contractId?: string; advanceId?: string }>(null);

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("cancel_cache_payment_breakdown" as any, { p_contract_id: id, p_reason: "cancelado no painel" });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast({ title: "Contrato cancelado", description: "As transações foram para o Lixo (30 dias)." }); },
    onError: (e: any) => toast({ title: "Não foi possível cancelar", description: errText(e), variant: "destructive" }),
  });

  if (!artistId) {
    return (
      <div className="mx-3 mb-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
        Associe o fornecedor do artista ao cachê para poder definir os contratos de pagamento.
      </div>
    );
  }
  if (isLoading || (!status && !statusError)) return <div className="px-3 pb-3 text-xs text-muted-foreground">A carregar contratos…</div>;
  if (error || !ctx || statusError || !status) return <div className="px-3 pb-3 text-xs text-destructive">Erro ao ler os contratos: {errText(error ?? statusError)}</div>;

  const gates = cachePaymentGates(status);
  // Cidades/tetos resolvidos com as escolhas atuais (a linha de BP de cachê de cada cidade).
  const resolved = status.cities.filter((c) => c.forecast_id);
  const maxCap = Math.max(0, ...resolved.map((c) => Number(c.cap)));
  const absorberId = resolved.find((c) => Number(c.cap) === maxCap)?.event_id;
  const ctxCities = resolved.map((c) => ({ event_id: c.event_id, name: c.name, cap: Number(c.cap), is_absorber: c.event_id === absorberId }));
  const ctxView = { ...ctx, cities: ctxCities.map((c) => ({ ...c, date: null, forecast_id: "", by_role: {} })) } as CacheContractContext;

  const totalCap = ctxCities.reduce((s, c) => s + Number(c.cap), 0);
  const contracted = ctx.contracts.reduce((s, c) => s + Number(c.gross), 0);
  const freeAdv = ctx.free_advances.reduce((s, a) => s + Number(a.amount), 0);
  const remaining = remainingToContract({ totalCap, otherContractsGross: contracted, freeAdvancesNotChosen: freeAdv });
  const atLimit = ctx.contracts.length >= MAX_CACHE_CONTRACTS;
  const cityName = (id: string) => ctxCities.find((c) => c.event_id === id)?.name ?? "Cidade";

  return (
    <div className="mx-3 mb-3 rounded-lg border border-border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <FileSignature className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Passo 2 · Pagamento do cachê</span>
          <span className="text-[10px] text-muted-foreground">{ctx.contracts.length}/{MAX_CACHE_CONTRACTS}</span>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setDialog({ kind: "advance" })}
              disabled={remaining <= 0 || !gates.canFreeAdvance}
              title={!gates.canFreeAdvance && status.frozen ? "O cachê já está congelado: lance o adiantamento dentro de um contrato." : remaining <= 0 ? "Não há valor por contratar: lance o adiantamento dentro de um contrato" : undefined}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
            >
              <Wallet className="h-3.5 w-3.5" /> Adiantamento
            </button>
            <button
              onClick={() => setDialog({ kind: "contract" })}
              disabled={atLimit || !gates.canCreateContract || remaining <= 0 && ctx.free_advances.length === 0}
              title={gates.needsFreeze ? "Congele primeiro o cachê no modal; só depois pode criar o contrato de pagamento." : atLimit ? `Máximo de ${MAX_CACHE_CONTRACTS} contratos` : undefined}
              className="flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-xs text-primary hover:bg-primary/10 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Novo contrato
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3 p-3">
        {ctx.master_line_warning && (
          <div className="flex gap-2 rounded-md border border-warning/30 bg-warning/5 p-2 text-[11px] text-warning">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Existe uma linha do cachê no BP do Master da turnê. Os pagamentos usam só as linhas das cidades; essa linha não é usada.
          </div>
        )}
        {gates.needsFreeze && (
          <p className="rounded-md border border-warning/30 bg-warning/5 p-2 text-[11px] text-warning">
            Congele primeiro o cachê no modal; só depois pode criar o contrato de pagamento.
          </p>
        )}
        {gates.pending.map((c) => (
          <div key={c.event_id} className="rounded-md border border-border p-2 text-[11px]">
            <p className="mb-1 text-muted-foreground">{c.name}: há várias linhas de cachê (2.1.01). Escolha a do artista.</p>
            <select
              aria-label={`Linha de cachê em ${c.name}`}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
              value={lineChoices[c.event_id] ?? ""}
              onChange={(e) => setLineChoices((prev) => ({ ...prev, [c.event_id]: e.target.value }))}
            >
              <option value="">— escolher —</option>
              {(c.candidates ?? []).map((o) => (
                <option key={o.forecast_id} value={o.forecast_id}>{o.description ?? "Linha"} · {formatCurrency(Number(o.amount))}</option>
              ))}
            </select>
          </div>
        ))}
        {resolved.length === 0 && gates.pending.length === 0 && (
          <p className="text-xs text-warning">Não há linha de cachê (2.1.01) no BP desta cidade. Crie-a no BP ou configure o cachê.</p>
        )}

        <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
          <div className="rounded-md bg-muted/30 p-2"><p className="text-muted-foreground">Cachê efetivo</p><p className="font-mono font-semibold">{formatCurrency(totalCap)}</p></div>
          <div className="rounded-md bg-muted/30 p-2"><p className="text-muted-foreground">Contratado</p><p className="font-mono font-semibold">{formatCurrency(contracted)}</p></div>
          <div className="rounded-md bg-muted/30 p-2"><p className="text-muted-foreground">Por contratar</p><p className="font-mono font-semibold">{formatCurrency(remaining)}</p></div>
        </div>

        {ctx.contracts.map((k, i) => (
          <div key={k.id} className="rounded-md border border-border p-2 text-xs">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">Contrato {i + 1}{k.label ? ` — ${k.label}` : ""}</p>
                <p className="text-[11px] text-muted-foreground">{k.beneficiary_name}</p>
              </div>
              <span className="font-mono font-semibold">{formatCurrency(Number(k.gross))}</span>
            </div>
            <div className="mt-1 space-y-0.5 text-[11px]">
              {k.withholding_applies && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Retenção IRS {Number(k.withholding_rate)}% (venc. {k.withholding_due_date})</span>
                  <span className="font-mono">− {formatCurrency(Number(k.withholding_amount))}</span>
                </div>
              )}
              {Number(k.advances_amount) > 0 && (
                <div className="flex justify-between text-muted-foreground"><span>Adiantamentos</span><span className="font-mono">− {formatCurrency(Number(k.advances_amount))}</span></div>
              )}
              <div className="flex justify-between font-medium">
                <span>Saldo ao artista</span>
                <span className="font-mono">
                  {formatCurrency(Number(k.artist_mother?.amount ?? 0))}
                  {k.artist_mother && Number(k.artist_mother.paid) > 0 && <span className="text-success"> · pago {formatCurrency(Number(k.artist_mother.paid))}</span>}
                </span>
              </div>
            </div>
            {canEdit && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button onClick={() => setDialog({ kind: "advance", contract: k })} disabled={!k.artist_mother}
                  className="flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[11px] hover:bg-muted disabled:opacity-50">
                  <Wallet className="h-3 w-3" /> Adiantamento
                </button>
                {ctx.free_advances.length > 0 && (
                  <button onClick={() => setDialog({ kind: "attach", contractId: k.id })} disabled={!k.artist_mother}
                    title={!k.artist_mother ? "Este contrato já não tem saldo ao artista" : undefined}
                    className="flex items-center gap-1 rounded border border-primary/30 px-2 py-0.5 text-[11px] text-primary hover:bg-primary/5 disabled:opacity-50">
                    <Link2 className="h-3 w-3" /> Ligar adiantamento
                  </button>
                )}
                <button onClick={() => setDialog({ kind: "contract", edit: k })} disabled={k.has_payment}
                  title={k.has_payment ? "Já há pagamento: estorne primeiro pelos fluxos normais" : undefined}
                  className="flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[11px] hover:bg-muted disabled:opacity-50">
                  <Pencil className="h-3 w-3" /> Alterar
                </button>
                <button
                  onClick={() => { if (window.confirm("Cancelar este contrato? As transações vão para o Lixo e os adiantamentos ficam livres.")) cancelMutation.mutate(k.id); }}
                  disabled={k.has_payment || cancelMutation.isPending}
                  title={k.has_payment ? "Já há pagamento: estorne primeiro pelos fluxos normais" : undefined}
                  className="flex items-center gap-1 rounded border border-destructive/30 px-2 py-0.5 text-[11px] text-destructive hover:bg-destructive/5 disabled:opacity-50">
                  <Ban className="h-3 w-3" /> Cancelar
                </button>
              </div>
            )}
          </div>
        ))}

        {ctx.free_advances.length > 0 && (
          <div className="rounded-md border border-dashed border-border p-2 text-[11px]">
            <p className="mb-1 font-medium text-muted-foreground">Adiantamentos sem contrato</p>
            {ctx.free_advances.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]" title={a.description}>{a.description}{a.legacy ? ` · ${Object.keys(a.by_city).map(cityName).join(", ")}` : ""}</span>
                <span className="font-mono shrink-0">{formatCurrency(Number(a.amount))}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {dialog?.kind === "contract" && (
        <ContractDialog ctx={ctxView} eventId={eventId} config={config} edit={dialog.edit} lineChoices={choicesArg}
          onAttachExisting={(advanceId) => setDialog({ kind: "attach", advanceId })}
          onClose={() => setDialog(null)} onDone={() => { setDialog(null); invalidate(); }} />
      )}
      {dialog?.kind === "attach" && (
        <AttachAdvanceDialog ctx={ctx} cityName={cityName} initialContractId={dialog.contractId} initialAdvanceId={dialog.advanceId}
          onClose={() => setDialog(null)} onDone={() => { setDialog(null); invalidate(); }} />
      )}
      {dialog?.kind === "advance" && (
        <AdvanceDialog eventId={eventId} config={config} contract={dialog.contract} remaining={remaining} totalCap={totalCap} lineChoices={choicesArg}
          onClose={() => setDialog(null)} onDone={() => { setDialog(null); invalidate(); }} />
      )}
    </div>
  );
}

function Shell({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <OverlayLayer className="modal-safe-overlay fixed inset-0 flex items-center justify-center bg-background/80">
      <div className="manual-modal-shell w-full max-w-lg rounded-xl border border-border bg-card shadow-xl flex flex-col">
        <div className="manual-modal-header flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
          <h3 className="font-semibold text-foreground">{title}</h3>
          <button onClick={onClose} aria-label="Fechar" className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-5">{children}</div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3 shrink-0">{footer}</div>
      </div>
    </OverlayLayer>
  );
}

function useSupplierOptions() {
  const { data = [] } = useQuery({
    queryKey: ["suppliers-active-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  return useMemo(() => data.map((s: any) => ({ value: s.id, label: s.name })), [data]);
}

function ContractDialog({ ctx, eventId, config, edit, lineChoices, onAttachExisting, onClose, onDone }: {
  ctx: CacheContractContext; eventId: string; config: any; edit?: CacheContextContract; lineChoices: Record<string, string> | null;
  onAttachExisting: (advanceId: string) => void; onClose: () => void; onDone: () => void;
}) {
  const supplierOptions = useSupplierOptions();
  const [key] = useState(newKey);
  const [label, setLabel] = useState(edit?.label ?? "");
  const [beneficiary, setBeneficiary] = useState<string>(edit?.beneficiary_supplier_id ?? config.supplier_id ?? "");
  const [gross, setGross] = useState(edit ? String(edit.gross) : "");
  const [grossUnit, setGrossUnit] = useState<AmountUnit>("eur");
  // Pergunta obrigatória, sem resposta pré-marcada.
  const [wh, setWh] = useState<null | boolean>(edit ? edit.withholding_applies : null);
  const defaultRate = config.withholding_rate != null ? Number(config.withholding_rate) : 25;
  const [rate, setRate] = useState(String(edit?.withholding_rate ?? defaultRate));
  const [whDue, setWhDue] = useState(edit?.withholding_due_date ?? "");
  const [artistDue, setArtistDue] = useState(edit?.artist_due_date ?? "");
  const [chosen, setChosen] = useState<string[]>(edit?.advance_ids ?? []);
  const [rateConfirmed, setRateConfirmed] = useState(false);

  // Adiantamentos disponíveis: livres + (ao alterar) os deste contrato.
  const { data: editAdvances = [] } = useQuery({
    queryKey: ["cache-contract-advances", edit?.id],
    enabled: !!edit && edit.advance_ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions").select("id, description, amount, event_id").in("id", edit!.advance_ids).limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: childAdv = [] } = useQuery({
    queryKey: ["cache-contract-advance-children", edit?.id],
    enabled: !!edit && edit.advance_ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions").select("parent_transaction_id, event_id, amount").in("parent_transaction_id", edit!.advance_ids).limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });
  const options = useMemo(() => {
    const list = ctx.free_advances.map((a) => ({ id: a.id, description: a.description, amount: Number(a.amount), by_city: a.by_city }));
    for (const a of editAdvances as any[]) {
      const kids = (childAdv as any[]).filter((c) => c.parent_transaction_id === a.id);
      const by_city: Record<string, number> = kids.length
        ? Object.fromEntries(kids.map((k) => [k.event_id, Number(k.amount)]))
        : { [a.event_id]: Number(a.amount) };
      list.push({ id: a.id, description: a.description, amount: Number(a.amount), by_city });
    }
    return list;
  }, [ctx.free_advances, editAdvances, childAdv]);

  const otherGross = ctx.contracts.filter((k) => k.id !== edit?.id).reduce((s, k) => s + Number(k.gross), 0);
  const totalCap = ctx.cities.reduce((s, c) => s + Number(c.cap), 0);
  const freeNotChosen = options.filter((a) => !chosen.includes(a.id)).reduce((s, a) => s + a.amount, 0);
  const remaining = remainingToContract({ totalCap, otherContractsGross: otherGross, freeAdvancesNotChosen: freeNotChosen });

  const advancesByCity = useMemo(() => {
    const out: Record<string, number> = {};
    for (const a of options.filter((o) => chosen.includes(o.id))) {
      for (const [ev, v] of Object.entries(a.by_city)) out[ev] = (out[ev] ?? 0) + Number(v);
    }
    return out;
  }, [options, chosen]);

  const grossNum = inputToEuros(gross, grossUnit, totalCap);
  const rateNum = Number(String(rate).replace(",", "."));
  const preview = grossNum > 0 && ctx.cities.length > 0
    ? previewContract({ cities: ctx.cities.map((c) => ({ ...c, cap: Number(c.cap) })), gross: grossNum, withholdingRate: wh ? rateNum : null, advancesByCity })
    : null;
  const rateDiffers = wh === true && rateNum !== defaultRate;

  const problems: string[] = [];
  if (!beneficiary) problems.push("Escolha o beneficiário.");
  if (!(grossNum > 0)) problems.push("Indique o valor bruto.");
  if (grossNum > remaining + 0.005) problems.push(`O bruto excede o restante por contratar (${formatCurrency(remaining)}).`);
  if (wh === null) problems.push("Responda à pergunta da retenção IRS.");
  if (wh && !(rateNum > 0 && rateNum < 100)) problems.push("Taxa de retenção inválida.");
  if (wh && !whDue) problems.push("Indique o vencimento da retenção.");
  if (rateDiffers && !rateConfirmed) problems.push("Confirme a taxa diferente da configurada.");
  // Aviso de teto por cidade (#346): adiantamentos livres por marcar + quotas ativas + quota deste contrato.
  const capCheck = useMemo(() => {
    if (!preview) return null;
    const otherQuotasByCity: Record<string, number> = {};
    for (const k of ctx.contracts.filter((x) => x.id !== edit?.id)) for (const cc of k.cities ?? []) otherQuotasByCity[cc.event_id] = (otherQuotasByCity[cc.event_id] ?? 0) + Number(cc.quota);
    const freeNotChosenByCity: Record<string, number> = {};
    for (const a of options.filter((o) => !chosen.includes(o.id))) for (const [ev, v] of Object.entries(a.by_city)) freeNotChosenByCity[ev] = (freeNotChosenByCity[ev] ?? 0) + Number(v);
    return cityCapCheck({
      cities: ctx.cities.map((c) => ({ event_id: c.event_id, name: c.name, cap: Number(c.cap) })),
      otherQuotasByCity, freeNotChosenByCity,
      newQuotaByCity: Object.fromEntries(preview.cities.map((c) => [c.event_id, c.quota])),
    });
  }, [preview, ctx.contracts, ctx.cities, options, chosen, edit?.id]);
  const capBlocking = !!capCheck && capCheck.exceeding.length > 0;
  const blockingAdvances = capBlocking
    ? options.filter((o) => !chosen.includes(o.id) && Object.keys(o.by_city).some((ev) => capCheck!.exceeding.some((x) => x.event_id === ev)))
    : [];
  if (capBlocking) problems.push(`${capCheck!.exceeding.map((x) => x.name).join(", ")} passaria do teto da cidade por causa de adiantamentos livres.`);
  for (const n of preview?.negative ?? []) problems.push(`Em ${n.name} os adiantamentos excedem a quota líquida (saldo ${formatCurrency(n.artistBalance)}).`);

  const save = useMutation({
    mutationFn: async () => {
      const common = {
        p_beneficiary_supplier_id: beneficiary, p_gross: grossNum, p_withholding_applies: wh,
        p_withholding_rate: wh ? rateNum : null, p_withholding_due_date: wh ? whDue : null,
        p_artist_due_date: artistDue || null, p_advance_ids: chosen, p_label: label || null,
      };
      const { error } = edit
        ? await supabase.rpc("update_cache_payment_contract" as any, { p_contract_id: edit.id, ...common })
        : await supabase.rpc("create_cache_payment_contract" as any, { p_event_id: eventId, p_artist_supplier_id: config.supplier_id, ...common, p_idempotency_key: key, p_line_choices: lineChoices });
      if (error) throw error;
    },
    onSuccess: () => { toast({ title: edit ? "Contrato alterado" : "Contrato criado" }); onDone(); },
    onError: (e: any) => toast({ title: "Não foi possível gravar", description: errText(e), variant: "destructive" }),
  });

  return (
    <Shell title={edit ? "Alterar contrato" : "Novo contrato de pagamento"} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm">Fechar</button>
        <button onClick={() => save.mutate()} disabled={problems.length > 0 || save.isPending}
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">
          {save.isPending ? "A gravar…" : edit ? "Gravar alteração" : "Criar contrato"}
        </button>
      </>}>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Descrição (ex.: Artístico, Co-produção)</label>
        <input value={label} onChange={(e) => setLabel(e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Beneficiário</label>
        <SearchableSelect options={supplierOptions} value={beneficiary} onValueChange={setBeneficiary} placeholder="Selecionar…" />
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted-foreground">Valor bruto (categoria 2.1.01, IVA 0)</label>
          <button type="button" onClick={() => { setGrossUnit("eur"); setGross(remaining.toFixed(2)); }} className="text-[11px] text-primary hover:underline">
            Usar o restante por contratar ({formatCurrency(remaining)})
          </button>
        </div>
        <AmountWithUnit value={gross} unit={grossUnit} onValue={setGross} onUnit={setGrossUnit} euros={grossNum} baseLabel={`do cachê efetivo (${formatCurrency(totalCap)})`} />
      </div>

      <div className="space-y-2 rounded-md border border-border p-3">
        <p className="text-xs font-medium">Aplica retenção IRS (artista não residente)?</p>
        <div className="flex gap-4 text-sm" role="radiogroup">
          <label className="flex items-center gap-1.5"><input type="radio" name="wh" checked={wh === true} onChange={() => setWh(true)} /> Sim</label>
          <label className="flex items-center gap-1.5"><input type="radio" name="wh" checked={wh === false} onChange={() => setWh(false)} /> Não</label>
        </div>
        {wh && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Taxa %</label>
              <input inputMode="decimal" value={rate} onChange={(e) => { setRate(e.target.value); setRateConfirmed(false); }}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Vencimento da retenção</label>
              <DatePicker value={whDue} onChange={(v: any) => setWhDue(v ?? "")} />
              {artistDue && !whDue && (
                <button type="button" onClick={() => setWhDue(artistDue)} className="text-[11px] text-primary hover:underline">Usar a data do artista ({artistDue})</button>
              )}
            </div>
            {rateDiffers && (
              <label className="col-span-2 flex items-center gap-2 text-[11px] text-warning">
                <Checkbox checked={rateConfirmed} onCheckedChange={(v) => setRateConfirmed(!!v)} />
                A taxa é diferente da configurada no cachê ({defaultRate}%). Confirmo.
              </label>
            )}
          </div>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Vencimento do saldo ao artista</label>
        <DatePicker value={artistDue} onChange={(v: any) => setArtistDue(v ?? "")} />
      </div>

      {options.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Adiantamentos a abater (cada um só num contrato, pelo valor total)</p>
          {options.map((a) => (
            <label key={a.id} className="flex min-w-0 items-start justify-between gap-2 rounded border border-border px-2 py-1 text-xs">
              <span className="flex min-w-0 flex-1 items-start gap-2">
                <Checkbox checked={chosen.includes(a.id)} onCheckedChange={(v) => setChosen((s) => v ? [...s, a.id] : s.filter((x) => x !== a.id))} className="mt-0.5 shrink-0" />
                <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]" title={a.description}>{a.description}</span>
              </span>
              <span className="shrink-0 font-mono whitespace-nowrap">{formatCurrency(a.amount)}</span>
            </label>
          ))}
        </div>
      )}

      {preview && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-[11px]">
            <thead><tr className="bg-muted/40 text-muted-foreground">
              <th className="px-2 py-1 text-left">Cidade</th><th className="px-2 py-1 text-right">Quota</th>
              <th className="px-2 py-1 text-right">Retenção</th><th className="px-2 py-1 text-right">Adiant.</th><th className="px-2 py-1 text-right">Saldo</th>
            </tr></thead>
            <tbody>
              {preview.cities.map((c) => (
                <tr key={c.event_id} className={c.artistBalance < 0 ? "text-destructive" : ""}>
                  <td className="px-2 py-1">{c.name}</td><td className="px-2 py-1 text-right font-mono">{formatCurrency(c.quota)}</td>
                  <td className="px-2 py-1 text-right font-mono">{formatCurrency(c.withholding)}</td>
                  <td className="px-2 py-1 text-right font-mono">{formatCurrency(c.advances)}</td>
                  <td className="px-2 py-1 text-right font-mono">{formatCurrency(c.artistBalance)}</td>
                </tr>
              ))}
              <tr className="border-t border-border font-semibold">
                <td className="px-2 py-1">Total</td><td className="px-2 py-1 text-right font-mono">{formatCurrency(preview.gross)}</td>
                <td className="px-2 py-1 text-right font-mono">{formatCurrency(preview.withholding)}</td>
                <td className="px-2 py-1 text-right font-mono">{formatCurrency(preview.advances)}</td>
                <td className="px-2 py-1 text-right font-mono">{formatCurrency(preview.artistBalance)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {capBlocking && capCheck && (
        <div role="alert" className="space-y-2 rounded-md border border-warning/40 bg-warning/5 p-2 text-[11px]">
          <p className="font-medium text-warning">Há adiantamentos livres que ocupam o teto de uma cidade. Ligue-os a um contrato ou marque-os neste.</p>
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="text-muted-foreground">
              <th className="text-left">Cidade</th><th className="text-right">Teto</th><th className="text-right">Contratos</th>
              <th className="text-right">Adiant. livres</th><th className="text-right">Espaço livre</th><th className="text-right">Este contrato</th>
            </tr></thead>
            <tbody>
              {capCheck.rows.map((r) => (
                <tr key={r.event_id} className={r.exceeds ? "font-semibold text-destructive" : ""}>
                  <td>{r.name}</td><td className="text-right font-mono">{formatCurrency(r.cap)}</td>
                  <td className="text-right font-mono">{formatCurrency(r.otherQuotas)}</td><td className="text-right font-mono">{formatCurrency(r.freeAdvances)}</td>
                  <td className="text-right font-mono">{formatCurrency(r.room)}</td><td className="text-right font-mono">{formatCurrency(r.newQuota)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {blockingAdvances.map((a) => (
            <div key={a.id} className="flex flex-wrap items-start justify-between gap-2 rounded border border-border px-2 py-1">
              <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]" title={a.description}>{a.description} · {formatCurrency(a.amount)}</span>
              <span className="flex shrink-0 gap-2">
                {!edit && ctx.contracts.length > 0 && (
                  <button type="button" onClick={() => onAttachExisting(a.id)} className="shrink-0 rounded border border-primary/30 px-2 py-0.5 text-primary hover:bg-primary/5">Ligar a um contrato existente</button>
                )}
                <button type="button" onClick={() => setChosen((s) => [...s, a.id])} className="shrink-0 rounded border border-border px-2 py-0.5 hover:bg-muted">Marcar neste contrato</button>
              </span>
            </div>
          ))}
        </div>
      )}
      {problems.length > 0 && (
        <ul className="space-y-0.5 text-[11px] text-warning">{problems.map((p) => <li key={p}>• {p}</li>)}</ul>
      )}
    </Shell>
  );
}

function AdvanceDialog({ eventId, config, contract, remaining, totalCap, lineChoices, onClose, onDone }: {
  eventId: string; config: any; contract?: CacheContextContract; remaining: number; totalCap: number; lineChoices: Record<string, string> | null; onClose: () => void; onDone: () => void;
}) {
  const [key] = useState(newKey);
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<AmountUnit>("eur");
  const [due, setDue] = useState("");
  const [desc, setDesc] = useState("");
  const max = contract ? Number(contract.artist_mother?.amount ?? 0) - Number(contract.artist_mother?.paid ?? 0) : remaining;
  // % sobre o cachê efetivo; dentro de contrato, sobre o saldo disponível.
  const pctBase = contract ? max : totalCap;
  const n = inputToEuros(amount, unit, pctBase);
  const problem = !(n > 0) ? "Indique o valor." : n > max + 0.005 ? `Máximo ${formatCurrency(max)}.` : null;

  const save = useMutation({
    mutationFn: async () => {
      const { error } = contract
        ? await supabase.rpc("add_cache_contract_advance" as any, { p_contract_id: contract.id, p_amount: n, p_due_date: due || null, p_description: desc || null, p_idempotency_key: key })
        : await supabase.rpc("create_cache_advance" as any, { p_event_id: eventId, p_artist_supplier_id: config.supplier_id, p_supplier_id: config.supplier_id, p_amount: n, p_due_date: due || null, p_description: desc || null, p_idempotency_key: key, p_line_choices: lineChoices });
      if (error) throw error;
    },
    onSuccess: () => { toast({ title: "Adiantamento lançado", description: "Pague-o pelo fluxo normal, com a conta." }); onDone(); },
    onError: (e: any) => toast({ title: "Não foi possível lançar", description: errText(e), variant: "destructive" }),
  });

  return (
    <Shell title={contract ? "Adiantamento dentro do contrato" : "Adiantamento (antes dos contratos)"} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm">Fechar</button>
        <button onClick={() => save.mutate()} disabled={!!problem || save.isPending} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">
          {save.isPending ? "A gravar…" : "Lançar"}
        </button>
      </>}>
      <p className="text-xs text-muted-foreground">
        {contract
          ? "Reduz o saldo ao artista deste contrato (o bruto não muda) e reparte-se pelas cidades na proporção do saldo."
          : "Reparte-se pelas cidades na proporção do cachê. Será escolhido ao criar o contrato e abatido pelo valor total."}
      </p>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Valor (máx. {formatCurrency(max)})</label>
        <AmountWithUnit value={amount} unit={unit} onValue={setAmount} onUnit={setUnit} euros={n}
          baseLabel={contract ? `do saldo disponível (${formatCurrency(pctBase)})` : `do cachê efetivo (${formatCurrency(pctBase)})`} />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Descrição</label>
        <input value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Vencimento</label>
        <DatePicker value={due} onChange={(v: any) => setDue(v ?? "")} />
      </div>
      {problem && <p className="text-[11px] text-warning">{problem}</p>}
    </Shell>
  );
}

/** Campo de valor com escolha € / %. Grava sempre euros (calculados e arredondados a 2 casas). */
function AmountWithUnit({ value, unit, onValue, onUnit, euros, baseLabel }: {
  value: string; unit: AmountUnit; onValue: (v: string) => void; onUnit: (u: AmountUnit) => void; euros: number; baseLabel: string;
}) {
  const btn = (u: AmountUnit, txt: string) => (
    <button type="button" aria-pressed={unit === u} onClick={() => { if (u !== unit) { onUnit(u); onValue(""); } }}
      className={`px-2 py-1 text-xs ${unit === u ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{txt}</button>
  );
  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <input inputMode="decimal" value={value} onChange={(e) => onValue(e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-sm" />
        <div className="flex overflow-hidden rounded-md border border-border" role="group" aria-label="Unidade do valor">
          {btn("eur", "€")}{btn("pct", "%")}
        </div>
      </div>
      {unit === "pct" && (
        <p className="text-[11px] text-muted-foreground">
          {Number.isFinite(euros) ? `${value}% ${baseLabel} = ${formatCurrency(euros)}` : "Indique uma percentagem entre 0 e 100."}
        </p>
      )}
    </div>
  );
}

function AttachAdvanceDialog({ ctx, cityName, initialContractId, initialAdvanceId, onClose, onDone }: {
  ctx: CacheContractContext; cityName: (id: string) => string; initialContractId?: string; initialAdvanceId?: string; onClose: () => void; onDone: () => void;
}) {
  const contracts = ctx.contracts.filter((k) => !!k.artist_mother);
  const [contractId, setContractId] = useState<string>(initialContractId ?? (contracts.length === 1 ? contracts[0].id : ""));
  const [advanceId, setAdvanceId] = useState<string>(initialAdvanceId ?? (ctx.free_advances.length === 1 ? ctx.free_advances[0].id : ""));
  const [confirmBen, setConfirmBen] = useState(false);
  const contract = ctx.contracts.find((k) => k.id === contractId);
  const advance = ctx.free_advances.find((a) => a.id === advanceId);
  const motherId = contract?.artist_mother?.id ?? null;

  const { data: dates = {} } = useQuery({
    queryKey: ["cache-free-advance-dates", ctx.free_advances.map((a) => a.id).join(",")],
    enabled: ctx.free_advances.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions").select("id, date").in("id", ctx.free_advances.map((a) => a.id)).limit(500);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((t: any) => [t.id, t.date as string | null]));
    },
  });
  // Filhas do saldo (pago por cidade) e presença em listas não rejeitadas — a RPC volta a validar tudo.
  const { data: state } = useQuery({
    queryKey: ["cache-attach-state", motherId],
    enabled: !!motherId,
    queryFn: async () => {
      const { data: kids, error } = await supabase.from("transactions").select("id, event_id, amount, paid_amount").eq("parent_transaction_id", motherId!).limit(1000);
      if (error) throw error;
      const ids = [motherId!, ...(kids ?? []).map((k: any) => k.id)];
      const { data: items, error: e2 } = await supabase.from("payment_list_items")
        .select("transaction_id, removed_at, payment_lists!inner(status)").in("transaction_id", ids).is("removed_at", null).limit(1000);
      if (e2) throw e2;
      const inList = (items ?? []).some((i: any) => i.payment_lists?.status !== "rejected");
      return { kids: (kids ?? []) as any[], inList };
    },
  });

  const preview = contract && advance && state
    ? previewAttachAdvance({
        advanceByCity: advance.by_city,
        cities: (contract.cities ?? []).map((cc) => {
          const kid = state.kids.find((k) => k.event_id === cc.event_id);
          return { event_id: cc.event_id, balance: Number(kid?.amount ?? 0), paid: Number(kid?.paid_amount ?? 0) };
        }),
        contractAdvances: Number(contract.advances_amount),
        hasArtistMother: !!contract.artist_mother,
        motherAmount: Number(contract.artist_mother?.amount ?? 0),
        motherPaid: Number(contract.artist_mother?.paid ?? 0),
        inPaymentList: state.inList,
      })
    : null;
  const benDiffers = !!contract && !!advance && needsBeneficiaryConfirmation(advance.supplier_id, contract.beneficiary_supplier_id);
  const blocked = !preview || preview.problems.length > 0 || (benDiffers && !confirmBen);

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("attach_cache_advance_to_contract" as any, {
        p_contract_id: contractId, p_advance_tx_id: advanceId, p_confirm_beneficiary: benDiffers && confirmBen,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (r) => {
      toast(r?.already_attached
        ? { title: "Já estava ligado", description: "O adiantamento já pertencia a este contrato." }
        : { title: "Adiantamento ligado", description: `Abatido ${formatCurrency(Number(r?.amount ?? 0))} ao saldo do contrato.` });
      onDone();
    },
    onError: (e: any) => toast({ title: "Não foi possível ligar", description: errText(e), variant: "destructive" }),
  });

  return (
    <Shell title="Ligar adiantamento ao contrato" onClose={onClose}
      footer={<>
        <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm">Fechar</button>
        <button onClick={() => save.mutate()} disabled={blocked || save.isPending}
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">
          {save.isPending ? "A ligar…" : "Ligar adiantamento"}
        </button>
      </>}>
      <p className="text-xs text-muted-foreground">
        O adiantamento passa a contar como pagamento por conta deste contrato: abate ao saldo da cidade onde foi lançado. O bruto, a retenção e os outros contratos não mudam.
      </p>
      {!initialContractId && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Contrato</label>
          <select aria-label="Contrato" value={contractId} onChange={(e) => { setContractId(e.target.value); setConfirmBen(false); }}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm">
            <option value="">— escolher —</option>
            {contracts.map((k) => (
              <option key={k.id} value={k.id}>Contrato {ctx.contracts.indexOf(k) + 1}{k.label ? ` — ${k.label}` : ""} · {k.beneficiary_name} · {formatCurrency(Number(k.gross))}</option>
            ))}
          </select>
        </div>
      )}
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Adiantamentos livres</p>
        {ctx.free_advances.map((a) => (
          <label key={a.id} className={`flex cursor-pointer items-start gap-2 rounded border px-2 py-1 text-xs ${a.id === advanceId ? "border-primary bg-primary/5" : "border-border"}`}>
            <input type="radio" name="attach-adv" checked={a.id === advanceId} onChange={() => { setAdvanceId(a.id); setConfirmBen(false); }} className="mt-0.5 shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block break-words [overflow-wrap:anywhere] font-medium" title={a.description ?? undefined}>{a.description ?? "Adiantamento"}</span>
              <span className="block break-words [overflow-wrap:anywhere] text-[11px] text-muted-foreground">
                {(dates as any)[a.id] ? formatDatePT((dates as any)[a.id]) : "sem data"} · {Object.keys(a.by_city).map(cityName).join(", ")} · {a.supplier_name ?? "—"}
              </span>
            </span>
            <span className="shrink-0 whitespace-nowrap text-right">
              <span className="block font-mono">{formatCurrency(Number(a.amount))}</span>
              <span className={`block text-[10px] ${Number(a.paid) >= Number(a.amount) - 0.005 ? "text-success" : "text-muted-foreground"}`}>
                {Number(a.paid) >= Number(a.amount) - 0.005 ? "pago" : "por pagar"}
              </span>
            </span>
          </label>
        ))}
      </div>
      {preview && contract && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-[11px]">
            <thead><tr className="bg-muted/40 text-muted-foreground">
              <th className="px-2 py-1 text-left">Cidade</th><th className="px-2 py-1 text-right">Saldo antes</th><th className="px-2 py-1 text-right">Saldo depois</th>
            </tr></thead>
            <tbody>
              {preview.cities.map((r) => (
                <tr key={r.event_id} className={r.after < 0 ? "text-destructive" : ""}>
                  <td className="px-2 py-1">{cityName(r.event_id)}</td>
                  <td className="px-2 py-1 text-right font-mono">{formatCurrency(r.before)}</td>
                  <td className="px-2 py-1 text-right font-mono">{formatCurrency(r.after)}</td>
                </tr>
              ))}
              <tr className="border-t border-border">
                <td className="px-2 py-1">Adiantamentos do contrato</td>
                <td className="px-2 py-1 text-right font-mono">{formatCurrency(preview.advancesBefore)}</td>
                <td className="px-2 py-1 text-right font-mono">{formatCurrency(preview.advancesAfter)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {preview && preview.problems.length > 0 && (
        <ul role="alert" className="space-y-0.5 text-[11px] text-destructive">{preview.problems.map((p) => <li key={p}>• {ATTACH_PROBLEM_TEXT[p]}</li>)}</ul>
      )}
      {benDiffers && contract && advance && (
        <div className="space-y-1 rounded-md border border-warning/40 bg-warning/5 p-2 text-[11px]">
          <p className="text-warning">
            O beneficiário do contrato é <strong>{contract.beneficiary_name ?? "—"}</strong>, mas o adiantamento foi pago a <strong>{advance.supplier_name ?? "—"}</strong>.
          </p>
          <label className="flex items-center gap-2">
            <Checkbox checked={confirmBen} onCheckedChange={(v) => setConfirmBen(!!v)} />
            Confirmo que este adiantamento conta para este contrato
          </label>
        </div>
      )}
    </Shell>
  );
}

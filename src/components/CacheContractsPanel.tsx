import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/mock-data";
import { OverlayLayer } from "@/components/ui/overlay-layer";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, FileSignature, Plus, Wallet, X, Pencil, Ban } from "lucide-react";
import {
  useCacheContractContext, useInvalidateCacheContracts,
  type CacheContextContract, type CacheContractContext,
} from "@/hooks/useCacheContractContext";
import { MAX_CACHE_CONTRACTS, previewContract, remainingToContract } from "@/lib/cache-contracts";

interface Props {
  eventId: string;
  config: any;
  canEdit: boolean;
}

const newKey = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
const errText = (e: any) => String(e?.message ?? e).replace(/^[a-z_]+: /, "");

/**
 * Contratos de pagamento do cachê (revê D15). Âncora: turnê/evento + artista; até 4 contratos que
 * dividem o cachê total por todas as cidades. Toda a gravação é feita pelas RPCs atómicas.
 */
export function CacheContractsPanel({ eventId, config, canEdit }: Props) {
  const artistId: string | null = config.supplier_id ?? null;
  const { data: ctx, isLoading, error } = useCacheContractContext(eventId, artistId);
  const invalidate = useInvalidateCacheContracts();
  const [dialog, setDialog] = useState<null | { kind: "contract"; edit?: CacheContextContract } | { kind: "advance"; contract?: CacheContextContract }>(null);

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
  if (isLoading) return <div className="px-3 pb-3 text-xs text-muted-foreground">A carregar contratos…</div>;
  if (error || !ctx) return <div className="px-3 pb-3 text-xs text-destructive">Erro ao ler os contratos: {errText(error)}</div>;

  const totalCap = ctx.cities.reduce((s, c) => s + Number(c.cap), 0);
  const contracted = ctx.contracts.reduce((s, c) => s + Number(c.gross), 0);
  const freeAdv = ctx.free_advances.reduce((s, a) => s + Number(a.amount), 0);
  const remaining = remainingToContract({ totalCap, otherContractsGross: contracted, freeAdvancesNotChosen: freeAdv });
  const atLimit = ctx.contracts.length >= MAX_CACHE_CONTRACTS;
  const cityName = (id: string) => ctx.cities.find((c) => c.event_id === id)?.name ?? "Cidade";

  return (
    <div className="mx-3 mb-3 rounded-lg border border-border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <FileSignature className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contratos de pagamento</span>
          <span className="text-[10px] text-muted-foreground">{ctx.contracts.length}/{MAX_CACHE_CONTRACTS}</span>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setDialog({ kind: "advance" })}
              disabled={remaining <= 0}
              title={remaining <= 0 ? "Não há valor por contratar: lance o adiantamento dentro de um contrato" : undefined}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
            >
              <Wallet className="h-3.5 w-3.5" /> Adiantamento
            </button>
            <button
              onClick={() => setDialog({ kind: "contract" })}
              disabled={atLimit || remaining <= 0 && ctx.free_advances.length === 0}
              title={atLimit ? `Máximo de ${MAX_CACHE_CONTRACTS} contratos` : undefined}
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
        {ctx.cities.length === 0 && (
          <p className="text-xs text-warning">Falta a linha do cachê no BP das cidades. Sincronize o cachê antes de definir contratos.</p>
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
              <div key={a.id} className="flex justify-between gap-2">
                <span className="truncate">{a.description}{a.legacy ? ` · ${Object.keys(a.by_city).map(cityName).join(", ")}` : ""}</span>
                <span className="font-mono shrink-0">{formatCurrency(Number(a.amount))}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {dialog?.kind === "contract" && (
        <ContractDialog ctx={ctx} eventId={eventId} config={config} edit={dialog.edit}
          onClose={() => setDialog(null)} onDone={() => { setDialog(null); invalidate(); }} />
      )}
      {dialog?.kind === "advance" && (
        <AdvanceDialog eventId={eventId} config={config} contract={dialog.contract} remaining={remaining}
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
        <div className="p-5 space-y-4 overflow-y-auto flex-1">{children}</div>
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

function ContractDialog({ ctx, eventId, config, edit, onClose, onDone }: {
  ctx: CacheContractContext; eventId: string; config: any; edit?: CacheContextContract; onClose: () => void; onDone: () => void;
}) {
  const supplierOptions = useSupplierOptions();
  const [key] = useState(newKey);
  const [label, setLabel] = useState(edit?.label ?? "");
  const [beneficiary, setBeneficiary] = useState<string>(edit?.beneficiary_supplier_id ?? config.supplier_id ?? "");
  const [gross, setGross] = useState(edit ? String(edit.gross) : "");
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

  const grossNum = Number(String(gross).replace(",", "."));
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
        : await supabase.rpc("create_cache_payment_contract" as any, { p_event_id: eventId, p_artist_supplier_id: config.supplier_id, ...common, p_idempotency_key: key });
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
          <button type="button" onClick={() => setGross(remaining.toFixed(2))} className="text-[11px] text-primary hover:underline">
            Usar o restante por contratar ({formatCurrency(remaining)})
          </button>
        </div>
        <input inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-sm" />
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
            <label key={a.id} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1 text-xs">
              <span className="flex items-center gap-2">
                <Checkbox checked={chosen.includes(a.id)} onCheckedChange={(v) => setChosen((s) => v ? [...s, a.id] : s.filter((x) => x !== a.id))} />
                <span className="truncate">{a.description}</span>
              </span>
              <span className="font-mono">{formatCurrency(a.amount)}</span>
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
      {problems.length > 0 && (
        <ul className="space-y-0.5 text-[11px] text-warning">{problems.map((p) => <li key={p}>• {p}</li>)}</ul>
      )}
    </Shell>
  );
}

function AdvanceDialog({ eventId, config, contract, remaining, onClose, onDone }: {
  eventId: string; config: any; contract?: CacheContextContract; remaining: number; onClose: () => void; onDone: () => void;
}) {
  const [key] = useState(newKey);
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState("");
  const [desc, setDesc] = useState("");
  const max = contract ? Number(contract.artist_mother?.amount ?? 0) - Number(contract.artist_mother?.paid ?? 0) : remaining;
  const n = Number(String(amount).replace(",", "."));
  const problem = !(n > 0) ? "Indique o valor." : n > max + 0.005 ? `Máximo ${formatCurrency(max)}.` : null;

  const save = useMutation({
    mutationFn: async () => {
      const { error } = contract
        ? await supabase.rpc("add_cache_contract_advance" as any, { p_contract_id: contract.id, p_amount: n, p_due_date: due || null, p_description: desc || null, p_idempotency_key: key })
        : await supabase.rpc("create_cache_advance" as any, { p_event_id: eventId, p_artist_supplier_id: config.supplier_id, p_supplier_id: config.supplier_id, p_amount: n, p_due_date: due || null, p_description: desc || null, p_idempotency_key: key });
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
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-sm" />
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

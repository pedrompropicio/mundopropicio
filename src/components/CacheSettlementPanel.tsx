import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/mock-data";
import { Calculator, TrendingUp, TrendingDown, Minus, CheckCircle2, Unlock, AlertTriangle, ChevronDown, ChevronUp, FileText, Wallet } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import type { RealCacheResult } from "@/hooks/useRealCacheCalculation";
import { CacheTransactionModal } from "@/components/CacheTransactionModal";
import { getCacheEffectiveAmount } from "@/lib/cache-pl-helper";

interface Props {
  config: any;
  realResult: RealCacheResult | undefined;
  projectedValue: number;
  eventId: string;
  canEdit: boolean;
  eventStatus?: string;
  /** When set, the panel works in "per-city" mode (turnê).
   * Reads from / writes to event_cache_city_settlements instead of event_cache_configs. */
  cityEventId?: string;
  citySettlement?: any | null;
  /** Optional label (city/venue name) shown on the header when in city mode. */
  cityLabel?: string;
}

export function CacheSettlementPanel({
  config,
  realResult,
  projectedValue,
  eventId,
  canEdit,
  eventStatus,
  cityEventId,
  citySettlement,
  cityLabel,
}: Props) {
  const { user } = useAuth();
  const userName = user?.user_metadata?.full_name ?? user?.email ?? "sistema";
  const queryClient = useQueryClient();

  // Source row depends on mode: city settlement (turnê) takes priority over config legacy fields.
  const sourceRow: any = cityEventId ? (citySettlement ?? {}) : config;
  const isFinalized = !!sourceRow.is_finalized;
  const adjustedAmount = sourceRow.adjusted_amount != null ? Number(sourceRow.adjusted_amount) : null;
  const snapshotRealAmount = sourceRow.real_amount != null ? Number(sourceRow.real_amount) : null;
  const calculatedNow = realResult?.finalAmount ?? 0;
  const realAmount = isFinalized && snapshotRealAmount != null ? snapshotRealAmount : calculatedNow;


  const [editingAdjusted, setEditingAdjusted] = useState(false);
  const [adjustedInput, setAdjustedInput] = useState(
    adjustedAmount != null ? String(adjustedAmount) : ""
  );
  const [adjustmentNotesInput, setAdjustmentNotesInput] = useState(sourceRow.agreement_notes ?? "");
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showTxModal, setShowTxModal] = useState(false);

  // Effective event for advances/transactions: city if turnê, master otherwise
  const effectiveEventId = cityEventId ?? eventId;

  // Fetch advances already paid for this artist
  const { data: advancesPaid = 0 } = useQuery({
    queryKey: ["cache-advances-paid", config.id, effectiveEventId, config.supplier_id],
    enabled: !!config.supplier_id,
    queryFn: async () => {
      const { data: catRow } = await supabase
        .from("account_categories")
        .select("id")
        .eq("is_active", true)
        .eq("type", "expense")
        .ilike("name", "%cach%")
        .order("code")
        .limit(1);
      const cacheCatId = catRow?.[0]?.id;
      if (!cacheCatId) return 0;

      const { data } = await supabase
        .from("transactions")
        .select("amount, paid_amount, status")
        .eq("event_id", effectiveEventId)
        .eq("type", "expense")
        .eq("category_id", cacheCatId)
        .eq("supplier_id", config.supplier_id);

      return (data ?? []).reduce((s: number, t: any) => s + Number(t.paid_amount ?? 0), 0);
    },
  });

  // Effective value uses helper: city settlement → config legacy → live calculation
  const effectiveValue = useMemo(
    () => getCacheEffectiveAmount(config, calculatedNow, cityEventId ? citySettlement : null),
    [config, calculatedNow, cityEventId, citySettlement]
  );
  // DR-2026-09-03-D15 (revista): sem retenção no fluxo do cachê.
  const balanceToPay = Math.max(0, effectiveValue - advancesPaid);
  const diff = effectiveValue - projectedValue;
  const isVariable = config.cache_type === "variable";
  const hasMissingDeductions = (realResult?.missingDeductionCategories?.length ?? 0) > 0;

  const adjustedDiffersFromCalculated = useMemo(() => {
    const parsed = parseFloat(adjustedInput);
    if (isNaN(parsed)) return false;
    return Math.abs(parsed - calculatedNow) >= 0.01;
  }, [adjustedInput, calculatedNow]);

  // Helper to invalidate the right caches based on mode
  const invalidateAfterChange = () => {
    if (cityEventId) {
      queryClient.invalidateQueries({ queryKey: ["event_cache_city_settlements", eventId] });
    } else {
      queryClient.invalidateQueries({ queryKey: ["event_cache_configs", eventId] });
    }
  };

  // Save adjusted amount — writes to city table when in city mode
  const saveAdjustedMutation = useMutation({
    mutationFn: async ({ value, notes }: { value: number | null; notes: string | null }) => {
      if (cityEventId) {
        const payload: any = {
          cache_config_id: config.id,
          event_id: cityEventId,
          adjusted_amount: value,
          agreement_notes: value != null ? notes : null,
        };
        const { error } = await supabase
          .from("event_cache_city_settlements" as any)
          .upsert(payload, { onConflict: "cache_config_id,event_id" });
        if (error) throw error;
      } else {
        const updates: any = { adjusted_amount: value, agreement_notes: value != null ? notes : null };
        const { error } = await supabase
          .from("event_cache_configs" as any)
          .update(updates)
          .eq("id", config.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidateAfterChange();
      setEditingAdjusted(false);
      toast({ title: "Valor ajustado guardado" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao guardar", description: err.message, variant: "destructive" });
    },
  });

  // Finalize cache — writes to city table when in city mode
  const finalizeMutation = useMutation({
    mutationFn: async (finalize: boolean) => {
      if (cityEventId) {
        const payload: any = {
          cache_config_id: config.id,
          event_id: cityEventId,
          is_finalized: finalize,
          real_amount: finalize ? calculatedNow : null,
          finalized_at: finalize ? new Date().toISOString() : null,
          finalized_by: finalize ? (userName || "sistema") : null,
        };
        const { error } = await supabase
          .from("event_cache_city_settlements" as any)
          .upsert(payload, { onConflict: "cache_config_id,event_id" });
        if (error) throw error;
      } else {
        const updates: any = {
          is_finalized: finalize,
          real_amount: finalize ? calculatedNow : null,
          finalized_at: finalize ? new Date().toISOString() : null,
          finalized_by: finalize ? (userName || "sistema") : null,
        };
        const { error } = await supabase
          .from("event_cache_configs" as any)
          .update(updates)
          .eq("id", config.id);
        if (error) throw error;
      }
    },
    onSuccess: (_, finalize) => {
      invalidateAfterChange();
      toast({
        title: finalize ? "Cachê finalizado" : "Cachê reaberto",
        description: finalize
          ? "O valor calculado foi gravado como snapshot. Não será mais recalculado."
          : "O valor voltará a ser recalculado automaticamente.",
      });
    },
  });

  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";

  // Early returns AFTER all hooks
  if (eventStatus !== "active" && eventStatus !== "completed") return null;
  if (!realResult) return null;

  return (
    <div className="border-t border-border bg-muted/20 p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calculator className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Fecho do Cachê — Valores Reais
            {cityLabel && <span className="ml-1 text-primary normal-case">· {cityLabel}</span>}
          </span>
        </div>
        {isVariable && (
          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            Memória de cálculo
            {showBreakdown ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
      </div>

      {/* Missing deductions alert */}
      {hasMissingDeductions && !isFinalized && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2.5">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-warning">Deduções sem transação lançada</p>
            <ul className="mt-1 space-y-0.5">
              {realResult.missingDeductionCategories.map((d) => (
                <li key={d.categoryId} className="text-[10px] text-warning/80">
                  • {d.categoryCode} {d.categoryName} — sem lançamento (será considerada €0,00)
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Comparison cards */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-border bg-background p-2.5">
          <p className="text-[10px] text-muted-foreground mb-1">Projetado (BP)</p>
          <p className="font-mono font-semibold text-sm">{formatCurrency(projectedValue)}</p>
        </div>
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5">
          <p className="text-[10px] text-muted-foreground mb-1">Real Calculado</p>
          <p className="font-mono font-semibold text-sm">{formatCurrency(realAmount)}</p>
        </div>
        <div className={`rounded-lg border p-2.5 ${
          adjustedAmount != null
            ? "border-warning/40 bg-warning/5"
            : "border-border bg-background"
        }`}>
          <p className="text-[10px] text-muted-foreground mb-1">
            {adjustedAmount != null ? "Ajustado" : "Final"}
          </p>
          <p className="font-mono font-semibold text-sm">
            {formatCurrency(effectiveValue)}
          </p>
        </div>
      </div>

      {/* Diff indicator */}
      {diff !== 0 ? (
        <div className={`flex items-center gap-1.5 text-xs ${
          diff > 0 ? "text-destructive" : "text-success"
        }`}>
          {diff > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          <span>
            {diff > 0 ? "+" : ""}{formatCurrency(diff)} vs. projetado
            {diff > 0 ? " (acréscimo)" : " (economia)"}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Minus className="h-3 w-3" />
          <span>Sem diferença em relação ao projetado</span>
        </div>
      )}

      {/* Withholding + Advances summary (always shown when there is a payment to make) */}
      {advancesPaid > 0 && (
        <div className="rounded-lg border border-border bg-background p-2.5 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Cachê Total Acordado</span>
            <span className="font-mono">{formatCurrency(effectiveValue)}</span>
          </div>
          {advancesPaid > 0 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Wallet className="h-3 w-3" />
                (−) Adiantamentos já pagos
              </span>
              <span className="font-mono">− {formatCurrency(advancesPaid)}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-xs font-semibold border-t border-border pt-1">
            <span>Saldo a Pagar</span>
            <span className="font-mono">{formatCurrency(balanceToPay)}</span>
          </div>
        </div>
      )}

      {/* Detailed calculation breakdown */}
      {isVariable && showBreakdown && (
        <div className="rounded-lg border border-border bg-background overflow-hidden animate-fade-in">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Etapa</th>
                <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {/* Revenue */}
              <tr>
                <td className="px-3 py-1.5 font-medium">
                  Receita Real de Bilheteira ({realResult.revenueBasisLabel})
                </td>
                <td className="px-3 py-1.5 text-right font-mono">
                  {formatCurrency(realResult.revenueBasis)}
                </td>
              </tr>

              {/* Category deductions */}
              {realResult.deductionDetails.map((d) => (
                <tr key={d.categoryId} className={!d.hasTransaction ? "bg-warning/5" : ""}>
                  <td className="px-3 py-1.5 pl-6 text-muted-foreground">
                    (−) {d.categoryCode} {d.categoryName}
                    {!d.hasTransaction && (
                      <span className="ml-1 text-warning text-[10px]">⚠ sem transação</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-destructive">
                    {d.amount > 0 ? `−${formatCurrency(d.amount)}` : "€0,00"}
                  </td>
                </tr>
              ))}

              {/* Fixed % deduction */}
              {realResult.fixedPctRate > 0 && (
                <tr>
                  <td className="px-3 py-1.5 pl-6 text-muted-foreground">
                    (−) Dedução fixa ({realResult.fixedPctRate}%)
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-destructive">
                    −{formatCurrency(realResult.fixedPctDeduction)}
                  </td>
                </tr>
              )}

              {/* Total deductions */}
              {realResult.totalDeduction > 0 && (
                <tr className="bg-muted/30">
                  <td className="px-3 py-1.5 pl-6 font-medium">Total Deduções</td>
                  <td className="px-3 py-1.5 text-right font-mono font-medium text-destructive">
                    −{formatCurrency(realResult.totalDeduction)}
                  </td>
                </tr>
              )}

              {/* Base */}
              <tr className="bg-muted/50">
                <td className="px-3 py-1.5 font-medium">Base de Cálculo</td>
                <td className="px-3 py-1.5 text-right font-mono font-medium">
                  {formatCurrency(realResult.baseForCalc)}
                </td>
              </tr>

              {/* Percentage */}
              <tr>
                <td className="px-3 py-1.5 text-muted-foreground">
                  Percentagem do Artista ({realResult.percentage}%)
                </td>
                <td className="px-3 py-1.5 text-right font-mono">
                  {formatCurrency(realResult.calculatedAmount)}
                </td>
              </tr>

              {/* Minimum guaranteed */}
              {realResult.minimumGuaranteed > 0 && (
                <tr>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    Mínimo Garantido
                    {realResult.isUsingMinimum && (
                      <span className="ml-1 text-accent-foreground text-[10px]">✓ aplicado</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    {formatCurrency(realResult.minimumGuaranteed)}
                  </td>
                </tr>
              )}

              {/* Final */}
              <tr className="bg-primary/10 border-t-2 border-primary/20">
                <td className="px-3 py-2 font-bold">Cachê Real (arredondado)</td>
                <td className="px-3 py-2 text-right font-mono font-bold">
                  {formatCurrency(realResult.finalAmount)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Adjusted amount input */}
      {canEdit && !isFinalized && (
        <div className="space-y-2">
          {editingAdjusted ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={adjustedInput}
                  onChange={(e) => setAdjustedInput(e.target.value)}
                  className={`${inputClass} text-xs max-w-[160px]`}
                  placeholder="Valor negociado"
                  autoFocus
                />
                <span className="text-[10px] text-muted-foreground">
                  Calculado: <span className="font-mono">{formatCurrency(calculatedNow)}</span>
                </span>
              </div>
              {adjustedDiffersFromCalculated && (
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-warning">
                    Justificativa obrigatória (valor difere do calculado):
                  </label>
                  <textarea
                    value={adjustmentNotesInput}
                    onChange={(e) => setAdjustmentNotesInput(e.target.value)}
                    className={`${inputClass} text-xs min-h-[60px]`}
                    placeholder="Ex: Câmbio dos voos BRL ainda em aberto, arredondamento na negociação com o artista..."
                  />
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const val = parseFloat(adjustedInput);
                    if (isNaN(val) || val < 0) return;
                    if (adjustedDiffersFromCalculated && !adjustmentNotesInput.trim()) {
                      toast({
                        title: "Justificativa obrigatória",
                        description: "Explica o motivo do ajuste antes de guardar.",
                        variant: "destructive",
                      });
                      return;
                    }
                    saveAdjustedMutation.mutate({
                      value: val,
                      notes: adjustedDiffersFromCalculated ? adjustmentNotesInput.trim() : null,
                    });
                  }}
                  className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Guardar
                </button>
                {adjustedAmount != null && (
                  <button
                    onClick={() => {
                      saveAdjustedMutation.mutate({ value: null, notes: null });
                      setAdjustedInput("");
                      setAdjustmentNotesInput("");
                    }}
                    className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary"
                  >
                    Limpar
                  </button>
                )}
                <button
                  onClick={() => {
                    setEditingAdjusted(false);
                    setAdjustmentNotesInput(config.agreement_notes ?? "");
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <button
                onClick={() => {
                  setAdjustedInput(adjustedAmount != null ? String(adjustedAmount) : String(calculatedNow));
                  setAdjustmentNotesInput(sourceRow.agreement_notes ?? "");
                  setEditingAdjusted(true);
                }}
                className="text-xs text-primary hover:underline"
              >
                {adjustedAmount != null ? "Editar valor ajustado" : "Definir valor ajustado (negociado)"}
              </button>
              {adjustedAmount != null && sourceRow.agreement_notes && (
                <p className="text-[10px] text-muted-foreground italic pl-1">
                  💬 {sourceRow.agreement_notes}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Finalize control */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-background p-2.5">
        <div className="flex items-center gap-2">
          {isFinalized ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : (
            <Unlock className="h-4 w-4 text-muted-foreground" />
          )}
          <div>
            <span className="text-xs font-medium">
              {isFinalized ? "Cachê Fechado" : "Fechar Cachê"}
            </span>
            {isFinalized && sourceRow.finalized_at && (
              <p className="text-[10px] text-muted-foreground">
                por {sourceRow.finalized_by || "—"} em{" "}
                {format(new Date(sourceRow.finalized_at), "dd/MM/yyyy HH:mm")}
              </p>
            )}
            {!isFinalized && (
              <p className="text-[10px] text-muted-foreground">
                Trava o valor final — sem recálculos futuros.
              </p>
            )}
          </div>
        </div>
        {canEdit && (
          <Switch
            checked={isFinalized}
            onCheckedChange={(checked) => finalizeMutation.mutate(checked)}
          />
        )}
      </div>

      {/* Generate transaction button — only when finalized */}
      {isFinalized && canEdit && balanceToPay > 0 && (
        <button
          onClick={() => setShowTxModal(true)}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
        >
          <FileText className="h-4 w-4" />
          Gerar Transação de Pagamento ({formatCurrency(balanceToPay)})
        </button>
      )}
      {isFinalized && canEdit && balanceToPay <= 0 && (
        <div className="w-full flex items-center justify-center gap-2 rounded-lg border border-success/30 bg-success/5 px-4 py-2.5 text-xs text-success">
          <CheckCircle2 className="h-4 w-4" />
          Cachê integralmente pago via adiantamentos
        </div>
      )}

      {/* Transaction generation modal */}
      {showTxModal && (
        <CacheTransactionModal
          onClose={() => setShowTxModal(false)}
          eventId={effectiveEventId}
          artistName={config.artist_name}
          amount={effectiveValue}
          cacheConfigId={config.id}
          cacheType={config.cache_type}
          configSupplierId={config.supplier_id}
        />
      )}
    </div>
  );
}

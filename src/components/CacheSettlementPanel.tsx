import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/mock-data";
import { Calculator, TrendingUp, TrendingDown, Minus, CheckCircle2, Unlock, AlertTriangle, ChevronDown, ChevronUp, FileText } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import type { RealCacheResult } from "@/hooks/useRealCacheCalculation";
import { CacheTransactionModal } from "@/components/CacheTransactionModal";

interface Props {
  config: any;
  realResult: RealCacheResult | undefined;
  projectedValue: number;
  eventId: string;
  canEdit: boolean;
  eventStatus?: string;
}

export function CacheSettlementPanel({
  config,
  realResult,
  projectedValue,
  eventId,
  canEdit,
  eventStatus,
}: Props) {
  const { user } = useAuth();
  const userName = user?.user_metadata?.full_name ?? user?.email ?? "sistema";
  const queryClient = useQueryClient();
  const isFinalized = !!config.is_finalized;
  const adjustedAmount = config.adjusted_amount != null ? Number(config.adjusted_amount) : null;
  const realAmount = realResult?.finalAmount ?? 0;

  const withholdingApplicable = !!config.withholding_applicable;
  const withholdingRate = Number(config.withholding_rate) || 25;
  const withholdingAmount = withholdingApplicable ? Math.round(realAmount * (withholdingRate / 100)) : 0;

  const [editingAdjusted, setEditingAdjusted] = useState(false);
  const [adjustedInput, setAdjustedInput] = useState(
    adjustedAmount != null ? String(adjustedAmount) : ""
  );
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showTxModal, setShowTxModal] = useState(false);

  // Only show for active/completed events
  if (eventStatus !== "active" && eventStatus !== "completed") return null;
  if (!realResult) return null;

  const effectiveValue = adjustedAmount != null ? adjustedAmount : realAmount;
  const effectiveWithholding = withholdingApplicable ? Math.round(effectiveValue * (withholdingRate / 100)) : 0;
  const netPayable = effectiveValue - effectiveWithholding;
  const diff = effectiveValue - projectedValue;
  const isVariable = config.cache_type === "variable";
  const hasMissingDeductions = (realResult.missingDeductionCategories?.length ?? 0) > 0;

  // Save adjusted amount
  const saveAdjustedMutation = useMutation({
    mutationFn: async (value: number | null) => {
      const { error } = await supabase
        .from("event_cache_configs" as any)
        .update({ adjusted_amount: value, real_amount: realAmount })
        .eq("id", config.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event_cache_configs", eventId] });
      setEditingAdjusted(false);
      toast({ title: "Valor ajustado guardado" });
    },
  });

  // Finalize cache
  const finalizeMutation = useMutation({
    mutationFn: async (finalize: boolean) => {
      const updates: any = {
        is_finalized: finalize,
        real_amount: realAmount,
      };
      if (finalize) {
        updates.finalized_at = new Date().toISOString();
        updates.finalized_by = userName || "sistema";
        if (adjustedAmount == null) {
          updates.adjusted_amount = null;
        }
      } else {
        updates.finalized_at = null;
        updates.finalized_by = null;
      }
      const { error } = await supabase
        .from("event_cache_configs" as any)
        .update(updates)
        .eq("id", config.id);
      if (error) throw error;
    },
    onSuccess: (_, finalize) => {
      queryClient.invalidateQueries({ queryKey: ["event_cache_configs", eventId] });
      toast({
        title: finalize ? "Cachê finalizado" : "Cachê reaberto",
        description: finalize
          ? "O valor está travado e não será recalculado."
          : "O valor voltará a ser recalculado automaticamente.",
      });
    },
  });

  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";

  return (
    <div className="border-t border-border bg-muted/20 p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calculator className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Fecho do Cachê — Valores Reais
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
            <div className="flex items-center gap-2">
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
              <button
                onClick={() => {
                  const val = parseFloat(adjustedInput);
                  if (!isNaN(val) && val >= 0) {
                    saveAdjustedMutation.mutate(val);
                  }
                }}
                className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                Guardar
              </button>
              {adjustedAmount != null && (
                <button
                  onClick={() => {
                    saveAdjustedMutation.mutate(null);
                    setAdjustedInput("");
                  }}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary"
                >
                  Limpar
                </button>
              )}
              <button
                onClick={() => setEditingAdjusted(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setAdjustedInput(adjustedAmount != null ? String(adjustedAmount) : String(realAmount));
                setEditingAdjusted(true);
              }}
              className="text-xs text-primary hover:underline"
            >
              {adjustedAmount != null ? "Editar valor ajustado" : "Definir valor ajustado (negociado)"}
            </button>
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
            {isFinalized && config.finalized_at && (
              <p className="text-[10px] text-muted-foreground">
                por {config.finalized_by || "—"} em{" "}
                {format(new Date(config.finalized_at), "dd/MM/yyyy HH:mm")}
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
      {isFinalized && canEdit && (
        <button
          onClick={() => setShowTxModal(true)}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
        >
          <FileText className="h-4 w-4" />
          Gerar Transação de Pagamento ({formatCurrency(effectiveValue)})
        </button>
      )}

      {/* Transaction generation modal */}
      {showTxModal && (
        <CacheTransactionModal
          onClose={() => setShowTxModal(false)}
          eventId={eventId}
          artistName={config.artist_name}
          amount={effectiveValue}
          cacheConfigId={config.id}
          configSupplierId={config.supplier_id}
        />
      )}
    </div>
  );
}

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/mock-data";
import { Lock, Unlock, Calculator, TrendingUp, TrendingDown, Minus, CheckCircle2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";

interface RealCacheResult {
  configId: string;
  artistName: string;
  cacheType: string;
  realRevenueGross: number;
  realRevenueNet: number;
  realDeductionAmount: number;
  fixedPctDeduction: number;
  totalDeduction: number;
  baseForCalc: number;
  percentage: number;
  calculatedAmount: number;
  minimumGuaranteed: number;
  finalAmount: number;
  isUsingMinimum: boolean;
}

interface Props {
  config: any;
  realResult: RealCacheResult | undefined;
  projectedValue: number;
  eventId: string;
  canEdit: boolean;
}

export function CacheSettlementPanel({
  config,
  realResult,
  projectedValue,
  eventId,
  canEdit,
}: Props) {
  const { user } = useAuth();
  const userName = user?.user_metadata?.full_name ?? user?.email ?? "sistema";
  const queryClient = useQueryClient();
  const isFinalized = !!config.is_finalized;
  const adjustedAmount = config.adjusted_amount != null ? Number(config.adjusted_amount) : null;
  const realAmount = realResult?.finalAmount ?? 0;

  const [editingAdjusted, setEditingAdjusted] = useState(false);
  const [adjustedInput, setAdjustedInput] = useState(
    adjustedAmount != null ? String(adjustedAmount) : ""
  );

  // The effective final value for settlement
  const effectiveValue = adjustedAmount != null ? adjustedAmount : realAmount;
  const diff = effectiveValue - projectedValue;

  // Save adjusted amount
  const saveAdjustedMutation = useMutation({
    mutationFn: async (value: number | null) => {
      const { error } = await supabase
        .from("event_cache_configs" as any)
        .update({
          adjusted_amount: value,
          real_amount: realAmount,
        })
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
        // If no adjusted amount, store the real calculated value
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

  if (!realResult) return null;

  const isVariable = config.cache_type === "variable";

  return (
    <div className="border-t border-border bg-muted/20 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Calculator className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Fecho do Cachê — Valores Reais
        </span>
      </div>

      {/* Comparison table */}
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
      {diff !== 0 && (
        <div className={`flex items-center gap-1.5 text-xs ${
          diff > 0 ? "text-destructive" : "text-success"
        }`}>
          {diff > 0 ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          <span>
            {diff > 0 ? "+" : ""}{formatCurrency(diff)} vs. projetado
            {diff > 0 ? " (acréscimo)" : " (economia)"}
          </span>
        </div>
      )}
      {diff === 0 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Minus className="h-3 w-3" />
          <span>Sem diferença em relação ao projetado</span>
        </div>
      )}

      {/* Variable breakdown */}
      {isVariable && (
        <div className="text-[10px] text-muted-foreground space-y-0.5 bg-background rounded-lg p-2 border border-border">
          <p>
            Receita real {config.cache_revenue_basis === "gross" ? "(Bruta)" : "(Líquida)"}: {formatCurrency(
              config.cache_revenue_basis === "gross" ? realResult.realRevenueGross : realResult.realRevenueNet
            )}
          </p>
          {realResult.totalDeduction > 0 && (
            <p>Deduções reais: −{formatCurrency(realResult.totalDeduction)}</p>
          )}
          <p>Base de cálculo: {formatCurrency(realResult.baseForCalc)}</p>
          <p>
            {realResult.percentage}% = {formatCurrency(realResult.calculatedAmount)}
            {realResult.isUsingMinimum && ` → Mín. Garantido: ${formatCurrency(realResult.minimumGuaranteed)}`}
          </p>
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
    </div>
  );
}

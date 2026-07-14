import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { format } from "date-fns";
import { CurrencyAmountInput } from "@/components/CurrencyAmountInput";
import { CurrencyBadge } from "@/components/CurrencyBadge";
import { CurrencyCode, isSupportedCurrency, eurToOriginal, formatInCurrency } from "@/lib/currency";
import { useBackdropClose } from "@/lib/backdropClose";

interface Props {
  forecast: any;
  categories?: any[];
  onClose: () => void;
}

export function ForecastEditModal({ forecast, categories: externalCategories, onClose }: Props) {
  const [description, setDescription] = useState(forecast.description || "");
  const [specification, setSpecification] = useState(forecast.specification || "");
  const [categoryId, setCategoryId] = useState(forecast.category_id || "");
  const initialCurrency: CurrencyCode = isSupportedCurrency(forecast.currency) ? forecast.currency : "EUR";
  const [currency, setCurrency] = useState<CurrencyCode>(initialCurrency);
  const [originalAmount, setOriginalAmount] = useState(
    initialCurrency === "EUR"
      ? String(forecast.amount)
      : String(forecast.original_amount ?? eurToOriginal(Number(forecast.amount), Number(forecast.fx_rate) || 1))
  );
  const [fxRate, setFxRate] = useState(
    initialCurrency === "EUR" ? "" : String(forecast.fx_rate ?? "")
  );
  const [fxRateSource, setFxRateSource] = useState<"manual" | "suggested">(
    forecast.fx_rate_source === "suggested" ? "suggested" : "manual"
  );
  const [eurAmount, setEurAmount] = useState<number>(Number(forecast.amount) || 0);
  const [ivaRate, setIvaRate] = useState(String(forecast.iva_rate));
  const [isOverhead, setIsOverhead] = useState<boolean>(!!forecast.is_overhead);
  const [observation, setObservation] = useState("");
  const queryClient = useQueryClient();
  const { user, isAdmin, isManager } = useAuth();
  const canSeeOverhead = isAdmin || isManager;
  const isExpenseType = forecast.type === "expense";

  const { data: loadedCategories = [] } = useQuery({
    queryKey: ["account_categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_categories")
        .select("*")
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
    enabled: !externalCategories,
  });

  const categories = externalCategories || loadedCategories;

  const filteredCategories = useMemo(() => {
    const catType = forecast.type === "income" ? "income" : "expense";
    return categories
      .filter((c: any) => c.type === catType && c.code.split(".").length === 3)
      .sort((a: any, b: any) => a.code.localeCompare(b.code));
  }, [categories, forecast.type]);

  const { data: auditLogs = [] } = useQuery({
    queryKey: ["forecast_audit_log", forecast.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forecast_audit_log" as any)
        .select("*")
        .eq("forecast_id", forecast.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      const newAmount = Math.round(eurAmount * 100) / 100;
      const newIvaRate = parseInt(ivaRate) || 0;
      const newDescription = description.trim();
      const newSpecification = specification.trim() || null;
      const newCategoryId = categoryId || null;
      const newCurrency = currency;
      const newOriginal = newCurrency === "EUR" ? null : (parseFloat(originalAmount) || 0);
      const newFxRate = newCurrency === "EUR" ? null : (parseFloat(fxRate) || 0);
      const newFxRateSource = newCurrency === "EUR" ? null : fxRateSource;

      if (!newDescription) throw new Error("A descrição é obrigatória.");
      if (newCurrency !== "EUR" && (!newFxRate || newFxRate <= 0)) {
        throw new Error("Define o câmbio para a moeda selecionada.");
      }

      const changes: { field_name: string; old_value: string; new_value: string }[] = [];

      if (newDescription !== (forecast.description || "")) {
        changes.push({ field_name: "Descrição", old_value: forecast.description || "", new_value: newDescription });
      }
      if ((newSpecification || "") !== (forecast.specification || "")) {
        changes.push({ field_name: "Especificação", old_value: forecast.specification || "—", new_value: newSpecification || "—" });
      }
      if (newCategoryId !== (forecast.category_id || null)) {
        const oldCat = categories.find((c: any) => c.id === forecast.category_id);
        const newCat = categories.find((c: any) => c.id === newCategoryId);
        changes.push({
          field_name: "Categoria",
          old_value: oldCat ? `${oldCat.code} ${oldCat.name}` : "—",
          new_value: newCat ? `${newCat.code} ${newCat.name}` : "—",
        });
      }
      if (newAmount !== Number(forecast.amount)) {
        changes.push({ field_name: "Valor (EUR)", old_value: String(forecast.amount), new_value: String(newAmount) });
      }
      const oldCurrency = forecast.currency || "EUR";
      if (newCurrency !== oldCurrency) {
        changes.push({ field_name: "Moeda", old_value: oldCurrency, new_value: newCurrency });
      }
      if (newCurrency !== "EUR") {
        const oldOrig = forecast.original_amount != null ? String(forecast.original_amount) : "—";
        const oldRate = forecast.fx_rate != null ? String(forecast.fx_rate) : "—";
        if (String(newOriginal) !== oldOrig) {
          changes.push({ field_name: `Valor original (${newCurrency})`, old_value: oldOrig, new_value: String(newOriginal) });
        }
        if (String(newFxRate) !== oldRate) {
          changes.push({ field_name: "Câmbio", old_value: oldRate, new_value: String(newFxRate) });
        }
      }
      if (newIvaRate !== Number(forecast.iva_rate)) {
        changes.push({ field_name: "Taxa IVA", old_value: `${forecast.iva_rate}%`, new_value: `${newIvaRate}%` });
      }
      const newOverhead = isExpenseType && canSeeOverhead ? !!isOverhead : !!forecast.is_overhead;
      if (newOverhead !== !!forecast.is_overhead) {
        changes.push({ field_name: "Rateio de Overhead", old_value: forecast.is_overhead ? "Sim" : "Não", new_value: newOverhead ? "Sim" : "Não" });
      }

      if (changes.length === 0) throw new Error("Nenhuma alteração detectada.");
      if (!observation.trim()) throw new Error("A observação é obrigatória para alterações em previsões aprovadas.");

      // Snapshot for undo (pre-change values)
      const snapshot = {
        description: forecast.description,
        specification: forecast.specification,
        category_id: forecast.category_id,
        amount: Number(forecast.amount),
        iva_rate: Number(forecast.iva_rate),
        currency: oldCurrency,
        original_amount: forecast.original_amount,
        fx_rate: forecast.fx_rate,
        fx_rate_source: forecast.fx_rate_source,
        is_overhead: !!forecast.is_overhead,
        exclude_from_result: !!forecast.exclude_from_result,
      };

      // Update forecast
      const updatePayload: any = {
        description: newDescription,
        specification: newSpecification,
        category_id: newCategoryId,
        amount: newAmount,
        iva_rate: newIvaRate,
        currency: newCurrency,
        original_amount: newOriginal,
        fx_rate: newFxRate,
        fx_rate_source: newFxRateSource,
        is_overhead: newOverhead,
        exclude_from_result: newOverhead,
      };
      const { error: updateError } = await supabase
        .from("event_forecasts")
        .update(updatePayload)
        .eq("id", forecast.id);
      if (updateError) throw updateError;

      // Log each change
      const changedBy = user?.user_metadata?.full_name ?? user?.email ?? "sistema";
      for (const change of changes) {
        const { error: logError } = await supabase
          .from("forecast_audit_log" as any)
          .insert({
            forecast_id: forecast.id,
            changed_by: changedBy,
            field_name: change.field_name,
            old_value: change.old_value,
            new_value: change.new_value,
            observation: observation.trim(),
          } as any);
        if (logError) console.error("Audit log error:", logError);
      }

      return { snapshot, changesCount: changes.length };
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ["event_forecasts"] });
      queryClient.invalidateQueries({ queryKey: ["forecast_audit_log", forecast.id] });
      onClose();
      if (result?.snapshot && user) {
        const { recordUndo } = await import("@/lib/undo");
        const { showUndoToast } = await import("@/hooks/useUndoToast");
        const undoRec = await recordUndo({
          action_type: "edit_forecast",
          entity_type: "event_forecast",
          entity_id: forecast.id,
          payload: { snapshot: result.snapshot },
          description: `Edição BP: ${forecast.description ?? ""}`.slice(0, 200),
          performed_by: user.id,
          performed_by_name: user.user_metadata?.full_name ?? user.email ?? undefined,
        });
        if (undoRec) {
          showUndoToast({
            message: "Previsão atualizada com sucesso!",
            description: `${result.changesCount} alteração(ões) gravada(s). Toque em Desfazer para restaurar os valores anteriores.`,
            undoId: undoRec.id,
            user: { id: user.id, name: user.user_metadata?.full_name ?? user.email ?? undefined },
            onUndone: () => {
              queryClient.invalidateQueries({ queryKey: ["event_forecasts"] });
              queryClient.invalidateQueries({ queryKey: ["forecast_audit_log", forecast.id] });
            },
          });
          return;
        }
      }
      toast({ title: "Previsão atualizada com sucesso!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const isExpense = forecast.type === "expense";
  const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";
  const backdrop = useBackdropClose(onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" {...backdrop}>
      <div className="glass w-full max-w-lg rounded-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>


        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Editar Previsão Aprovada</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-secondary"><X className="h-5 w-5" /></button>
        </div>

        {/* Description */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Descrição *</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
        </div>

        {/* Specification (expenses only) */}
        {isExpense && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Especificação</label>
            <input type="text" value={specification} onChange={(e) => setSpecification(e.target.value)} className={inputClass} placeholder="Detalhes adicionais…" />
          </div>
        )}

        {/* Category */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Categoria Contabilística</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
            <option value="">— Sem categoria —</option>
            {filteredCategories.map((c: any) => (
              <option key={c.id} value={c.id}>{c.code} {c.name}</option>
            ))}
          </select>
        </div>

        {/* Amount (multi-currency) + IVA */}
        <div className="space-y-3">
          <CurrencyAmountInput
            currency={currency}
            onCurrencyChange={setCurrency}
            originalAmount={originalAmount}
            onOriginalAmountChange={setOriginalAmount}
            fxRate={fxRate}
            onFxRateChange={setFxRate}
            onFxRateSourceChange={setFxRateSource}
            onEurAmountChange={setEurAmount}
            label="Valor s/ IVA"
          />
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Taxa IVA</label>
            <select value={ivaRate} onChange={(e) => setIvaRate(e.target.value)} className={inputClass}>
              <option value="23">23%</option>
              <option value="13">13%</option>
              <option value="6">6%</option>
              <option value="0">0%</option>
            </select>
          </div>
          {currency !== "EUR" && (
            <p className="text-xs text-muted-foreground">
              Será gravado em EUR: <span className="font-semibold text-foreground">{formatCurrency(eurAmount)}</span>
              <CurrencyBadge currency={currency} originalAmount={parseFloat(originalAmount) || 0} fxRate={parseFloat(fxRate) || 0} className="ml-2" />
            </p>
          )}
        </div>

        {/* Overhead allocation toggle (admin/manager + expenses only) */}
        {isExpenseType && canSeeOverhead && (
          <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isOverhead}
                onChange={(e) => setIsOverhead(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border accent-warning"
              />
              <div className="flex-1">
                <p className="text-xs font-semibold text-warning uppercase tracking-wider">Rateio de Overhead</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Custo estrutural rateado neste evento (assessoria, jurídico, escritório). Aparece no BP/DRE para sócios como linha normal, mas <strong>não impacta o resultado da empresa</strong> — apenas o acerto com sócios. Visível apenas para admin/manager.
                </p>
              </div>
            </label>
          </div>
        )}

        {/* Observation */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Observação / Justificação *</label>
          <textarea
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            placeholder="Motivo da alteração…"
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </div>

        <button
          onClick={() => editMutation.mutate()}
          disabled={editMutation.isPending}
          className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {editMutation.isPending ? "A guardar…" : "Guardar Alteração"}
        </button>

        {/* Audit history */}
        {auditLogs.length > 0 && (
          <div className="border-t border-border/50 pt-3 space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Histórico de Alterações</h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {auditLogs.map((log: any) => (
                <div key={log.id} className="rounded-lg bg-muted/30 px-3 py-2 text-xs space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{log.field_name}</span>
                    <span className="text-muted-foreground">{format(new Date(log.created_at), "dd/MM/yyyy HH:mm")}</span>
                  </div>
                  <p className="text-muted-foreground">
                    {log.old_value} → <span className="text-foreground font-medium">{log.new_value}</span>
                  </p>
                  {log.observation && <p className="text-muted-foreground italic">"{log.observation}"</p>}
                  <p className="text-muted-foreground text-[10px]">por {log.changed_by}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

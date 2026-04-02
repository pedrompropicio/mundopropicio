import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { format } from "date-fns";

interface Props {
  forecast: any;
  onClose: () => void;
}

export function ForecastEditModal({ forecast, onClose }: Props) {
  const [amount, setAmount] = useState(String(forecast.amount));
  const [ivaRate, setIvaRate] = useState(String(forecast.iva_rate));
  const [observation, setObservation] = useState("");
  const queryClient = useQueryClient();
  const { user } = useAuth();

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
      const newAmount = parseFloat(amount) || 0;
      const newIvaRate = parseInt(ivaRate) || 0;
      const changes: { field_name: string; old_value: string; new_value: string }[] = [];

      if (newAmount !== Number(forecast.amount)) {
        changes.push({ field_name: "Valor", old_value: String(forecast.amount), new_value: String(newAmount) });
      }
      if (newIvaRate !== Number(forecast.iva_rate)) {
        changes.push({ field_name: "Taxa IVA", old_value: `${forecast.iva_rate}%`, new_value: `${newIvaRate}%` });
      }

      if (changes.length === 0) throw new Error("Nenhuma alteração detectada.");
      if (!observation.trim()) throw new Error("A observação é obrigatória para alterações em previsões aprovadas.");

      // Update forecast
      const { error: updateError } = await supabase
        .from("event_forecasts")
        .update({ amount: newAmount, iva_rate: newIvaRate })
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event_forecasts"] });
      queryClient.invalidateQueries({ queryKey: ["forecast_audit_log", forecast.id] });
      toast({ title: "Previsão atualizada com sucesso!" });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="glass w-full max-w-md rounded-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Alterar Valor — BP Aprovado</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-secondary"><X className="h-5 w-5" /></button>
        </div>

        <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs space-y-1">
          <p className="font-medium">{forecast.description}</p>
          {forecast.specification && <p className="text-muted-foreground">Especificação: {forecast.specification}</p>}
          <p className="text-muted-foreground">Valor atual: {formatCurrency(Number(forecast.amount))} | IVA: {forecast.iva_rate}%</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Novo Valor s/ IVA (€)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Taxa IVA</label>
            <select
              value={ivaRate}
              onChange={(e) => setIvaRate(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="23">23%</option>
              <option value="13">13%</option>
              <option value="6">6%</option>
              <option value="0">0%</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Observação *</label>
          <textarea
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            placeholder="Justificação da alteração…"
            rows={2}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
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

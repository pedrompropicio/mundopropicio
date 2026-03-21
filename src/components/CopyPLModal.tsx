import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { X, Copy, Search, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/mock-data";
import { EventStatusBadge } from "@/components/EventStatusBadge";

interface CopyPLModalProps {
  targetEventId: string;
  targetEventName: string;
  existingForecastCount: number;
  onClose: () => void;
}

export function CopyPLModal({ targetEventId, targetEventName, existingForecastCount, onClose }: CopyPLModalProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [mode, setMode] = useState<"replace" | "add">("add");

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["events_for_copy_pl"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date, status, event_type")
        .neq("id", targetEventId)
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: sourceForecastCount = 0 } = useQuery({
    queryKey: ["source_forecast_count", selectedEventId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("event_forecasts")
        .select("*", { count: "exact", head: true })
        .eq("event_id", selectedEventId!);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!selectedEventId,
  });

  const copyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedEventId) throw new Error("Selecione um evento");

      // Fetch source forecasts
      const { data: sourceForecasts, error: fetchErr } = await supabase
        .from("event_forecasts")
        .select("*")
        .eq("event_id", selectedEventId);
      if (fetchErr) throw fetchErr;
      if (!sourceForecasts || sourceForecasts.length === 0) {
        throw new Error("O evento selecionado não tem previsões no P&L");
      }

      // If replace mode, delete existing forecasts
      if (mode === "replace" && existingForecastCount > 0) {
        const { error: delErr } = await supabase
          .from("event_forecasts")
          .delete()
          .eq("event_id", targetEventId);
        if (delErr) throw delErr;
      }

      // Insert copied forecasts (reset status to draft)
      const newForecasts = sourceForecasts.map((f) => ({
        event_id: targetEventId,
        type: f.type,
        description: f.description,
        amount: f.amount,
        iva_rate: f.iva_rate,
        category_id: f.category_id,
        notes: f.notes,
        specification: f.specification,
        formula_type: f.formula_type,
        formula_value: f.formula_value,
        status: "draft",
      }));

      const { error: insertErr } = await supabase
        .from("event_forecasts")
        .insert(newForecasts);
      if (insertErr) throw insertErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event_forecasts", targetEventId] });
      toast({ title: `P&L copiado com sucesso! (${sourceForecastCount} linhas)` });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Erro ao copiar P&L", description: err.message, variant: "destructive" });
    },
  });

  const filtered = events.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="glass w-full max-w-lg rounded-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Copy className="h-5 w-5 text-primary" /> Copiar P&L
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-secondary">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          Copiar previsões de P&L de outro evento para <span className="font-semibold text-foreground">{targetEventName}</span>
        </p>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar evento…"
            className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Event list */}
        <div className="max-h-52 overflow-y-auto space-y-1 rounded-lg border border-border p-1">
          {isLoading ? (
            <p className="py-4 text-center text-xs text-muted-foreground">A carregar…</p>
          ) : filtered.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">Nenhum evento encontrado</p>
          ) : (
            filtered.map((e) => (
              <button
                key={e.id}
                onClick={() => setSelectedEventId(e.id)}
                className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  selectedEventId === e.id
                    ? "bg-primary/15 text-foreground"
                    : "hover:bg-secondary text-muted-foreground"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{e.name}</p>
                  <p className="text-[10px] opacity-70">{formatDate(e.date)}</p>
                </div>
                <EventStatusBadge status={e.status as any} />
              </button>
            ))
          )}
        </div>

        {/* Selected event info */}
        {selectedEvent && (
          <div className="rounded-lg bg-secondary/50 p-3 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Origem:</span>
              <span className="font-medium">{selectedEvent.name}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Linhas no P&L:</span>
              <span className="font-mono font-medium">{sourceForecastCount}</span>
            </div>

            {/* Mode selection if target has existing forecasts */}
            {existingForecastCount > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-warning">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>O evento de destino já tem {existingForecastCount} linhas no P&L</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("add")}
                    className={`rounded-lg border p-2.5 text-xs font-medium transition-all text-left ${
                      mode === "add"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    <span className="block font-semibold">Adicionar</span>
                    <span className="block text-[10px] opacity-70 mt-0.5">Manter existentes</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("replace")}
                    className={`rounded-lg border p-2.5 text-xs font-medium transition-all text-left ${
                      mode === "replace"
                        ? "border-destructive bg-destructive/10 text-destructive"
                        : "border-border bg-background text-muted-foreground hover:border-destructive/40"
                    }`}
                  >
                    <span className="block font-semibold">Substituir</span>
                    <span className="block text-[10px] opacity-70 mt-0.5">Apagar existentes</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action button */}
        <button
          onClick={() => copyMutation.mutate()}
          disabled={!selectedEventId || sourceForecastCount === 0 || copyMutation.isPending}
          className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
        >
          {copyMutation.isPending
            ? "A copiar…"
            : `Copiar ${sourceForecastCount} linhas de P&L`}
        </button>
      </div>
    </div>
  );
}

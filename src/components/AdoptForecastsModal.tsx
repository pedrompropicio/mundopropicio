import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/mock-data";
import { Layers, Plus, Search } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Master event id */
  masterEventId: string;
  /** Sub-event ids */
  childEventIds: string[];
  /** If adopting into an existing master forecast line */
  masterForecast?: { id: string; description: string; category_id: string | null; type: string } | null;
  /** Mode: 'adopt' = adopt into existing, 'create' = create new master + adopt */
  mode: "adopt" | "create";
  /** Available categories for create mode */
  categories?: { id: string; code: string; name: string; type: string }[];
}

export function AdoptForecastsModal({ open, onOpenChange, masterEventId, childEventIds, masterForecast, mode, categories = [] }: Props) {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  // For create mode
  const [newDescription, setNewDescription] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [newIvaRate, setNewIvaRate] = useState("23");

  // Fetch sub-event forecasts that are NOT yet adopted
  const { data: subForecasts = [], isLoading } = useQuery({
    queryKey: ["sub_event_forecasts_for_adopt", childEventIds, masterForecast?.category_id],
    queryFn: async () => {
      // master_forecast_id is a new column, cast to any to avoid type errors
      const { data, error } = await (supabase
        .from("event_forecasts")
        .select("*, account_categories(code, name)") as any)
        .in("event_id", childEventIds)
        .is("master_forecast_id", null)
        .eq("type", "expense");
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: open && childEventIds.length > 0,
  });

  // Fetch sub-event names for display
  const { data: subEvents = [] } = useQuery({
    queryKey: ["sub_event_names_adopt", childEventIds],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, name").in("id", childEventIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && childEventIds.length > 0,
  });

  const eventNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    subEvents.forEach((e: any) => { map[e.id] = e.name; });
    return map;
  }, [subEvents]);

  // Filter: if adopting into existing, optionally filter by same category
  const filteredForecasts = useMemo(() => {
    let list = subForecasts;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((f: any) =>
        f.description?.toLowerCase().includes(s) ||
        f.account_categories?.name?.toLowerCase().includes(s) ||
        f.account_categories?.code?.toLowerCase().includes(s) ||
        eventNameMap[f.event_id]?.toLowerCase().includes(s)
      );
    }
    return list;
  }, [subForecasts, search, eventNameMap]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredForecasts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredForecasts.map((f: any) => f.id)));
    }
  };

  const totalSelected = filteredForecasts.filter((f: any) => selectedIds.has(f.id)).reduce((s: number, f: any) => s + Number(f.amount), 0);

  const handleSave = async () => {
    if (selectedIds.size === 0) return;
    setSaving(true);

    try {
      let masterForecastId: string;

      if (mode === "create") {
        if (!newDescription.trim()) {
          toast({ title: "Preencha a descrição da linha Master", variant: "destructive" });
          setSaving(false);
          return;
        }

        // Calculate the sum of selected forecasts
        const selectedForecasts = subForecasts.filter((f: any) => selectedIds.has(f.id));
        const totalAmount = selectedForecasts.reduce((s: number, f: any) => s + Number(f.amount), 0);

        // Create the master forecast line
        const { data: newForecast, error: createError } = await supabase
          .from("event_forecasts")
          .insert({
            event_id: masterEventId,
            type: "expense",
            description: newDescription.trim(),
            category_id: newCategoryId || null,
            amount: totalAmount,
            iva_rate: parseInt(newIvaRate),
            status: "approved",
          })
          .select("id")
          .single();

        if (createError) throw createError;
        masterForecastId = newForecast.id;
      } else {
        if (!masterForecast) throw new Error("Linha Master não definida");
        masterForecastId = masterForecast.id;
      }

      // Update selected sub-event forecasts to point to master
      const ids = Array.from(selectedIds);
      const { error: updateError } = await (supabase
        .from("event_forecasts")
        .update({ master_forecast_id: masterForecastId }) as any)
        .in("id", ids);

      if (updateError) throw updateError;

      queryClient.invalidateQueries({ queryKey: ["event_forecasts"] });
      queryClient.invalidateQueries({ queryKey: ["sub_event_forecasts_for_adopt"] });
      toast({ title: `${ids.length} linha(s) vinculada(s) à conta Master` });
      onOpenChange(false);
      setSelectedIds(new Set());
      setNewDescription("");
      setNewCategoryId("");
    } catch (err: any) {
      toast({ title: "Erro ao vincular", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const expenseCategories = categories.filter((c) => c.type === "expense");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            {mode === "adopt" ? "Adotar Linhas dos Sub-Eventos" : "Criar Conta Master + Vincular"}
          </DialogTitle>
          <DialogDescription>
            {mode === "adopt"
              ? `Selecione as linhas dos sub-eventos para vincular à conta "${masterForecast?.description ?? ""}".`
              : "Crie uma nova linha no BP do Master e vincule linhas existentes dos sub-eventos."}
          </DialogDescription>
        </DialogHeader>

        {/* Create mode: new forecast fields */}
        {mode === "create" && (
          <div className="space-y-3 border-b border-border/50 pb-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Nova Linha Master</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Descrição *</label>
                <input
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                  placeholder="Ex: Voos equipa"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Categoria</label>
                <SearchableSelect
                  options={expenseCategories.map((c) => ({ value: c.id, label: `${c.code} ${c.name}` }))}
                  value={newCategoryId}
                  onValueChange={setNewCategoryId}
                  placeholder="Selecionar…"
                  searchPlaceholder="Pesquisar conta…"
                />
              </div>
            </div>
            <div className="w-24">
              <label className="text-xs text-muted-foreground">IVA</label>
              <select
                value={newIvaRate}
                onChange={(e) => setNewIvaRate(e.target.value)}
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
              >
                <option value="23">23%</option>
                <option value="13">13%</option>
                <option value="6">6%</option>
                <option value="0">0%</option>
              </select>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded border border-border bg-background pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
            placeholder="Pesquisar por descrição, categoria ou evento…"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-1">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-4">A carregar…</p>
          ) : filteredForecasts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sem linhas disponíveis nos sub-eventos</p>
          ) : (
            <>
              <div className="flex items-center gap-2 pb-2 border-b border-border/30">
                <Checkbox
                  checked={selectedIds.size === filteredForecasts.length && filteredForecasts.length > 0}
                  onCheckedChange={toggleAll}
                  className="h-3.5 w-3.5"
                />
                <span className="text-xs text-muted-foreground">
                  {selectedIds.size > 0 ? `${selectedIds.size} selecionada(s) — ${formatCurrency(totalSelected)}` : "Selecionar todas"}
                </span>
              </div>
              {filteredForecasts.map((f: any) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => toggleSelect(f.id)}
                  className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    selectedIds.has(f.id) ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/30 border border-transparent"
                  }`}
                >
                  <Checkbox
                    checked={selectedIds.has(f.id)}
                    className="h-3.5 w-3.5 pointer-events-none shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {f.account_categories?.code && (
                        <span className="text-xs text-muted-foreground mr-1">{f.account_categories.code}</span>
                      )}
                      {f.description}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {eventNameMap[f.event_id] || "Sub-evento"}
                      {f.specification && ` · ${f.specification}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-sm font-semibold">{formatCurrency(Number(f.amount))}</p>
                    <p className="text-[10px] text-muted-foreground">{f.iva_rate}% IVA</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                    f.status === "approved" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                  }`}>
                    {f.status === "approved" ? "Aprovada" : "Rascunho"}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-secondary transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || selectedIds.size === 0}
            className="rounded-lg px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? "A vincular…" : `Vincular ${selectedIds.size > 0 ? `(${selectedIds.size})` : ""}`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

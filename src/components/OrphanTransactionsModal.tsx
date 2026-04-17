import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/mock-data";
import { AlertTriangle, Search, Receipt, Layers, Loader2, CheckCircle2, XCircle, Info } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  masterEventId: string;
  childEventIds: string[];
}

/**
 * Lista órfãs dos sub-eventos e identifica candidatos válidos a RATEIO MASTER.
 *
 * REGRA DE RATEIO (clássico):
 *   1) A categoria NÃO existe ainda no BP do Master
 *   2) A despesa aparece em TODOS os sub-eventos
 *   3) Os valores por sub-evento são ~iguais (tolerância 1%)
 *
 * Apenas grupos que cumpram a regra podem ser "adotados como rateio Master" (cria linha
 * Master + splits por sub-evento). Para os restantes, mostra-se um aviso explicando que
 * devem ser tratados via botão "Adotar" de uma linha Master existente, ou ignorados.
 */
export function OrphanTransactionsModal({ open, onOpenChange, masterEventId, childEventIds }: Props) {
  const queryClient = useQueryClient();
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  // 1) Sub-event expense transactions sem split-pai
  const { data: orphans = [], isLoading } = useQuery({
    queryKey: ["all_orphan_txs", masterEventId, childEventIds],
    queryFn: async () => {
      if (childEventIds.length === 0) return [];
      const { data: txs, error } = await supabase
        .from("transactions")
        .select("id, event_id, description, amount, iva_rate, status, category_id, invoice_ref, account_id, account_categories(code, name), financial_accounts(name)")
        .in("event_id", childEventIds)
        .eq("type", "expense")
        .is("parent_transaction_id", null)
        .in("status", ["paid", "approved", "pending", "overdue"]);
      if (error) throw error;
      const list = (txs ?? []) as any[];
      if (list.length === 0) return [];
      const ids = list.map((t) => t.id);
      const { data: linked, error: lErr } = await supabase
        .from("event_forecasts")
        .select("transaction_id")
        .in("transaction_id", ids);
      if (lErr) throw lErr;
      const linkedSet = new Set((linked ?? []).map((r: any) => r.transaction_id));
      return list.filter((t) => !linkedSet.has(t.id));
    },
    enabled: open && childEventIds.length > 0,
  });

  // 2) Categorias já presentes no BP Master (para excluir do rateio)
  const { data: masterCategoryIds = new Set<string>() } = useQuery({
    queryKey: ["master_categories_for_orphans", masterEventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("category_id")
        .eq("event_id", masterEventId)
        .eq("type", "expense");
      if (error) throw error;
      return new Set((data ?? []).map((r: any) => r.category_id).filter(Boolean) as string[]);
    },
    enabled: open,
  });

  // 3) Nomes dos sub-eventos
  const { data: subEvents = [] } = useQuery({
    queryKey: ["sub_event_names_orphan", childEventIds],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, name").in("id", childEventIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && childEventIds.length > 0,
  });

  const eventNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    subEvents.forEach((e: any) => { m[e.id] = e.name; });
    return m;
  }, [subEvents]);

  // ── Análise: agrupar por categoria e classificar como rateio válido ou não ──
  type GroupAnalysis = {
    id: string;
    catCode: string;
    catName: string;
    items: any[];
    totalsByEvent: Record<string, number>;
    isValidRateio: boolean;
    reason: string;
    totalAmount: number;
  };

  const grouped: GroupAnalysis[] = useMemo(() => {
    const map = new Map<string, { catCode: string; catName: string; items: any[] }>();
    orphans.forEach((t: any) => {
      const key = t.category_id || "no-cat";
      if (!map.has(key)) {
        map.set(key, {
          catCode: t.account_categories?.code || "—",
          catName: t.account_categories?.name || "Sem categoria",
          items: [],
        });
      }
      map.get(key)!.items.push(t);
    });

    const totalSubEvents = childEventIds.length;
    const TOLERANCE = 0.01; // 1%

    return Array.from(map.entries())
      .map(([id, v]) => {
        const totalsByEvent: Record<string, number> = {};
        v.items.forEach((t: any) => {
          totalsByEvent[t.event_id] = (totalsByEvent[t.event_id] || 0) + Number(t.amount);
        });
        const eventsCovered = Object.keys(totalsByEvent).length;
        const totalAmount = v.items.reduce((s, t: any) => s + Number(t.amount), 0);

        let isValidRateio = false;
        let reason = "";

        if (id === "no-cat") {
          reason = "Sem categoria — impossível classificar";
        } else if (masterCategoryIds.has(id)) {
          reason = "Categoria já existe no BP Master — usar botão Adotar (↗) na linha Master";
        } else if (eventsCovered < totalSubEvents) {
          reason = `Só aparece em ${eventsCovered}/${totalSubEvents} sub-eventos — não é um rateio`;
        } else {
          // Verificar se valores são ~iguais
          const values = Object.values(totalsByEvent);
          const avg = values.reduce((s, v) => s + v, 0) / values.length;
          const maxDeviation = Math.max(...values.map((v) => Math.abs(v - avg) / avg));
          if (maxDeviation > TOLERANCE) {
            const minV = Math.min(...values);
            const maxV = Math.max(...values);
            reason = `Valores divergem entre sub-eventos (${formatCurrency(minV)} – ${formatCurrency(maxV)}) — não é um rateio clássico`;
          } else {
            isValidRateio = true;
            reason = `Despesa partilhada: ${formatCurrency(avg)} em cada um dos ${totalSubEvents} sub-eventos`;
          }
        }

        return { id, ...v, totalsByEvent, isValidRateio, reason, totalAmount };
      })
      .sort((a, b) => {
        // válidos primeiro
        if (a.isValidRateio !== b.isValidRateio) return a.isValidRateio ? -1 : 1;
        return a.catCode.localeCompare(b.catCode);
      });
  }, [orphans, childEventIds, masterCategoryIds]);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return grouped;
    const q = search.toLowerCase();
    return grouped.filter((g) =>
      g.catCode.toLowerCase().includes(q) ||
      g.catName.toLowerCase().includes(q) ||
      g.items.some((t: any) =>
        (t.description || "").toLowerCase().includes(q) ||
        (eventNameMap[t.event_id] || "").toLowerCase().includes(q) ||
        (t.invoice_ref || "").toLowerCase().includes(q) ||
        (t.financial_accounts?.name || "").toLowerCase().includes(q)
      )
    );
  }, [grouped, search, eventNameMap]);

  const validGroups = useMemo(() => filteredGroups.filter((g) => g.isValidRateio), [filteredGroups]);
  const invalidGroups = useMemo(() => filteredGroups.filter((g) => !g.isValidRateio), [filteredGroups]);

  const toggleGroup = (id: string) => {
    const next = new Set(selectedGroups);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedGroups(next);
  };
  const toggleAll = () => {
    if (selectedGroups.size === validGroups.length) setSelectedGroups(new Set());
    else setSelectedGroups(new Set(validGroups.map((g) => g.id)));
  };

  const handleAdopt = async () => {
    if (selectedGroups.size === 0) return;
    setSaving(true);
    try {
      const groups = validGroups.filter((g) => selectedGroups.has(g.id));
      let createdMasters = 0;
      let createdSplits = 0;

      for (const g of groups) {
        const sample = g.items[0];
        // Criar linha Master para a categoria (com o total)
        const { data: newMaster, error: mErr } = await supabase
          .from("event_forecasts")
          .insert({
            event_id: masterEventId,
            type: "expense",
            description: g.catName,
            category_id: g.id,
            amount: g.totalAmount,
            iva_rate: sample.iva_rate ?? 23,
            status: "approved",
            formula_type: "fixed",
            formula_value: g.totalAmount,
          })
          .select("id")
          .single();
        if (mErr) throw mErr;
        const masterId = newMaster.id;
        createdMasters++;

        // Para cada transação: criar split no sub-evento ligado ao Master + tx
        for (const t of g.items) {
          const { error: sErr } = await supabase.from("event_forecasts").insert({
            event_id: t.event_id,
            type: "expense",
            description: t.description || g.catName,
            category_id: t.category_id,
            amount: t.amount,
            iva_rate: t.iva_rate ?? 23,
            status: "approved",
            formula_type: "fixed",
            formula_value: t.amount,
            master_forecast_id: masterId,
            transaction_id: t.id,
          });
          if (sErr) throw sErr;
          createdSplits++;
        }
      }

      queryClient.invalidateQueries({ queryKey: ["event_forecasts"] });
      queryClient.invalidateQueries({ queryKey: ["all_orphan_txs"] });
      queryClient.invalidateQueries({ queryKey: ["adopted_forecasts"] });
      queryClient.invalidateQueries({ queryKey: ["master_categories_for_orphans"] });
      toast({
        title: "Rateios criados",
        description: `${createdMasters} linha(s) Master · ${createdSplits} split(s) vinculado(s).`,
      });
      setSelectedGroups(new Set());
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro ao adotar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Transações Órfãs dos Sub-Eventos
          </DialogTitle>
          <DialogDescription>
            Apenas categorias que aparecem em <strong>todos</strong> os sub-eventos com <strong>valores idênticos</strong> e que <strong>ainda não existem no BP Master</strong> são candidatas a rateio. As restantes devem ser adotadas individualmente em linhas Master existentes (botão ↗) ou ignoradas.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Pesquisar por descrição, categoria, evento, fatura ou conta…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {isLoading ? (
            <div className="flex flex-1 items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> A carregar…
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-12 text-sm text-muted-foreground">
              {orphans.length === 0 ? "🎉 Nenhuma transação órfã encontrada." : "Nenhum resultado para a pesquisa."}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* ── Candidatos válidos a rateio ── */}
              {validGroups.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold text-success uppercase tracking-wider">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Candidatos a rateio Master ({validGroups.length})
                    </div>
                    <button
                      onClick={toggleAll}
                      className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs hover:bg-secondary"
                    >
                      <Checkbox checked={selectedGroups.size === validGroups.length && validGroups.length > 0} className="h-3.5 w-3.5 pointer-events-none" />
                      Selecionar todos
                    </button>
                  </div>
                  {validGroups.map((g) => {
                    const isSel = selectedGroups.has(g.id);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => toggleGroup(g.id)}
                        className={`w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                          isSel ? "border-success bg-success/5" : "border-success/30 hover:bg-success/5"
                        }`}
                      >
                        <Checkbox checked={isSel} className="mt-0.5 pointer-events-none" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Layers className="h-4 w-4 text-success shrink-0" />
                            <span className="font-mono text-sm text-success font-semibold">{g.catCode}</span>
                            <span className="font-medium text-sm">{g.catName}</span>
                            <span className="text-[10px] rounded-full bg-success/15 text-success px-2 py-0.5">Rateio válido</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <Info className="h-3 w-3" />
                            {g.reason}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-1">
                            {g.items.length} transação(ões) em {Object.keys(g.totalsByEvent).length} sub-eventos
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono text-sm font-semibold">{formatCurrency(g.totalAmount)}</div>
                          <div className="text-[10px] text-muted-foreground">total</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* ── Não elegíveis ── */}
              {invalidGroups.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2 border-t border-border/50">
                    <XCircle className="h-3.5 w-3.5" />
                    Não elegíveis a rateio ({invalidGroups.length})
                  </div>
                  {invalidGroups.map((g) => (
                    <div key={g.id} className="rounded-lg border border-border/50 bg-muted/30 p-3 opacity-80">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="font-mono text-xs text-warning">{g.catCode}</span>
                        <span className="text-sm">{g.catName}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{g.items.length} item(ns) · {formatCurrency(g.totalAmount)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                        <Info className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>{g.reason}</span>
                      </div>
                      {/* Detalhe por sub-evento para entender o porquê */}
                      <div className="mt-2 text-[11px] text-muted-foreground grid grid-cols-2 gap-x-3 gap-y-0.5">
                        {Object.entries(g.totalsByEvent).map(([eid, v]) => (
                          <div key={eid} className="flex justify-between gap-2">
                            <span className="truncate">{eventNameMap[eid] || "—"}</span>
                            <span className="font-mono">{formatCurrency(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-lg px-4 py-2 text-sm hover:bg-secondary"
            disabled={saving}
          >
            Fechar
          </button>
          <button
            onClick={handleAdopt}
            disabled={selectedGroups.size === 0 || saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar rateio Master {selectedGroups.size > 0 ? `(${selectedGroups.size})` : ""}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

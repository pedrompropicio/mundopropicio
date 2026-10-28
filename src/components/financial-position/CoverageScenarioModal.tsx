import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";
import { invalidateEventFinancials } from "@/lib/invalidate-event-financials";
import { formatPositionAmount } from "@/lib/financial-position";
import { forecastEvent, REAL_SCENARIO, type CoverageScenario, type PlanningEvent } from "../../../supabase/functions/_shared/ticketing/planning-forecast";

interface Props { eventId: string; onClose: () => void }

function ScenarioForm({ event, root, companyId, onClose }: { event: PlanningEvent; root: PlanningEvent; companyId: string; onClose: () => void }) {
  const { isAdmin, isManager } = useAuth();
  const qc = useQueryClient();
  const initial = event.cenario ?? { ...(root.cenario ?? REAL_SCENARIO), receita_manual_bruta: null };
  const [mode, setMode] = useState<CoverageScenario["modo"]>(initial.modo);
  const [percentage, setPercentage] = useState(String(initial.percentagem));
  const [manual, setManual] = useState(initial.receita_manual_bruta == null ? "" : String(initial.receita_manual_bruta));
  const [days, setDays] = useState(initial.viragem_real_dias == null ? "" : String(initial.viragem_real_dias));
  const canEdit = isAdmin || isManager;
  const history = useQuery({ queryKey: ["coverage-scenario-history", companyId, event.event_id], queryFn: async () => {
    const { data, error } = await supabase.from("event_coverage_scenario_log").select("id,op,changed_at,new")
      .eq("company_id", companyId).eq("event_id", event.event_id).order("changed_at", { ascending: false }).limit(20);
    if (error) throw error;
    return data;
  } });
  const numericManual = manual === "" ? null : Number(manual);
  const preview = forecastEvent(event.zonas, numericManual);
  const valid = percentage.trim() !== "" && Number.isFinite(Number(percentage)) && Number(percentage) >= 0 && Number(percentage) <= 100
    && (numericManual == null || (Number.isFinite(numericManual) && numericManual >= 0))
    && (days === "" || (Number.isInteger(Number(days)) && Number(days) >= 0));
  const mutation = useMutation({
    mutationFn: async (inherit: boolean) => {
      if (!canEdit) throw new Error("Sem autorização para editar o cenário");
      if (!valid && !inherit) throw new Error("Verifique os valores do cenário");
      const result = inherit
        ? await supabase.from("event_coverage_scenarios").delete().eq("event_id", event.event_id).eq("company_id", companyId)
        : await supabase.from("event_coverage_scenarios").upsert({ event_id: event.event_id, company_id: companyId,
          modo: mode, percentagem: Number(percentage), receita_manual_bruta: numericManual,
          viragem_real_dias: days === "" ? null : Number(days) }, { onConflict: "event_id" });
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      invalidateEventFinancials(qc);
      qc.invalidateQueries({ queryKey: ["coverage-scenario-planning"] });
      toast.success("Cenário de receita guardado"); onClose();
    },
    onError: (error: Error) => toast.error("Não foi possível guardar", { description: error.message }),
  });
  return <div className="space-y-4 py-3">
    <p className="text-sm font-medium">{event.nome}</p>
    {event.event_id !== root.event_id && !event.cenario && <p className="text-xs text-muted-foreground">Cenário herdado de {root.nome}</p>}
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1"><Label htmlFor="coverage-mode">Modo</Label><Select value={mode} onValueChange={v => setMode(v as CoverageScenario["modo"])} disabled={!canEdit || mutation.isPending}>
        <SelectTrigger id="coverage-mode"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="real">Real</SelectItem><SelectItem value="previsao">Previsão</SelectItem></SelectContent>
      </Select></div>
      <div className="space-y-1"><Label htmlFor="coverage-percentage">Percentagem considerada (%)</Label><Input id="coverage-percentage" type="number" min="0" max="100" step="0.01" value={percentage} onChange={e => setPercentage(e.target.value)} disabled={!canEdit || mutation.isPending} /></div>
      <div className="space-y-1"><Label htmlFor="coverage-manual">Receita manual bruta (€)</Label><Input id="coverage-manual" type="number" min="0" step="0.01" value={manual} onChange={e => setManual(e.target.value)} disabled={!canEdit || preview.source === "lotes" || mutation.isPending} /></div>
      <div className="space-y-1"><Label htmlFor="coverage-days">Viragem para Real (dias antes)</Label><Input id="coverage-days" type="number" min="0" step="1" value={days} onChange={e => setDays(e.target.value)} disabled={!canEdit || mutation.isPending} /></div>
    </div>
    <dl className="space-y-2 border-t border-border pt-3 text-sm">
      <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Previsão bruta · {preview.source === "lotes" ? "lotes" : preview.source === "manual" ? "manual" : "sem previsão"}</dt><dd className="tabular-nums">{formatPositionAmount(preview.value)}</dd></div>
      <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Previsto original (referência)</dt><dd className="tabular-nums">{formatPositionAmount(event.previsto_original)}</dd></div>
    </dl>
    <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Histórico de alterações</summary>
      {history.isLoading ? <p role="status">A carregar…</p> : history.isError ? <p role="alert">Histórico indisponível.</p> : history.data?.length ? <ol className="divide-y divide-border">
        {history.data.map(row => { const snapshot = row.new as unknown as CoverageScenario | null; return <li key={row.id} className="py-2 text-xs">
          {new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Lisbon" }).format(new Date(row.changed_at))} · {snapshot ? `${snapshot.modo} · ${snapshot.percentagem}%` : "Herdar da raiz"}
        </li>; })}
      </ol> : <p className="py-2 text-xs text-muted-foreground">Sem alterações registadas.</p>}
    </details>
    <DialogFooter className="gap-2">
      {canEdit && event.event_id !== root.event_id && event.cenario && <Button variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate(true)}>Herdar da raiz</Button>}
      <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      {canEdit && <Button disabled={!valid || mutation.isPending} onClick={() => mutation.mutate(false)}>{mutation.isPending ? "A guardar…" : "Guardar"}</Button>}
    </DialogFooter>
  </div>;
}

export function CoverageScenarioModal({ eventId, onClose }: Props) {
  const { companyId } = useCompany();
  const { user, isAdmin, isManager, hasPermission } = useAuth();
  const query = useQuery({
    queryKey: ["coverage-scenario-planning", companyId, user?.id, eventId],
    enabled: !!companyId && !!user && (isAdmin || isManager || hasPermission("view_financial_position")),
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_financial_position_base", { p_company_id: companyId, p_year: null });
      if (error) throw error;
      const raw = data as unknown as { a_pagar: { por_evento: Array<{ evento_id: string; planeamento: PlanningEvent[] | null }> } };
      const group = raw.a_pagar.por_evento.find(g => g.planeamento?.some(e => e.event_id === eventId));
      const event = group?.planeamento?.find(e => e.event_id === eventId);
      const root = group?.planeamento?.find(e => e.event_id === group.evento_id);
      if (!event || !root) throw new Error("Evento fora de planeamento ou em curso");
      return { event, root };
    },
  });
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent>
    <DialogHeader><DialogTitle>Cenário de receita</DialogTitle><DialogDescription>Bilheteira · cobertura de eventos futuros</DialogDescription></DialogHeader>
    {query.isLoading ? <p role="status">A carregar cenário…</p> : query.data && companyId
      ? <ScenarioForm key={`${query.data.event.event_id}:${JSON.stringify(query.data.event.cenario)}:${JSON.stringify(query.data.root.cenario)}`} event={query.data.event} root={query.data.root} companyId={companyId} onClose={onClose} />
      : <p role="alert">Não foi possível carregar o cenário deste evento.</p>}
  </DialogContent></Dialog>;
}
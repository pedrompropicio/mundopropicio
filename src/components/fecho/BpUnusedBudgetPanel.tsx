import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PiggyBank, Check } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/mock-data";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { computeUnusedBudget, vatLabel, type AmountLine } from "@/lib/event-cost-basis";
import { type FechoBasis } from "@/hooks/useFechoBasis";

interface Props {
  eventId: string;
  /** Linhas operacionais do BP já em memória no Fecho (sem overhead). */
  operationalForecasts: AmountLine[];
  /** Transações de despesa já em memória no Fecho (universo canónico). */
  expenseTx: (AmountLine & { account_categories?: { code?: string | null; name?: string | null } | null })[];
  basis: FechoBasis;
}

const NO_CATEGORY = "__no_category__";

/**
 * Verba de BP por usar, por rubrica. SÓ LEITURA (+ registo do reconhecimento).
 * Não toca no cálculo do resultado, no acerto com sócios nem em blockers de fecho.
 */
export function BpUnusedBudgetPanel({ eventId, operationalForecasts, expenseTx, basis }: Props) {
  const { user, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const canManageBp = hasPermission("manage_bp");

  // Eventos sem BP: painel não se aplica.
  const { data: budgetMode, isLoading: loadingMode } = useQuery({
    queryKey: ["event-budget-mode", eventId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("event_budget_mode", { _event_id: eventId });
      if (error) throw error;
      return (data as string | null) ?? "with_bp";
    },
  });
  const hasBp = budgetMode !== "without_bp";

  // Vista (respeita o seletor) e registo (SEMPRE s/IVA).
  const rowsView = useMemo(
    () => computeUnusedBudget(operationalForecasts, expenseTx, basis.withVat),
    [operationalForecasts, expenseTx, basis.withVat],
  );
  const rowsNet = useMemo(
    () => computeUnusedBudget(operationalForecasts, expenseTx, false),
    [operationalForecasts, expenseTx],
  );

  const totalView = rowsView.reduce((s, r) => s + r.unused, 0);
  const totalNet = rowsNet.reduce((s, r) => s + r.unused, 0);

  // Rubricas conhecidas via transações; o resto vem de uma query única.
  const knownCats = useMemo(() => {
    const m = new Map<string, { code?: string | null; name?: string | null }>();
    for (const t of expenseTx) {
      const cat = (t as any).account_categories;
      if (t.category_id && cat) m.set(t.category_id, cat);
    }
    return m;
  }, [expenseTx]);

  const missingIds = useMemo(
    () => rowsView.map((r) => r.key).filter((k) => k !== NO_CATEGORY && !knownCats.has(k)),
    [rowsView, knownCats],
  );

  const { data: fetchedCats = [] } = useQuery({
    queryKey: ["bp-unused-categories", missingIds.slice().sort().join(",")],
    enabled: missingIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_categories")
        .select("id, code, name")
        .in("id", missingIds);
      if (error) throw error;
      return data || [];
    },
  });

  const catLabel = (key: string) => {
    if (key === NO_CATEGORY) return "Sem rubrica";
    const c = knownCats.get(key) ?? fetchedCats.find((f: any) => f.id === key);
    if (!c) return "—";
    return [c.code, c.name].filter(Boolean).join(" · ") || "—";
  };

  const { data: ack } = useQuery({
    queryKey: ["bp-review-ack", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_bp_review_acks")
        .select("id, acknowledged_by, acknowledged_at, unused_net, lines_count")
        .eq("event_id", eventId)
        .order("acknowledged_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", data.acknowledged_by)
        .maybeSingle();
      return { ...data, ackName: prof?.full_name || prof?.email || "—" };
    },
  });

  const ackMatches =
    !!ack &&
    ack.lines_count === rowsNet.length &&
    Math.abs(Number(ack.unused_net) - totalNet) <= 0.01;

  async function handleAck() {
    setSaving(true);
    try {
      const { data: ev, error: evErr } = await supabase
        .from("events")
        .select("company_id")
        .eq("id", eventId)
        .single();
      if (evErr) throw evErr;

      const { error } = await supabase.from("event_bp_review_acks").insert({
        event_id: eventId,
        company_id: ev.company_id,
        acknowledged_by: user?.id,
        unused_net: totalNet,
        lines_count: rowsNet.length,
      });
      if (error) throw error;
      toast.success("Verbas marcadas como revistas");
      queryClient.invalidateQueries({ queryKey: ["bp-review-ack", eventId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível registar a revisão");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border/50 flex flex-wrap items-center gap-2">
        <PiggyBank className="h-4 w-4 text-primary" />
        <span className="font-semibold text-sm">Verba por usar</span>
        <span className="font-mono text-sm font-bold">{formatCurrency(totalView)}</span>
        <Badge variant="outline" className="text-[10px]">Despesas {vatLabel(basis.withVat)}</Badge>
      </div>

      <p className="px-4 py-2 text-[11px] text-muted-foreground border-b border-border/50">
        Lista de revisão, não de erro. Faturas de um evento podem chegar depois de ele acontecer — o valor que deve ficar em cada linha é decisão de gestão.
      </p>

      {rowsView.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          Nenhuma rubrica com verba por usar.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rubrica</TableHead>
              <TableHead className="text-right">Previsto</TableHead>
              <TableHead className="text-right">Realizado</TableHead>
              <TableHead className="text-right">Por usar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowsView.map((r) => (
              <TableRow key={r.key}>
                <TableCell className="text-sm">
                  {catLabel(r.key)}
                  {r.realized === 0 && (
                    <Badge variant="outline" className="ml-2 text-[9px] text-muted-foreground">
                      sem transações
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">{formatCurrency(r.forecast)}</TableCell>
                <TableCell className="text-right font-mono text-sm text-muted-foreground">
                  {formatCurrency(r.realized)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm font-semibold">
                  {formatCurrency(r.unused)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="px-4 py-3 border-t border-border/50 flex flex-wrap items-center gap-2">
        {ack && ackMatches ? (
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Check className="h-3.5 w-3.5 text-success" />
            Revisto por {ack.ackName} em {format(new Date(ack.acknowledged_at), "dd/MM/yyyy HH:mm")}
          </span>
        ) : (
          <>
            {ack && (
              <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/30">
                Revisão desactualizada
              </Badge>
            )}
            {canManageBp && (
              <Button size="sm" variant="outline" onClick={handleAck} disabled={saving}>
                <Check className="mr-1.5 h-3.5 w-3.5" /> Marcar verbas como revistas
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

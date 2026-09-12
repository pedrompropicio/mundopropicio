/**
 * Painel "Apuramentos" — SÓ LEITURA (épica #146, sub-tarefa (a)).
 *
 * Lê `event_settlements` + `event_settlement_participants`. Nesta fase estas
 * tabelas são um ESPELHO de `event_partners` (mantido por trigger na BD) e
 * NENHUM cálculo do sistema as consome: o Fecho, o card e o Encontro de Contas
 * continuam a ler `event_partners`. Sem edição nesta peça.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Layers, Info } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { HOUSE_PARTNER_NAME } from "@/lib/house-partner";

interface Props {
  eventId: string;
}

const fmtPct = (v: number | string | null | undefined) =>
  v === null || v === undefined ? "—" : `${Number(v)}%`;

export function EventSettlementsPanel({ eventId }: Props) {
  const { data: settlements = [], isLoading } = useQuery({
    queryKey: ["event-settlements", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_settlements")
        .select("id, name, parent_id, parent_share_pct, parent_share_basis, position, is_sealed, sealed_at")
        .eq("event_id", eventId)
        .order("position", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: participants = [] } = useQuery({
    queryKey: ["event-settlement-participants", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_settlement_participants")
        .select(
          "id, settlement_id, participant_kind, mode, profit_pct, loss_pct, expense_includes_iva, can_order, can_pay, visible_in_docs, supplier:suppliers(name)",
        )
        .eq("event_id", eventId);
      if (error) throw error;
      return data ?? [];
    },
  });

  /**
   * Perímetro (#146 (b)) — quantas linhas de BP e transações estão marcadas
   * para cada apuramento. ATENÇÃO: a coluna é `event_settlement_id`;
   * `transactions.settlement_id` é o fecho de bilheteira, coisa diferente.
   */
  const { data: perimeter } = useQuery({
    queryKey: ["event-settlement-perimeter", eventId],
    queryFn: async () => {
      const [f, t] = await Promise.all([
        supabase.from("event_forecasts").select("event_settlement_id").eq("event_id", eventId).not("event_settlement_id", "is", null),
        supabase.from("transactions").select("event_settlement_id").eq("event_id", eventId).not("event_settlement_id", "is", null),
      ]);
      if (f.error) throw f.error;
      if (t.error) throw t.error;
      const counts: Record<string, { bp: number; tx: number }> = {};
      const bump = (id: string, k: "bp" | "tx") => {
        counts[id] = counts[id] ?? { bp: 0, tx: 0 };
        counts[id][k] += 1;
      };
      (f.data ?? []).forEach((r: any) => bump(r.event_settlement_id, "bp"));
      (t.data ?? []).forEach((r: any) => bump(r.event_settlement_id, "tx"));
      return counts;
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">A carregar apuramentos…</p>;
  if (settlements.length === 0)
    return <p className="text-sm text-muted-foreground">Este evento ainda não tem apuramentos.</p>;

  const roots = settlements.filter((s: any) => !s.parent_id);
  const childrenOf = (id: string) => settlements.filter((s: any) => s.parent_id === id);

  const renderSettlement = (s: any, depth: number) => {
    const rows = participants.filter((p: any) => p.settlement_id === s.id);
    return (
      <div key={s.id} className={depth > 0 ? "ml-4 border-l border-border/60 pl-4" : ""}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">{s.name}</span>
          {s.parent_id && (
            <Badge variant="outline" className="text-xs">
              {fmtPct(s.parent_share_pct)} do apuramento acima
              {s.parent_share_basis === "net_result_gross_expenses" ? " · despesas c/IVA" : " · despesas s/IVA"}
            </Badge>
          )}
          {s.is_sealed && <Badge className="text-xs">Selado</Badge>}
          <Badge variant="secondary" className="text-[10px]">
            Perímetro: {perimeter?.[s.id]?.bp ?? 0} linha(s) de BP · {perimeter?.[s.id]?.tx ?? 0} transação(ões)
          </Badge>
        </div>


        {rows.length === 0 ? (
          <p className="mb-4 text-xs text-muted-foreground">Sem participantes.</p>
        ) : (
          <div className="mb-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Participante</TableHead>
                  <TableHead>Modo</TableHead>
                  <TableHead className="text-right">% Lucro</TableHead>
                  <TableHead className="text-right">% Perda</TableHead>
                  <TableHead>Base de IVA</TableHead>
                  <TableHead>Encomendar</TableHead>
                  <TableHead>Pagar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      {p.participant_kind === "house" ? HOUSE_PARTNER_NAME : (p.supplier?.name ?? "—")}
                      {p.participant_kind === "house" && (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          casa
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {p.mode === "settles" ? "Acerta" : "Nominal"}
                    </TableCell>
                    <TableCell className="text-right">{fmtPct(p.profit_pct)}</TableCell>
                    <TableCell className="text-right">
                      {p.loss_pct === null ? `${fmtPct(p.profit_pct)} (igual ao lucro)` : fmtPct(p.loss_pct)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {p.expense_includes_iva === null || p.expense_includes_iva === undefined
                        ? "Herda o evento"
                        : p.expense_includes_iva
                          ? "Despesas c/IVA"
                          : "Despesas s/IVA"}
                    </TableCell>
                    <TableCell className="text-xs">{p.can_order ? "Sim" : "Não"}</TableCell>
                    <TableCell className="text-xs">{p.can_pay ? "Sim" : "Não"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {childrenOf(s.id).map((c: any) => renderSettlement(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Vista informativa. Os valores acompanham automaticamente a lista de sócios acima; o fecho e o
        encontro de contas continuam a usar essa lista.
      </p>
      {roots.map((r: any) => renderSettlement(r, 0))}
    </div>
  );
}

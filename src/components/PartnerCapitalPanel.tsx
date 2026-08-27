import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Landmark, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { format } from "date-fns";
import { isCapitalCategoryCode, capitalKindFromCode, type CapitalKind } from "@/lib/capital-branch";

// Re-export para não quebrar importadores existentes (SSoT vive em lib/capital-branch).
export { capitalKindFromCode };
export type { CapitalKind };


const KIND_LABEL: Record<CapitalKind, string> = {
  aporte: "Aporte",
  devolucao: "Devolução de aporte",
  distribuicao: "Distribuição de resultado",
};

interface Props {
  eventId: string;
  eventStatus?: string;
  /** Modo informativo: mostra só o resumo por sócio (usado no Acerto com Sócios). */
  summaryOnly?: boolean;
}

/**
 * Capital do Sócio (AEP — Associação em Participação, DL 231/81 PT).
 * Liga transações do ramo 10.1 · Capital a um sócio do evento.
 * NÃO participa em nenhum cálculo do acerto operacional.
 */
export function PartnerCapitalPanel({ eventId, eventStatus, summaryOnly = false }: Props) {
  const queryClient = useQueryClient();
  const { isAdmin, isManager } = useAuth();
  const canEdit = (isAdmin || isManager) && eventStatus !== "completed" && !summaryOnly;

  const { data: subEventIds = [] } = useQuery({
    queryKey: ["sub-event-ids", eventId],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id").eq("parent_event_id", eventId);
      if (error) throw error;
      return (data ?? []).map((e: any) => e.id as string);
    },
  });

  const treeIds = [eventId, ...subEventIds];

  const { data: partners = [] } = useQuery({
    queryKey: ["event-partners", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_partners")
        .select("*, suppliers(name)")
        .eq("event_id", eventId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Transações do ramo 10.1 · Capital em todo o tree do evento
  const { data: capitalTxs = [] } = useQuery({
    queryKey: ["partner-capital-txs", eventId, subEventIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, description, amount, date, type, event_id, category_id, account_categories(code, name)")
        .in("event_id", treeIds)
        .order("date", { ascending: false });
      if (error) throw error;
      return (data ?? []).filter((t: any) => isCapitalCategoryCode(t.account_categories?.code));
    },
    enabled: treeIds.length > 0,
  });

  const { data: links = [] } = useQuery({
    queryKey: ["partner-capital-moves", eventId, subEventIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_capital_moves")
        .select("*")
        .in("event_id", treeIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: treeIds.length > 0,
  });

  const linkByTx = new Map<string, any>((links as any[]).map((l) => [l.transaction_id, l]));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["partner-capital-moves", eventId] });
  };

  const linkMutation = useMutation({
    mutationFn: async ({ tx, partnerId }: { tx: any; partnerId: string }) => {
      const kind = capitalKindFromCode(tx.account_categories?.code);
      if (!kind) {
        throw new Error(
          "Só transações de capital (ramo 10.1) podem ser ligadas a um sócio como movimento de capital",
        );
      }
      const { error } = await supabase.from("partner_capital_moves").insert({
        event_id: tx.event_id,
        partner_id: partnerId,
        transaction_id: tx.id,
        kind,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Movimento de capital vinculado ao sócio" });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const unlinkMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("partner_capital_moves").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Vínculo removido" });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  // Resumo por sócio
  const summary = (partners as any[]).map((p) => {
    let aportes = 0;
    let devolucoes = 0;
    let distribuicoes = 0;
    (capitalTxs as any[]).forEach((tx) => {
      const link = linkByTx.get(tx.id);
      if (!link || link.partner_id !== p.id) return;
      const v = Number(tx.amount || 0);
      if (link.kind === "aporte") aportes += v;
      else if (link.kind === "devolucao") devolucoes += v;
      else if (link.kind === "distribuicao") distribuicoes += v;
    });
    return {
      partnerId: p.id,
      name: p.suppliers?.name ?? "—",
      aportes,
      devolucoes,
      distribuicoes,
      outstanding: aportes - devolucoes,
    };
  });

  const hasAny = summary.some((s) => s.aportes || s.devolucoes || s.distribuicoes);

  if (partners.length === 0) {
    if (summaryOnly) return null;
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        Sem sócios cadastrados neste evento. Adicione sócios no separador "Sócios" para utilizar esta funcionalidade.
      </div>
    );
  }

  if (summaryOnly && !hasAny) return null;

  const summaryTable = (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Sócio</TableHead>
          <TableHead className="text-right">Aportes</TableHead>
          <TableHead className="text-right">Devoluções</TableHead>
          <TableHead className="text-right">Distribuições</TableHead>
          <TableHead className="text-right">Capital em dívida</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {summary.map((s) => (
          <TableRow key={s.partnerId}>
            <TableCell className="text-sm font-medium">{s.name}</TableCell>
            <TableCell className="text-right font-mono text-success">{formatCurrency(s.aportes)}</TableCell>
            <TableCell className="text-right font-mono">{formatCurrency(s.devolucoes)}</TableCell>
            <TableCell className="text-right font-mono">{formatCurrency(s.distribuicoes)}</TableCell>
            <TableCell className="text-right font-mono font-bold">{formatCurrency(s.outstanding)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  if (summaryOnly) {
    return (
      <div className="glass rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50 bg-muted/30 flex items-center gap-2">
          <Landmark className="h-4 w-4 text-primary" />
          <span className="font-semibold">Capital do Sócio (AEP)</span>
          <Badge variant="outline" className="text-[10px]">informativo</Badge>
        </div>
        {summaryTable}
        <p className="px-4 py-2.5 text-[11px] text-muted-foreground">
          Valores de capital — informativo; não incluídos no acerto operacional nesta fase.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Landmark className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Capital do Sócio (AEP)</h3>
      </div>

      <div className="glass rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border/50 bg-muted/30">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Movimentos de capital (ramo 10.1)
          </span>
        </div>
        {capitalTxs.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            Sem transações do ramo 10.1 · Capital neste evento.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Sócio</TableHead>
                {canEdit && <TableHead className="w-[40px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(capitalTxs as any[]).map((tx) => {
                const link = linkByTx.get(tx.id);
                const kind = capitalKindFromCode(tx.account_categories?.code);
                return (
                  <TableRow key={tx.id}>
                    <TableCell className="text-xs font-mono">
                      {tx.date ? format(new Date(tx.date), "dd/MM/yyyy") : "—"}
                    </TableCell>
                    <TableCell className="text-sm">{tx.description || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {tx.account_categories?.code} · {tx.account_categories?.name}
                    </TableCell>
                    <TableCell className="text-xs">
                      {kind ? <Badge variant="outline" className="text-[10px]">{KIND_LABEL[kind]}</Badge> : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(Number(tx.amount || 0))}</TableCell>
                    <TableCell className="min-w-[200px]">
                      {link ? (
                        <span className="text-sm">
                          {(partners as any[]).find((p) => p.id === link.partner_id)?.suppliers?.name ?? "—"}
                        </span>
                      ) : canEdit ? (
                        <SearchableSelect
                          options={(partners as any[]).map((p) => ({
                            value: p.id,
                            label: `${p.suppliers?.name} (${p.percentage}%)`,
                          }))}
                          value=""
                          onValueChange={(partnerId) => linkMutation.mutate({ tx, partnerId })}
                          placeholder="Vincular a sócio…"
                          searchPlaceholder="Pesquisar sócio…"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">Sem vínculo</span>
                      )}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        {link && (
                          <button
                            onClick={() => unlinkMutation.mutate(link.id)}
                            className="p-1 rounded hover:bg-destructive/10 transition-colors"
                            title="Desvincular"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="glass rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border/50 bg-muted/30">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Resumo por sócio</span>
        </div>
        {summaryTable}
        <p className="px-4 py-2.5 text-[11px] text-muted-foreground">
          Capital em dívida = Aportes − Devoluções. Valores de capital — informativo; não incluídos no acerto
          operacional nesta fase.
        </p>
      </div>
    </div>
  );
}

export default PartnerCapitalPanel;

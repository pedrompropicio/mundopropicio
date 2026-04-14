import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileWarning, FolderOpen, Clock, AlertTriangle } from "lucide-react";

export default function ReportPendencyIndex() {
  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["pendency-txs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, description, amount, type, status, category_id, account_id, event_id, date, events(name)")
        .in("status", ["pending", "approved", "paid"]);
      if (error) throw error;
      return data;
    },
  });

  const { data: documents = [] } = useQuery({
    queryKey: ["pendency-docs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transaction_documents")
        .select("transaction_id, is_accounting");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: forecasts = [] } = useQuery({
    queryKey: ["pendency-forecasts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("id, status, event_id, description, events(name)")
        .eq("status", "pending");
      if (error) throw error;
      return data;
    },
  });

  const pendencies = useMemo(() => {
    const docMap = new Map<string, boolean>();
    for (const doc of documents) {
      if (doc.is_accounting) docMap.set(doc.transaction_id, true);
    }

    const noCategory = transactions.filter((t) => !t.category_id && t.status !== "pending");
    const noDoc = transactions.filter((t) => t.account_id && !docMap.has(t.id) && t.status === "paid");
    const pendingApproval = transactions.filter((t) => t.status === "pending");
    const pendingForecasts = forecasts;

    return { noCategory, noDoc, pendingApproval, pendingForecasts };
  }, [transactions, documents, forecasts]);

  const cards = [
    { icon: FolderOpen, label: "Sem Categoria", count: pendencies.noCategory.length, color: "text-warning" },
    { icon: FileWarning, label: "Sem Doc. Contábil", count: pendencies.noDoc.length, color: "text-destructive" },
    { icon: Clock, label: "Aguardam Aprovação", count: pendencies.pendingApproval.length, color: "text-primary" },
    { icon: AlertTriangle, label: "BP Pendente", count: pendencies.pendingForecasts.length, color: "text-warning" },
  ];

  const totalPendencies = cards.reduce((s, c) => s + c.count, 0);

  if (isLoading) return <p className="py-8 text-center text-muted-foreground">A carregar…</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="glass rounded-xl p-4 text-center">
            <c.icon className={`h-6 w-6 mx-auto mb-1 ${c.color}`} />
            <p className="text-2xl font-bold">{c.count}</p>
            <p className="text-xs text-muted-foreground">{c.label}</p>
          </div>
        ))}
      </div>

      {totalPendencies === 0 && (
        <div className="text-center py-12">
          <p className="text-lg font-medium text-success">✅ Tudo em ordem!</p>
          <p className="text-sm text-muted-foreground">Não há pendências identificadas.</p>
        </div>
      )}

      {pendencies.noCategory.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2"><FolderOpen className="h-4 w-4 text-warning" /> Transações sem Categoria ({pendencies.noCategory.length})</h3>
          <div className="glass rounded-xl p-4 overflow-x-auto max-h-[300px] overflow-y-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Descrição</TableHead><TableHead>Evento</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
              <TableBody>
                {pendencies.noCategory.slice(0, 20).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.description}</TableCell>
                    <TableCell>{(t.events as any)?.name ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">{Number(t.amount).toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {pendencies.noDoc.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2"><FileWarning className="h-4 w-4 text-destructive" /> Transações Pagas sem Documento Contábil ({pendencies.noDoc.length})</h3>
          <div className="glass rounded-xl p-4 overflow-x-auto max-h-[300px] overflow-y-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Descrição</TableHead><TableHead>Evento</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
              <TableBody>
                {pendencies.noDoc.slice(0, 20).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.description}</TableCell>
                    <TableCell>{(t.events as any)?.name ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">{Number(t.amount).toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {pendencies.pendingApproval.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Transações Aguardando Aprovação ({pendencies.pendingApproval.length})</h3>
          <div className="glass rounded-xl p-4 overflow-x-auto max-h-[300px] overflow-y-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Descrição</TableHead><TableHead>Evento</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
              <TableBody>
                {pendencies.pendingApproval.slice(0, 20).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.description}</TableCell>
                    <TableCell>{(t.events as any)?.name ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">{Number(t.amount).toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

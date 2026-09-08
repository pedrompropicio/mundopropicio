import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Unlink } from "lucide-react";

interface AuditRow {
  id: string;
  run_at: string;
  transaction_id: string;
  invoice_group_id: string | null;
  file_url: string | null;
  ref_atual: string | null;
  numero_lido: string | null;
  document_type: string | null;
  confidence: string | null;
  veredicto: string;
  aplicado: boolean;
}

interface TxInfo {
  id: string;
  description: string | null;
  amount: number;
  date: string | null;
  due_date: string | null;
  supplier_id: string | null;
  suppliers?: { name: string | null } | null;
}

const eur = (n: number) =>
  Number(n ?? 0).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

export default function InvoiceGroupAudit() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const isAuthorized = role === "admin" || role === ("platform_admin" as any);
  const [running, setRunning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["invoice-group-audit"],
    enabled: isAuthorized,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_group_audit" as any)
        .select("*")
        .order("run_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as AuditRow[];
    },
  });

  const lastRunAt = rows?.[0]?.run_at ?? null;
  const lastRows = useMemo(
    () => (rows ?? []).filter((r) => r.run_at === lastRunAt),
    [rows, lastRunAt],
  );

  const { data: txMap } = useQuery({
    queryKey: ["invoice-group-audit-txs", lastRunAt],
    enabled: isAuthorized && lastRows.length > 0,
    queryFn: async () => {
      const ids = [...new Set(lastRows.map((r) => r.transaction_id))];
      const out: Record<string, TxInfo> = {};
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await supabase
          .from("transactions")
          .select("id, description, amount, date, due_date, supplier_id, suppliers(name)")
          .in("id", ids.slice(i, i + 200));
        for (const t of (data ?? []) as any[]) out[t.id] = t as TxInfo;
      }
      return out;
    },
  });

  if (!isAuthorized) return <Navigate to="/" replace />;

  const toUngroup = lastRows.filter((r) => r.veredicto === "desagrupar");
  const toReview = lastRows.filter((r) => r.veredicto === "rever");
  const okRows = lastRows.filter((r) => r.veredicto === "ok");
  const alreadyApplied = toUngroup.length > 0 && toUngroup.every((r) => r.aplicado);

  const runDryRun = async () => {
    setRunning(true);
    try {
      // O OCR é lento: a função processa poucos grupos por chamada e devolve
      // `remaining`. Repetimos com o mesmo run_at até terminar.
      let runAt: string | undefined;
      let remaining = 1;
      let desagrupar = 0;
      let rever = 0;
      let total = 0;
      let guard = 0;
      while (remaining > 0 && guard < 200) {
        guard++;
        const { data, error } = await supabase.functions.invoke("audit-invoice-groups", {
          body: { action: "dry-run", run_at: runAt, max_groups: 3 },
        });
        if (error) throw error;
        const d = data as any;
        if (d?.error) throw new Error(d.error);
        runAt = d.run_at;
        remaining = Number(d.remaining ?? 0);
        desagrupar += Number(d.linhas_desagrupar ?? 0);
        rever += Number(d.linhas_rever ?? 0);
        total = Number(d.grupos_total ?? total);
        setProgress(`${total - remaining}/${total} grupos analisados…`);
      }
      setProgress(null);
      toast({
        title: "Auditoria concluída",
        description: `${total} grupos · ${desagrupar} linhas a desagrupar · ${rever} a rever.`,
      });
      await qc.invalidateQueries({ queryKey: ["invoice-group-audit"] });
    } catch (e: any) {
      setProgress(null);
      toast({ title: "Erro na auditoria", description: e?.message ?? "Falhou", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const applyFixes = async () => {
    setApplying(true);
    try {
      const { data, error } = await supabase.functions.invoke("audit-invoice-groups", {
        body: { action: "apply" },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "Correções aplicadas", description: `${(data as any).aplicadas} linhas desagrupadas.` });
      setConfirmApply(false);
      await qc.invalidateQueries({ queryKey: ["invoice-group-audit"] });
      await qc.invalidateQueries({ queryKey: ["transactions"] });
    } catch (e: any) {
      toast({ title: "Erro ao aplicar", description: e?.message ?? "Falhou", variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  const renderTable = (list: AuditRow[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-left text-muted-foreground">
          <tr className="border-b border-border">
            <th className="py-2 pr-3">Fornecedor</th>
            <th className="py-2 pr-3">Descrição</th>
            <th className="py-2 pr-3">Nº atual</th>
            <th className="py-2 pr-3">Nº lido</th>
            <th className="py-2 pr-3 text-right">Valor</th>
            <th className="py-2 pr-3">Data</th>
            <th className="py-2 pr-3">Ficheiro</th>
            <th className="py-2 pr-3">Veredicto</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {list.map((r) => {
            const tx = txMap?.[r.transaction_id];
            return (
              <tr key={r.id} className={r.veredicto === "desagrupar" ? "bg-destructive/5" : undefined}>
                <td className="py-2 pr-3">{tx?.suppliers?.name ?? "—"}</td>
                <td className="py-2 pr-3">{tx?.description ?? "—"}</td>
                <td className="py-2 pr-3 font-mono">{r.ref_atual ?? "—"}</td>
                <td className="py-2 pr-3 font-mono">{r.numero_lido ?? "—"}</td>
                <td className="py-2 pr-3 text-right">{tx ? eur(tx.amount) : "—"}</td>
                <td className="py-2 pr-3">{tx?.date ?? tx?.due_date ?? "—"}</td>
                <td className="py-2 pr-3 max-w-[220px] truncate" title={r.file_url ?? ""}>
                  {r.file_url ? r.file_url.split("/").pop() : "sem documento"}
                </td>
                <td className="py-2 pr-3">
                  <Badge variant={r.veredicto === "desagrupar" ? "destructive" : "secondary"}>
                    {r.veredicto}
                    {r.aplicado ? " · aplicado" : ""}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="container mx-auto space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Auditoria de grupos de fatura</h1>
        <p className="text-sm text-muted-foreground">
          Lê os documentos anexos das transações agrupadas e compara o número impresso com o nº de fatura
          registado. O dry-run nunca altera transações.
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base">Última auditoria</CardTitle>
            <CardDescription>
              {lastRunAt
                ? `${new Date(lastRunAt).toLocaleString("pt-PT")} · ${okRows.length} ok · ${toUngroup.length} a desagrupar · ${toReview.length} a rever`
                : "Ainda não corrida"}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button onClick={runDryRun} disabled={running} variant="outline">
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Correr auditoria (dry-run)
            </Button>
            <Button
              onClick={() => setConfirmApply(true)}
              disabled={!lastRunAt || toUngroup.length === 0 || alreadyApplied || applying}
              variant="destructive"
            >
              <Unlink className="mr-2 h-4 w-4" />
              Aplicar correções
            </Button>
          </div>
        </CardHeader>
        {confirmApply && (
          <CardContent>
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 space-y-2">
              <p className="text-sm">
                Vão ser desagrupadas <strong>{toUngroup.length}</strong> linhas e o nº de fatura de cada uma
                passa a ser o número lido no documento. Confirmas?
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" onClick={applyFixes} disabled={applying}>
                  {applying ? "A aplicar…" : "Confirmar"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmApply(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {isLoading && <p className="text-sm text-muted-foreground">A carregar…</p>}

      {toUngroup.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-destructive">A desagrupar ({toUngroup.length})</CardTitle>
            <CardDescription>O documento anexo tem um número diferente do canónico do grupo.</CardDescription>
          </CardHeader>
          <CardContent>{renderTable(toUngroup)}</CardContent>
        </Card>
      )}

      {toReview.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">A rever manualmente ({toReview.length})</CardTitle>
            <CardDescription>
              Sem documento, sem número legível, confiança baixa ou documento que não é fatura/recibo. Nunca são
              alteradas automaticamente.
            </CardDescription>
          </CardHeader>
          <CardContent>{renderTable(toReview)}</CardContent>
        </Card>
      )}

      {okRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Grupos legítimos ({okRows.length} linhas)</CardTitle>
            <CardDescription>Documento partilhado ou número coincidente — nada a fazer.</CardDescription>
          </CardHeader>
          <CardContent>{renderTable(okRows)}</CardContent>
        </Card>
      )}
    </div>
  );
}

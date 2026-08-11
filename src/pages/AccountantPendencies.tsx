import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { respondAccountantReview } from "@/lib/accountant-reviews";
import { invalidateTransactionQueries } from "@/lib/invalidate-transactions";

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n ?? 0);

interface Row {
  id: string;
  transaction_id: string;
  status: string;
  note: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  response_note: string | null;
  responded_at: string | null;
  tx_description: string | null;
  tx_amount: number;
  tx_payment_date: string | null;
  supplier_name: string | null;
  reviewer_name: string | null;
}

export default function AccountantPendencies() {
  const { user, isAdmin, isManager, hasPermission } = useAuth();
  const { companyId } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"pendente" | "conferido" | "all">("pendente");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const allowed = isAdmin || isManager || hasPermission("manage_transactions");
  if (!allowed) return <Navigate to="/" replace />;

  const { data, isLoading } = useQuery({
    queryKey: ["accountant-pendencies", companyId, filter],
    enabled: !!companyId,
    queryFn: async (): Promise<Row[]> => {
      let q = (supabase as any)
        .from("accountant_transaction_reviews")
        .select("*, transactions:transaction_id(description, amount, payment_date, suppliers:supplier_id(name))")
        .eq("company_id", companyId)
        .order("reviewed_at", { ascending: false });
      if (filter !== "all") q = q.eq("status", filter);
      const { data: rows, error } = await q;
      if (error) throw error;

      const reviewerIds = [...new Set((rows ?? []).map((r: any) => r.reviewed_by).filter(Boolean))];
      let names: Record<string, string> = {};
      if (reviewerIds.length) {
        const { data: profs } = await (supabase as any)
          .from("profiles").select("id, full_name, email").in("id", reviewerIds);
        for (const p of profs ?? []) names[p.id] = p.full_name || p.email || "—";
      }

      return (rows ?? []).map((r: any) => ({
        ...r,
        tx_description: r.transactions?.description ?? null,
        tx_amount: Number(r.transactions?.amount ?? 0),
        tx_payment_date: r.transactions?.payment_date ?? null,
        supplier_name: r.transactions?.suppliers?.name ?? null,
        reviewer_name: r.reviewed_by ? names[r.reviewed_by] ?? "—" : "—",
      }));
    },
  });

  const respond = useMutation({
    mutationFn: async (row: Row) => {
      const text = (drafts[row.id] ?? row.response_note ?? "").trim();
      if (!text) throw new Error("Escreve a resposta.");
      if (!user) throw new Error("Sessão inválida.");
      await respondAccountantReview({ reviewId: row.id, responseNote: text, userId: user.id });
    },
    onSuccess: () => {
      toast({ title: "Resposta registada" });
      queryClient.invalidateQueries({ queryKey: ["accountant-pendencies"] });
      queryClient.invalidateQueries({ queryKey: ["accountant-pendencies-count"] });
      queryClient.invalidateQueries({ queryKey: ["accountant-review"] });
      invalidateTransactionQueries(queryClient);
    },
    onError: (e: any) => toast({ title: "Erro", description: e?.message ?? String(e), variant: "destructive" }),
  });

  const rows = data ?? [];
  const pendingCount = rows.filter((r) => r.status === "pendente").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pendências da Contabilista</h1>
          <p className="text-sm text-muted-foreground">
            Observações levantadas na conferência de documentos. Responde aqui para a contabilista re-validar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {filter === "pendente" && (
            <Badge variant="secondary" className="text-amber-500">{pendingCount} pendentes</Badge>
          )}
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
            <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="conferido">Conferidas</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
        </div>
      ) : !rows.length ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          Nada por aqui — sem registos de conferência neste filtro.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border bg-card p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {r.status === "pendente"
                    ? <AlertTriangle className="h-4 w-4 text-amber-500" />
                    : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                  <span>{r.tx_description ?? "—"}</span>
                  {r.supplier_name && <span className="text-muted-foreground">· {r.supplier_name}</span>}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{r.tx_payment_date ? format(new Date(r.tx_payment_date), "dd/MM/yyyy") : "—"}</span>
                  <span className="font-semibold text-foreground">{fmtEUR(r.tx_amount)}</span>
                  <Link to={`/transacoes?highlight=${r.transaction_id}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                    Ver transação <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>

              <div className="rounded bg-muted/40 px-2 py-1.5 text-xs">
                <p className="font-medium">
                  Observação da contabilista · {r.reviewer_name}
                  {r.reviewed_at ? ` · ${format(new Date(r.reviewed_at), "dd/MM/yyyy HH:mm")}` : ""}
                </p>
                <p className="whitespace-pre-wrap">{r.note || "—"}</p>
              </div>

              {r.response_note && (
                <div className="rounded bg-primary/5 px-2 py-1.5 text-xs">
                  <p className="flex items-center gap-1 font-medium"><MessageSquare className="h-3 w-3" /> Resposta do financeiro
                    {r.responded_at ? ` · ${format(new Date(r.responded_at), "dd/MM/yyyy HH:mm")}` : ""}
                  </p>
                  <p className="whitespace-pre-wrap">{r.response_note}</p>
                </div>
              )}

              {r.status === "pendente" && (
                <div className="space-y-1.5">
                  <Textarea
                    value={drafts[r.id] ?? r.response_note ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                    placeholder="Responder à contabilista…"
                    className="min-h-[60px] text-xs"
                  />
                  <Button size="sm" onClick={() => respond.mutate(r)} disabled={respond.isPending}>
                    {respond.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                    {r.response_note ? "Atualizar resposta" : "Responder"}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

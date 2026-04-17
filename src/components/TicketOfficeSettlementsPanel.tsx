import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, FileText, RotateCcw, Pencil, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/mock-data";
import { useAuth } from "@/contexts/AuthContext";
import { TicketOfficeSettlementModal } from "./TicketOfficeSettlementModal";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { logAudit, getAuditUser } from "@/lib/audit";

interface Props {
  officeId: string;
  officeName: string;
}

export function TicketOfficeSettlementsPanel({ officeId, officeName }: Props) {
  const { user, isAdmin, hasPermission } = useAuth();
  const canManage = isAdmin || hasPermission("manage_accounts");
  const queryClient = useQueryClient();

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState("");

  const { data: settlements = [], isLoading } = useQuery({
    queryKey: ["ticket_office_settlements", officeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ticket_office_settlements")
        .select("*, events(id, name, date)")
        .eq("financial_account_id", officeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const reverseMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      // Unlink transactions and revert their status
      const { data: linked } = await (supabase as any)
        .from("transactions")
        .select("id, type")
        .eq("settlement_id", id);
      // Restore expense txns to pending; delete the auto-created transfer
      const settlement = settlements.find((s: any) => s.id === id);
      if (settlement?.transfer_transaction_id) {
        await (supabase as any).from("transactions").delete().eq("id", settlement.transfer_transaction_id);
      }
      const expenseIds = (linked || [])
        .filter((t: any) => t.type === "expense")
        .map((t: any) => t.id);
      if (expenseIds.length > 0) {
        await (supabase as any)
          .from("transactions")
          .update({ settlement_id: null, status: "pending", payment_date: null, paid_amount: 0 })
          .in("id", expenseIds);
      }
      const { error } = await (supabase as any)
        .from("ticket_office_settlements")
        .update({
          status: "reversed",
          reversed_at: new Date().toISOString(),
          reversed_by: user?.id,
          reversal_reason: reason,
        })
        .eq("id", id);
      if (error) throw error;
      await logAudit({
        entity_type: "ticket_office_settlement",
        entity_id: id,
        action: "reverse",
        changed_by: getAuditUser(user),
        metadata: { reason },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket_office_settlements"] });
      queryClient.invalidateQueries({ queryKey: ["ticket_office_balances"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Fecho estornado");
      setReversingId(null);
      setReverseReason("");
    },
    onError: (err: any) => toast.error("Erro ao estornar", { description: err.message }),
  });

  const openDoc = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("ticket-office-settlements")
      .createSignedUrl(path, 60);
    if (error) return toast.error("Erro ao abrir ficheiro");
    window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Fechos de Bilheteira</h3>
          <p className="text-sm text-muted-foreground">Consolidação por evento de receitas, despesas e líquido transferido</p>
        </div>
        {canManage && (
          <Button onClick={() => { setEditing(null); setShowModal(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Novo Fecho
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-center text-muted-foreground py-8">A carregar…</p>
      ) : settlements.length === 0 ? (
        <div className="glass rounded-xl p-8 text-center text-muted-foreground">
          Ainda não há fechos para esta bilheteira.
        </div>
      ) : (
        <div className="space-y-3">
          {settlements.map((s: any) => {
            const netFinal = s.net_adjusted ?? s.net_calculated;
            return (
              <div key={s.id} className="glass rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold truncate">{s.events?.name ?? "—"}</h4>
                      {s.status === "confirmed" && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-500">
                          <CheckCircle2 className="h-3 w-3" /> Confirmado
                        </span>
                      )}
                      {s.status === "draft" && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-xs text-amber-500">
                          Rascunho
                        </span>
                      )}
                      {s.status === "reversed" && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-red-500/15 px-2 py-0.5 text-xs text-red-400">
                          <AlertCircle className="h-3 w-3" /> Estornado
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.events?.date ?? ""} • Criado em {new Date(s.created_at).toLocaleDateString("pt-PT")}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {s.document_url && (
                      <button
                        onClick={() => openDoc(s.document_url)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Abrir comprovativo"
                      >
                        <FileText className="h-4 w-4" />
                      </button>
                    )}
                    {canManage && s.status !== "reversed" && (s.status === "draft" || isAdmin) && (
                      <button
                        onClick={() => { setEditing(s); setShowModal(true); }}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    {isAdmin && s.status === "confirmed" && (
                      <button
                        onClick={() => setReversingId(s.id)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                        title="Estornar"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                  <div className="rounded-lg bg-secondary/40 p-2 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase">Bruto</p>
                    <p className="font-mono font-semibold text-emerald-500">{formatCurrency(Number(s.gross_revenue))}</p>
                  </div>
                  <div className="rounded-lg bg-secondary/40 p-2 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase">Deduções</p>
                    <p className="font-mono font-semibold text-red-400">−{formatCurrency(Number(s.total_deductions))}</p>
                  </div>
                  <div className="rounded-lg bg-secondary/40 p-2 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase">Líquido</p>
                    <p className={`font-mono font-semibold ${netFinal >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                      {formatCurrency(Number(netFinal))}
                    </p>
                  </div>
                  <div className="rounded-lg bg-secondary/40 p-2 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase">Transferido</p>
                    <p className="font-mono font-semibold text-amber-500">{formatCurrency(Number(s.net_transferred))}</p>
                  </div>
                </div>

                {s.adjustment_notes && (
                  <p className="text-xs text-muted-foreground italic">Ajuste: {s.adjustment_notes}</p>
                )}
                {s.notes && (
                  <p className="text-xs text-muted-foreground">{s.notes}</p>
                )}
                {s.reversal_reason && (
                  <p className="text-xs text-red-400">Motivo do estorno: {s.reversal_reason}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <TicketOfficeSettlementModal
          open={showModal}
          onClose={() => { setShowModal(false); setEditing(null); }}
          officeId={officeId}
          officeName={officeName}
          existingSettlement={editing}
        />
      )}

      <AlertDialog open={!!reversingId} onOpenChange={() => { setReversingId(null); setReverseReason(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Estornar fecho de bilheteira?</AlertDialogTitle>
            <AlertDialogDescription>
              As transações vinculadas voltarão ao estado pendente e a transferência criada será removida.
              Esta ação fica registada no log de auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Motivo do estorno (obrigatório)"
            value={reverseReason}
            onChange={(e) => setReverseReason(e.target.value)}
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!reverseReason.trim()) {
                  toast.error("Indique o motivo do estorno");
                  return;
                }
                reversingId && reverseMutation.mutate({ id: reversingId, reason: reverseReason });
              }}
              disabled={reverseMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {reverseMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Estornar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { listItemPhase, onlySettlingPayments, settledTxIdsFrom, SETTLEMENT_COLUMNS } from "@/lib/payment-settlement";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STORAGE_KEY = "approved-payment-list-reminder-shown-session";

export function ApprovedPaymentListReminder() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { data: approvedLists = [], refetch } = useQuery({
    queryKey: ["approved-payment-list-reminder"],
    enabled: isAdmin && !loading,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_lists")
        .select(`
          id,
          title,
          approved_at,
          payment_list_items (
            id,
            manually_marked_paid,
            removed_at,
            transactions (
              id,
              amount,
              iva_rate,
              paid_amount,
              status
            )
          )
        `)
        .eq("status", "approved")
        .order("approved_at", { ascending: false });

      if (error) throw error;
      const lists = (data ?? []) as any[];
      // Regra única (D-ERP86/D-ERP157): só pagamentos 'paid' não estornados liquidam.
      const txIds = [...new Set(lists.flatMap((l) =>
        (l.payment_list_items ?? []).map((i: any) => i.transactions?.id).filter(Boolean)))];
      let settled = new Set<string>();
      for (let i = 0; i < txIds.length; i += 200) {
        const { data: pays, error: pErr } = await onlySettlingPayments<any>(
          (supabase as any).from("transaction_payments").select(SETTLEMENT_COLUMNS),
        ).in("transaction_id", txIds.slice(i, i + 200));
        if (pErr) throw pErr;
        for (const id of settledTxIdsFrom(pays as any[])) settled.add(id);
      }
      return lists.map((l) => ({ ...l, settledTxIds: settled }));
    },
  });

  const reminderData = useMemo(() => {
    const listsWithUnpaid = approvedLists
      .map((list: any) => {
        const unpaidCount = (list.payment_list_items ?? []).filter((item: any) => {
          // Mesma regra de fases do ecrã da lista (issue #200): conta só "Por pagar".
          if (item.removed_at) return false;
          const tx = item.transactions;
          if (!tx) return false;
          return listItemPhase({
            txId: tx.id, txStatus: tx.status, manuallyMarkedPaid: item.manually_marked_paid,
            settledTxIds: list.settledTxIds ?? new Set<string>(),
          }) === "unpaid";
        }).length;

        return {
          id: list.id as string,
          title: list.title as string,
          approvedAt: list.approved_at as string | null,
          unpaidCount,
        };
      })
      .filter((list) => list.unpaidCount > 0);

    const totalUnpaid = listsWithUnpaid.reduce((sum, list) => sum + list.unpaidCount, 0);
    const signature = listsWithUnpaid.map((list) => `${list.id}:${list.unpaidCount}`).join("|");

    return {
      listsWithUnpaid,
      totalUnpaid,
      signature,
    };
  }, [approvedLists]);

  useEffect(() => {
    if (!isAdmin || loading) {
      setOpen(false);
      return;
    }
  }, [isAdmin, loading]);

  useEffect(() => {
    if (!isAdmin || loading) return;

    // Only show the reminder once per browser session (i.e. when the app is opened).
    // Realtime updates and refetches must NOT re-open it during normal usage.
    if (window.sessionStorage.getItem(STORAGE_KEY) === "1") return;

    const { listsWithUnpaid } = reminderData;
    if (listsWithUnpaid.length === 0) return;

    setOpen(true);
    window.sessionStorage.setItem(STORAGE_KEY, "1");
  }, [isAdmin, loading, reminderData]);

  if (!isAdmin || loading || reminderData.listsWithUnpaid.length === 0) return null;

  const handleDismiss = () => {
    window.sessionStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  };

  const handleOpenLists = () => {
    handleDismiss();
    navigate("/relatorios/listas-pagamento");
  };

  const listCount = reminderData.listsWithUnpaid.length;
  const latestList = reminderData.listsWithUnpaid[0];

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Pagamentos aprovados por liquidar</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Existem {reminderData.totalUnpaid} pagamento{reminderData.totalUnpaid === 1 ? "" : "s"} por liquidar em {listCount} lista{listCount === 1 ? "" : "s"} de pagamento aprovada{listCount === 1 ? "" : "s"}.
              </p>
              <p>
                Mais recente: <span className="font-medium text-foreground">{latestList.title}</span> ({latestList.unpaidCount} por liquidar).
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleDismiss}>Lembrar depois</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button onClick={handleOpenLists}>Abrir listas de pagamento</Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
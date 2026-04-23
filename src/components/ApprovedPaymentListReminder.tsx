import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { calcWithIva } from "@/lib/utils";
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

const STORAGE_KEY = "approved-payment-list-reminder-dismissed";

export function ApprovedPaymentListReminder() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [dismissedSignature, setDismissedSignature] = useState<string | null>(null);

  const { data: approvedLists = [] } = useQuery({
    queryKey: ["approved-payment-list-reminder"],
    enabled: isAdmin && !loading,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
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
      return data ?? [];
    },
  });

  const reminderData = useMemo(() => {
    const listsWithUnpaid = approvedLists
      .map((list: any) => {
        const unpaidCount = (list.payment_list_items ?? []).filter((item: any) => {
          if (item.manually_marked_paid) return false;
          const tx = item.transactions;
          if (!tx) return false;
          const totalWithIva = calcWithIva(Number(tx.amount ?? 0), Number(tx.iva_rate ?? 23));
          const paid = Number(tx.paid_amount ?? 0);
          return tx.status !== "paid" && paid < totalWithIva - 0.05;
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

    const stored = window.localStorage.getItem(STORAGE_KEY);
    setDismissedSignature(stored);
  }, [isAdmin, loading]);

  useEffect(() => {
    if (!isAdmin || loading) return;

    const { signature, listsWithUnpaid } = reminderData;
    if (!signature || listsWithUnpaid.length === 0) {
      setOpen(false);
      return;
    }

    if (dismissedSignature === signature) {
      setOpen(false);
      return;
    }

    setOpen(true);
  }, [dismissedSignature, isAdmin, loading, reminderData]);

  if (!isAdmin || loading || reminderData.listsWithUnpaid.length === 0) return null;

  const handleDismiss = () => {
    window.localStorage.setItem(STORAGE_KEY, reminderData.signature);
    setDismissedSignature(reminderData.signature);
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
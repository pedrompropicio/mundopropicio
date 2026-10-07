import { useEffect, useMemo, useState } from "react";
import { OverlayLayer } from "@/components/ui/overlay-layer";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, CreditCard, Plus, Lock, RotateCcw, FileDown, Trash2, Paperclip, Pencil } from "lucide-react";
import { TransactionDocumentsModal } from "@/components/TransactionDocumentsModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { cn, formatDatePT } from "@/lib/utils";
import {
  CARD_SESSION_STATUS_LABELS,
  CARD_SESSION_STATUS_VARIANTS,
  formatCurrency,
  cardItemGross,
  invalidateCardSessionQueries,

  type CardSessionStatus,
} from "@/lib/card-session-helpers";
import { fetchCardAccountBalance } from "@/lib/card-account-balance";
import { deleteTransactionDocument } from "@/lib/transaction-document-storage";
import { deleteStorageObject } from "@/lib/storage-delete";
import { fetchCardSessionAccountSync, resolveOpening, computeOpenSessionTheoretical } from "@/lib/card-session-balance";
import { CardLoadModal } from "@/components/cards/CardLoadModal";

import { NewCardExpenseModal } from "@/components/cards/NewCardExpenseModal";
import { ApproveCardItemModal } from "@/components/cards/ApproveCardItemModal";
import { CloseCardSessionModal } from "@/components/cards/CloseCardSessionModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  exportCardSessionToPdf,
  exportCardSessionToExcel,
  type CardSessionExportData,
} from "@/lib/export-card-session";
import { fetchAllPagedQuery } from "@/lib/supabase-paging";
import { formatLisbonDateTime } from "@/lib/date-lisbon";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Tab = "expenses" | "queue" | "loads";

export default function CardSessionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAdmin, isManager, hasPermission, user } = useAuth();
  const canManage = isAdmin || isManager || hasPermission("card_manage");
  const canClose = isAdmin || isManager;

  const [tab, setTab] = useState<Tab>("expenses");
  const [loadOpen, setLoadOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editExpense, setEditExpense] = useState<any | null>(null);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [deleteExpense, setDeleteExpense] = useState<any | null>(null);
  const [deleteItem, setDeleteItem] = useState<any | null>(null);
  const [approveItem, setApproveItem] = useState<any | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [docsTx, setDocsTx] = useState<{ id: string; description: string } | null>(null);
  const [openingOpen, setOpeningOpen] = useState(false);
  const [openingValue, setOpeningValue] = useState("");
  const [openingReason, setOpeningReason] = useState("");
  const [showQueueHistory, setShowQueueHistory] = useState(false);



  const { data: session } = useQuery({
    queryKey: ["card-session", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("card_sessions")
        .select("*, financial_accounts:card_account_id(id, name, initial_balance), events:primary_event_id(id, name)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: loads = [] } = useQuery({
    queryKey: ["card-session-loads", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error: qErr1 } = await supabase
        .from("card_session_loads")
        .select("*, source:source_account_id(name)")
        .eq("session_id", id!)
        .order("load_date", { ascending: false });
      if (qErr1) throw qErr1;
      return data ?? [];
    },
  });

  /**
   * Cargas marcadas como pagas numa lista de pagamento mas ainda sem crédito
   * (#201): a marca é visual e não muda o status da saída, logo o trigger
   * `card_load_on_out_paid` não corre e o cartão fica sem crédito.
   */
  const pendingOutTxIds = (loads as any[])
    .filter((l) => !l.in_transaction_id && l.out_transaction_id)
    .map((l) => String(l.out_transaction_id));

  const { data: markedPaidTxIds = new Set<string>() } = useQuery({
    queryKey: ["card-session-loads-marked-paid", id, pendingOutTxIds.join(",")],
    enabled: pendingOutTxIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_list_items")
        .select("transaction_id, manually_marked_paid, removed_at")
        .in("transaction_id", pendingOutTxIds)
        .is("removed_at", null);
      if (error) throw error;
      return new Set(
        (data ?? [])
          .filter((r: any) => r.manually_marked_paid && r.transaction_id)
          .map((r: any) => String(r.transaction_id)),
      );
    },
  });



  const { data: expenses = [] } = useQuery({
    queryKey: ["card-session-expenses", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error: qErr2 } = await fetchAllPagedQuery(supabase
        .from("transactions")
        .select("id, description, amount, iva_rate, paid_amount, date, payment_date, event_id, category_id, supplier_id, invoice_ref, company_id, forecast_id, parent_transaction_id, is_transitory, exclude_from_result, reversed_at, is_hidden, shared_cost_account_id, events:event_id(name), account_categories:category_id(name, code)")

        .eq("card_session_id", id!)
        .order("date", { ascending: false }));
      if (qErr2) throw qErr2;
      return data ?? [];
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["card-session-items", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error: qErr3 } = await supabase
        .from("card_session_items")
        .select("*, events:event_id(name)")
        .eq("session_id", id!)
        .order("item_date", { ascending: false });
      if (qErr3) throw qErr3;
      return data ?? [];
    },
  });

  const expenseIds = (expenses as any[]).map((e) => e.id);

  /**
   * D17 — uma sessão aberta antes do novo modelo pode misturar:
   *  - transações DIRECTAS antigas (carimbadas com card_session_id, sem item)
   *  - itens novos (card_session_items), que só viram transação na integração
   * A aba Despesas mostra os dois, com etiqueta a distinguir.
   */
  const itemTxIds = useMemo(
    () => new Set((items as any[]).map((i) => i.transaction_id).filter(Boolean) as string[]),
    [items],
  );
  const legacyExpenses = useMemo(
    () => (expenses as any[]).filter((e) => !itemTxIds.has(e.id)),
    [expenses, itemTxIds],
  );
  const modelItems = useMemo(
    () => (items as any[]).filter((i) => i.status === "approved" || i.status === "integrated"),
    [items],
  );

  const { data: docCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["card-session-expense-doc-counts", id, expenseIds.length],
    enabled: expenseIds.length > 0,
    queryFn: async () => {
      const { data, error } = await fetchAllPagedQuery(supabase
        .from("transaction_documents")
        .select("transaction_id")
        .in("transaction_id", expenseIds));
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const d of data ?? []) map[(d as any).transaction_id] = (map[(d as any).transaction_id] ?? 0) + 1;
      return map;
    },
  });

  const cardAccountId = (session as any)?.financial_accounts?.id ?? (session as any)?.card_account_id ?? null;
  const { data: cardBalance } = useQuery({
    queryKey: ["card-account-balance", cardAccountId],
    enabled: !!cardAccountId,
    queryFn: () => fetchCardAccountBalance(cardAccountId as string),
  });

  const totalLoads = (loads as any[])
    .filter((l) => l.in_transaction_id)
    .reduce((s, l) => s + Number(l.amount), 0);
  const totalLoadsPending = (loads as any[])
    .filter((l) => !l.in_transaction_id)
    .reduce((s, l) => s + Number(l.amount), 0);
  const totalApproved = (expenses as any[]).reduce((s, e) => s + (Number(e.paid_amount) || cardItemGross(e)), 0);
  const pendingItems = (items as any[]).filter((i) => i.status === "submitted");
  // Cartão gasta SEMPRE o total c/IVA — amount na BD é base s/IVA.
  const totalPending = pendingItems.reduce((s, i) => s + cardItemGross(i), 0);

  /**
   * D17 — dois saldos distintos:
   *  - Saldo contabilístico: o da conta no módulo Contas (só conta transações).
   *  - Saldo real estimado: contabilístico − itens da sessão ainda não
   *    integrados (submitted + approved), que já saíram do cartão mas ainda não
   *    têm transação.
   */
  const openItemsGross = (items as any[])
    .filter((i) => i.status === "submitted" || i.status === "approved")
    .reduce((s, i) => s + cardItemGross(i), 0);
  const realEstimated = cardBalance == null ? undefined : cardBalance - openItemsGross;


  // Sessões FECHADAS não recalculam nada — usam o closing_summary histórico.
  const isClosedSession = (session as any)?.status === "closed";
  const loadInIds = (loads as any[]).map((l) => l.in_transaction_id);
  const { data: accountSync } = useQuery({
    queryKey: ["card-session-account-sync", id, cardAccountId, loadInIds.filter(Boolean).length],
    enabled: !!cardAccountId && !!session && !isClosedSession,
    queryFn: () =>
      fetchCardSessionAccountSync({
        accountId: cardAccountId as string,
        sessionId: id!,
        openedAt: (session as any).opened_at,
        loadInTransactionIds: loadInIds,
      }),
  });

  /**
   * "Fechado por": o resumo do fecho só guarda o id do utilizador
   * (closing_summary.closed_by_user_id, em alternativa card_sessions.closed_by).
   * O nome vem de profiles; sem acesso, mostra "—" — nunca o uuid.
   */
  const closingPersonId = useMemo(() => {
    const raw =
      (session as any)?.closing_summary?.closed_by_user_id ?? (session as any)?.closed_by ?? null;
    return typeof raw === "string" && UUID_RE.test(raw) ? raw : null;
  }, [session]);
  const { data: closingPersonProfile } = useQuery({
    queryKey: ["card-session-closer", closingPersonId],
    enabled: !!closingPersonId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("id", closingPersonId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const rawOverride =
    (session as any)?.opening_balance === null || (session as any)?.opening_balance === undefined
      ? null
      : Number((session as any).opening_balance);
  const { opening, isOverride } = isClosedSession
    ? {
        opening: Number(
          (session as any)?.closing_summary?.opening_balance ?? (session as any)?.opening_balance ?? 0,
        ),
        isOverride: rawOverride !== null,
      }
    : resolveOpening(rawOverride, accountSync?.dynamicOpening ?? 0);
  const directTotal = isClosedSession ? 0 : accountSync?.directTotal ?? 0;
  const legacySessionSpend = isClosedSession ? 0 : accountSync?.legacySessionSpend ?? 0;
  // #275 — sessões abertas usam a fórmula do fecho (close-card-session).
  const theoretical = isClosedSession
    ? opening + totalLoads - totalApproved - totalPending + directTotal
    : computeOpenSessionTheoretical({ opening, totalLoads, openItemsGross, legacySessionSpend, directTotal });


  /** Breakdown por evento: transações antigas da sessão + itens (novo modelo). */
  const expensesByEvent = useMemo(() => {
    const map: Record<string, { name: string; amount: number }> = {};
    const add = (key: string, name: string, amount: number) => {
      if (!map[key]) map[key] = { name, amount: 0 };
      map[key].amount += amount;
    };
    for (const e of legacyExpenses as any[]) {
      add(e.event_id ?? "none", e.events?.name ?? "Sem evento", Number(e.paid_amount) || cardItemGross(e));
    }
    for (const it of items as any[]) {
      if (it.status === "rejected") continue;
      add(it.event_id ?? "none", it.events?.name ?? "Sem evento", cardItemGross(it));
    }
    return map;
  }, [legacyExpenses, items]);


  const transition = useMutation({
    mutationFn: async (newStatus: CardSessionStatus) => {
      const { error } = await supabase
        .from("card_sessions")
        .update({ status: newStatus })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Estado atualizado." });
      qc.invalidateQueries({ queryKey: ["card-session", id] });
      qc.invalidateQueries({ queryKey: ["card-sessions"] });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const updateOpening = useMutation({
    mutationFn: async ({ value, reason }: { value: number | null; reason: string }) => {
      const who = (user as any)?.email ?? "utilizador";
      const stamp = new Date().toISOString().slice(0, 10);
      const line =
        value === null
          ? `[${stamp}] Saldo de abertura voltou ao cálculo automático da conta (era ${formatCurrency(opening)}) por ${who}: ${reason}`
          : `[${stamp}] Saldo de abertura corrigido de ${formatCurrency(opening)} para ${formatCurrency(value)} por ${who}: ${reason}`;
      const prevNotes = ((session as any)?.notes ?? "").trim();
      const { error } = await supabase
        .from("card_sessions")
        .update({ opening_balance: value, notes: prevNotes ? `${prevNotes}\n${line}` : line })
        .eq("id", id!)
        .eq("status", "open");
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Saldo de abertura atualizado." });
      setOpeningOpen(false);
      invalidateCardSessionQueries(qc, id);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });


  const deleteLoad = useMutation({
    mutationFn: async (load: any) => {
      if (load.in_transaction_id) {
        throw new Error("Esta recarga já foi paga/liquidada. Elimine primeiro a transação de saída na Lista de Pagamento.");
      }
      if (!load.out_transaction_id) {
        // fallback: apagar só a linha
        const { error } = await supabase.from("card_session_loads").delete().eq("id", load.id);
        if (error) throw error;
        return;
      }
      // Apagar a transação OUT — o trigger trg_card_load_on_out_delete limpa card_session_loads
      const { error } = await supabase.from("transactions").delete().eq("id", load.out_transaction_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Recarga eliminada." });
      qc.invalidateQueries({ queryKey: ["card-session-loads", id] });
      qc.invalidateQueries({ queryKey: ["card-session", id] });
      qc.invalidateQueries({ queryKey: ["financial-accounts"] });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  /**
   * Exclusão de despesa (só com sessão aberta).
   * - Bloqueia se a transação estiver numa lista de pagamento (FK NO ACTION).
   * - #265: a transação sai PRIMEIRO (DELETE com .select para detetar RLS);
   *   só depois os ficheiros, e só os que nenhuma linha ainda referencia.
   * - Item da equipa que gerou a despesa volta a 'submitted' (FK SET NULL deixaria
   *   um item "aprovado" sem transação).
   * - transaction_audit_log tem FK CASCADE → o registo vai para system_audit_log.
   */
  const deleteExpenseMut = useMutation({
    mutationFn: async (e: any) => {
      const { data: inLists, error: listErr } = await supabase
        .from("payment_list_items")
        .select("id")
        .eq("transaction_id", e.id)
        .limit(1);
      if (listErr) throw listErr;
      if (inLists && inLists.length > 0) {
        throw new Error("Esta despesa está numa lista de pagamento. Remova-a da lista antes de excluir.");
      }

      const { data: docs, error: docsErr } = await fetchAllPagedQuery(supabase
        .from("transaction_documents")
        .select("file_url")
        .eq("transaction_id", e.id));
      if (docsErr) throw docsErr;
      const fileUrls = (docs ?? []).map((d: any) => d.file_url as string).filter(Boolean);

      const { data: linkedItems } = await supabase
        .from("card_session_items")
        .select("id")
        .eq("transaction_id", e.id);

      const { data: deleted, error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", e.id)
        .select("id");
      if (error) throw error;
      if (!deleted || deleted.length === 0) {
        throw new Error("Sem permissão para excluir esta despesa.");
      }

      // #265: falha no storage fica visível, mas só depois de gravar a auditoria.
      // Só DEPOIS de a despesa sair (as linhas caem por cascata): limpa os ficheiros sem referências.
      let storageErr: Error | null = null;
      for (const fileUrl of [...new Set(fileUrls)]) {
        try { await deleteTransactionDocument({ fileUrl, scope: "orphan" }); }
        catch (err: any) { storageErr = err as Error; }
      }

      const gross = Number(e.paid_amount) || cardItemGross(e);
      if (e.company_id) {
        const { error: auditErr } = await supabase.from("system_audit_log").insert({
          entity_type: "card_session_expense",
          entity_id: e.id,
          action: "delete",
          changed_by: user?.email ?? "sistema",
          company_id: e.company_id,
          old_data: {
            description: e.description,
            amount: e.amount,
            iva_rate: e.iva_rate,
            paid_amount: e.paid_amount,
            total_gross: gross,
            date: e.date,
            event_id: e.event_id,
            category_id: e.category_id,
            supplier_id: e.supplier_id,
          },
          metadata: {
            card_session_id: id,
            reverted_item_ids: (linkedItems ?? []).map((i: any) => i.id),
          },
        } as any);
        if (auditErr) console.warn("[deleteExpense] system_audit_log falhou:", auditErr.message);
      }
      if (storageErr) throw storageErr;

      if (linkedItems && linkedItems.length > 0) {
        await supabase
          .from("card_session_items")
          .update({
            status: "submitted",
            transaction_id: null,
            reviewed_by: null,
            reviewed_at: null,
            rejection_reason: `Despesa excluída em ${new Date().toLocaleDateString("pt-PT")} — item devolvido à fila de aprovação.`,
          })
          .in("id", linkedItems.map((i: any) => i.id));
      }
    },
    onSuccess: () => {
      toast({ title: "Despesa excluída." });
      invalidateCardSessionQueries(qc, id);
      setDeleteExpense(null);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  /**
   * Exclusão de item da sessão (#276) — só com sessão aberta.
   * Ordem (#265, decalque de deleteExpenseMut):
   * 1. lê os card_item_documents (file_path) + legado document_path;
   * 2. apaga a linha de card_session_items com .select("id") — 0 linhas = RLS
   *    filtrou, nunca sucesso falso;
   * 3. grava a auditoria com o snapshot que já está em memória;
   * 4. SÓ DEPOIS remove os ficheiros de card-documents via storage-delete
   *    (que verifica referências, incl. transaction_documents.file_url =
   *    card://<caminho> — um talão referenciado por uma transação é mantido).
   *    Falha no storage fica visível, mas só depois da auditoria gravada.
   */
  const deleteItemMut = useMutation({
    mutationFn: async (it: any) => {
      const { data: docs, error: docsErr } = await supabase
        .from("card_item_documents")
        .select("file_path")
        .eq("item_id", it.id);
      if (docsErr) throw docsErr;
      const filePaths = [
        ...(docs ?? []).map((d: any) => d.file_path as string),
        ...(it.document_path ? [it.document_path as string] : []),
      ].filter(Boolean);

      const { data: deleted, error } = await supabase
        .from("card_session_items")
        .delete()
        .eq("id", it.id)
        .select("id");
      if (error) throw error;
      if (!deleted || deleted.length === 0) {
        throw new Error("Sem permissão para excluir este item.");
      }

      const gross = cardItemGross(it);
      if (it.company_id) {
        const { error: auditErr } = await supabase.from("system_audit_log").insert({
          entity_type: "card_session_item",
          entity_id: it.id,
          action: "delete",
          changed_by: user?.email ?? "sistema",
          company_id: it.company_id,
          old_data: {
            date: it.item_date,
            supplier_name: it.supplier_name,
            description: it.description,
            amount: it.amount,
            iva_rate: it.iva_rate,
            total_gross: gross,
            event_id: it.event_id,
            category_id: it.category_id,
          },
          metadata: { card_session_id: id },
        } as any);
        if (auditErr) console.warn("[deleteItem] system_audit_log falhou:", auditErr.message);
      }

      // Só depois de a linha sair: ficheiros para o lixo recuperável.
      let storageErr: Error | null = null;
      for (const p of [...new Set(filePaths)]) {
        try {
          await deleteStorageObject("card-documents", p, {
            reason: "excluir item de sessão de cartão",
            related_table: "card_session_items",
            related_id: it.id,
          });
        } catch (err: any) { storageErr = err as Error; }
      }
      if (storageErr) throw storageErr;
    },
    onSuccess: () => {
      toast({ title: "Item excluído." });
      invalidateCardSessionQueries(qc, id);
      setDeleteItem(null);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });




  if (!session) {
    return <div className="p-6 text-sm text-muted-foreground">A carregar…</div>;
  }

  const status = session.status as CardSessionStatus;
  const cardName = (session as any).financial_accounts?.name ?? "Cartão";
  const isLocked = status === "closed";
  // Editar/excluir despesas só com a sessão ABERTA (in_review/closed = leitura).
  const canEditExpenses = canManage && status === "open";
  const canEditOpening = canEditExpenses;
  const closingSummary = ((session as any).closing_summary ?? {}) as Record<string, any>;
  const reconciliation = (closingSummary.reconciliation ?? {}) as Record<string, any>;
  const closingNumber = (key: string): number | null => {
    const value = closingSummary[key] ?? reconciliation[key];
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  const closedAccountBalance = closingNumber("account_balance");
  const closedConfirmedBalance = closingNumber("confirmed_balance");
  const closedTheoreticalBalance = closingNumber("theoretical_balance");
  const theoreticalDiverges =
    isClosedSession &&
    closedTheoreticalBalance !== null &&
    Math.abs(theoretical - closedTheoreticalBalance) > 0.01;
  const closingOpening = closingNumber("opening_balance") ?? closingNumber("opening");
  const closingLoads = closingNumber("total_loads");
  const closingApproved =
    closingNumber("total_approved_expenses") ??
    closingNumber("approved") ??
    closingNumber("total_approved") ??
    closingNumber("new_spend_gross") ??
    closingNumber("total_amount");
  const closingDifference = closingNumber("difference");
  const closingExpenses = Object.values(
    (closingSummary.expenses_by_event ?? closingSummary.by_event ?? {}) as Record<string, any>,
  ).filter((entry: any) => entry && typeof entry === "object" && entry.name);
  const closingPersonRaw =
    closingSummary.adjusted_by ?? closingSummary.closed_by_name ?? closingSummary.generated_by ?? null;
  const closingPerson =
    typeof closingPersonRaw === "string" && !UUID_RE.test(closingPersonRaw)
      ? closingPersonRaw
      : closingPersonProfile?.full_name || closingPersonProfile?.email || null;
  const closingWhen =
    closingSummary.adjusted_at ?? closingSummary.closed_at ?? closingSummary.generated_at ?? (session as any).closed_at;

  /** Payload de exportação — os mesmos números dos cards acima. */
  const buildExportData = (): CardSessionExportData => {
    const rows = [
      ...(expenses as any[]).map((e) => ({
        date: String(e.date ?? ""),
        description: String(e.description ?? ""),
        event: e.events?.name ?? "Sem evento",
        category: e.account_categories
          ? `${e.account_categories.code ?? ""} ${e.account_categories.name ?? ""}`.trim()
          : "—",
        status: "Aprovada",
        amount: Number(e.paid_amount) || cardItemGross(e),
      })),
      ...pendingItems.map((i: any) => ({
        date: String(i.item_date ?? ""),
        description: String(i.description ?? i.supplier_name_raw ?? "Item pendente"),
        event: i.events?.name ?? "Sem evento",
        category: "—",
        status: "Pendente de aprovação",
        amount: cardItemGross(i),
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    return {
      companyId: (session as any)?.company_id ?? null,
      cardName,
      holderName: String(session.holder_name ?? "—"),
      primaryEventName: (session as any).events?.name ?? null,
      statusLabel: CARD_SESSION_STATUS_LABELS[status],
      openedAt: session.opened_at ?? null,
      closedAt: (session as any).closed_at ?? null,
      summary: {
        availableOnCard: cardBalance == null ? null : Number(cardBalance),
        delivered: opening + totalLoads,
        deliveredNote: `Abertura ${formatCurrency(opening)} (${isOverride ? "override manual" : "calculado da conta"}) + ${loads.length} recarga(s)`,
        approvedSpent: totalApproved,
        approvedCount: (expenses as any[]).length,
        pending: totalPending,
        pendingCount: pendingItems.length,
        theoretical,
      },
      byEvent: Object.values(expensesByEvent).map((v) => ({ name: v.name, amount: v.amount })),
      expenses: rows,
      loads: (loads as any[])
        .slice()
        .sort((a, b) => String(a.load_date ?? "").localeCompare(String(b.load_date ?? "")))
        .map((l) => ({
          date: String(l.load_date ?? ""),
          source: l.source?.name ?? "—",
          amount: Number(l.amount ?? 0),
        })),
    };
  };

  const handleExport = async (kind: "pdf" | "excel") => {
    try {
      const payload = buildExportData();
      if (kind === "pdf") await exportCardSessionToPdf(payload);
      else await exportCardSessionToExcel(payload);
    } catch (e: any) {
      toast({ title: "Erro ao exportar", description: e?.message, variant: "destructive" });
    }
  };



  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button onClick={() => navigate("/cartoes")} className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Voltar
          </button>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <CreditCard className="h-6 w-6 text-primary" />
            {cardName} — {session.holder_name}
          </h1>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Badge className={cn("border", CARD_SESSION_STATUS_VARIANTS[status])} variant="outline">
              {CARD_SESSION_STATUS_LABELS[status]}
            </Badge>
            {(session as any).events?.name && <span>Evento principal: {(session as any).events.name}</span>}
            <span>
              {isClosedSession && (session as any).closed_at
                ? `· ${formatDatePT(session.opened_at)} a ${formatDatePT((session as any).closed_at)}`
                : `· Aberta em ${formatDatePT(session.opened_at)}`}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">
                <FileDown className="mr-1 inline h-4 w-4" /> Exportar
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport("pdf")}>PDF</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("excel")}>Excel</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {canManage && !isLocked && (
            <button onClick={() => setLoadOpen(true)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">
              <Plus className="mr-1 inline h-4 w-4" /> Recarga
            </button>
          )}
          {canClose && status === "open" && (
            <button onClick={() => transition.mutate("in_review")} className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 hover:bg-amber-500/20">
              Enviar para revisão
            </button>
          )}
          {canClose && status === "in_review" && (
            <button onClick={() => setCloseOpen(true)} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Lock className="mr-1 inline h-4 w-4" /> Fechar sessão
            </button>
          )}
          {canClose && status !== "open" && !isLocked && (
            <button onClick={() => transition.mutate("open")} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">
              <RotateCcw className="mr-1 inline h-4 w-4" /> Reabrir
            </button>
          )}
          {isLocked && (isAdmin) && (
            <button onClick={() => transition.mutate("open")} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">
              <RotateCcw className="mr-1 inline h-4 w-4" /> Reabrir (admin)
            </button>
          )}
          {isLocked && (
            <button
              onClick={() => window.print()}
              className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              <FileDown className="mr-1 inline h-4 w-4" /> Imprimir / PDF
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="Saldo contabilístico"
          value={isClosedSession ? (closedAccountBalance === null ? "—" : formatCurrency(closedAccountBalance)) : (cardBalance == null ? "—" : formatCurrency(cardBalance))}
          hint={isClosedSession ? "Valor contabilístico no dia do fecho." : "Saldo da conta no módulo Contas (só transações)"}
          tone={(isClosedSession ? closedAccountBalance : cardBalance) != null && Number(isClosedSession ? closedAccountBalance : cardBalance) < 0 ? "warn" : undefined}
        />
        <Kpi
          label="Saldo real estimado"
          value={isClosedSession ? (closedConfirmedBalance === null ? "—" : formatCurrency(closedConfirmedBalance)) : (realEstimated == null ? "—" : formatCurrency(realEstimated))}
          hint={isClosedSession ? "Valor conferido no dia do fecho." : `Contabilístico − itens da sessão ainda não integrados (${formatCurrency(openItemsGross)})`}
          tone={(isClosedSession ? closedConfirmedBalance : realEstimated) != null && Number(isClosedSession ? closedConfirmedBalance : realEstimated) < 0 ? "warn" : undefined}
        />
        <Kpi
          label="Entregue"
          value={formatCurrency(opening + totalLoads)}
          hint={
            isOverride
              ? `Abertura ${formatCurrency(opening)} (override manual) + ${loads.length} recarga(s)`
              : `Abertura ${formatCurrency(opening)} (calculado da conta) + ${loads.length} recarga(s)`
          }
          badge={
            !isClosedSession ? (
              <span
                title={
                  isOverride
                    ? `Override manual. Cálculo da conta à data de abertura: ${formatCurrency(accountSync?.dynamicOpening ?? 0)}`
                    : "Calculado da conta: saldo inicial + movimentos pagos com data anterior à abertura"
                }
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[10px] font-medium",
                  isOverride
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-600"
                    : "border-border bg-muted text-muted-foreground",
                )}
              >
                {isOverride ? "override" : "calculado"}
              </span>
            ) : undefined
          }
          action={
            canEditOpening ? (
              <button
                type="button"
                aria-label="Editar saldo de abertura"
                title="Editar saldo de abertura"
                onClick={() => { setOpeningValue(String(opening)); setOpeningReason(""); setOpeningOpen(true); }}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            ) : undefined
          }
        />
        <Kpi label="Gasto aprovado" value={formatCurrency(totalApproved)} hint={`${expenses.length} transação(ões)`} />
        <Kpi label="Pendente de aprovação" value={formatCurrency(totalPending)} hint={`${pendingItems.length} item(s)`} tone={pendingItems.length > 0 ? "warn" : undefined} />
        <Kpi
          label="Saldo teórico da sessão"
          value={isClosedSession ? (closedTheoreticalBalance === null ? "—" : formatCurrency(closedTheoreticalBalance)) : formatCurrency(theoretical)}
          hint={
            isClosedSession
              ? (
                  <>
                    <span>Valor gravado no dia do fecho.</span>
                    {theoreticalDiverges && (
                      <span className="mt-1 block text-amber-600">
                        Recalculado hoje dá {formatCurrency(theoretical)} — o resumo foi gravado com dados incompletos no fecho (#273).
                      </span>
                    )}
                  </>
                )
              : "Abertura + recargas − itens por integrar ± movimentos da sessão e directos. É o valor que o fecho vai calcular."
          }
        />
      </div>



      {/* Breakdown por evento */}
      {Object.keys(expensesByEvent).length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Despesas por evento</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {Object.entries(expensesByEvent).map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-muted-foreground">{v.name}</span>
                <span className="font-medium">{formatCurrency(v.amount)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-4">
          <TabBtn active={tab === "expenses"} onClick={() => setTab("expenses")}>Despesas ({legacyExpenses.length + modelItems.length})</TabBtn>
          <TabBtn active={tab === "queue"} onClick={() => setTab("queue")}>
            Fila de aprovação {pendingItems.length > 0 && <span className="ml-1 rounded-full bg-amber-500/20 px-1.5 text-xs text-amber-600">{pendingItems.length}</span>}
          </TabBtn>
          <TabBtn active={tab === "loads"} onClick={() => setTab("loads")}>Recargas ({loads.length})</TabBtn>
        </div>
      </div>

      {tab === "expenses" && (
        <div className="space-y-2">
          {canManage && !isLocked && (
            <button onClick={() => setExpenseOpen(true)} className="mb-2 inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/20">
              <Plus className="h-4 w-4" /> Nova despesa
            </button>
          )}
          {legacyExpenses.length === 0 && modelItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem despesas registadas.</p>
          ) : (
            <div className="space-y-1">
              {legacyExpenses.length > 0 && modelItems.length > 0 && (
                <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Registadas antes do modelo de itens
                </p>
              )}
              {legacyExpenses.map((e) => {
                const count = (docCounts as Record<string, number>)[e.id] ?? 0;
                return (
                  <div key={e.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{e.description}</span>
                        <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-600">
                          registada antes do modelo de itens
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {e.date} · {e.events?.name ?? "Sem evento"} · {e.account_categories?.code ?? "—"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setDocsTx({ id: e.id, description: e.description })}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors",
                          count > 0
                            ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                            : "border-border text-muted-foreground hover:bg-muted"
                        )}
                        title={count > 0 ? `${count} anexo(s)` : "Anexar fatura/documento"}
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                        {count > 0 ? count : "Anexar"}
                      </button>
                      {canEditExpenses && (
                        <>
                          <button
                            onClick={() => setEditExpense(e)}
                            title="Editar despesa"
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteExpense(e)}
                            title="Excluir despesa"
                            className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                      <div className="font-semibold">{formatCurrency(Number(e.paid_amount) || cardItemGross(e))}</div>

                    </div>
                  </div>
                );
              })}

              {modelItems.length > 0 && (
                <>
                  <p className="pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Itens da sessão (só viram transação na integração)
                  </p>
                  {modelItems.map((it: any) => (
                    <div key={it.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{it.description ?? it.supplier_name ?? "Despesa"}</span>
                          <Badge variant="outline" className="border-primary/40 bg-primary/10 text-[10px] text-primary">
                            {it.status === "integrated" ? "integrada" : "item da sessão"}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {it.item_date} · {it.events?.name ?? "Sem evento"} · {it.supplier_name ?? "—"}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {canManage && !isLocked && it.status === "approved" && (
                          <button
                            onClick={() => setEditItem(it)}
                            title="Editar item"
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canEditExpenses && (
                          <button
                            onClick={() => setDeleteItem(it)}
                            title="Excluir item"
                            className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <span className="font-semibold">{formatCurrency(cardItemGross(it))}</span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "queue" && (() => {
        const queueItems = (items as any[]).filter((it) => it.status === "submitted");
        const historyItems = (items as any[]).filter((it) => it.status !== "submitted");
        const visibleItems = showQueueHistory ? (items as any[]) : queueItems;
        return (
          <div className="space-y-2">
            {historyItems.length > 0 && (
              <button
                onClick={() => setShowQueueHistory((v) => !v)}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                {showQueueHistory ? "Esconder histórico" : `Mostrar histórico (${historyItems.length})`}
              </button>
            )}
            {visibleItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada por aprovar.</p>
            ) : (
              visibleItems.map((it) => (
                <div key={it.id} className={cn(
                  "flex gap-3 rounded-lg border px-3 py-2 text-sm",
                  it.status === "approved" ? "border-emerald-500/40 bg-emerald-500/5" :
                  it.status === "rejected" ? "border-destructive/40 bg-destructive/5" :
                  "border-amber-500/40 bg-amber-500/5",
                )}>
                  {it.document_path && <CardItemThumb path={it.document_path} />}
                  <div className="flex flex-1 items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{it.supplier_name || it.description || "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {it.item_date} · {it.events?.name ?? "Sem evento"} · {it.status}
                        {it.rejection_reason && <> · motivo: {it.rejection_reason}</>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{formatCurrency(cardItemGross(it))}</span>
                      {canManage && it.status === "submitted" && !isLocked && (
                        <button
                          onClick={() => setApproveItem(it)}
                          className="rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20"
                        >
                          Rever
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        );
      })()}

      {tab === "loads" && (
        <div className="space-y-2">
          {canManage && !isLocked && (
            <button onClick={() => setLoadOpen(true)} className="mb-2 inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/20">
              <Plus className="h-4 w-4" /> Nova recarga
            </button>
          )}
          {loads.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem recargas.</p>
          ) : (
            (loads as any[]).map((l) => {
              const canDelete = canManage && !isLocked && !l.in_transaction_id;
              return (
                <div key={l.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium">{l.source?.name ?? "—"} → {cardName}</div>
                    <div className="text-xs text-muted-foreground">
                      {l.load_date}{l.notes ? ` · ${l.notes}` : ""}
                      {" · "}
                      {l.in_transaction_id
                        ? <span className="text-emerald-500">liquidada</span>
                        : <span className="text-amber-500">aguarda pagamento</span>}
                    </div>
                    {!l.in_transaction_id && l.out_transaction_id && markedPaidTxIds.has(String(l.out_transaction_id)) && (
                      <Badge
                        variant="outline"
                        className="mt-1 border-warning/40 bg-warning/10 text-[10px] text-warning"
                        title="A marca de pago é visual: o crédito no cartão só nasce quando a saída é liquidada."
                      >
                        Marcada como paga — o crédito no cartão só entra ao liquidar
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-emerald-500">+{formatCurrency(Number(l.amount))}</div>
                    {canDelete && (
                      <button
                        onClick={() => {
                          if (confirm("Eliminar esta recarga? A transação de saída pendente será também removida.")) {
                            deleteLoad.mutate(l);
                          }
                        }}
                        disabled={deleteLoad.isPending}
                        title="Eliminar recarga (só se ainda não foi paga)"
                        className="rounded-md border border-destructive/40 bg-destructive/10 p-1.5 text-destructive hover:bg-destructive/20 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {isLocked && session.closing_summary && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Resumo do fecho</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <SummaryRow label="Saldo de abertura" value={closingOpening === null ? "—" : `${formatCurrency(closingOpening)}${(closingSummary.opening_is_override ?? reconciliation.opening_is_override) ? " (override)" : ""}`} />
              <SummaryRow label="Total de recargas" value={closingLoads === null ? "—" : formatCurrency(closingLoads)} />
              <SummaryRow label="Gasto aprovado" value={closingApproved === null ? "—" : formatCurrency(closingApproved)} />
              <SummaryRow label="Saldo teórico" value={closedTheoreticalBalance === null ? "—" : formatCurrency(closedTheoreticalBalance)} />
              <SummaryRow label="Saldo conferido" value={closedConfirmedBalance === null ? "—" : formatCurrency(closedConfirmedBalance)} />
              <SummaryRow label="Diferença" value={closingDifference === null ? "—" : formatCurrency(closingDifference)} />
              <SummaryRow label="Ajuste criado" value={(closingSummary.adjustment_created ?? reconciliation.adjustment_created) ? "Sim" : "Não"} />
              <SummaryRow label="Fechado por" value={closingPerson ?? "—"} />
              <SummaryRow label="Fechado em" value={closingWhen ? formatLisbonDateTime(closingWhen) : "—"} />
            </dl>

            {closingExpenses.length > 0 && (
              <div className="border-t border-border pt-3">
                <h3 className="mb-2 text-xs font-semibold text-muted-foreground">Despesas por evento</h3>
                <div className="space-y-1.5">
                  {closingExpenses.map((entry: any, index) => (
                    <div key={`${entry.name}-${index}`} className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">{entry.name}</span>
                      <span className="font-medium">{formatCurrency(Number(entry.amount ?? entry.total ?? 0))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isAdmin && (
              <details className="border-t border-border pt-3 text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none font-medium">Ver detalhe técnico</summary>
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-[11px]">{JSON.stringify(session.closing_summary, null, 2)}</pre>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      <CardLoadModal
        open={loadOpen}
        onOpenChange={setLoadOpen}
        sessionId={id!}
        cardAccountId={session.card_account_id}
        cardName={cardName}
      />
      <NewCardExpenseModal
        open={expenseOpen}
        onOpenChange={setExpenseOpen}
        sessionId={id!}
        cardAccountId={session.card_account_id}
        defaultEventId={session.primary_event_id}
      />
      <NewCardExpenseModal
        open={!!editExpense}
        onOpenChange={(v) => { if (!v) setEditExpense(null); }}
        sessionId={id!}
        cardAccountId={session.card_account_id}
        defaultEventId={session.primary_event_id}
        expense={editExpense}
      />
      <NewCardExpenseModal
        open={!!editItem}
        onOpenChange={(v) => { if (!v) setEditItem(null); }}
        sessionId={id!}
        cardAccountId={session.card_account_id}
        defaultEventId={session.primary_event_id}
        item={editItem}
      />
      {deleteExpense && (
        <OverlayLayer className="fixed inset-0 flex items-center justify-center bg-black/60 p-4">
          <div className="glass w-full max-w-md rounded-xl p-6">
            <h2 className="mb-2 text-lg font-semibold">Excluir despesa?</h2>
            <p className="text-sm text-muted-foreground">
              {deleteExpense.description} — <span className="font-semibold text-foreground">
                {formatCurrency(Number(deleteExpense.paid_amount) || cardItemGross(deleteExpense))}
              </span>
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              A transação e os anexos são eliminados definitivamente e o valor volta ao saldo da sessão.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setDeleteExpense(null)}
                className="flex-1 rounded-lg border border-border py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteExpenseMut.mutate(deleteExpense)}
                disabled={deleteExpenseMut.isPending}
                className="flex-1 rounded-lg bg-destructive py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                {deleteExpenseMut.isPending ? "A excluir…" : "Excluir"}
              </button>
            </div>
          </div>
        </OverlayLayer>
      )}

      {deleteItem && (
        <OverlayLayer className="fixed inset-0 flex items-center justify-center bg-black/60 p-4">
          <div className="glass w-full max-w-md rounded-xl p-6">
            <h2 className="mb-2 text-lg font-semibold">Excluir item?</h2>
            <p className="text-sm text-muted-foreground">
              {deleteItem.description ?? deleteItem.supplier_name ?? "Despesa"} — <span className="font-semibold text-foreground">
                {formatCurrency(cardItemGross(deleteItem))}
              </span>
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              O item é eliminado da sessão e o valor volta ao saldo teórico. O talão vai para o lixo recuperável, exceto se estiver referenciado por uma transação.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setDeleteItem(null)}
                className="flex-1 rounded-lg border border-border py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteItemMut.mutate(deleteItem)}
                disabled={deleteItemMut.isPending}
                className="flex-1 rounded-lg bg-destructive py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                {deleteItemMut.isPending ? "A excluir…" : "Excluir"}
              </button>
            </div>
          </div>
        </OverlayLayer>
      )}

      <Dialog open={openingOpen} onOpenChange={setOpeningOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Corrigir saldo de abertura</DialogTitle>
            <DialogDescription>
              Use apenas para corrigir uma abertura lançada errada (ex.: saldo do cartão ajustado depois no módulo Contas).
              A correção fica registada nas notas da sessão.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="opening-value">Novo saldo de abertura (€)</Label>
              <Input
                id="opening-value"
                type="number"
                step="0.01"
                value={openingValue}
                onChange={(e) => setOpeningValue(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Atual: {formatCurrency(opening)} {isOverride ? "(override manual)" : "(calculado da conta)"} · cálculo
                da conta à data de abertura: {formatCurrency(accountSync?.dynamicOpening ?? 0)}
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="opening-reason">Motivo (obrigatório)</Label>
              <Textarea
                id="opening-reason"
                rows={2}
                value={openingReason}
                onChange={(e) => setOpeningReason(e.target.value)}
                placeholder="Ex.: saldo do cartão estava lançado errado; ajustado no módulo Contas."
              />
            </div>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpeningOpen(false)}
              className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              Cancelar
            </button>
            {isOverride && (
              <button
                type="button"
                disabled={updateOpening.isPending || !openingReason.trim()}
                onClick={() => updateOpening.mutate({ value: null, reason: openingReason.trim() })}
                className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
              >
                Voltar ao cálculo automático
              </button>
            )}
            <button
              type="button"
              disabled={
                updateOpening.isPending ||
                !openingReason.trim() ||
                !Number.isFinite(Number(openingValue)) ||
                openingValue.trim() === ""
              }
              onClick={() => updateOpening.mutate({ value: Number(openingValue), reason: openingReason.trim() })}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {updateOpening.isPending ? "A gravar…" : "Gravar correção"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <ApproveCardItemModal
        open={!!approveItem}
        onOpenChange={(v) => { if (!v) setApproveItem(null); }}
        item={approveItem}
        cardAccountId={session.card_account_id}
      />
      <CloseCardSessionModal
        open={closeOpen}
        onOpenChange={setCloseOpen}
        session={{
          id: session.id,
          card_account_id: session.card_account_id,
          card_name: cardName,
          opening_balance: opening,
          opening_is_override: isOverride,
          total_loads: totalLoads,
          total_approved_expenses: totalApproved,
          pending_items: pendingItems.length,
          expenses_by_event: expensesByEvent,
          direct_total: directTotal,
          open_items_gross: openItemsGross,
          legacy_session_spend: legacySessionSpend,
          direct_movements: (accountSync?.directMovements ?? []).map((t) => ({
            id: t.id,
            description: t.description ?? "(sem descrição)",
            signed: (t.type === "income" ? 1 : -1) * Number(t.paid_amount ?? 0),
            date: t.payment_date ?? t.date ?? "",
          })),
          account_balance: accountSync?.accountBalance ?? null,
        }}
      />
      {docsTx && (
        <TransactionDocumentsModal
          transactionId={docsTx.id}
          transactionDescription={docsTx.description}
          onClose={() => {
            setDocsTx(null);
            qc.invalidateQueries({ queryKey: ["card-session-expense-doc-counts", id] });
          }}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, hint, tone, action, badge }: { label: string; value: string; hint?: React.ReactNode; tone?: "warn"; action?: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {label}
            {badge}
          </p>
          {action}
        </div>
        <p className={cn("mt-1 text-xl font-bold", tone === "warn" ? "text-amber-500" : "text-foreground")}>{value}</p>
        {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/50 pb-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}


function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "border-b-2 pb-2 text-sm font-medium",
        active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function CardItemThumb({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.storage
      .from("card-documents")
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (!cancelled) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  if (!url) return <div className="h-14 w-14 shrink-0 animate-pulse rounded bg-muted" />;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="h-14 w-14 shrink-0 overflow-hidden rounded border border-border bg-muted"
      onClick={(e) => e.stopPropagation()}
    >
      <img src={url} alt="Talão" className="h-full w-full object-cover" />
    </a>
  );
}

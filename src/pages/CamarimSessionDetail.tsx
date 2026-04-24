import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ShoppingBag, CheckCircle2, XCircle, Wallet, Plus, Lock, Zap, AlertTriangle, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SESSION_STATUS_LABELS,
  SESSION_STATUS_VARIANTS,
  SESSION_MODE_LABELS,
  PAYMENT_ORIGIN_LABELS,
  BP_SCOPE_LABELS,
  ITEM_STATUS_LABELS,
  ITEM_STATUS_VARIANTS,
  FUND_MOVE_LABELS,
  formatCurrency,
  type CamarimSessionMode,
  type CamarimSessionStatus,
  type CamarimItemStatus,
  type CamarimItemPaymentOrigin,
  type CamarimItemBpScope,
  type CamarimFundMoveType,
} from "@/lib/camarim-helpers";
import { CamarimItemModal } from "@/components/camarim/CamarimItemModal";
import { CamarimFundMoveModal } from "@/components/camarim/CamarimFundMoveModal";
import { CamarimItemAttachmentButton } from "@/components/camarim/CamarimItemAttachmentButton";
import { EditSessionModal } from "@/components/camarim/EditSessionModal";
import { SplitItemModal } from "@/components/camarim/SplitItemModal";
import { Split } from "lucide-react";

interface SessionData {
  id: string;
  title: string;
  mode: CamarimSessionMode;
  status: CamarimSessionStatus;
  budget_amount: number;
  currency: string;
  opened_at: string;
  notes: string | null;
}

interface ItemRow {
  id: string;
  service_description: string | null;
  supplier_name_raw: string | null;
  total_amount: number;
  iva_amount: number;
  document_date: string | null;
  document_number: string | null;
  has_document: boolean;
  payment_origin: CamarimItemPaymentOrigin;
  bp_scope: CamarimItemBpScope;
  status: CamarimItemStatus;
  created_at: string;
  ocr_confidence: string | null;
  category_id: string | null;
  has_attachment?: boolean;
}

interface FundMove {
  id: string;
  move_type: CamarimFundMoveType;
  amount: number;
  move_date: string;
  notes: string | null;
  financial_account_id: string | null;
  created_at?: string;
}

interface FinAccount {
  id: string;
  name: string;
}

export default function CamarimSessionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, isManager } = useAuth();
  const canManage = isAdmin || isManager;

  const [session, setSession] = useState<SessionData | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [funds, setFunds] = useState<FundMove[]>([]);
  const [loading, setLoading] = useState(true);
  const [showItem, setShowItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [showFund, setShowFund] = useState(false);
  const [showIntegrate, setShowIntegrate] = useState(false);
  const [integrating, setIntegrating] = useState(false);
  const [cardAccountId, setCardAccountId] = useState<string>("");
  const [settlementAccountId, setSettlementAccountId] = useState<string>("");
  const [accounts, setAccounts] = useState<FinAccount[]>([]);
  const [parkedDecisions, setParkedDecisions] = useState<Record<string, { decision: "reject" | "approve_without_doc" | "defer"; reason: string }>>({});
  const [showEditSession, setShowEditSession] = useState(false);
  const [showDeleteSession, setShowDeleteSession] = useState(false);
  const [deletingSession, setDeletingSession] = useState(false);
  const [splitItemId, setSplitItemId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void load();
    void loadAccounts();
  }, [id]);

  const loadAccounts = async () => {
    const { data } = await supabase
      .from("financial_accounts")
      .select("id,name")
      .eq("is_active", true)
      .order("name");
    setAccounts((data ?? []) as FinAccount[]);
  };

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: s }, { data: it }, { data: fm }] = await Promise.all([
      supabase.from("camarim_sessions" as any).select("*").eq("id", id).single(),
      supabase.from("camarim_items" as any).select("*").eq("session_id", id).order("created_at", { ascending: false }),
      supabase.from("camarim_fund_moves" as any).select("*").eq("session_id", id).order("move_date", { ascending: false }),
    ]);
    const itemsList = ((it ?? []) as any[]) as ItemRow[];
    // Anexa flag has_attachment numa única query agregada
    if (itemsList.length > 0) {
      const ids = itemsList.map((i) => i.id);
      const { data: docs } = await supabase
        .from("camarim_item_documents" as any)
        .select("item_id")
        .in("item_id", ids);
      const set = new Set(((docs ?? []) as any[]).map((d) => d.item_id));
      itemsList.forEach((i) => {
        i.has_attachment = set.has(i.id);
      });
    }
    setSession(s as any as SessionData);
    setItems(itemsList);
    setFunds((fm ?? []) as any as FundMove[]);
    setLoading(false);
  };

  const handleDeleteSession = async () => {
    if (!id || !session) return;
    setDeletingSession(true);
    try {
      // Apaga ficheiros do storage primeiro
      const { data: docs } = await supabase
        .from("camarim_item_documents" as any)
        .select("file_path,item_id,camarim_items!inner(session_id)")
        .eq("camarim_items.session_id", id);
      const paths = ((docs ?? []) as any[]).map((d) => d.file_path).filter(Boolean);
      if (paths.length > 0) {
        await supabase.storage.from("camarim-documents").remove(paths);
      }
      // O CASCADE da BD trata de items, fund_moves, session_events, integrations, item_documents.
      const { error } = await supabase.from("camarim_sessions" as any).delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Sessão eliminada" });
      navigate("/camarim");
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro a eliminar sessão", description: e.message });
    } finally {
      setDeletingSession(false);
      setShowDeleteSession(false);
    }
  };

  const totals = useMemo(() => {
    const spent = items.reduce((acc, i) => acc + Number(i.total_amount ?? 0), 0);
    const advances = funds
      .filter((f) => f.move_type === "advance" || f.move_type === "reinforcement")
      .reduce((a, b) => a + Number(b.amount ?? 0), 0);
    const refunds = funds
      .filter((f) => f.move_type === "refund")
      .reduce((a, b) => a + Number(b.amount ?? 0), 0);
    const cashOnHand = advances - refunds - items
      .filter((i) => i.payment_origin === "advance")
      .reduce((a, b) => a + Number(b.total_amount ?? 0), 0);
    const byScope = {
      master_common: items.filter((i) => i.bp_scope === "master_common").reduce((a, b) => a + Number(b.total_amount ?? 0), 0),
      local_city: items.filter((i) => i.bp_scope === "local_city").reduce((a, b) => a + Number(b.total_amount ?? 0), 0),
    };
    const pending = items.filter((i) => i.status === "submitted" || i.status === "draft").length;
    return { spent, advances, refunds, cashOnHand, byScope, pending };
  }, [items, funds]);

  const updateItemStatus = async (itemId: string, status: CamarimItemStatus) => {
    const { error } = await supabase
      .from("camarim_items" as any)
      .update({ status } as any)
      .eq("id", itemId);
    if (error) {
      toast({ variant: "destructive", title: "Erro", description: error.message });
      return;
    }
    toast({ title: status === "approved" ? "Item aprovado" : status === "rejected" ? "Item rejeitado" : "Atualizado" });
    void load();
  };

  const updateSessionStatus = async (status: CamarimSessionStatus) => {
    if (!id) return;
    const { error } = await supabase
      .from("camarim_sessions" as any)
      .update({ status, ...(status === "closed" ? { closed_at: new Date().toISOString() } : {}) } as any)
      .eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: "Erro", description: error.message });
      return;
    }
    toast({ title: `Sessão ${SESSION_STATUS_LABELS[status]}` });
    void load();
  };

  const approvedItems = useMemo(() => items.filter((i) => i.status === "approved"), [items]);
  const parkedItems = useMemo(() => items.filter((i) => i.status === "pending_review"), [items]);
  const needsCardAccount = useMemo(
    () => approvedItems.some((i) => i.payment_origin === "card"),
    [approvedItems],
  );
  const missingCategoryCount = useMemo(
    () => approvedItems.filter((i) => !i.category_id).length,
    [approvedItems],
  );

  // Acerto previsto: gasto via adiantamento - adiantamento líquido entregue
  const settlementPreview = useMemo(() => {
    const advanceNet = totals.advances - totals.refunds;
    const spentFromAdvance = items
      .filter((i) => i.payment_origin === "advance" && (i.status === "approved" || i.status === "integrated"))
      .reduce((acc, i) => acc + Number(i.total_amount ?? 0), 0);
    const balance = +(spentFromAdvance - advanceNet).toFixed(2);
    let type: "balanced" | "reinforcement" | "refund" = "balanced";
    if (advanceNet > 0 && Math.abs(balance) >= 0.01) type = balance > 0 ? "reinforcement" : "refund";
    return { advanceNet, spentFromAdvance, balance, type };
  }, [items, totals]);

  // Bloqueios pré-integração: lista de problemas que impedem o fluxo
  const blockingIssues = useMemo(() => {
    const issues: string[] = [];
    const advanceItems = approvedItems.filter((i) => i.payment_origin === "advance");
    const advanceFundMoves = funds.filter(
      (f) => f.move_type === "advance" || f.move_type === "reinforcement",
    );
    const refundMoves = funds.filter((f) => f.move_type === "refund");
    const lastAdvanceMove = [...advanceFundMoves].sort((a, b) => {
      const aDate = a.created_at ?? a.move_date;
      const bDate = b.created_at ?? b.move_date;
      return bDate.localeCompare(aDate);
    })[0];
    const advanceAccountId = lastAdvanceMove?.financial_account_id ?? null;
    const advanceNet = totals.advances - totals.refunds;
    const spentFromAdvance = advanceItems.reduce((acc, i) => acc + Number(i.total_amount ?? 0), 0);
    const ccy = session?.currency ?? "EUR";

    // (1) Devoluções > entregas → saldo líquido negativo (impossível na prática)
    if (refundMoves.length > 0 && totals.refunds > totals.advances + 0.005) {
      issues.push(
        `Devoluções registadas (${formatCurrency(totals.refunds, ccy)}) excedem o adiantamento entregue (${formatCurrency(totals.advances, ccy)}). Revê os movimentos na aba "Fundos" — o líquido não pode ser negativo.`,
      );
    }

    if (advanceItems.length > 0) {
      // (2) Não há nenhum movimento de adiantamento registado
      if (advanceFundMoves.length === 0) {
        issues.push(
          `${advanceItems.length} item(ns) aprovado(s) marcado(s) como pagos pelo adiantamento, mas nenhum movimento de adiantamento foi registado na aba "Fundos".`,
        );
      } else if (advanceNet <= 0) {
        // (3) Líquido zero ou negativo
        issues.push(
          `Adiantamento líquido entregue à equipa é zero (entregas ${formatCurrency(totals.advances, ccy)} − devoluções ${formatCurrency(totals.refunds, ccy)}). Regista um movimento de adiantamento na aba "Fundos".`,
        );
      } else if (!advanceAccountId) {
        // (4) Sem conta associada
        issues.push(
          'O último movimento de adiantamento não tem conta financeira associada. Edita-o na aba "Fundos" e escolhe a conta de origem.',
        );
      } else {
        // (5) Incoerência grave: gasto via adiantamento muito superior ao líquido entregue
        // Permitimos pequena diferença (até €50 ou 10%) que vira reforço automático no fecho.
        // Acima disso exigimos registo explícito de reforço para evitar erro humano.
        const overspend = spentFromAdvance - advanceNet;
        const tolerance = Math.max(50, advanceNet * 0.1);
        if (overspend > tolerance) {
          issues.push(
            `Gasto via adiantamento (${formatCurrency(spentFromAdvance, ccy)}) excede o líquido entregue (${formatCurrency(advanceNet, ccy)}) em ${formatCurrency(overspend, ccy)} — diferença muito grande. Regista um movimento de reforço na aba "Fundos" antes de integrar (ou corrige a origem dos itens).`,
          );
        }
      }
    } else if (advanceFundMoves.length > 0 && advanceNet > 0) {
      // (6) Houve adiantamento entregue mas nenhum item aprovado o consumiu
      // → vai gerar uma devolução total. Avisamos como bloqueio leve para confirmação.
      issues.push(
        `Foi entregue ${formatCurrency(advanceNet, ccy)} de adiantamento mas nenhum item aprovado foi pago por adiantamento — toda a verba será devolvida. Confirma na aba "Fundos" se isto está correto (ou regista um movimento de devolução manual).`,
      );
    }

    return issues;
  }, [approvedItems, funds, totals, session?.currency]);



  const runIntegrate = async () => {
    if (!id) return;
    if (blockingIssues.length > 0) {
      toast({
        variant: "destructive",
        title: "Pré-requisitos em falta",
        description: blockingIssues[0],
      });
      return;
    }
    if (missingCategoryCount > 0) {
      toast({
        variant: "destructive",
        title: "Categorias em falta",
        description: `${missingCategoryCount} item(ns) aprovado(s) sem categoria contábil.`,
      });
      return;
    }
    if (needsCardAccount && !cardAccountId) {
      toast({
        variant: "destructive",
        title: "Conta de cartão obrigatória",
        description: "Há itens pagos por cartão — escolhe a conta financeira.",
      });
      return;
    }
    // Validar decisões: cada parqueado precisa de uma decisão
    const undecided = parkedItems.filter((p) => !parkedDecisions[p.id]);
    if (undecided.length > 0) {
      toast({
        variant: "destructive",
        title: "Itens parqueados sem decisão",
        description: `${undecided.length} item(ns) parqueado(s) — escolhe rejeitar, aprovar sem doc. ou adiar.`,
      });
      return;
    }
    // Validar justificativa quando approve_without_doc
    for (const p of parkedItems) {
      const d = parkedDecisions[p.id];
      if (d?.decision === "approve_without_doc" && !d.reason.trim()) {
        toast({
          variant: "destructive",
          title: "Justificativa obrigatória",
          description: `Item "${p.supplier_name_raw || "—"}" precisa de justificativa para ser aprovado sem documento.`,
        });
        return;
      }
    }

    setIntegrating(true);
    try {
      const { data, error } = await supabase.functions.invoke("close-camarim-session", {
        body: {
          session_id: id,
          card_account_id: cardAccountId || null,
          settlement_account_id: settlementAccountId || null,
          parked_decisions: Object.entries(parkedDecisions).map(([item_id, v]) => ({
            item_id,
            decision: v.decision,
            reason: v.reason || undefined,
          })),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const settlementMsg = data?.settlement?.type && data.settlement.type !== "balanced"
        ? ` · Acerto: ${data.settlement.type === "reinforcement" ? "reforço a pagar" : "devolução a receber"} de ${formatCurrency(Math.abs(data.settlement.balance ?? 0), session?.currency ?? "EUR")}`
        : "";
      toast({
        title: "Sessão integrada",
        description: `${data?.created ?? 0} transação(ões) gerada(s)${
          data?.errors?.length ? ` · ${data.errors.length} erro(s)` : ""
        }${settlementMsg}`,
      });
      setShowIntegrate(false);
      setParkedDecisions({});
      void load();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao integrar", description: e.message });
    } finally {
      setIntegrating(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">A carregar…</p>;
  if (!session) return <p className="text-sm text-muted-foreground">Sessão não encontrada.</p>;

  const pct = session.budget_amount > 0 ? Math.min(100, (totals.spent / session.budget_amount) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/camarim")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
              <ShoppingBag className="h-5 w-5 text-primary" />
              {session.title}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{SESSION_MODE_LABELS[session.mode]}</span>
              <Badge className={cn("border", SESSION_STATUS_VARIANTS[session.status])} variant="outline">
                {SESSION_STATUS_LABELS[session.status]}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && session.status !== "integrated" && (
            <Button variant="outline" size="sm" onClick={() => setShowEditSession(true)}>
              <Pencil className="mr-2 h-4 w-4" /> Editar sessão
            </Button>
          )}
          {session.status === "open" && canManage && (
            <Button variant="outline" onClick={() => updateSessionStatus("in_review")}>
              <Lock className="mr-2 h-4 w-4" /> Enviar para revisão
            </Button>
          )}
          {session.status === "in_review" && canManage && (
            <Button variant="outline" onClick={() => updateSessionStatus("closed")}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Fechar sessão
            </Button>
          )}
          {(session.status === "in_review" || session.status === "closed") && canManage && (
            <Button onClick={() => setShowIntegrate(true)} disabled={approvedItems.length === 0}>
              <Zap className="mr-2 h-4 w-4" /> Integrar ({approvedItems.length})
            </Button>
          )}
          {/* Eliminar sessão: admin enquanto não integrada; manager apenas em revisão */}
          {((isAdmin && session.status !== "integrated") ||
            (isManager && !isAdmin && session.status === "in_review")) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteSession(true)}
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Eliminar sessão
            </Button>
          )}
          {session.status === "integrated" && (
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Integrada
            </Badge>
          )}
        </div>
      </div>

      {missingCategoryCount > 0 && (session.status === "in_review" || session.status === "closed") && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {missingCategoryCount} item(ns) aprovado(s) sem categoria contábil. Edita-os antes de integrar
            — caso contrário não serão convertidos em transações.
          </p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Orçamento</p>
            <p className="text-lg font-semibold">{formatCurrency(session.budget_amount, session.currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Gasto</p>
            <p className="text-lg font-semibold">{formatCurrency(totals.spent, session.currency)}</p>
            <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-primary",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Caixa em mão</p>
            <p className={cn("text-lg font-semibold", totals.cashOnHand < 0 && "text-destructive")}>
              {formatCurrency(totals.cashOnHand, session.currency)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Adiant.: {formatCurrency(totals.advances, session.currency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Por aprovar</p>
            <p className="text-lg font-semibold">{totals.pending}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Master {formatCurrency(totals.byScope.master_common, session.currency)} · Local{" "}
              {formatCurrency(totals.byScope.local_city, session.currency)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="items" className="w-full">
        <TabsList>
          <TabsTrigger value="items">Itens ({items.length})</TabsTrigger>
          <TabsTrigger value="funds">Fundos ({funds.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="space-y-3">
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => {
                setEditingItemId(null);
                setShowItem(true);
              }}
              disabled={session.status === "integrated"}
            >
              <Plus className="mr-2 h-4 w-4" /> Adicionar conta
            </Button>
          </div>

          {items.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Sem itens registados.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {items.map((it) => (
                <Card
                  key={it.id}
                  className="cursor-pointer transition hover:border-primary/40"
                  onClick={() => {
                    setEditingItemId(it.id);
                    setShowItem(true);
                  }}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">
                            {it.supplier_name_raw || "—"}
                          </p>
                          <Badge className={cn("border text-[10px]", ITEM_STATUS_VARIANTS[it.status])} variant="outline">
                            {ITEM_STATUS_LABELS[it.status]}
                          </Badge>
                          {!it.has_document && (
                            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 text-[10px]">
                              Sem documento
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {it.service_description || "—"}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                          <span>{it.document_date || "—"}</span>
                          <span>·</span>
                          <span>{PAYMENT_ORIGIN_LABELS[it.payment_origin]}</span>
                          <span>·</span>
                          <span>{BP_SCOPE_LABELS[it.bp_scope]}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold">{formatCurrency(it.total_amount, session.currency)}</p>
                        {it.iva_amount > 0 && (
                          <p className="text-[10px] text-muted-foreground">
                            IVA {formatCurrency(it.iva_amount, session.currency)}
                          </p>
                        )}
                        <div className="mt-1 flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {it.has_attachment && (
                            <CamarimItemAttachmentButton itemId={it.id} iconOnly />
                          )}
                          {canManage && (it.status === "submitted" || it.status === "draft") && (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-emerald-600"
                                onClick={() => updateItemStatus(it.id, "approved")}
                                title="Aprovar"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive"
                                onClick={() => updateItemStatus(it.id, "rejected")}
                                title="Rejeitar"
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="funds" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowFund(true)} disabled={!canManage}>
              <Wallet className="mr-2 h-4 w-4" /> Registar movimento
            </Button>
          </div>

          {funds.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Sem movimentos de caixa.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {funds.map((f) => (
                <Card key={f.id}>
                  <CardContent className="flex items-center justify-between p-3">
                    <div>
                      <p className="text-sm font-medium">{FUND_MOVE_LABELS[f.move_type]}</p>
                      <p className="text-xs text-muted-foreground">
                        {f.move_date} {f.notes ? `· ${f.notes}` : ""}
                      </p>
                    </div>
                    <p
                      className={cn(
                        "text-sm font-semibold",
                        f.move_type === "refund" ? "text-destructive" : "text-emerald-600",
                      )}
                    >
                      {f.move_type === "refund" ? "-" : "+"}
                      {formatCurrency(f.amount, session.currency)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {showItem && (
        <CamarimItemModal
          open={showItem}
          onOpenChange={setShowItem}
          sessionId={session.id}
          itemId={editingItemId}
          mode="manager"
          onSaved={load}
        />
      )}

      {showFund && (
        <CamarimFundMoveModal
          open={showFund}
          onOpenChange={setShowFund}
          sessionId={session.id}
          onSaved={load}
        />
      )}

      {showEditSession && (
        <EditSessionModal
          open={showEditSession}
          onOpenChange={setShowEditSession}
          sessionId={session.id}
          initial={{
            title: session.title,
            budget_amount: session.budget_amount,
            notes: session.notes,
          }}
          onSaved={load}
        />
      )}

      <AlertDialog open={showDeleteSession} onOpenChange={setShowDeleteSession}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar sessão de camarim?</AlertDialogTitle>
            <AlertDialogDescription>
              Vai apagar definitivamente a sessão <strong>{session.title}</strong>, todos os
              {" "}{items.length} item(ns), {funds.length} movimento(s) de fundos e ficheiros anexos.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingSession}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSession}
              disabled={deletingSession}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingSession ? "A eliminar…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showIntegrate} onOpenChange={setShowIntegrate}>
        <AlertDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Integrar sessão no sistema financeiro</AlertDialogTitle>
            <AlertDialogDescription>
              Vou gerar {approvedItems.length} transação(ões) a partir dos itens aprovados.
              Itens por adiantamento são liquidados na caixa do camarim; do bolso ficam a reembolsar.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4">
            {blockingIssues.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  Não é possível integrar — corrige antes de continuar
                </div>
                <ul className="list-disc space-y-1 pl-5 text-xs text-destructive">
                  {blockingIssues.map((msg, idx) => (
                    <li key={idx}>{msg}</li>
                  ))}
                </ul>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => {
                    setShowIntegrate(false);
                    setShowFund(true);
                  }}
                >
                  <Wallet className="mr-1.5 h-3.5 w-3.5" /> Registar movimento de fundo
                </Button>
              </div>
            )}

            {needsCardAccount && (
              <div className="space-y-2">
                <Label>Conta financeira do cartão da empresa</Label>
                <Select value={cardAccountId} onValueChange={setCardAccountId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar conta…" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Acerto de adiantamento */}
            {settlementPreview.advanceNet > 0 && (
              <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2">
                <p className="text-sm font-medium">Acerto de adiantamento</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>Adiantamento líquido: <strong className="tabular-nums">{formatCurrency(settlementPreview.advanceNet, session.currency)}</strong></div>
                  <div>Gasto via adiant.: <strong className="tabular-nums">{formatCurrency(settlementPreview.spentFromAdvance, session.currency)}</strong></div>
                </div>
                {settlementPreview.type === "balanced" ? (
                  <p className="text-xs text-emerald-600">✓ Equilibrado — sem acerto necessário.</p>
                ) : settlementPreview.type === "reinforcement" ? (
                  <p className="text-xs text-destructive">
                    Falta pagar à equipa: <strong>{formatCurrency(Math.abs(settlementPreview.balance), session.currency)}</strong> — será criada transação de despesa <em>aprovada</em>.
                  </p>
                ) : (
                  <p className="text-xs text-emerald-600">
                    Sobra a devolver: <strong>{formatCurrency(Math.abs(settlementPreview.balance), session.currency)}</strong> — será criada transação de receita <em>aprovada</em>.
                  </p>
                )}
                {settlementPreview.type !== "balanced" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Conta para o acerto (opcional — usa a do adiantamento se vazio)</Label>
                    <Select value={settlementAccountId} onValueChange={setSettlementAccountId}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Mesma do adiantamento" /></SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {/* Itens parqueados */}
            {parkedItems.length > 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                  {parkedItems.length} item(ns) parqueado(s) sem documento — decide o destino
                </div>
                {parkedItems.map((p) => {
                  const d = parkedDecisions[p.id];
                  return (
                    <div key={p.id} className="space-y-1.5 rounded border border-border bg-card p-2">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-medium">{p.supplier_name_raw || "—"} · {p.service_description || "—"}</span>
                        <span className="shrink-0 tabular-nums">{formatCurrency(p.total_amount, session.currency)}</span>
                      </div>
                      <Select
                        value={d?.decision ?? ""}
                        onValueChange={(v) =>
                          setParkedDecisions((prev) => ({
                            ...prev,
                            [p.id]: { decision: v as any, reason: prev[p.id]?.reason ?? "" },
                          }))
                        }
                      >
                        <SelectTrigger className="h-8"><SelectValue placeholder="Escolher destino…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="reject">Rejeitar (descarta)</SelectItem>
                          <SelectItem value="approve_without_doc">Aprovar sem documento (com justificativa)</SelectItem>
                          <SelectItem value="defer">Adiar (fica para próxima sessão)</SelectItem>
                        </SelectContent>
                      </Select>
                      {d?.decision === "approve_without_doc" && (
                        <input
                          type="text"
                          placeholder="Justificativa contábil (obrigatória)"
                          value={d.reason}
                          onChange={(e) =>
                            setParkedDecisions((prev) => ({
                              ...prev,
                              [p.id]: { ...prev[p.id], reason: e.target.value },
                            }))
                          }
                          className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={integrating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={runIntegrate} disabled={integrating || blockingIssues.length > 0}>
              {integrating ? "A integrar…" : "Integrar agora"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

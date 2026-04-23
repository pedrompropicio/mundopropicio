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
import { ArrowLeft, ShoppingBag, CheckCircle2, XCircle, Wallet, Plus, Lock, Zap, AlertTriangle } from "lucide-react";
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
}

interface FundMove {
  id: string;
  move_type: CamarimFundMoveType;
  amount: number;
  move_date: string;
  notes: string | null;
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
  const [accounts, setAccounts] = useState<FinAccount[]>([]);

  useEffect(() => {
    if (!id) return;
    void load();
  }, [id]);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: s }, { data: it }, { data: fm }] = await Promise.all([
      supabase.from("camarim_sessions" as any).select("*").eq("id", id).single(),
      supabase.from("camarim_items" as any).select("*").eq("session_id", id).order("created_at", { ascending: false }),
      supabase.from("camarim_fund_moves" as any).select("*").eq("session_id", id).order("move_date", { ascending: false }),
    ]);
    setSession(s as any as SessionData);
    setItems((it ?? []) as any as ItemRow[]);
    setFunds((fm ?? []) as any as FundMove[]);
    setLoading(false);
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
          {session.status === "open" && canManage && (
            <Button variant="outline" onClick={() => updateSessionStatus("in_review")}>
              <Lock className="mr-2 h-4 w-4" /> Enviar para revisão
            </Button>
          )}
          {session.status === "in_review" && canManage && (
            <Button onClick={() => updateSessionStatus("closed")}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Fechar sessão
            </Button>
          )}
        </div>
      </div>

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
                        {canManage && (it.status === "submitted" || it.status === "draft") && (
                          <div className="mt-1 flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-emerald-600"
                              onClick={() => updateItemStatus(it.id, "approved")}
                              title="Aprovar"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-destructive"
                              onClick={() => updateItemStatus(it.id, "rejected")}
                              title="Rejeitar"
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
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
    </div>
  );
}

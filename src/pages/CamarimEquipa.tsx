import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingBag, Plus, ArrowLeft, ArrowRight, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { Navigate, useNavigate } from "react-router-dom";
import {
  SESSION_STATUS_LABELS,
  SESSION_STATUS_VARIANTS,
  ITEM_STATUS_LABELS,
  ITEM_STATUS_VARIANTS,
  formatCurrency,
  type CamarimSessionStatus,
  type CamarimItemStatus,
} from "@/lib/camarim-helpers";
import { CamarimItemModal } from "@/components/camarim/CamarimItemModal";

interface SessionRow {
  id: string;
  title: string;
  status: CamarimSessionStatus;
  budget_amount: number;
  currency: string;
  spent?: number;
  pending?: number;
}

interface ActiveSessionItems {
  id: string;
  total_amount: number;
  supplier_name_raw: string | null;
  service_description: string | null;
  status: CamarimItemStatus;
  document_date: string | null;
}

export default function CamarimEquipa() {
  const { user, hasPermission, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [items, setItems] = useState<ActiveSessionItems[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (loading || !user) return;
    void load();
  }, [loading, user]);

  const load = async () => {
    setBusy(true);
    const { data: s } = await supabase
      .from("camarim_sessions" as any)
      .select("id,title,status,budget_amount,currency")
      .in("status", ["open", "in_review"])
      .order("opened_at", { ascending: false });

    const list = ((s ?? []) as any[]) as SessionRow[];
    if (list.length > 0) {
      const ids = list.map((x) => x.id);
      const { data: it } = await supabase
        .from("camarim_items" as any)
        .select("session_id,total_amount,status")
        .in("session_id", ids);
      const m = new Map<string, { spent: number; pending: number }>();
      ((it ?? []) as any[]).forEach((row) => {
        const cur = m.get(row.session_id) ?? { spent: 0, pending: 0 };
        cur.spent += Number(row.total_amount ?? 0);
        if (row.status === "draft" || row.status === "submitted") cur.pending += 1;
        m.set(row.session_id, cur);
      });
      list.forEach((x) => {
        const v = m.get(x.id);
        x.spent = v?.spent ?? 0;
        x.pending = v?.pending ?? 0;
      });
    }
    setSessions(list);
    setBusy(false);
  };

  const loadSessionItems = async (sid: string) => {
    const { data } = await supabase
      .from("camarim_items" as any)
      .select("id,total_amount,supplier_name_raw,service_description,status,document_date")
      .eq("session_id", sid)
      .order("created_at", { ascending: false })
      .limit(50);
    setItems(((data ?? []) as any[]) as ActiveSessionItems[]);
  };

  if (loading) return <p className="p-6 text-sm text-muted-foreground">A carregar…</p>;

  if (!user) return <Navigate to="/login" replace />;

  if (!isAdmin && !hasPermission("camarim_team")) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Sem permissão para o módulo de camarim. Contacta a gestão.
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate("/")}>
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Vista da sessão activa
  if (selectedId) {
    const sess = sessions.find((s) => s.id === selectedId);
    const pct = sess && sess.budget_amount > 0 ? Math.min(100, ((sess.spent ?? 0) / sess.budget_amount) * 100) : 0;
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4 pb-24">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Sessões
          </Button>
          <Badge className={cn("border", SESSION_STATUS_VARIANTS[sess?.status ?? "open"])} variant="outline">
            {SESSION_STATUS_LABELS[sess?.status ?? "open"]}
          </Badge>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{sess?.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Gasto / Orçamento</p>
            <p className="text-xl font-semibold">
              {formatCurrency(sess?.spent ?? 0, sess?.currency)} /{" "}
              <span className="text-muted-foreground text-base">
                {formatCurrency(sess?.budget_amount ?? 0, sess?.currency)}
              </span>
            </p>
            <div className="mt-2 h-2 w-full rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full",
                  pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-primary",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-2">
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sem contas registadas. Tira foto do primeiro talão!</p>
          ) : (
            items.map((it) => (
              <Card
                key={it.id}
                className="cursor-pointer transition active:scale-[0.99]"
                onClick={() => {
                  setEditId(it.id);
                  setShowAdd(true);
                }}
              >
                <CardContent className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{it.supplier_name_raw || "—"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {it.service_description || "—"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{it.document_date || "—"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatCurrency(it.total_amount, sess?.currency)}</p>
                    <Badge className={cn("border text-[10px]", ITEM_STATUS_VARIANTS[it.status])} variant="outline">
                      {ITEM_STATUS_LABELS[it.status]}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* FAB */}
        <button
          onClick={() => {
            setEditId(null);
            setShowAdd(true);
          }}
          className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95"
          aria-label="Nova conta"
        >
          <Camera className="h-6 w-6" />
        </button>

        {showAdd && selectedId && (
          <CamarimItemModal
            open={showAdd}
            onOpenChange={(o) => {
              setShowAdd(o);
              if (!o) {
                setEditId(null);
                void loadSessionItems(selectedId);
                void load();
              }
            }}
            sessionId={selectedId}
            itemId={editId}
            mode="team"
            onSaved={() => loadSessionItems(selectedId)}
          />
        )}
      </div>
    );
  }

  // Listagem de sessões abertas
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <ShoppingBag className="h-5 w-5 text-primary" /> Camarim — Equipa
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Escolhe a sessão activa e regista contas.</p>
      </div>

      {busy ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Não há sessões abertas. Pede à gestão para abrir uma sessão.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const pct = s.budget_amount > 0 ? Math.min(100, ((s.spent ?? 0) / s.budget_amount) * 100) : 0;
            return (
              <Card
                key={s.id}
                className="cursor-pointer transition hover:border-primary/40 active:scale-[0.99]"
                onClick={() => {
                  setSelectedId(s.id);
                  void loadSessionItems(s.id);
                }}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{s.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Gasto {formatCurrency(s.spent ?? 0, s.currency)} de{" "}
                        {formatCurrency(s.budget_amount, s.currency)}
                      </p>
                      <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-primary",
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

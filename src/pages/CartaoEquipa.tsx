import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreditCard, Camera, Receipt, Pencil, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CARD_SESSION_STATUS_LABELS,
  CARD_SESSION_STATUS_VARIANTS,
  formatCurrency,
  cardItemGross,
  type CardSessionStatus,
} from "@/lib/card-session-helpers";
import { CardTeamItemModal } from "@/components/cards/CardTeamItemModal";

const LAST_SESSION_KEY = "card_team_last_session";

interface SessionRow {
  id: string;
  card_account_id: string;
  card_name: string;
  status: CardSessionStatus;
  holder_profile_id: string | null;
  holder_name: string;
  primary_event_id: string | null;
  primary_event_name: string | null;
  opening_balance: number;
  loads_total: number;
  approved_total: number;
  pending_total: number;
  pending_count: number;
  my_submitted_count: number;
  my_approved_count: number;
}

interface ItemRow {
  id: string;
  supplier_name: string | null;
  description: string | null;
  amount: number;
  item_date: string;
  status: "submitted" | "approved" | "rejected";
  rejection_reason: string | null;
  document_path: string | null;
  submitted_by: string | null;
  event_id: string | null;
  event_name: string | null;
}

const ITEM_STATUS_LABEL: Record<ItemRow["status"], string> = {
  submitted: "Submetido",
  approved: "Aprovado",
  rejected: "Rejeitado",
};

const ITEM_STATUS_CLASS: Record<ItemRow["status"], string> = {
  submitted: "border-amber-500/40 bg-amber-500/10 text-amber-600",
  approved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
  rejected: "border-destructive/40 bg-destructive/10 text-destructive",
};

export default function CartaoEquipa() {
  const { user, hasPermission, isAdmin, isManager, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const canManage = isAdmin || isManager || hasPermission("card_manage");

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [autoCamera, setAutoCamera] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    void load();
  }, [loading, user]);

  useEffect(() => {
    if (selectedId) {
      try {
        localStorage.setItem(LAST_SESSION_KEY, selectedId);
      } catch {}
      void loadItems(selectedId);
    }
  }, [selectedId]);

  const load = async () => {
    if (!user) return;
    setBusy(true);
    // sessões abertas/em revisão. RLS-select é aberto, mas filtramos por holder
    // se o utilizador não for gestor (mostra só as suas).
    let q = supabase
      .from("card_sessions")
      .select(
        "id, card_account_id, status, holder_profile_id, holder_name, primary_event_id, opening_balance, financial_accounts:card_account_id(name), events:primary_event_id(name)",
      )
      .in("status", ["open", "in_review"])
      .order("opened_at", { ascending: false });
    if (!canManage) q = q.eq("holder_profile_id", user.id);
    const { data: raw } = await q;
    const list = (raw ?? []) as any[];

    if (list.length === 0) {
      setSessions([]);
      setSelectedId(null);
      setBusy(false);
      return;
    }
    const ids = list.map((s) => s.id);

    const [{ data: loads }, { data: exps }, { data: allItems }] = await Promise.all([
      supabase
        .from("card_session_loads")
        .select("session_id, amount, in_transaction_id")
        .in("session_id", ids)
        .not("in_transaction_id", "is", null),
      supabase
        .from("transactions")
        .select("card_session_id, paid_amount, amount, iva_rate")
        .in("card_session_id", ids),
      supabase
        .from("card_session_items")
        .select("session_id, amount, iva_rate, status, submitted_by")
        .in("session_id", ids),
    ]);

    const loadsMap = new Map<string, number>();
    (loads ?? []).forEach((l: any) =>
      loadsMap.set(l.session_id, (loadsMap.get(l.session_id) ?? 0) + Number(l.amount)),
    );
    const expMap = new Map<string, number>();
    (exps ?? []).forEach((e: any) =>
      expMap.set(
        e.card_session_id,
        (expMap.get(e.card_session_id) ?? 0) + (Number(e.paid_amount) || cardItemGross(e)),
      ),
    );
    const pendMap = new Map<string, { total: number; count: number }>();
    const mySubMap = new Map<string, number>();
    const myAppMap = new Map<string, number>();
    (allItems ?? []).forEach((i: any) => {
      if (i.status === "submitted") {
        const cur = pendMap.get(i.session_id) ?? { total: 0, count: 0 };
        cur.total += cardItemGross(i);
        cur.count += 1;
        pendMap.set(i.session_id, cur);
      }
      if (i.submitted_by === user.id) {
        if (i.status === "submitted")
          mySubMap.set(i.session_id, (mySubMap.get(i.session_id) ?? 0) + 1);
        if (i.status === "approved")
          myAppMap.set(i.session_id, (myAppMap.get(i.session_id) ?? 0) + 1);
      }
    });

    const rows: SessionRow[] = list.map((s) => ({
      id: s.id,
      card_account_id: s.card_account_id,
      card_name: s.financial_accounts?.name ?? "Cartão",
      status: s.status,
      holder_profile_id: s.holder_profile_id,
      holder_name: s.holder_name,
      primary_event_id: s.primary_event_id,
      primary_event_name: s.events?.name ?? null,
      opening_balance: Number(s.opening_balance ?? 0),
      loads_total: loadsMap.get(s.id) ?? 0,
      approved_total: expMap.get(s.id) ?? 0,
      pending_total: pendMap.get(s.id)?.total ?? 0,
      pending_count: pendMap.get(s.id)?.count ?? 0,
      my_submitted_count: mySubMap.get(s.id) ?? 0,
      my_approved_count: myAppMap.get(s.id) ?? 0,
    }));

    setSessions(rows);

    let nextId: string | null = null;
    try {
      const stored = localStorage.getItem(LAST_SESSION_KEY);
      if (stored && rows.some((r) => r.id === stored)) nextId = stored;
    } catch {}
    if (!nextId) nextId = rows[0].id;
    setSelectedId(nextId);

    setBusy(false);
  };

  const loadItems = async (sid: string) => {
    if (!user) return;
    // Produtor: só os seus. Gestor: todos os da sessão.
    let q = supabase
      .from("card_session_items")
      .select(
        "id, supplier_name, description, amount, iva_rate, item_date, status, rejection_reason, document_path, submitted_by, event_id, events:event_id(name)",
      )
      .eq("session_id", sid)
      .order("created_at", { ascending: false })
      .limit(100);
    if (!canManage) q = q.eq("submitted_by", user.id);
    const { data } = await q;
    setItems(
      ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        supplier_name: r.supplier_name,
        description: r.description,
        amount: cardItemGross(r), // total c/IVA (o que saiu do cartão)
        item_date: r.item_date,
        status: r.status,
        rejection_reason: r.rejection_reason,
        document_path: r.document_path,
        submitted_by: r.submitted_by,
        event_id: r.event_id,
        event_name: r.events?.name ?? null,
      })),
    );
  };

  const active = useMemo(() => sessions.find((s) => s.id === selectedId), [sessions, selectedId]);
  const theoretical = active
    ? active.opening_balance + active.loads_total - active.approved_total - active.pending_total
    : 0;

  if (loading) return <p className="p-6 text-sm text-muted-foreground">A carregar…</p>;
  if (!user) return <Navigate to="/login" replace />;

  if (!isAdmin && !hasPermission("card_team") && !hasPermission("card_manage")) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Sem permissão para o módulo de cartões. Contacta a gestão.
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate("/")}>
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canAddNow = active?.status === "open";
  const isMine = active && (active.holder_profile_id === user.id || canManage);

  return (
    <div className="min-h-[100dvh] w-full bg-muted/30 sm:py-6">
      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[420px] flex-col overflow-hidden bg-background sm:min-h-[min(900px,calc(100dvh-3rem))] sm:rounded-[2rem] sm:border sm:border-border sm:shadow-2xl">
        {/* Header */}
        <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold">Cartão — Produtor</span>
            </div>
            <div className="flex items-center gap-2">
              {active && (
                <Badge
                  className={cn("border", CARD_SESSION_STATUS_VARIANTS[active.status])}
                  variant="outline"
                >
                  {CARD_SESSION_STATUS_LABELS[active.status]}
                </Badge>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={async () => {
                  if (window.confirm("Terminar sessão?")) {
                    await signOut();
                    navigate("/login");
                  }
                }}
                title="Terminar sessão"
                aria-label="Terminar sessão"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {sessions.length > 0 ? (
            <div className="mt-3 space-y-2">
              <Select value={selectedId ?? ""} onValueChange={(v) => setSelectedId(v)}>
                <SelectTrigger className="h-11 text-sm">
                  <SelectValue placeholder="Escolhe a sessão…" />
                </SelectTrigger>
                <SelectContent>
                  {sessions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.card_name} · {s.holder_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {active && (
                <div className="space-y-1 rounded-md border border-border bg-muted/30 p-2 text-[11px]">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Saldo teórico</span>
                    <span className="font-semibold text-foreground">
                      {formatCurrency(theoretical)}
                    </span>
                  </div>
                  {active.primary_event_name && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Evento principal</span>
                      <span className="truncate max-w-[60%] text-right">
                        {active.primary_event_name}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-muted-foreground">
                    <span>Meus lançamentos</span>
                    <span>
                      {active.my_submitted_count} pendente(s) · {active.my_approved_count}{" "}
                      aprovado(s)
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            !busy && (
              <p className="mt-3 text-xs text-muted-foreground">
                Não há sessões de cartão ativas atribuídas a ti. Pede à gestão para abrir uma.
              </p>
            )
          )}
        </header>

        {/* Lista */}
        <main className="flex-1 space-y-2 px-4 pb-32 pt-4">
          {busy ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : !selectedId ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sem sessões disponíveis.
            </p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Receipt className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Sem lançamentos. Tira foto do primeiro talão!
              </p>
            </div>
          ) : (
            items.map((it) => {
              const isSelf = it.submitted_by === user.id;
              const canEdit = isSelf && it.status === "submitted" && active?.status === "open";
              return (
                <Card
                  key={it.id}
                  onClick={() => {
                    if (!canEdit) return;
                    setEditId(it.id);
                    setAutoCamera(false);
                    setShowModal(true);
                  }}
                  className={cn(
                    "transition",
                    canEdit && "cursor-pointer active:scale-[0.99]",
                  )}
                >
                  <CardContent className="flex items-start justify-between gap-2 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {it.supplier_name || it.description || "—"}
                      </p>
                      {it.description && it.supplier_name && (
                        <p className="truncate text-xs text-muted-foreground">
                          {it.description}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        {it.item_date}
                        {it.event_name ? ` · ${it.event_name}` : ""}
                      </p>
                      {it.status === "rejected" && it.rejection_reason && (
                        <p className="mt-1 text-[11px] text-destructive">
                          Motivo: {it.rejection_reason}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatCurrency(it.amount)}</p>
                      <Badge
                        variant="outline"
                        className={cn("mt-1 border text-[10px]", ITEM_STATUS_CLASS[it.status])}
                      >
                        {ITEM_STATUS_LABEL[it.status]}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </main>

        {/* FAB */}
        {selectedId && canAddNow && isMine && (
          <div className="absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3">
            <button
              onClick={() => {
                setEditId(null);
                setAutoCamera(false);
                setShowModal(true);
              }}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-lg active:scale-95"
              aria-label="Adicionar manualmente"
              title="Adicionar manualmente"
            >
              <Pencil className="h-5 w-5" />
            </button>
            <button
              onClick={() => {
                setEditId(null);
                setAutoCamera(true);
                setShowModal(true);
              }}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl ring-4 ring-background active:scale-95"
              aria-label="Nova despesa com foto"
            >
              <Camera className="h-7 w-7" />
            </button>
          </div>
        )}

        {showModal && selectedId && active && (
          <CardTeamItemModal
            open={showModal}
            onOpenChange={(o) => {
              setShowModal(o);
              if (!o) {
                setEditId(null);
                setAutoCamera(false);
                void loadItems(selectedId);
                void load();
              }
            }}
            sessionId={selectedId}
            primaryEventId={active.primary_event_id}
            itemId={editId}
            autoOpenCamera={autoCamera && !editId}
            onSaved={() => void loadItems(selectedId)}
          />
        )}
      </div>
    </div>
  );
}

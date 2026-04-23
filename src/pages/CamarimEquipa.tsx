import { useEffect, useMemo, useState } from "react";
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
import { ShoppingBag, Camera, Receipt } from "lucide-react";
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

const LAST_SESSION_KEY = "camarim_team_last_session";

interface SessionRow {
  id: string;
  title: string;
  status: CamarimSessionStatus;
  budget_amount: number;
  currency: string;
  spent?: number;
}

interface ItemRow {
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
  const [items, setItems] = useState<ItemRow[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (loading || !user) return;
    void load();
  }, [loading, user]);

  // Persist last session per device
  useEffect(() => {
    if (selectedId) {
      try {
        localStorage.setItem(LAST_SESSION_KEY, selectedId);
      } catch {}
      void loadItems(selectedId);
    }
  }, [selectedId]);

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
        .select("session_id,total_amount")
        .in("session_id", ids);
      const m = new Map<string, number>();
      ((it ?? []) as any[]).forEach((row) => {
        m.set(row.session_id, (m.get(row.session_id) ?? 0) + Number(row.total_amount ?? 0));
      });
      list.forEach((x) => {
        x.spent = m.get(x.id) ?? 0;
      });
    }
    setSessions(list);

    // Decide active session
    let nextId: string | null = null;
    try {
      const stored = localStorage.getItem(LAST_SESSION_KEY);
      if (stored && list.some((x) => x.id === stored)) nextId = stored;
    } catch {}
    if (!nextId && list.length > 0) nextId = list[0].id;
    setSelectedId(nextId);

    setBusy(false);
  };

  const loadItems = async (sid: string) => {
    const { data } = await supabase
      .from("camarim_items" as any)
      .select("id,total_amount,supplier_name_raw,service_description,status,document_date")
      .eq("session_id", sid)
      .order("created_at", { ascending: false })
      .limit(50);
    setItems(((data ?? []) as any[]) as ItemRow[]);
  };

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === selectedId),
    [sessions, selectedId],
  );

  const pct = useMemo(() => {
    if (!activeSession || activeSession.budget_amount <= 0) return 0;
    return Math.min(100, ((activeSession.spent ?? 0) / activeSession.budget_amount) * 100);
  }, [activeSession]);

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

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col">
      {/* Sticky header — selector sempre visível */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold">Camarim — Equipa</span>
          </div>
          {activeSession && (
            <Badge
              className={cn("border", SESSION_STATUS_VARIANTS[activeSession.status])}
              variant="outline"
            >
              {SESSION_STATUS_LABELS[activeSession.status]}
            </Badge>
          )}
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
                    {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeSession && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Gasto</span>
                  <span>
                    {formatCurrency(activeSession.spent ?? 0, activeSession.currency)} /{" "}
                    {formatCurrency(activeSession.budget_amount, activeSession.currency)}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-primary",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          !busy && (
            <p className="mt-3 text-xs text-muted-foreground">
              Não há sessões abertas. Pede à gestão para abrir uma sessão.
            </p>
          )
        )}
      </header>

      {/* Lista de contas */}
      <main className="flex-1 px-4 pb-32 pt-4">
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
              Sem contas registadas. Tira foto do primeiro talão!
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
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
                    <p className="truncate text-sm font-medium">
                      {it.supplier_name_raw || "—"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {it.service_description || "—"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {it.document_date || "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">
                      {formatCurrency(it.total_amount, activeSession?.currency)}
                    </p>
                    <Badge
                      className={cn("border text-[10px]", ITEM_STATUS_VARIANTS[it.status])}
                      variant="outline"
                    >
                      {ITEM_STATUS_LABELS[it.status]}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* FAB — câmara, sempre disponível */}
      {selectedId && (
        <button
          onClick={() => {
            setEditId(null);
            setShowAdd(true);
          }}
          className="fixed bottom-6 left-1/2 z-30 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl ring-4 ring-background active:scale-95"
          aria-label="Nova conta"
        >
          <Camera className="h-7 w-7" />
        </button>
      )}

      {showAdd && selectedId && (
        <CamarimItemModal
          open={showAdd}
          onOpenChange={(o) => {
            setShowAdd(o);
            if (!o) {
              setEditId(null);
              void loadItems(selectedId);
              void load();
            }
          }}
          sessionId={selectedId}
          itemId={editId}
          mode="team"
          autoOpenCamera={!editId}
          onSaved={() => loadItems(selectedId)}
        />
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
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
import { ShoppingBag, Camera, Receipt, GripHorizontal, Pencil, LogOut } from "lucide-react";
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
import { CamarimTeamSummary } from "@/components/camarim/CamarimTeamSummary";
import { CamarimItemAttachmentButton } from "@/components/camarim/CamarimItemAttachmentButton";

const LAST_SESSION_KEY = "camarim_team_last_session";
const FRAME_POS_KEY = "camarim_team_frame_pos";
const DEFAULT_LANDING_KEY = "camarim_team_default_landing";

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
  has_document: boolean;
  has_attachment?: boolean;
}

export default function CamarimEquipa() {
  const { user, hasPermission, isAdmin, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [autoCamera, setAutoCamera] = useState(false);
  const [busy, setBusy] = useState(true);
  const [defaultLanding, setDefaultLanding] = useState(false);

  // Load default-landing preference (admin/manager only)
  useEffect(() => {
    try {
      setDefaultLanding(localStorage.getItem(DEFAULT_LANDING_KEY) === "1");
    } catch {}
  }, []);

  const toggleDefaultLanding = () => {
    const next = !defaultLanding;
    setDefaultLanding(next);
    try {
      if (next) localStorage.setItem(DEFAULT_LANDING_KEY, "1");
      else localStorage.removeItem(DEFAULT_LANDING_KEY);
    } catch {}
  };

  // ===== Drag-to-move (apenas desktop, sm+) =====
  const frameRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    active: boolean;
  } | null>(null);

  // Restore saved position on mount (desktop only)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.innerWidth < 640) return;
    try {
      const raw = localStorage.getItem(FRAME_POS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
          setPos(parsed);
        }
      }
    } catch {}
  }, []);

  const clampPos = (x: number, y: number) => {
    const el = frameRef.current;
    const w = el?.offsetWidth ?? 420;
    const h = el?.offsetHeight ?? 700;
    const maxX = window.innerWidth - w;
    const maxY = window.innerHeight - h;
    return {
      x: Math.max(0, Math.min(x, Math.max(0, maxX))),
      y: Math.max(0, Math.min(y, Math.max(0, maxY))),
    };
  };

  const onDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (window.innerWidth < 640) return; // só desktop
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const el = frameRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const current = pos ?? { x: rect.left, y: rect.top };
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: current.x,
      origY: current.y,
      active: true,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d?.active) return;
    const next = clampPos(d.origX + (e.clientX - d.startX), d.origY + (e.clientY - d.startY));
    setPos(next);
  };

  const onDragEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d?.active) return;
    d.active = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    if (pos) {
      try {
        localStorage.setItem(FRAME_POS_KEY, JSON.stringify(pos));
      } catch {}
    }
  };

  // Re-clamp on window resize so a janela não fica fora do ecrã
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 640) {
        setPos(null);
        return;
      }
      setPos((p) => (p ? clampPos(p.x, p.y) : p));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
      .select("id,total_amount,supplier_name_raw,service_description,status,document_date,has_document")
      .eq("session_id", sid)
      .order("created_at", { ascending: false })
      .limit(50);
    const list = ((data ?? []) as any[]) as ItemRow[];
    if (list.length > 0) {
      const ids = list.map((i) => i.id);
      const { data: docs } = await supabase
        .from("camarim_item_documents" as any)
        .select("item_id")
        .in("item_id", ids);
      const set = new Set(((docs ?? []) as any[]).map((d) => d.item_id));
      list.forEach((i) => (i.has_attachment = set.has(i.id)));
    }
    setItems(list);
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

  // No desktop: se houver pos guardada, posiciona a janela em coords absolutas
  // dentro do viewport. No mobile (<sm): pos é null e a janela ocupa o ecrã.
  const frameStyle: React.CSSProperties =
    pos && typeof window !== "undefined" && window.innerWidth >= 640
      ? { position: "fixed", left: pos.x, top: pos.y, margin: 0 }
      : {};

  return (
    <div className="min-h-[100dvh] w-full bg-muted/30 sm:py-6">
      <div
        ref={frameRef}
        style={frameStyle}
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-[420px] flex-col overflow-hidden bg-background sm:min-h-[min(900px,calc(100dvh-3rem))] sm:rounded-[2rem] sm:border sm:border-border sm:shadow-2xl"
      >
      {/* Drag handle — só visível em desktop */}
      <div
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        className="hidden sm:flex sticky top-0 z-30 h-6 cursor-grab items-center justify-center bg-muted/40 select-none active:cursor-grabbing rounded-t-[2rem] touch-none"
        title="Arrastar"
        aria-label="Arrastar janela"
      >
        <GripHorizontal className="h-4 w-4 text-muted-foreground" />
      </div>
      {/* Sticky header — selector sempre visível */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold">Camarim — Equipa</span>
          </div>
          <div className="flex items-center gap-2">
            {activeSession && (
              <Badge
                className={cn("border", SESSION_STATUS_VARIANTS[activeSession.status])}
                variant="outline"
              >
                {SESSION_STATUS_LABELS[activeSession.status]}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={async () => {
                if (window.confirm("Terminar sessão?")) {
                  await signOut();
                  navigate("/auth");
                }
              }}
              title="Terminar sessão"
              aria-label="Terminar sessão"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Toggle: só relevante para admin/manager (utilizadores camarim-only já entram sempre aqui) */}
        {(isAdmin || hasPermission("camarim_team")) && (
          <label className="mt-2 flex cursor-pointer items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-[11px] text-muted-foreground">
            <span>Abrir sempre nesta vista ao entrar no sistema</span>
            <input
              type="checkbox"
              checked={defaultLanding}
              onChange={toggleDefaultLanding}
              className="h-4 w-4 cursor-pointer accent-primary"
            />
          </label>
        )}

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
      <main className="flex-1 px-4 pb-32 pt-4 space-y-4">
        {activeSession && !busy && (
          <CamarimTeamSummary
            items={items}
            budget={activeSession.budget_amount}
            spent={activeSession.spent ?? 0}
            currency={activeSession.currency}
          />
        )}
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
                  setAutoCamera(false);
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
                    <div className="mt-1 flex justify-end" onClick={(e) => e.stopPropagation()}>
                      <CamarimItemAttachmentButton
                        itemId={it.id}
                        iconOnly
                        hasAttachment={!!it.has_attachment}
                        sessionId={selectedId ?? undefined}
                        onAttached={() => loadItems(selectedId!)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* FAB — câmara (principal) + manual (secundário) */}
      {selectedId && (
        <div className="absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3">
          <button
            onClick={() => {
              setEditId(null);
              setAutoCamera(false);
              setShowAdd(true);
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
              setShowAdd(true);
            }}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl ring-4 ring-background active:scale-95"
            aria-label="Nova conta com foto"
          >
            <Camera className="h-7 w-7" />
          </button>
        </div>
      )}

      {showAdd && selectedId && (
        <CamarimItemModal
          open={showAdd}
          onOpenChange={(o) => {
            setShowAdd(o);
            if (!o) {
              setEditId(null);
              setAutoCamera(false);
              void loadItems(selectedId);
              void load();
            }
          }}
          sessionId={selectedId}
          itemId={editId}
          mode="team"
          autoOpenCamera={autoCamera && !editId}
          onSaved={() => loadItems(selectedId)}
        />
      )}
      </div>
    </div>
  );
}

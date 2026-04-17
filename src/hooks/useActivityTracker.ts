import { useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const PAGE_LABELS: Record<string, string> = {
  "/": "Dashboard",
  "/calendario": "Calendário",
  "/eventos": "Eventos",
  "/transacoes": "Transações",
  "/bilheteiras": "Bilheteiras",
  "/plano-contas": "Plano de Contas",
  "/contas": "Contas",
  "/fornecedores": "Fornecedores",
  "/cotacoes": "Cotações",
  "/iva": "Gestão IVA",
  "/recorrentes": "Recorrentes",
  "/reembolsos": "Reembolsos",
  "/relatorios": "Relatórios",
  "/admin": "Administração",
  "/ajuda": "Manual",
};

function resolvePageLabel(pathname: string): string {
  // Direct match
  if (PAGE_LABELS[pathname]) return PAGE_LABELS[pathname];
  // Event detail
  if (pathname.startsWith("/eventos/")) return "Detalhe Evento";
  // Report sub-pages
  if (pathname.startsWith("/relatorios/")) return "Relatórios";
  // Admin sub-pages
  if (pathname.startsWith("/admin/")) return "Administração";
  // Fallback
  return pathname;
}

const MIN_INTERVAL_MS = 30_000; // max 1 log per 30s
const ACTIVE_WINDOW_MS = 5 * 60_000; // continue counting recent active usage for up to 5 min
const HEARTBEAT_CHECK_MS = 15_000;
const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll", "mousemove", "click"] as const;

export function useActivityTracker() {
  const { user } = useAuth();
  const location = useLocation();
  const lastLogRef = useRef<{ page: string; time: number }>({ page: "", time: 0 });
  const lastInteractionRef = useRef(0);
  const currentPageRef = useRef(resolvePageLabel(location.pathname));

  const logActivity = useCallback(
    (page: string, force = false) => {
      if (!user) return;

      const now = Date.now();
      const last = lastLogRef.current;

      if (!force && last.page === page && now - last.time < MIN_INTERVAL_MS) return;

      lastLogRef.current = { page, time: now };

      void supabase
        .from("user_activity_log" as any)
        .insert({ user_id: user.id, page } as any)
        .then(({ error }) => {
          if (error) console.error("Activity log error:", error.message);
        });
    },
    [user],
  );

  useEffect(() => {
    if (!user) return;

    const page = resolvePageLabel(location.pathname);
    currentPageRef.current = page;
    lastInteractionRef.current = Date.now();
    logActivity(page, true);
  }, [user, location.pathname, logActivity]);

  useEffect(() => {
    if (!user) return;

    lastInteractionRef.current = Date.now();

    const handleActivity = () => {
      if (document.visibilityState !== "visible") return;
      lastInteractionRef.current = Date.now();
      logActivity(currentPageRef.current);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      lastInteractionRef.current = Date.now();
      logActivity(currentPageRef.current);
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastInteractionRef.current > ACTIVE_WINDOW_MS) return;
      logActivity(currentPageRef.current);
    }, HEARTBEAT_CHECK_MS);

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handleActivity, { passive: true });
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, handleActivity);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [user, logActivity]);
}

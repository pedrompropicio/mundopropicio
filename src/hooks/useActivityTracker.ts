import { useEffect, useRef } from "react";
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

export function useActivityTracker() {
  const { user } = useAuth();
  const location = useLocation();
  const lastLogRef = useRef<{ page: string; time: number }>({ page: "", time: 0 });

  useEffect(() => {
    if (!user) return;

    const page = resolvePageLabel(location.pathname);
    const now = Date.now();
    const last = lastLogRef.current;

    // Skip if same page logged recently
    if (last.page === page && now - last.time < MIN_INTERVAL_MS) return;

    lastLogRef.current = { page, time: now };

    supabase
      .from("user_activity_log" as any)
      .insert({ user_id: user.id, page } as any)
      .then(({ error }) => {
        if (error) console.error("Activity log error:", error.message);
      });
  }, [user, location.pathname]);
}

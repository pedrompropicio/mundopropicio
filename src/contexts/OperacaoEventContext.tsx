import { createContext, useContext, useEffect, useMemo, useCallback, type ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useScopedEventIds } from "@/hooks/useScopedEventIds";

export interface OperacaoEventOption {
  id: string;
  name: string;
  date: string | null;
  status: string | null;
}

interface OperacaoEventContextValue {
  activeEventId: string | null;
  setActiveEventId: (id: string | null) => void;
  events: OperacaoEventOption[];
  isLoading: boolean;
}

const Ctx = createContext<OperacaoEventContextValue | null>(null);

const LS_KEY = (uid: string) => `op.activeEventId.${uid}`;

/** Routes inside /operacao that should NOT receive the ?event= injection. */
const EXEMPT_PATHS = [
  "/operacao/accept-invite",
  "/operacao/staff",
  "/operacao/onboarding",
];

function isExempt(pathname: string): boolean {
  return EXEMPT_PATHS.some((p) => pathname.startsWith(p));
}

export function OperacaoEventProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { eventIds, isLoading: loadingScope } = useScopedEventIds();

  const { data: events, isLoading: loadingEvents } = useQuery({
    queryKey: ["op-event-switcher", eventIds.join(",")],
    enabled: eventIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date, status")
        .in("id", eventIds)
        .order("date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OperacaoEventOption[];
    },
  });

  const urlEventId = params.get("event");
  const lsKey = user?.id ? LS_KEY(user.id) : null;

  const persist = useCallback(
    (id: string | null) => {
      if (!lsKey) return;
      try {
        if (id) localStorage.setItem(lsKey, id);
        else localStorage.removeItem(lsKey);
      } catch {
        // ignore
      }
    },
    [lsKey],
  );

  const setActiveEventId = useCallback(
    (id: string | null) => {
      persist(id);
      const next = new URLSearchParams(params);
      if (id) next.set("event", id);
      else next.delete("event");
      next.delete("page");
      setParams(next, { replace: true });
    },
    [params, setParams, persist],
  );

  // Auto-injecta ?event= a partir do localStorage / single event quando a URL não tem.
  useEffect(() => {
    if (!user || loadingScope || loadingEvents) return;
    if (isExempt(location.pathname)) return;
    if (!location.pathname.startsWith("/operacao")) return;
    if (urlEventId) {
      // Se URL tem um valor válido para este user, persiste
      if (eventIds.includes(urlEventId)) persist(urlEventId);
      return;
    }
    // sem URL → tenta localStorage
    let candidate: string | null = null;
    if (lsKey) {
      try {
        const stored = localStorage.getItem(lsKey);
        if (stored && eventIds.includes(stored)) candidate = stored;
      } catch {
        // ignore
      }
    }
    // se não há candidato e só há 1 evento acessível, autoselect
    if (!candidate && eventIds.length === 1) candidate = eventIds[0];
    if (candidate) {
      const next = new URLSearchParams(params);
      next.set("event", candidate);
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, loadingScope, loadingEvents, eventIds.join(","), location.pathname, urlEventId]);

  const value = useMemo<OperacaoEventContextValue>(
    () => ({
      activeEventId: urlEventId,
      setActiveEventId,
      events: events ?? [],
      isLoading: loadingScope || loadingEvents,
    }),
    [urlEventId, setActiveEventId, events, loadingScope, loadingEvents],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOperacaoEvent(): OperacaoEventContextValue {
  const v = useContext(Ctx);
  if (!v) {
    // Fallback seguro fora do provider
    return { activeEventId: null, setActiveEventId: () => {}, events: [], isLoading: false };
  }
  return v;
}

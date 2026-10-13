import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RealtimeSub {
  table: string;
  /** Filtro postgres_changes, ex.: "event_id=in.(a,b)". Sem filtro, o RLS limita o que chega. */
  filter?: string;
  /** Tipo de alteração; omisso = todas. (DELETE não aceita filtro no Realtime.) */
  event?: "*" | "INSERT" | "UPDATE" | "DELETE";
}

/** Filtro "col=in.(…)" ou "col=eq.x"; null se não houver ids. */
export function realtimeIdFilter(column: string, ids: (string | null | undefined)[]): string | null {
  const clean = [...new Set(ids.filter((x): x is string => !!x))].slice(0, 100);
  if (clean.length === 0) return null;
  return clean.length === 1 ? `${column}=eq.${clean[0]}` : `${column}=in.(${clean.join(",")})`;
}

/**
 * Rede de segurança (D-ERP266): enquanto o ecrã está aberto, qualquer mudança
 * nas tabelas indicadas chama `onChange` com debounce. O canal é removido ao
 * sair do ecrã ou quando as subscrições mudam. `onChange` nunca grava.
 */
export function useRealtimeInvalidation(
  channelKey: string,
  subs: RealtimeSub[],
  onChange: () => void,
  opts: { enabled?: boolean; debounceMs?: number } = {},
) {
  const { enabled = true, debounceMs = 1000 } = opts;
  const cb = useRef(onChange);
  cb.current = onChange;
  const subsKey = JSON.stringify(subs);

  useEffect(() => {
    if (!enabled || subs.length === 0) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fire = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; cb.current(); }, debounceMs);
    };
    let ch: any = supabase.channel(`rt-${channelKey}-${Math.random().toString(36).slice(2, 8)}`);
    for (const s of subs) {
      ch = ch.on(
        "postgres_changes" as any,
        { event: s.event ?? "*", schema: "public", table: s.table, ...(s.filter ? { filter: s.filter } : {}) },
        fire,
      );
    }
    ch.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelKey, subsKey, enabled, debounceMs]);
}

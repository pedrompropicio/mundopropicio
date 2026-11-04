import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { freezeFinalBpVersion } from "@/lib/bp-final-close";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Lock, Loader2 } from "lucide-react";
import HelpTooltip from "@/components/HelpTooltip";

/**
 * D19 — Guarda de fecho do evento.
 * Único ecrã onde se passa o evento a 'completed'. Consulta a mesma fonte de
 * verdade do trigger (public.event_close_blockers) antes de gravar:
 *  - hard (camarim por integrar / cartão aberto) → não deixa avançar;
 *  - soft (despesas pendentes/atrasadas) → aviso com confirmação explícita.
 */

export interface EventCloseBlockers {
  hard: {
    camarim_sessions: { id: string; title: string | null; status: string }[];
    card_sessions: {
      id: string;
      holder_name: string | null;
      card_name: string | null;
      status: string;
    }[];
  };
  soft: {
    pending_expenses: {
      id: string;
      description: string | null;
      amount: number | null;
      status: string;
      supplier_name: string | null;
      due_date: string | null;
    }[];
  };
}

export const EMPTY_BLOCKERS: EventCloseBlockers = {
  hard: { camarim_sessions: [], card_sessions: [] },
  soft: { pending_expenses: [] },
};

export async function fetchEventCloseBlockers(eventId: string): Promise<EventCloseBlockers> {
  const { data, error } = await (supabase as any).rpc("event_close_blockers", {
    _event_id: eventId,
  });
  if (error) throw error;
  const raw = (data ?? {}) as any;
  return {
    hard: {
      camarim_sessions: raw?.hard?.camarim_sessions ?? [],
      card_sessions: raw?.hard?.card_sessions ?? [],
    },
    soft: { pending_expenses: raw?.soft?.pending_expenses ?? [] },
  };
}

export function hasHardBlockers(b: EventCloseBlockers | null | undefined): boolean {
  if (!b) return false;
  return b.hard.camarim_sessions.length > 0 || b.hard.card_sessions.length > 0;
}

const eur = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(v ?? 0));

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
  eventName: string;
  isPending?: boolean;
  onConfirm: () => void;
}

export function CloseEventGuardDialog({
  open,
  onOpenChange,
  eventId,
  eventName,
  isPending,
  onConfirm,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [blockers, setBlockers] = useState<EventCloseBlockers | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [parentEventId, setParentEventId] = useState<string | null | undefined>();
  const [freezeFinal, setFreezeFinal] = useState(true);
  const [freezing, setFreezing] = useState(false);
  const [freezeError, setFreezeError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAck(false);
    setError(null);
    setFreezeError(null);
    setFreezeFinal(true);
    setParentEventId(undefined);
    setBlockers(null);
    setLoading(true);
    let cancelled = false;
    Promise.all([
      fetchEventCloseBlockers(eventId),
      supabase.from("events").select("parent_event_id").eq("id", eventId).single(),
    ])
      .then(([nextBlockers, event]) => {
        if (cancelled) return;
        if (event.error) throw event.error;
        if (!event.data) throw new Error("Evento não encontrado.");
        setParentEventId(event.data.parent_event_id);
        setBlockers(nextBlockers);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e.message ?? "Erro ao verificar sessões abertas.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, eventId]);

  const hard = hasHardBlockers(blockers);
  const pending = blockers?.soft.pending_expenses ?? [];
  const needsAck = pending.length > 0;
  const canClose = !loading && !error && blockers !== null && parentEventId !== undefined
    && !hard && (!needsAck || ack);

  const handleConfirm = async () => {
    if (!canClose || isPending || freezing) return;
    setFreezeError(null);
    setFreezing(true);
    try {
      if (!parentEventId && freezeFinal) {
        await freezeFinalBpVersion(eventId, user);
        queryClient.invalidateQueries({ queryKey: ["bp-final-close-versions"] });
        queryClient.invalidateQueries({ queryKey: ["bp-versions"] });
      }
      onConfirm();
    } catch (e: any) {
      setFreezeError(e.message ?? "Erro ao congelar a versão final do BP.");
    } finally {
      setFreezing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!freezing) onOpenChange(v); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Concluir evento <HelpTooltip anchor="fecho.concluir" size={14} />
          </DialogTitle>
          <DialogDescription>
            {eventName} — o fecho bloqueia alterações. Apenas um administrador pode reabrir.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> A verificar sessões abertas…
          </p>
        ) : error ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : (
          <div className="space-y-4">
            {hard && (
              <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                <p className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <Lock className="h-4 w-4" /> Não é possível fechar o evento
                  <HelpTooltip anchor="fecho.bloqueios" size={13} />
                </p>
                {blockers!.hard.card_sessions.length > 0 && (
                  <div className="text-xs text-destructive/90">
                    <p className="font-medium">
                      {blockers!.hard.card_sessions.length} sessão(ões) de cartão aberta(s):
                    </p>
                    <ul className="mt-1 list-disc pl-4">
                      {blockers!.hard.card_sessions.map((s) => (
                        <li key={s.id}>
                          {s.holder_name ?? "sem portador"}
                          {s.card_name ? ` · ${s.card_name}` : ""} ({s.status})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {blockers!.hard.camarim_sessions.length > 0 && (
                  <div className="text-xs text-destructive/90">
                    <p className="font-medium">
                      {blockers!.hard.camarim_sessions.length} sessão(ões) de camarim por integrar:
                    </p>
                    <ul className="mt-1 list-disc pl-4">
                      {blockers!.hard.camarim_sessions.map((s) => (
                        <li key={s.id}>
                          {s.title ?? "sessão"} ({s.status})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-xs text-destructive/70">
                  É custo que ainda vai cair no evento. Integra/fecha as sessões primeiro.
                </p>
              </div>
            )}

            {!hard && pending.length > 0 && (
              <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
                <p className="flex items-center gap-2 text-sm font-medium text-warning">
                  <AlertTriangle className="h-4 w-4" /> {pending.length} despesa(s) pendente(s) ou
                  atrasada(s)
                </p>
                <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-warning/90">
                  {pending.map((t) => (
                    <li key={t.id} className="flex justify-between gap-3">
                      <span className="truncate">
                        {t.description ?? "—"}
                        {t.supplier_name ? ` · ${t.supplier_name}` : ""}
                      </span>
                      <span className="shrink-0 font-medium">{eur(t.amount)}</span>
                    </li>
                  ))}
                </ul>
                <label className="flex items-start gap-2 pt-1 text-xs text-foreground">
                  <Checkbox checked={ack} onCheckedChange={(v) => setAck(v === true)} />
                  <span>
                    Fechar mesmo assim, as despesas pendentes ficam fora do fecho
                  </span>
                </label>
              </div>
            )}

            {!hard && pending.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Sem sessões abertas nem despesas pendentes. O evento pode ser concluído.
              </p>
            )}

            {parentEventId ? (
              <p className="text-sm text-muted-foreground">
                Sub-evento: a versão final congela-se no evento principal.
              </p>
            ) : (
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={freezeFinal} disabled={freezing || isPending}
                  onCheckedChange={(v) => setFreezeFinal(v === true)} />
                <span>Congelar a versão actual do BP como versão final do fecho</span>
              </label>
            )}
          </div>
        )}

        {freezeError && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {freezeError}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={freezing} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!canClose || isPending || freezing} onClick={handleConfirm}>
            {isPending || freezing ? "A concluir…" : "Concluir evento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Traduz a excepção crua do trigger (P0001) para a apresentação da UI. */
export function translateCloseBlockerError(message: string): string {
  if (message?.includes("Não é possível fechar o evento")) {
    return `${message} Integra/fecha as sessões antes de concluir o evento.`;
  }
  return message;
}

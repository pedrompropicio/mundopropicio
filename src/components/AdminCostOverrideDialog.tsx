import { useEffect, useState } from "react";
import { OverlayLayer } from "@/components/ui/overlay-layer";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCompany } from "@/hooks/useCompany";
import { fetchAdminWindowEvent, type AdminWindowEvent } from "@/lib/admin-window";

/**
 * #264 — evento da janela administrativa para (conta marcada, data do documento).
 * Devolve null quando a conta não está marcada ou a data não cai em janela.
 */
export function useAdminWindowEvent(opts: {
  categoryFlagged: boolean;
  date: string | null | undefined;
  companyId?: string | null;
}): AdminWindowEvent | null {
  const { companyId: activeCompanyId } = useCompany();
  const companyId = opts.companyId ?? activeCompanyId ?? null;
  const { data } = useQuery({
    queryKey: ["admin-window-event", companyId, opts.date],
    enabled: opts.categoryFlagged && !!companyId && !!opts.date,
    queryFn: () => fetchAdminWindowEvent(companyId, opts.date),
    staleTime: 60_000,
  });
  return opts.categoryFlagged ? data ?? null : null;
}

interface Props {
  open: boolean;
  windowEventName: string;
  chosenLabel: string;
  canOverride: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

/** Diálogo de excepção (justificação obrigatória). Sem permissão: só explica. */
export function AdminCostOverrideDialog({ open, windowEventName, chosenLabel, canOverride, onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) setReason(""); }, [open]);
  if (!open) return null;
  return (
    <OverlayLayer className="fixed inset-0 flex items-center justify-center bg-background/70 p-4">
      <div className="glass w-full max-w-md space-y-3 rounded-xl p-5">
        <h3 className="text-base font-semibold">Custo do evento da janela administrativa</h3>
        <p className="text-sm text-muted-foreground">
          Esta conta é custo do evento <span className="font-semibold text-foreground">{windowEventName}</span> nesta data
          (data do documento). Escolheste <span className="font-semibold text-foreground">{chosenLabel}</span>.
        </p>
        {canOverride ? (
          <>
            <label className="block text-xs font-medium">Justificação da excepção (obrigatória)</label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Porque é que este custo não é do evento da janela?" />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
              <Button type="button" disabled={!reason.trim()} onClick={() => onConfirm(reason.trim())}>
                Gravar com excepção
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm">
              Não tens a permissão de excepção. Lança no evento {windowEventName} ou pede a excepção a um administrador ou gestor.
            </p>
            <div className="flex justify-end">
              <Button type="button" onClick={onCancel}>Entendido</Button>
            </div>
          </>
        )}
      </div>
    </OverlayLayer>
  );
}

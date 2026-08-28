import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Play } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n);

export interface BlastRadius {
  forecastCount: number;
  forecastSum: number;
  txCount: number;
  txSum: number;
  protectedForecasts: number;
}

/**
 * Raio de destruição de um `apply` (reset_reimport / syncMode=replace),
 * calculado com leituras read-only que espelham os filtros do
 * `apply-coala-bp`: exclui A&B (rubricas 1.1.03* / 2.9*), linhas/TX ligadas ao
 * `sponsorship_pipeline` e linhas de BP com transação vinculada (âncora legada
 * `event_forecasts.transaction_id` OU `transactions.forecast_id`).
 */
export async function computeBlastRadius(eventId: string): Promise<BlastRadius> {
  const [cats, fcs, txs, pipeline] = await Promise.all([
    supabase.from("account_categories").select("id, code"),
    supabase
      .from("event_forecasts")
      .select("id, category_id, amount, transaction_id")
      .eq("event_id", eventId)
      .is("version_id", null),
    supabase.from("transactions").select("id, category_id, amount, forecast_id").eq("event_id", eventId),
    supabase
      .from("sponsorship_pipeline")
      .select("linked_forecast_id, linked_transaction_id")
      .eq("event_id", eventId),
  ]);
  if (cats.error) throw cats.error;
  if (fcs.error) throw fcs.error;
  if (txs.error) throw txs.error;
  if (pipeline.error) throw pipeline.error;

  const AB_PREFIXES = ["1.1.03", "2.9"];
  const abIds = new Set(
    (cats.data ?? [])
      .filter((c: any) => {
        const code = String(c.code ?? "").trim();
        return AB_PREFIXES.some((p) => code === p || code.startsWith(`${p}.`));
      })
      .map((c: any) => c.id as string),
  );
  const isAb = (r: any) => !!r?.category_id && abIds.has(r.category_id);

  const protectedFcIds = new Set(
    (pipeline.data ?? []).map((r: any) => r.linked_forecast_id).filter((x: any) => typeof x === "string"),
  );
  const protectedTxIds = new Set(
    (pipeline.data ?? []).map((r: any) => r.linked_transaction_id).filter((x: any) => typeof x === "string"),
  );
  const txLinkedFcIds = new Set(
    (txs.data ?? []).map((t: any) => t.forecast_id).filter((x: any) => typeof x === "string"),
  );

  const fcToDelete = (fcs.data ?? []).filter(
    (f: any) => !isAb(f) && !protectedFcIds.has(f.id) && !f.transaction_id && !txLinkedFcIds.has(f.id),
  );
  const fcProtected = (fcs.data ?? []).filter(
    (f: any) => !isAb(f) && !protectedFcIds.has(f.id) && (!!f.transaction_id || txLinkedFcIds.has(f.id)),
  );
  const txToDelete = (txs.data ?? []).filter((t: any) => !isAb(t) && !protectedTxIds.has(t.id));

  return {
    forecastCount: fcToDelete.length,
    forecastSum: fcToDelete.reduce((s: number, f: any) => s + (Number(f.amount) || 0), 0),
    txCount: txToDelete.length,
    txSum: txToDelete.reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0),
    protectedForecasts: fcProtected.length,
  };
}

interface Props {
  eventId: string;
  enabled: boolean;
  autoApplyEnabled: boolean;
  pending: boolean;
  onConfirm: () => void;
}

export default function CoalaApplyButton({ eventId, enabled, autoApplyEnabled, pending, onConfirm }: Props) {
  const [open, setOpen] = useState(false);

  const blocked = !enabled || !autoApplyEnabled;
  const blockedReason = !enabled
    ? "Config desativada (Ativo = off). Ativa a config antes de aplicar."
    : "Auto-aplicar está em «manual». Liga o Auto-aplicar antes de aplicar.";

  const radiusQ = useQuery({
    enabled: open,
    queryKey: ["coala-blast-radius", eventId],
    queryFn: () => computeBlastRadius(eventId),
    staleTime: 0,
  });

  const trigger = (
    <Button size="sm" disabled={blocked || pending} onClick={() => setOpen(true)}>
      <Play className="h-3 w-3 mr-1" /> Apply
    </Button>
  );

  return (
    <>
      {blocked ? (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-block">{trigger}</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-[260px] text-xs">{blockedReason}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        trigger
      )}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar sync do Drive?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  O apply reescreve o BP e as transações deste evento a partir do ficheiro do Drive.
                  É criado um snapshot do BP antes de qualquer eliminação.
                </p>
                {radiusQ.isLoading ? (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> A calcular o raio de destruição…
                  </p>
                ) : radiusQ.error ? (
                  <p className="text-destructive font-medium">
                    Não foi possível calcular o raio de destruição ({(radiusQ.error as any)?.message}).
                    Não avances às cegas — corre primeiro um Dry-run.
                  </p>
                ) : radiusQ.data ? (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 space-y-1 text-foreground">
                    <p className="font-semibold text-destructive">Seriam eliminados:</p>
                    <p>
                      {radiusQ.data.forecastCount} linha(s) de BP — {eur(radiusQ.data.forecastSum)}
                    </p>
                    <p>
                      {radiusQ.data.txCount} transação(ões) — {eur(radiusQ.data.txSum)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {radiusQ.data.protectedForecasts} linha(s) de BP com transação vinculada ficam protegidas.
                    </p>
                  </div>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={radiusQ.isLoading || !!radiusQ.error}
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              Aplicar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

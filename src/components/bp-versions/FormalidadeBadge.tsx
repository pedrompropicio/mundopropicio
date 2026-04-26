import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type FormalidadeState =
  | "estimado"
  | "negociacao"
  | "fechado"
  | "pago_parcial"
  | "pago_total";

interface Option {
  value: FormalidadeState;
  label: string;
  emoji: string;
  /** Tailwind classes for badge background + text. All semantic tokens. */
  cls: string;
  description: string;
}

export const FORMALIDADE_OPTIONS: Option[] = [
  {
    value: "estimado",
    label: "Estimado",
    emoji: "🔴",
    cls: "bg-destructive/15 text-destructive hover:bg-destructive/25",
    description: "Chute inicial, sem cotação firme",
  },
  {
    value: "negociacao",
    label: "Negociação",
    emoji: "🟠",
    cls: "bg-warning/15 text-warning hover:bg-warning/25",
    description: "Em cotação com fornecedor",
  },
  {
    value: "fechado",
    label: "Fechado",
    emoji: "🔵",
    cls: "bg-primary/15 text-primary hover:bg-primary/25",
    description: "Contrato/PO assinado, valor blindado",
  },
  {
    value: "pago_parcial",
    label: "Pago Parcial",
    emoji: "🟢",
    cls: "bg-success/10 text-success hover:bg-success/20",
    description: "Pagamentos iniciados, ainda há saldo",
  },
  {
    value: "pago_total",
    label: "Pago Total",
    emoji: "✅",
    cls: "bg-success/25 text-success hover:bg-success/35",
    description: "100% liquidado",
  },
];

const OPTION_BY_VALUE = Object.fromEntries(
  FORMALIDADE_OPTIONS.map((o) => [o.value, o]),
) as Record<FormalidadeState, Option>;

interface Props {
  forecastId: string;
  eventId: string;
  current: FormalidadeState | null | undefined;
  /** When true, badge is non-clickable (read-only contexts: cenários, snapshots). */
  readOnly?: boolean;
  /** When true, hides the "atual" caret hint and uses smaller paddings. Defaults true. */
  compact?: boolean;
}

/**
 * Pequeno badge de formalidade exibido na linha do BP. Clicável: abre um
 * popover com as 5 opções para o utilizador alterar manualmente. Como toda
 * automação no projeto, a mudança é sempre manual (validação humana) — esta
 * passa pelo trigger `log_formalidade_change` que regista no audit log.
 */
export function FormalidadeBadge({ forecastId, eventId, current, readOnly = false, compact = true }: Props) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const value: FormalidadeState = (current ?? "estimado") as FormalidadeState;
  const option = OPTION_BY_VALUE[value] ?? OPTION_BY_VALUE.estimado;

  const updateMutation = useMutation({
    mutationFn: async (next: FormalidadeState) => {
      const { error } = await supabase
        .from("event_forecasts")
        .update({ formalidade: next as any })
        .eq("id", forecastId);
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      queryClient.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
      queryClient.invalidateQueries({ queryKey: ["formalidade-history", forecastId] });
      queryClient.invalidateQueries({ queryKey: ["formalidade-audit", eventId] });
      toast({
        title: "Formalidade atualizada",
        description: `Linha marcada como ${OPTION_BY_VALUE[next].label}.`,
      });
      setOpen(false);
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao atualizar",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const badgeCls = cn(
    "inline-flex items-center gap-1 rounded-full font-semibold uppercase tracking-wider align-middle transition-colors",
    compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-1 text-[10px]",
    option.cls,
    readOnly ? "cursor-default" : "cursor-pointer",
  );

  if (readOnly) {
    return (
      <span className={badgeCls} title={option.description}>
        <span aria-hidden>{option.emoji}</span>
        {option.label}
      </span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={badgeCls}
          title={`Formalidade: ${option.label}. Clique para alterar.`}
          onClick={(e) => e.stopPropagation()}
        >
          <span aria-hidden>{option.emoji}</span>
          {option.label}
          <ChevronDown className="h-2.5 w-2.5 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Estado da Formalidade
        </div>
        <div className="space-y-0.5">
          {FORMALIDADE_OPTIONS.map((opt) => {
            const isCurrent = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={updateMutation.isPending || isCurrent}
                onClick={() => updateMutation.mutate(opt.value)}
                className={cn(
                  "w-full flex items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                  "hover:bg-accent disabled:opacity-100",
                  isCurrent && "bg-accent/50",
                )}
              >
                <span aria-hidden className="text-base leading-none mt-0.5">{opt.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">{opt.label}</span>
                    {isCurrent && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                    {opt.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
        <div className="border-t mt-1 pt-1.5 px-2 pb-1">
          <p className="text-[9px] text-muted-foreground italic">
            Mudanças são registadas no histórico de auditoria.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

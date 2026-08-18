import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronDown, UserCog } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ORDERING_HOUSE_LABEL,
  orderingPartnerInitials,
  type OrderingPartnerOption,
} from "@/lib/ordering-partner";

interface Props {
  forecastId: string;
  eventId: string;
  current: string | null | undefined;
  partners: OrderingPartnerOption[];
  /** Quando true não é clicável (snapshots, cenários, linhas via Master). */
  readOnly?: boolean;
}

/**
 * Badge discreto do ordenador da despesa numa linha do BP. Clicável (para quem
 * edita o BP): abre popover com os sócios do evento + opção "— (MP/comum)".
 * Só deve ser renderizado em linhas de DESPESA de eventos com sócios.
 */
export function OrderingPartnerBadge({ forecastId, eventId, current, partners, readOnly = false }: Props) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const selected = partners.find((p) => p.id === current) ?? null;

  const updateMutation = useMutation({
    mutationFn: async (next: string | null) => {
      const { error } = await supabase
        .from("event_forecasts")
        .update({ ordering_partner_id: next } as any)
        .eq("id", forecastId);
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      queryClient.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
      toast({
        title: "Ordenador atualizado",
        description: next
          ? `Linha atribuída a ${partners.find((p) => p.id === next)?.name ?? "sócio"}.`
          : `Linha marcada como ${ORDERING_HOUSE_LABEL}.`,
      });
      setOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Erro ao atualizar", description: err.message, variant: "destructive" });
    },
  });

  const badgeCls = cn(
    "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider align-middle transition-colors",
    selected
      ? "bg-accent text-accent-foreground hover:bg-accent/80"
      : "border border-dashed border-border/70 text-muted-foreground hover:text-foreground",
    readOnly ? "cursor-default" : "cursor-pointer",
  );

  const label = selected ? orderingPartnerInitials(selected.name) : "MP";
  const title = selected
    ? `Ordenador: ${selected.name}`
    : `Ordenador: ${ORDERING_HOUSE_LABEL}`;

  if (readOnly) {
    if (!selected) return null;
    return (
      <span className={badgeCls} title={title}>
        <UserCog className="h-2.5 w-2.5" />
        {label}
      </span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={badgeCls}
          title={`${title}. Clique para alterar.`}
          onClick={(e) => e.stopPropagation()}
        >
          <UserCog className="h-2.5 w-2.5" />
          {label}
          <ChevronDown className="h-2.5 w-2.5 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Ordenador da despesa
        </div>
        <div className="space-y-0.5">
          {[{ id: "", name: `— ${ORDERING_HOUSE_LABEL}` }, ...partners].map((opt) => {
            const isCurrent = (opt.id || null) === (current || null);
            return (
              <button
                key={opt.id || "house"}
                type="button"
                disabled={updateMutation.isPending || isCurrent}
                onClick={() => updateMutation.mutate(opt.id || null)}
                className={cn(
                  "w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                  "hover:bg-accent disabled:opacity-100",
                  isCurrent && "bg-accent/50",
                )}
              >
                <span className="truncate">{opt.name}</span>
                {isCurrent && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

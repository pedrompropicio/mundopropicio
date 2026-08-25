import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronDown, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PAYING_HOUSE_LABEL_FALLBACK,
  payingPartnerInitials,
  type PayingPartnerOption,
} from "@/lib/paying-partner";

interface Props {
  forecastId: string;
  eventId: string;
  current: string | null | undefined;
  partners: PayingPartnerOption[];
  /** Nome da empresa configurada no evento (rótulo de "sem pagador"). */
  houseLabel?: string;
  /** Quando true não é clicável (snapshots, cenários, linhas via Master). */
  readOnly?: boolean;
}

/**
 * Badge discreto do PAGADOR da despesa numa linha do BP — irmão do
 * `OrderingPartnerBadge` (ordenador). Só em linhas de DESPESA de eventos
 * com sócios. Vazio = empresa configurada no evento.
 */
export function PayingPartnerBadge({
  forecastId,
  eventId,
  current,
  partners,
  houseLabel,
  readOnly = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const house = houseLabel || PAYING_HOUSE_LABEL_FALLBACK;
  const selected = partners.find((p) => p.id === current) ?? null;

  const updateMutation = useMutation({
    mutationFn: async (next: string | null) => {
      const { error } = await supabase
        .from("event_forecasts")
        .update({ paying_partner_id: next } as any)
        .eq("id", forecastId);
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      queryClient.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
      toast({
        title: "Pagador atualizado",
        description: next
          ? `Linha atribuída a ${partners.find((p) => p.id === next)?.name ?? "sócio"}.`
          : `Linha marcada como ${house}.`,
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
      ? "bg-primary/15 text-primary hover:bg-primary/25"
      : "border border-dashed border-border/70 text-muted-foreground hover:text-foreground",
    readOnly ? "cursor-default" : "cursor-pointer",
  );

  const label = selected ? payingPartnerInitials(selected.name) : payingPartnerInitials(house);
  const title = selected ? `Pagador: ${selected.name}` : `Pagador: ${house}`;

  if (readOnly) {
    if (!selected) return null;
    return (
      <span className={badgeCls} title={title}>
        <Wallet className="h-2.5 w-2.5" />
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
          <Wallet className="h-2.5 w-2.5" />
          {label}
          <ChevronDown className="h-2.5 w-2.5 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Pagador da despesa
        </div>
        <div className="space-y-0.5">
          {[{ id: "", name: `— ${house}` }, ...partners].map((opt) => {
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

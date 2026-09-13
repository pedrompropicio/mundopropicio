/**
 * Selector de apuramento (épica #146, sub-tarefa (b)).
 *
 * ARMADILHA: a coluna é `event_settlement_id`. `transactions.settlement_id`
 * é outra coisa — é o fecho de bilheteira (`ticket_office_settlements`).
 *
 * Só aparece quando o evento tem MAIS DE UM apuramento. Enquanto cada evento
 * tiver apenas a raiz espelhada de `event_partners`, o selector fica invisível
 * e nenhuma linha é marcada — nada muda nos cálculos existentes.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  eventId: string | null | undefined;
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
}

export function useEventSettlementOptions(eventId: string | null | undefined) {
  return useQuery({
    queryKey: ["event-settlement-options", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_settlements")
        .select("id, name, parent_id, position, is_sealed")
        .eq("event_id", eventId!)
        .order("position", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!eventId,
  });
}

export function EventSettlementSelect({ eventId, value, onChange, disabled }: Props) {
  const { data: settlements = [] } = useEventSettlementOptions(eventId);

  // Sem evento (mãe de rateio) ou com um único apuramento: não mostrar nada.
  if (!eventId || settlements.length < 2) return null;

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">Fechamento</label>
      <select
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">Sem fechamento definido</option>
        {settlements.map((s: any) => (
          <option key={s.id} value={s.id} disabled={s.is_sealed}>
            {s.parent_id ? `— ${s.name}` : s.name}
            {s.is_sealed ? " (selado)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * (g6) Devolução de custos internos da sociedade.
 *
 * A linha CONTINUA a contar no perímetro de cima (a raiz é imutável e os sócios
 * de cima suportam a sua parte) e é DEVOLVIDA por inteiro ao fechamento abaixo
 * indicado aqui. Não confundir com o perímetro (`event_settlement_id`): uma
 * linha nunca pode ter as duas coisas.
 */
interface AddbackProps {
  eventId: string | null | undefined;
  value: string | null;
  reason: string;
  onChange: (v: string | null) => void;
  onReasonChange: (v: string) => void;
  /** true quando a linha já tem perímetro marcado — as duas coisas excluem-se. */
  disabledByPerimeter?: boolean;
  disabled?: boolean;
}

export function EventAddbackSelect({
  eventId,
  value,
  reason,
  onChange,
  onReasonChange,
  disabledByPerimeter,
  disabled,
}: AddbackProps) {
  const { data: settlements = [] } = useEventSettlementOptions(eventId);
  const children = (settlements as any[]).filter((s) => s.parent_id);

  if (!eventId || children.length === 0) return null;

  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
      <label className="block text-xs font-medium text-muted-foreground">
        Devolver a fechamento (custos internos da sociedade)
      </label>
      <select
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        value={value ?? ""}
        disabled={disabled || disabledByPerimeter}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">Não devolver</option>
        {children.map((s: any) => (
          <option key={s.id} value={s.id} disabled={s.is_sealed}>
            {s.name}
            {s.is_sealed ? " (selado)" : ""}
          </option>
        ))}
      </select>
      {disabledByPerimeter ? (
        <p className="text-[11px] text-muted-foreground">
          Esta linha está marcada com o perímetro de um fechamento — retire o perímetro para a poder
          devolver.
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          A despesa continua a contar no fechamento de cima e é somada por inteiro ao fechamento
          escolhido.
        </p>
      )}
      {value ? (
        <input
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          placeholder="Motivo da devolução (obrigatório)"
          value={reason}
          disabled={disabled}
          onChange={(e) => onReasonChange(e.target.value)}
        />
      ) : null}
    </div>
  );
}

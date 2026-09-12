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
      <label className="mb-1 block text-xs font-medium text-muted-foreground">Apuramento</label>
      <select
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">Sem apuramento definido</option>
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

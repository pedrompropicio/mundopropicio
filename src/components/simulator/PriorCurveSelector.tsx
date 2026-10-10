import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  fetchAbPerCapitaBenchmark, listBenchmarkSourceEvents, PRIOR_CURVE_MODE,
} from "@/lib/simulator-prior-curve";

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon" }) : "—";

interface Props {
  eventId: string;
  eventName: string | null;
  companyId: string | null;
  mode: string | null | undefined;
  priorEventId: string | null | undefined;
  collectedAt: string | null | undefined;
  onChange: (mode: string, priorEventId: string | null) => Promise<void>;
}

/** #89 movimento 2 — "Usar histórico de…": só sugere; o piso manual continua a mandar. */
export function PriorCurveSelector({ eventId, eventName, companyId, mode, priorEventId, collectedAt, onChange }: Props) {
  const { data: sources = [], isLoading } = useQuery({
    queryKey: ["sim-prior-sources", eventId, eventName],
    queryFn: () => listBenchmarkSourceEvents(eventId, eventName),
  });
  const { data: abBench } = useQuery({
    queryKey: ["sim-ab-benchmark", companyId],
    enabled: !!companyId,
    queryFn: () => fetchAbPerCapitaBenchmark(companyId as string),
  });
  const active = mode === PRIOR_CURVE_MODE && !!priorEventId;
  const src = sources.find((s) => s.id === priorEventId);

  return (
    <div className="col-span-full rounded-lg border border-border bg-muted/30 p-3 space-y-2">
      <p className="text-sm font-semibold">Curva de vendas: usar histórico de…</p>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">A carregar eventos com histórico…</p>
      ) : sources.length === 0 && !active ? (
        <p className="text-xs text-muted-foreground">
          Ainda não há eventos com histórico colhido. O histórico é colhido ao selar o fecho (ou no botão "Colher benchmarks" do Fecho).
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={active ? priorEventId! : ""} onValueChange={(v) => onChange(PRIOR_CURVE_MODE, v)}>
            <SelectTrigger className="h-8 w-[320px]"><SelectValue placeholder="Escolher evento-fonte" /></SelectTrigger>
            <SelectContent>
              {sources.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.sameArtist ? "★ " : ""}{s.name} ({fmtDate(s.date)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {active && (
            <Button size="sm" variant="outline" onClick={() => onChange("preset", null)}>
              Voltar à curva por defeito
            </Button>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {active
          ? <>Projeção pela curva de <strong>{src?.name ?? "evento-fonte"}</strong> (% acumulada por dia antes do evento), colhida em {fmtDate(collectedAt ?? src?.collectedAt)}. Fora de D-180…D0 ou sem vendas, usa-se a curva por defeito. O piso manual continua a mandar.</>
          : "Projeção pela curva por defeito (ritmo + reta final)."}
      </p>
      {abBench && Number(abBench.avg_ticket_per_pax) > 0 && (
        <p className="text-xs text-muted-foreground">
          Sugestão A&amp;B (bebidas): per capita histórico da empresa {Number(abBench.avg_ticket_per_pax).toLocaleString("pt-PT", { style: "currency", currency: "EUR" })} ({abBench.sample_size} evento(s), colhido em {fmtDate(abBench.last_calculated_at)}). Só referência — não substitui valores do A&amp;B.
        </p>
      )}
    </div>
  );
}

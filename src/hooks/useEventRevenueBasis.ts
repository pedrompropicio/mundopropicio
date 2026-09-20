/**
 * Hook fino sobre o SSoT da receita (`computeEventRevenueBasis`, D24).
 *
 * A&B tem de ser injectado porque o cenário forecast vive em hooks
 * (`useEventABScenarios` → `useEventAttendance`).
 */
import { useQuery } from "@tanstack/react-query";
import {
  computeEventRevenueBasis,
  type EventRevenueBasis,
} from "@/lib/event-revenue-basis";
import { useEventABScenarios, type ABScenarioParticipants } from "@/hooks/useEventABScenarios";

const EMPTY_PARTICIPANTS: ABScenarioParticipants = { real: {}, breakeven: {}, forecast: {} };

export function useEventRevenueBasis(
  eventId: string | undefined,
  eventIds: string[] = [],
  /**
   * `eventRealized` (#227): quando o evento já está carregado no consumidor,
   * passa-o para evitar a leitura extra; sem ele, o fetcher calcula.
   */
  opts: { skipForecast?: boolean; eventRealized?: boolean } = {},
): { data: EventRevenueBasis | undefined; isLoading: boolean } {
  const ids = Array.from(new Set([eventId, ...eventIds].filter(Boolean))) as string[];
  const idsKey = ids.slice().sort().join(",");

  const ab = useEventABScenarios(eventId, EMPTY_PARTICIPANTS);
  const abForecastNet = ab.totals ? ab.totals.forecast.receitaTotal : null;

  const { data, isLoading } = useQuery({
    queryKey: [
      "event-revenue-basis",
      idsKey,
      opts.skipForecast ?? false,
      opts.eventRealized ?? null,
      abForecastNet,
    ],
    queryFn: () =>
      computeEventRevenueBasis({
        eventId: eventId!,
        eventIds: ids,
        abForecastNet,
        skipForecast: opts.skipForecast,
        eventRealized: opts.eventRealized,
      }),
    enabled: !!eventId,
  });

  return { data, isLoading };
}

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
  opts: { skipForecast?: boolean } = {},
): { data: EventRevenueBasis | undefined; isLoading: boolean } {
  const ids = Array.from(new Set([eventId, ...eventIds].filter(Boolean))) as string[];
  const idsKey = ids.slice().sort().join(",");

  const ab = useEventABScenarios(eventId, EMPTY_PARTICIPANTS);
  const abForecastNet = ab.totals ? ab.totals.forecast.receitaTotal : null;

  const { data, isLoading } = useQuery({
    queryKey: ["event-revenue-basis", idsKey, opts.skipForecast ?? false, abForecastNet],
    queryFn: () =>
      computeEventRevenueBasis({
        eventId: eventId!,
        eventIds: ids,
        abForecastNet,
        skipForecast: opts.skipForecast,
      }),
    enabled: !!eventId,
  });

  return { data, isLoading };
}

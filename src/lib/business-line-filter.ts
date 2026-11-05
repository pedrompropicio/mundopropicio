/** Vazio = todas. A opção sem linha inclui também registos anteriores à 0339. */
export function filterEventsByBusinessLine<T>(events: T[], selected: readonly string[]): T[] {
  if (selected.length === 0) return events;
  const ids = new Set(selected);
  const matches = (event: T) => ids.has((event as any).business_line_id ?? "__sem_linha__");
  // Preserva a referência quando todas as opções presentes estão seleccionadas.
  return events.every(matches) ? events : events.filter(matches);
}

export function businessLineLabel(
  id: string | null | undefined,
  lines: readonly { id: string; name: string }[],
): string {
  if (id == null || id === "__sem_linha__") return "Sem linha";
  return lines.find((line) => line.id === id)?.name ?? "Linha indisponível";
}

/** Preserve existing text when only surrounding whitespace differs. */
export function preserveUnchangedForecastText(draft: string, previous: string | null | undefined): string | null {
  const normalized = draft.trim();
  return normalized === (previous ?? "").trim() ? previous ?? null : normalized || null;
}

/** Send only changed fields, so audit/undo never includes untouched values. */
export function forecastEditDiff(previous: Record<string, any>, next: Record<string, any>): Record<string, any> {
  return Object.fromEntries(Object.entries(next).filter(([key, value]) => {
    const old = previous[key] ?? null;
    if (typeof value === "number") return Number(old) !== value;
    if (typeof value === "boolean") return Boolean(old) !== value;
    return old !== value;
  }));
}
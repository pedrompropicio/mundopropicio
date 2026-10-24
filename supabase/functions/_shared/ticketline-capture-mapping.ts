/** #358: validate the whole report before the single daily-sales write.
 * No credentials, network requests or serving side effects on import.
 */
export interface CaptureRow { label: string; qty: number; value: number; codes: string | null }
export interface CaptureTarget {
  id: string; event_id: string; company_id: string;
  ticketline_report_codes: string | null;
  organization_name?: string | null;
  daily_fallback_active?: boolean | null;
  promotores_migrated_at?: string | null;
}
export interface CaptureParsed {
  rows: CaptureRow[];
  totalRow: { qty: number | null; value: number | null } | null;
}
const normCodes = (s: string | null) => String(s ?? "").replace(/\s+/g, "").trim();
const normKey = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const labelKey = (s: string) => normKey(s.split("|")[0].replace(/\[[^\]]*\]/g, ""));
const safeName = (label: string, name: string) => name.split(" ").filter(Boolean).length >= 2
  && (label === name || label.startsWith(`${name} `));
const hasToken = (label: string, token: string) => (` ${label} `).includes(` ${token} `);

export function resolveCaptureMapping(rows: CaptureRow[], targets: CaptureTarget[], nameById: ReadonlyMap<string, string>) {
  const names = new Map(targets.map(t => [t.id, normKey(nameById.get(t.event_id) || t.organization_name || "")]));
  const matched = new Map<string, { row: CaptureRow; method: string }>();
  const decisions: Array<{ label: string; codes: string | null; qty: number; value: number; method: string | null; matched: Array<{ configId: string; event_id: string }> }> = [];
  const externalRows: Array<{ row: CaptureRow; reason: string }> = [];
  const skippedConfigs: Array<{ configId: string; event_id: string; reason: string }> = [];
  const payload: Array<{ company_id: string; event_id: string; quantity: number; total_value: number }> = [];
  const counts = { matched: 0, zeroed: 0, omitted: 0, external: 0 };
  const result = () => ({ payload, decisions, externalRows, skippedConfigs, counts,
    matchMethods: Object.fromEntries([...matched].map(([id, m]) => [id, m.method])) });
  const abort = (phase: string, message: string) => ({ ...result(), payload: [], abort: { phase, message } });

  // Also reject duplicate configured codes even if that code has no movement today.
  const seenCodes = new Set<string>();
  const seenEvents = new Set<string>();
  for (const t of targets) {
    const code = normCodes(t.ticketline_report_codes);
    if ((code && seenCodes.has(code)) || seenEvents.has(t.event_id)) {
      return abort("capture_day_ambiguous_match", "código ou evento repetido nos configs-alvo");
    }
    if (code) seenCodes.add(code);
    seenEvents.add(t.event_id);
  }

  for (const row of rows) {
    const code = normCodes(row.codes);
    const key = labelKey(row.label);
    const byName = targets.filter(t => safeName(key, names.get(t.id) || ""));
    const byCode = code ? targets.filter(t => normCodes(t.ticketline_report_codes) === code) : [];
    let hits: CaptureTarget[] = byCode;
    let method = "code";
    if (code && hits.length === 0) {
      if (byName.length) return abort("capture_day_code_conflict", "código desconhecido com nome completo de um alvo");
      externalRows.push({ row, reason: "unknown_code_external" });
    } else if (!code) {
      method = "name";
      hits = byName.filter(t => !normCodes(t.ticketline_report_codes));
      if (hits.length > 1 || (hits.length > 0 && byName.length > 1)) {
        return abort("capture_day_ambiguous_match", "nome completo identifica múltiplos configs");
      }
      if (!hits.length) {
        // Whole tokens only: Cidade A must never match Cidade AB by prefix.
        const suspect = targets.some(t => (names.get(t.id) || "").split(" ")
          .filter(token => token.length >= 3).some(token => hasToken(key, token)));
        if (byName.length || suspect) return abort("capture_day_suspect_match", "linha sem código contém identidade parcial de um alvo");
        externalRows.push({ row, reason: "unrelated_name_external" });
      }
    }
    decisions.push({ ...row, method: hits.length ? method : null,
      matched: hits.map(t => ({ configId: t.id, event_id: t.event_id })) });
    const hit = hits[0];
    if (hit) {
      if (matched.has(hit.id)) return abort("capture_day_ambiguous_match", "mais de uma linha para o mesmo config");
      matched.set(hit.id, { row, method });
    }
  }
  for (const t of targets) {
    const match = matched.get(t.id);
    if (!match && !normCodes(t.ticketline_report_codes)) {
      if (t.daily_fallback_active === true || t.promotores_migrated_at != null) {
        return abort("capture_day_unmatched_consumer", "config sem código consumidor da série não encontrado no relatório");
      }
      skippedConfigs.push({ configId: t.id, event_id: t.event_id, reason: "not_identifiable_no_movement" });
      counts.omitted++;
      continue;
    }
    if (match) counts.matched++; else counts.zeroed++;
    payload.push({ company_id: t.company_id, event_id: t.event_id,
      quantity: match?.row.qty ?? 0, total_value: match?.row.value ?? 0 });
  }
  counts.external = externalRows.length;
  return { ...result(), abort: undefined };
}

interface CaptureAdmin {
  from(table: "ticketline_daily_sales"): {
    upsert(payload: Array<{ company_id: string; event_id: string; sale_date: string; quantity: number; total_value: number }>,
      options: { onConflict: string }): PromiseLike<{ error: { message: string } | null }>;
  };
}
export interface CaptureContext {
  dayIso: string; targets: CaptureTarget[]; nameById: ReadonlyMap<string, string>;
  debug: Record<string, unknown>; headerRange: string | null; fileSize: number;
  updateRun: (patch: Record<string, unknown>) => Promise<void>;
}

/** Real post-parse execution boundary, shared by the entrypoint and fake-admin tests. */
export async function applyCaptureDay(admin: CaptureAdmin, ctx: CaptureContext, parsed: CaptureParsed) {
  const totals = { qty: parsed.rows.reduce((s, r) => s + r.qty, 0),
    value: Math.round(parsed.rows.reduce((s, r) => s + r.value, 0) * 100) / 100 };
  const baseAudit = { dataSource: "sales_per_event_day", day: ctx.dayIso, reportRows: parsed.rows,
    totalRow: parsed.totalRow, totals, headerRange: ctx.headerRange, configsTargeted: ctx.targets.length };
  const fail = async (phase: string, message: string, details: Record<string, unknown> = {}) => {
    const audit = { ...baseAudit, ...details, debug: ctx.debug, source_mode: "sales_per_event_day" };
    await ctx.updateRun({ status: phase, finished_at: new Date().toISOString(), error_message: message, import_audit: audit });
    return { ok: false as const, phase, error: message, audit };
  };
  // No inferred zeros without a valid TOTAL. Preserve signed quantities, but reject malformed values.
  if (parsed.rows.some(r => !Number.isInteger(r.qty) || !Number.isFinite(r.value) || r.qty > 5000)) {
    return fail("capture_day_sanity", "quantidade ou valor inválido, ou qty acima do limite (5000)");
  }
  if (!parsed.totalRow || parsed.totalRow.qty === null || !Number.isFinite(parsed.totalRow.qty)
    || parsed.totalRow.qty !== totals.qty
    || (parsed.totalRow.value !== null && (!Number.isFinite(parsed.totalRow.value)
      || Math.abs(parsed.totalRow.value - totals.value) >= 0.005))) {
    return fail("capture_day_total_mismatch", "TOTAL ausente ou diferente da soma de todas as linhas");
  }
  const mapping = resolveCaptureMapping(parsed.rows, ctx.targets, ctx.nameById);
  const details = { mapping: mapping.decisions, externalRows: mapping.externalRows,
    skippedConfigs: mapping.skippedConfigs, counts: mapping.counts, matchMethods: mapping.matchMethods };
  if (mapping.abort) return fail(mapping.abort.phase, mapping.abort.message, details);
  const payload = mapping.payload.map(row => ({ ...row, sale_date: ctx.dayIso }));
  if (payload.length) {
    const { error } = await admin.from("ticketline_daily_sales").upsert(payload, { onConflict: "event_id,sale_date" });
    if (error) return fail("import_failed", `UPSERT ticketline_daily_sales: ${error.message}`, details);
  }
  const warning = mapping.counts.omitted ? `${mapping.counts.omitted} configs sem código omitidos; espelho preservado (cobertura coded_and_matched)` : null;
  const audit = { ...baseAudit, ...details, coverage: "coded_and_matched", upserted: payload,
    matchedConfigs: mapping.counts.matched, warning };
  await ctx.updateRun({ status: "success", finished_at: new Date().toISOString(),
    files_downloaded: [{ name: `sales_per_event_${ctx.dayIso}.sjr.js`, size: ctx.fileSize }],
    error_message: warning, import_audit: { ...audit, debug: ctx.debug, source_mode: "sales_per_event_day" } });
  return { ok: true as const, audit, warning, coverage: audit.coverage,
    counts: mapping.counts, skippedConfigs: mapping.skippedConfigs };
}
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPagedQuery } from "@/lib/supabase-paging";

export type TriState = "all" | "yes" | "no";

export interface ContactFilters {
  companyId: string;
  search: string;
  emailConsent: TriState;
  waConsent: TriState;
  active: TriState;
  source: string; // "all" | "__none__" | valor
  snapshotId: string | null; // último snapshot da lista escolhida
}

export const CONTACTS_PAGE_SIZE = 50;
const COLS = "id, name, email, phone_e164, source, consent_email, consent_whatsapp, is_active, last_activity_at";

/** Remove caracteres que partem a sintaxe de `.or()` do PostgREST. */
export function sanitizeSearch(s: string): string {
  return s.replace(/[,()*%\\:"']/g, " ").trim();
}

/** Builder com TODOS os filtros aplicados na base (#308). */
export function buildContactsQuery(f: ContactFilters, opts: { count?: boolean } = {}) {
  const select = f.snapshotId ? `${COLS}, audience_members!inner(snapshot_id)` : COLS;
  let q = (supabase as any)
    .from("contacts")
    .select(select, opts.count ? { count: "exact" } : undefined)
    .eq("company_id", f.companyId);
  if (f.snapshotId) q = q.eq("audience_members.snapshot_id", f.snapshotId);
  const s = sanitizeSearch(f.search);
  if (s) q = q.or(`name.ilike.*${s}*,email.ilike.*${s}*,phone_e164.ilike.*${s}*`);
  if (f.emailConsent !== "all") q = q.eq("consent_email", f.emailConsent === "yes");
  if (f.waConsent !== "all") q = q.eq("consent_whatsapp", f.waConsent === "yes");
  if (f.active !== "all") q = q.eq("is_active", f.active === "yes");
  if (f.source === "__none__") q = q.is("source", null);
  else if (f.source !== "all") q = q.eq("source", f.source);
  return q;
}

export async function fetchContactsPage(f: ContactFilters, page: number) {
  const from = page * CONTACTS_PAGE_SIZE;
  const { data, error, count } = await buildContactsQuery(f, { count: true })
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .range(from, from + CONTACTS_PAGE_SIZE - 1);
  if (error) throw error;
  return { rows: (data ?? []) as any[], total: count ?? 0 };
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Exporta o resultado filtrado completo (paginado no servidor), UTF-8. */
export async function exportContactsCsv(f: ContactFilters, fileLabel: string, audienceId: string | null = null): Promise<number> {
  let rows: any[];
  if (audienceId) rows = await fetchAllAudienceRows(f, audienceId);
  else {
    const { data, error } = await fetchAllPagedQuery(buildContactsQuery(f), { maxRows: 200000 });
    if (error) throw error;
    rows = (data ?? []) as any[];
  }
  const header = ["nome", "email", "telefone", "source", "consent_email", "consent_whatsapp", "estado", "ultima_actividade"];
  const lines = rows.map((c) =>
    [c.name, c.email, c.phone_e164, c.source, c.consent_email ? "sim" : "não", c.consent_whatsapp ? "sim" : "não",
      c.is_active ? "activo" : "inactivo", c.last_activity_at].map(csvCell).join(","),
  );
  const blob = new Blob(["\uFEFF" + [header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contactos_${fileLabel.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 50)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return rows.length;
}

/** D-ERP277: audiência → critério atual avaliado na base (RPC paginada). */
function audienceArgs(f: ContactFilters, audienceId: string, offset: number, limit: number) {
  return {
    p_audience_id: audienceId, p_search: sanitizeSearch(f.search) || null,
    p_email: f.emailConsent, p_wa: f.waConsent, p_active: f.active, p_source: f.source,
    p_offset: offset, p_limit: limit,
  };
}

export async function fetchAudiencePage(f: ContactFilters, audienceId: string, page: number) {
  const { data, error } = await (supabase as any).rpc(
    "crm_contacts_by_audience", audienceArgs(f, audienceId, page * CONTACTS_PAGE_SIZE, CONTACTS_PAGE_SIZE));
  if (error) throw error;
  return { rows: (data?.rows ?? []) as any[], total: Number(data?.total ?? 0) };
}

export async function fetchAllAudienceRows(f: ContactFilters, audienceId: string): Promise<any[]> {
  const out: any[] = [];
  for (let off = 0; off < 200000; off += 1000) {
    const { data, error } = await (supabase as any).rpc("crm_contacts_by_audience", audienceArgs(f, audienceId, off, 1000));
    if (error) throw error;
    const rows = (data?.rows ?? []) as any[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

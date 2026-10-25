// #359 — prova do texto aceite nas caixas email/WhatsApp do formulário (kind=lead).
// Puro: sem efeitos ao importar. O lookup é injetado. Nunca rejeita o lead:
// versão inválida/ausente ou falha do lookup → NULL + aviso.

export type ConsentChannel = "email" | "whatsapp";
export type ConsentVersionRow = {
  version: string; locale: string; channel: string; valid_from: string; valid_to: string | null;
};
export type ConsentLookup = (company: string, versions: string[]) => Promise<ConsentVersionRow[]>;

export type ConsentResolution = {
  /** false = payload sem campos de versão: o chamador não toca no row (comportamento de hoje). */
  applies: boolean;
  columns: { consent_email_text_version: string | null; consent_whatsapp_text_version: string | null; consent_decided_at: string | null };
  raw: Record<string, unknown>;
};

const VERSION_RE = /^[a-z0-9][a-z0-9-]{2,63}$/;
const FIELD: Record<ConsentChannel, "consent_email_text_version" | "consent_whatsapp_text_version"> = {
  email: "consent_email_text_version", whatsapp: "consent_whatsapp_text_version",
};
const BOX: Record<ConsentChannel, "consent_email" | "consent_whatsapp"> = { email: "consent_email", whatsapp: "consent_whatsapp" };

export function hasConsentVersionFields(p: unknown): boolean {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return o.consent_email_text_version !== undefined && o.consent_email_text_version !== null
    || o.consent_whatsapp_text_version !== undefined && o.consent_whatsapp_text_version !== null;
}

function normLocale(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const l = v.trim().toLowerCase().split(/[-_]/)[0];
  return /^[a-z]{2}$/.test(l) ? l : null;
}

export async function resolveConsentVersions(
  input: { payload: unknown; company: string | null; now: Date },
  lookup: ConsentLookup,
): Promise<ConsentResolution> {
  const columns = { consent_email_text_version: null as string | null, consent_whatsapp_text_version: null as string | null, consent_decided_at: null as string | null };
  if (!hasConsentVersionFields(input.payload)) return { applies: false, columns, raw: {} };
  const p = input.payload as Record<string, unknown>;
  const warnings: string[] = [];
  const raw: Record<string, unknown> = {};
  const locale = normLocale(p.consent_locale);
  if (typeof p.consent_locale === "string") raw.consent_locale = p.consent_locale.slice(0, 16);
  if (typeof p.consent_decided_at === "string") raw.consent_decided_at_client = p.consent_decided_at.slice(0, 40);

  const wanted: Array<[ConsentChannel, string]> = [];
  for (const ch of ["email", "whatsapp"] as ConsentChannel[]) {
    const v = p[FIELD[ch]];
    if (v === undefined || v === null) continue;
    if (p[BOX[ch]] !== true) { warnings.push(`${ch}:box_not_checked`); continue; }
    if (typeof v !== "string" || !VERSION_RE.test(v)) { warnings.push(`${ch}:invalid_format`); continue; }
    wanted.push([ch, v]);
  }
  if (wanted.length && !input.company) { warnings.push("no_company"); wanted.length = 0; }
  if (wanted.length && !locale) { warnings.push("no_locale"); wanted.length = 0; }

  if (wanted.length) {
    let rows: ConsentVersionRow[] | null = null;
    try { rows = await lookup(input.company!, [...new Set(wanted.map(([, v]) => v))]); }
    catch { rows = null; }
    if (!Array.isArray(rows)) warnings.push("lookup_failed");
    else {
      const t = input.now.getTime();
      for (const [ch, v] of wanted) {
        const ok = rows.some(r => r.version === v && r.channel === ch && r.locale === locale
          && Date.parse(r.valid_from) <= t && (r.valid_to == null || Date.parse(r.valid_to) > t));
        if (ok) columns[FIELD[ch]] = v; else warnings.push(`${ch}:unknown_version`);
      }
    }
  }
  if (columns.consent_email_text_version || columns.consent_whatsapp_text_version) columns.consent_decided_at = input.now.toISOString();
  if (warnings.length) raw.consent_version_warnings = warnings;
  return { applies: true, columns, raw };
}

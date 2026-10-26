// #364: o lembrete só segue para quem tem o consentimento de email MAIS RECENTE = granted
// (última linha de club_member_email_consents por membro). Sem linha, revoked ou outra decisão: não envia.
// Empate de decided_at resolve-se pelo id (bigint, maior = mais recente), de forma determinística.
export type EmailConsentRow = { member_id: string; decision: string; decided_at: string; id: number | string };
export const NO_GRANTED_CONSENT = "no_granted_consent";

export function latestDecisions(rows: EmailConsentRow[]): Map<string, string> {
  const best = new Map<string, EmailConsentRow>();
  for (const r of rows) {
    const cur = best.get(r.member_id);
    if (!cur) { best.set(r.member_id, r); continue; }
    const t = Date.parse(r.decided_at) - Date.parse(cur.decided_at);
    if (t > 0 || (t === 0 && BigInt(r.id) > BigInt(cur.id))) best.set(r.member_id, r);
  }
  return new Map([...best].map(([k, v]) => [k, v.decision]));
}

/** Devolve os ids cujo consentimento mais recente é granted, mantendo a ordem de entrada. */
export function grantedOnly(ids: string[], rows: EmailConsentRow[]): { allowed: string[]; excluded: number } {
  const last = latestDecisions(rows);
  const allowed = ids.filter((id) => last.get(id) === "granted");
  return { allowed, excluded: ids.length - allowed.length };
}

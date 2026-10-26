// #367 — Identificação do responsável pelo tratamento nos emails do Clube Newgang (pt-PT).
// Razão social e NIPC conferidos em companies (MP 7c858982-…) a 26/10/2026; morada e email indicados pelo Pedro.
// URL da política: página publicada static_pages slug "privacidade" servida em /pt/privacidade (HTTP 200).
export const LEGAL_CONTROLLER = "Responsável pelo tratamento: Mundo Propício Unipessoal, Lda · NIPC 515274291";
export const LEGAL_ADDRESS = "Rua Prista Monteiro 13B, 1600-792 Lisboa, Portugal · geral@mundopropicio.com";
export const PRIVACY_URL = "https://mundopropicio.com/pt/privacidade";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

const LINK = "color:#9cc3aa;text-decoration:underline;";

/** Bloco legal HTML. Com unsubscribeUrl (marketing/lembrete) junta «Cancelar a subscrição»; sem ele (transacional) só identificação + política. */
export function legalFooterHtml(unsubscribeUrl?: string | null): string {
  const links = `<a href="${PRIVACY_URL}" style="${LINK}">Política de Privacidade</a>` +
    (unsubscribeUrl ? ` · <a href="${esc(unsubscribeUrl)}" style="${LINK}">Cancelar a subscrição</a>` : "");
  return `<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#7fa58c;">` +
    `${esc(LEGAL_CONTROLLER)}<br>${esc(LEGAL_ADDRESS)}<br>${links}</p>`;
}

export function legalFooterText(unsubscribeUrl?: string | null): string[] {
  return [LEGAL_CONTROLLER, LEGAL_ADDRESS, `Política de Privacidade: ${PRIVACY_URL}`,
    ...(unsubscribeUrl ? [`Cancelar a subscrição: ${unsubscribeUrl}`] : [])];
}

/**
 * #333 fase11 — Gmail somente leitura para o Assistente de Entrada de Dados.
 * Contratos puros + cliente que só aceita GET em três endpoints de leitura.
 * Metadados, corpos e anexos são DADOS NÃO CONFIÁVEIS: nunca instruções, nunca decisões.
 * Não há send/delete/trash/modify/markread: o cliente recusa qualquer outro método/caminho.
 */
import { z } from "npm:zod@3";

/** Único escopo pedido na ligação própria do utilizador. */
export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_MAX_RANGE_DAYS = 92;
export const GMAIL_MAX_PAGE = 20;
export const GMAIL_MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
/** Limites explícitos da leitura do corpo da mensagem escolhida. */
export const GMAIL_READ_MAX_BYTES = 200 * 1024;
export const GMAIL_READ_MAX_CHARS = 4000;
export const GMAIL_READ_MAX_DEPTH = 6;
export const GMAIL_READ_TIMEOUT_MS = 15000;
const ACCEPTED = new Set(["application/pdf", "image/jpeg", "image/png"]);

const civil = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => {
  const t = new Date(`${d}T00:00:00Z`); return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}, "Data inválida");
export const gmailFilterSchema = z.object({
  from_date: civil,
  to_date: civil, // inclusivo
  sender: z.string().trim().max(120).regex(/^[A-Za-z0-9._%+@-]*$/, "Remetente: só endereço ou domínio").optional(),
  subject: z.string().trim().max(120).optional(),
  page_size: z.number().int().min(1).max(GMAIL_MAX_PAGE),
  page_token: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/).optional(),
  /** Por omissão só mensagens com anexo (fluxo de importação); false = pesquisa para leitura. */
  attachments_only: z.boolean().optional(),
}).strict().superRefine((f, ctx) => {
  const a = Date.parse(`${f.from_date}T00:00:00Z`), b = Date.parse(`${f.to_date}T00:00:00Z`);
  if (b < a) ctx.addIssue({ code: "custom", message: "A data final é anterior à inicial." });
  else if ((b - a) / 86400000 > GMAIL_MAX_RANGE_DAYS) ctx.addIssue({ code: "custom", message: `Período máximo de ${GMAIL_MAX_RANGE_DAYS} dias.` });
  if (!f.sender && !f.subject) ctx.addIssue({ code: "custom", message: "Indica remetente ou assunto." });
});
export type GmailFilter = z.infer<typeof gmailFilterSchema>;
export const gmailSelectionSchema = z.object({
  message_id: z.string().regex(/^[A-Za-z0-9]{6,64}$/),
  part_id: z.string().regex(/^[0-9]+(\.[0-9]+){0,5}$/),
}).strict();

const slash = (d: string) => d.replaceAll("-", "/");
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
/** Assunto vira termo literal: remove operadores/aspas/parênteses, nunca sintaxe do utilizador. */
export function sanitizeSubjectTerm(s: string): string {
  return s.replace(/[\u0000-\u001f\u007f"(){}\[\]:\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}
export function buildGmailQuery(f: GmailFilter): string {
  const parts = [`after:${slash(f.from_date)}`, `before:${slash(nextDay(f.to_date))}`, ...(f.attachments_only === false ? [] : ["has:attachment"])];
  if (f.sender) parts.push(`from:${f.sender}`);
  const subject = f.subject ? sanitizeSubjectTerm(f.subject) : "";
  if (subject) parts.push(`subject:"${subject}"`);
  return parts.join(" ");
}

/** Texto não confiável para mostrar: sem controlo/bidi, limitado. React escapa o resto. */
export function untrustedText(v: unknown, max = 200): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

type Part = { partId?: string; filename?: string; mimeType?: string; body?: { attachmentId?: string; size?: number }; parts?: Part[] };
export type GmailAttachment = { part_id: string; filename: string; mime: string; size_bytes: number };
export type GmailMessageSummary = { message_id: string; from: string; subject: string; date: string; attachments: GmailAttachment[] };

export function listAttachments(payload: Part | undefined, depth = 0): (GmailAttachment & { attachment_id: string })[] {
  if (!payload || depth > 6) return [];
  const own = payload.filename && payload.body?.attachmentId && payload.partId && ACCEPTED.has(String(payload.mimeType))
    && Number(payload.body.size) > 0 && Number(payload.body.size) <= GMAIL_MAX_ATTACHMENT_BYTES
    ? [{ part_id: payload.partId, attachment_id: payload.body.attachmentId, filename: untrustedText(payload.filename, 255) || "anexo", mime: String(payload.mimeType), size_bytes: Number(payload.body.size) }]
    : [];
  return [...own, ...(payload.parts ?? []).flatMap((p) => listAttachments(p, depth + 1))];
}

export function summarizeMessage(m: { id?: string; internalDate?: string; payload?: Part & { headers?: { name?: string; value?: string }[] } }): GmailMessageSummary | null {
  if (!m.id || !/^[A-Za-z0-9]{6,64}$/.test(m.id)) return null;
  const h = (n: string) => untrustedText(m.payload?.headers?.find((x) => x.name?.toLowerCase() === n)?.value);
  const ms = Number(m.internalDate);
  return { message_id: m.id, from: h("from"), subject: h("subject"), date: Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : "",
    attachments: listAttachments(m.payload).map(({ attachment_id: _a, ...rest }) => rest) };
}

/** Origem rastreável, sem conteúdo do email. */
export const gmailOrigin = (messageId: string, partId: string) => `gmail:${messageId}:${partId}`;

const B64 = /^[A-Za-z0-9_-]*={0,2}$/;
export function decodeBase64Url(s: string): Uint8Array {
  if (!B64.test(s)) throw new Error("Anexo ilegível");
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "").padEnd(Math.ceil(s.replace(/=+$/, "").length / 4) * 4, "="));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const LIST = /^\/users\/me\/messages$/;
const GET = /^\/users\/me\/messages\/[A-Za-z0-9]{6,64}$/;
const ATT = /^\/users\/me\/messages\/[A-Za-z0-9]{6,64}\/attachments\/[A-Za-z0-9_-]{1,1024}$/;
const MESSAGE_FIELDS = "id,internalDate,payload(partId,headers,filename,mimeType,body(attachmentId,size),parts(partId,filename,mimeType,body(attachmentId,size),parts(partId,filename,mimeType,body(attachmentId,size),parts(partId,filename,mimeType,body(attachmentId,size)))))";

export type GmailFetch = (path: string, query: URLSearchParams) => Promise<Response>;
export class GmailUnavailable extends Error {}

/** Envolve um transporte autenticado (ligação própria do utilizador). Só GET de leitura. */
export function gmailReadOnly(transport: GmailFetch) {
  const get = async (path: string, q: Record<string, string | string[]>) => {
    if (!LIST.test(path) && !GET.test(path) && !ATT.test(path)) throw new Error("Caminho Gmail não permitido");
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) for (const x of Array.isArray(v) ? v : [v]) params.append(k, x);
    const r = await transport(path, params);
    if (r.status === 401 || r.status === 403) throw new GmailUnavailable("A ligação ao Gmail expirou ou não tem permissão de leitura. Volta a ligar a tua conta.");
    if (!r.ok) throw new GmailUnavailable("O Gmail não respondeu. Tenta mais tarde.");
    return await r.json() as Record<string, unknown>;
  };
  return {
    async search(f: GmailFilter): Promise<{ messages: GmailMessageSummary[]; next_page_token: string | null }> {
      const list = await get("/users/me/messages", { q: buildGmailQuery(f), maxResults: String(f.page_size), ...(f.page_token ? { pageToken: f.page_token } : {}) });
      const ids = (Array.isArray(list.messages) ? list.messages : []).slice(0, f.page_size).map((m) => String((m as { id?: unknown }).id ?? "")).filter((x) => /^[A-Za-z0-9]{6,64}$/.test(x));
      const messages: GmailMessageSummary[] = [];
      for (const id of ids) {
        const s = summarizeMessage(await get(`/users/me/messages/${id}`, { format: "full", fields: MESSAGE_FIELDS }) as never);
        if (s) messages.push(s);
      }
      const token = typeof list.nextPageToken === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(list.nextPageToken) ? list.nextPageToken : null;
      return { messages, next_page_token: token };
    },
    /** Só depois da escolha humana: relê a mensagem, encontra a parte e descarrega esse anexo. */
    async attachment(messageId: string, partId: string): Promise<{ bytes: Uint8Array; filename: string; mime: string }> {
      const msg = await get(`/users/me/messages/${messageId}`, { format: "full", fields: MESSAGE_FIELDS });
      const part = listAttachments((msg as { payload?: Part }).payload).find((p) => p.part_id === partId);
      if (!part) throw new GmailUnavailable("O anexo escolhido já não está disponível nesta mensagem.");
      const data = await get(`/users/me/messages/${messageId}/attachments/${part.attachment_id}`, {});
      const bytes = decodeBase64Url(String(data.data ?? ""));
      if (!bytes.length || bytes.length > GMAIL_MAX_ATTACHMENT_BYTES) throw new GmailUnavailable("Anexo vazio ou superior a 20 MB.");
      return { bytes, filename: part.filename, mime: part.mime };
    },
  };
}
export type GmailReader = ReturnType<typeof gmailReadOnly>;

/**
 * #333 fase11 — Gmail somente leitura para o Assistente de Entrada de Dados.
 * Contratos puros + cliente que só aceita GET em três endpoints de leitura.
 * Metadados, corpos e anexos são DADOS NÃO CONFIÁVEIS: nunca instruções, nunca decisões.
 * Não há send/delete/trash/modify/markread: o cliente recusa qualquer outro método/caminho.
 */
import { z } from "npm:zod@3";
import { classifySubject, flexibleSubjectQueries, MATCH_LABEL, matchScore, type MatchKind } from "./gmail-flexible.ts";

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
  /** Assunto: "flexible" (padrão) recupera variantes limitadas e ordena; "exact" = só a expressão. */
  match: z.enum(["flexible", "exact"]).optional(),
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
/** Base obrigatória (período + remetente + anexo), sempre em AND com qualquer termo de assunto. */
export function baseGmailQuery(f: GmailFilter): string {
  const parts = [`after:${slash(f.from_date)}`, `before:${slash(nextDay(f.to_date))}`, ...(f.attachments_only === false ? [] : ["has:attachment"])];
  if (f.sender) parts.push(`from:${f.sender}`);
  return parts.join(" ");
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
export type GmailMessageSummary = { message_id: string; from: string; subject: string; date: string; attachments: GmailAttachment[]; match?: { kind: MatchKind; label: string } };
export type GmailSearchInfo = { mode: "exact" | "flexible"; searched: string[]; candidates: number; coverage_complete: boolean; note?: string };
/** Limites da pesquisa flexível por pedido (cada página repete a recuperação — sem estado guardado). */
export const FLEX_LIST_PER_QUERY = 50;
export const FLEX_MAX_CANDIDATES = 80;
export const FLEX_TIME_BUDGET_MS = 20000;

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

/** Descodifica no máximo maxBytes; sinaliza truncagem em vez de ler o corpo inteiro. */
export function decodeBase64UrlCapped(s: string, maxBytes: number): { bytes: Uint8Array; truncated: boolean } {
  if (!B64.test(s)) throw new Error("Corpo ilegível");
  const clean = s.replace(/=+$/, "");
  const truncated = Math.floor((clean.length * 3) / 4) > maxBytes;
  const part = truncated ? clean.slice(0, Math.floor(maxBytes / 3) * 4) : clean;
  const bin = atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="));
  return { bytes: Uint8Array.from(bin, (c) => c.charCodeAt(0)), truncated };
}

/** HTML não confiável → texto simples. Remove scripts/estilos/recursos; nunca carrega nada remoto. */
const safeCodePoint = (n: number): string =>
  Number.isFinite(n) && n >= 32 && !(n >= 0x7f && n < 0xa1) && n <= 0x10ffff
    ? (() => { try { return String.fromCodePoint(n); } catch { return " "; } })() : " ";
/** Entidades nomeadas Latin-1 (HTML4), suficientes para texto em português. */
const NAMED_ENTITIES: Record<string, string> = Object.fromEntries(
  ("nbsp:160 iexcl:161 cent:162 pound:163 curren:164 yen:165 brvbar:166 sect:167 uml:168 copy:169 ordf:170 laquo:171 not:172 shy:173 reg:174 macr:175 deg:176 plusmn:177 sup2:178 sup3:179 acute:180 micro:181 para:182 middot:183 cedil:184 sup1:185 ordm:186 raquo:187 frac14:188 frac12:189 frac34:190 iquest:191 Agrave:192 Aacute:193 Acirc:194 Atilde:195 Auml:196 Aring:197 AElig:198 Ccedil:199 Egrave:200 Eacute:201 Ecirc:202 Euml:203 Igrave:204 Iacute:205 Icirc:206 Iuml:207 ETH:208 Ntilde:209 Ograve:210 Oacute:211 Ocirc:212 Otilde:213 Ouml:214 times:215 Oslash:216 Ugrave:217 Uacute:218 Ucirc:219 Uuml:220 Yacute:221 THORN:222 szlig:223 agrave:224 aacute:225 acirc:226 atilde:227 auml:228 aring:229 aelig:230 ccedil:231 egrave:232 eacute:233 ecirc:234 euml:235 igrave:236 iacute:237 icirc:238 iuml:239 eth:240 ntilde:241 ograve:242 oacute:243 ocirc:244 otilde:245 ouml:246 divide:247 oslash:248 ugrave:249 uacute:250 ucirc:251 uuml:252 yacute:253 thorn:254 yuml:255")
    .split(" ").map((e) => { const [k, v] = e.split(":"); return [k, safeCodePoint(Number(v))]; }),
);
export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|head|title|object|embed|iframe)[\s\S]*?(<\/\1\s*>|$)/gi, " ")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote|section|article|table)>/gi, "\n")
    .replace(/<(br|hr)[^>]*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d{1,7});/g, (_m, d) => safeCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]{1,6});/gi, (_m, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&apos;/gi, "'")
    .replace(/&([a-zA-Z][a-zA-Z0-9]{1,9});/g, (m, name: string) => NAMED_ENTITIES[name] ?? m)
    .replace(/&amp;/gi, "&");
}
/** Texto de corpo para mostrar: sem controlo/bidi, quebras preservadas, corte sinalizado. */
export function cleanBodyText(t: string, maxChars = GMAIL_READ_MAX_CHARS): { text: string; truncated: boolean } {
  const clean = t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return clean.length > maxChars ? { text: `${clean.slice(0, maxChars).trimEnd()}…`, truncated: true } : { text: clean, truncated: false };
}

type BodyPart = { mimeType?: string; body?: { data?: string; size?: number }; parts?: BodyPart[] };
function findBodyPart(payload: BodyPart | undefined, mime: string, depth = 0): BodyPart | null {
  if (!payload || depth > GMAIL_READ_MAX_DEPTH) return null;
  if (payload.mimeType === mime && typeof payload.body?.data === "string") return payload;
  for (const p of payload.parts ?? []) { const f = findBodyPart(p, mime, depth + 1); if (f) return f; }
  return null;
}
export type GmailMessageBody = {
  message_id: string; from: string; subject: string; date: string;
  kind: "plain" | "html" | "none"; body_text: string; truncated: boolean;
};

const LIST = /^\/users\/me\/messages$/;
const GET = /^\/users\/me\/messages\/[A-Za-z0-9]{6,64}$/;
const ATT = /^\/users\/me\/messages\/[A-Za-z0-9]{6,64}\/attachments\/[A-Za-z0-9_-]{1,1024}$/;
const MESSAGE_FIELDS = "id,internalDate,payload(partId,headers,filename,mimeType,body(attachmentId,size),parts(partId,filename,mimeType,body(attachmentId,size),parts(partId,filename,mimeType,body(attachmentId,size),parts(partId,filename,mimeType,body(attachmentId,size)))))";
/** Leitura do corpo: inclui body(data) das partes de texto (anexos nunca vêm inline). */
const READ_FIELDS = "id,internalDate,payload(headers,mimeType,body(data,size),parts(mimeType,body(data,size),parts(mimeType,body(data,size),parts(mimeType,body(data,size),parts(mimeType,body(data,size))))))";

export type GmailFetch = (path: string, query: URLSearchParams) => Promise<Response>;
export class GmailUnavailable extends Error {}

/** Envolve um transporte autenticado (ligação própria do utilizador). Só GET de leitura. */
export function gmailReadOnly(transport: GmailFetch, opts?: { readTimeoutMs?: number }) {
  const readTimeoutMs = opts?.readTimeoutMs ?? GMAIL_READ_TIMEOUT_MS;
  /** Prazo explícito da leitura; a resposta tardia é descartada, nunca usada. */
  const withTimeout = <T>(p: Promise<T>): Promise<T> => {
    p.catch(() => undefined); // a promessa que perde a corrida não fica por tratar
    return Promise.race([p, new Promise<T>((_res, rej) => setTimeout(() => rej(new GmailUnavailable("A leitura do email demorou demasiado. Tenta outra vez.")), readTimeoutMs))]);
  };
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
    async search(f: GmailFilter): Promise<{ messages: GmailMessageSummary[]; next_page_token: string | null; search_info?: GmailSearchInfo }> {
      const subject = f.subject ? sanitizeSubjectTerm(f.subject) : "";
      const queries = subject && f.match !== "exact" ? flexibleSubjectQueries(subject) : [];
      if (!queries.length) {
        if (f.page_token && /^f\d+$/.test(f.page_token)) throw new GmailUnavailable("Página de pesquisa inválida. Volta a procurar.");
        const list = await get("/users/me/messages", { q: buildGmailQuery(f), maxResults: String(f.page_size), ...(f.page_token ? { pageToken: f.page_token } : {}) });
        const ids = (Array.isArray(list.messages) ? list.messages : []).slice(0, f.page_size).map((m) => String((m as { id?: unknown }).id ?? "")).filter((x) => /^[A-Za-z0-9]{6,64}$/.test(x));
        const messages: GmailMessageSummary[] = [];
        for (const id of ids) {
          const s = summarizeMessage(await get(`/users/me/messages/${id}`, { format: "full", fields: MESSAGE_FIELDS }) as never);
          if (s) messages.push(subject ? { ...s, match: { kind: "exact", label: MATCH_LABEL.exact } } : s);
        }
        const token = typeof list.nextPageToken === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(list.nextPageToken) ? list.nextPageToken : null;
        return { messages, next_page_token: token, search_info: { mode: "exact", searched: [subject ? `assunto com a expressão exata "${subject}"` : "sem filtro de assunto"], candidates: messages.length, coverage_complete: true } };
      }
      // Flexível: offset estável sobre a lista ordenada inteira dos candidatos recuperados.
      const offset = f.page_token ? (/^f\d{1,4}$/.test(f.page_token) ? Number(f.page_token.slice(1)) : NaN) : 0;
      if (!Number.isFinite(offset)) throw new GmailUnavailable("Página de pesquisa inválida. Volta a procurar.");
      const started = Date.now();
      const base = baseGmailQuery(f);
      const seen = new Set<string>(); const ids: string[] = [];
      let complete = true;
      for (const { q } of queries) {
        if (Date.now() - started > FLEX_TIME_BUDGET_MS) { complete = false; break; }
        const list = await get("/users/me/messages", { q: `${base} ${q}`, maxResults: String(FLEX_LIST_PER_QUERY) });
        if (typeof list.nextPageToken === "string") complete = false;
        for (const m of Array.isArray(list.messages) ? list.messages : []) {
          const id = String((m as { id?: unknown }).id ?? "");
          if (!/^[A-Za-z0-9]{6,64}$/.test(id) || seen.has(id)) continue;
          if (ids.length >= FLEX_MAX_CANDIDATES) { complete = false; break; }
          seen.add(id); ids.push(id);
        }
      }
      // Metadados mínimos (assunto/data) para ordenar; em blocos de 10 dentro do prazo.
      const ranked: { id: string; kind: MatchKind; ms: number }[] = [];
      for (let i = 0; i < ids.length; i += 10) {
        if (Date.now() - started > FLEX_TIME_BUDGET_MS) { complete = false; break; }
        const metas = await Promise.all(ids.slice(i, i + 10).map((id) => get(`/users/me/messages/${id}`, { format: "metadata", metadataHeaders: ["Subject"], fields: "id,internalDate,payload(headers)" })));
        for (const m of metas) {
          const id = String(m.id ?? ""); if (!seen.has(id)) continue;
          const subj = untrustedText(((m.payload as { headers?: { name?: string; value?: string }[] } | undefined)?.headers ?? []).find((h) => h.name?.toLowerCase() === "subject")?.value);
          const kind = classifySubject(subject, subj);
          if (kind) ranked.push({ id, kind, ms: Number(m.internalDate) || 0 });
        }
      }
      ranked.sort((a, b) => matchScore(b.kind) - matchScore(a.kind) || b.ms - a.ms || (a.id < b.id ? -1 : 1));
      const page = ranked.slice(offset, offset + f.page_size);
      const messages: GmailMessageSummary[] = [];
      for (const r of page) {
        const s = summarizeMessage(await get(`/users/me/messages/${r.id}`, { format: "full", fields: MESSAGE_FIELDS }) as never);
        if (s) messages.push({ ...s, match: { kind: r.kind, label: MATCH_LABEL[r.kind] } });
      }
      const nextOffset = offset + f.page_size;
      return {
        messages, next_page_token: nextOffset < ranked.length ? `f${nextOffset}` : null,
        search_info: {
          mode: "flexible", candidates: ranked.length, coverage_complete: complete,
          searched: [`assunto parecido com "${subject}": expressão, mesmas palavras em qualquer ordem, palavras juntas e variações de grafia`],
          ...(complete ? {} : { note: `Pesquisa limitada a ${FLEX_MAX_CANDIDATES} candidatos ou ${FLEX_TIME_BUDGET_MS / 1000} s: podem existir mais emails. Reduz o período ou indica o remetente.` }),
        },
      };
    },
    /** Metadados dos anexos da mensagem escolhida (sem bytes, sem attachment_id), para o seletor humano. */
    async attachments(messageId: string): Promise<GmailAttachment[]> {
      const msg = await withTimeout(get(`/users/me/messages/${messageId}`, { format: "full", fields: MESSAGE_FIELDS }));
      return listAttachments((msg as { payload?: Part }).payload).map(({ part_id, filename, mime, size_bytes }) => ({ part_id, filename: untrustedText(filename, 120), mime, size_bytes }));
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
    /** Só depois da escolha humana: lê o corpo dessa mensagem como texto (nunca executa nem segue conteúdo). */
    async read(messageId: string): Promise<GmailMessageBody> {
      const msg = await withTimeout(get(`/users/me/messages/${messageId}`, { format: "full", fields: READ_FIELDS }));
      const base = summarizeMessage(msg as never);
      if (!base) throw new GmailUnavailable("Mensagem indisponível.");
      const meta = { message_id: base.message_id, from: base.from, subject: base.subject, date: base.date };
      const payload = (msg as { payload?: BodyPart }).payload;
      const plain = findBodyPart(payload, "text/plain");
      const part = plain ?? findBodyPart(payload, "text/html");
      if (!part || typeof part.body?.data !== "string") return { ...meta, kind: "none", body_text: "", truncated: false };
      let decoded: { bytes: Uint8Array; truncated: boolean };
      try { decoded = decodeBase64UrlCapped(part.body.data, GMAIL_READ_MAX_BYTES); }
      catch { throw new GmailUnavailable("Não foi possível ler o corpo deste email."); }
      const raw = new TextDecoder("utf-8", { fatal: false }).decode(decoded.bytes);
      const cleaned = cleanBodyText(plain ? raw : htmlToText(raw));
      return { ...meta, kind: plain ? "plain" : "html", body_text: cleaned.text, truncated: decoded.truncated || cleaned.truncated };
    },
  };
}
export type GmailReader = ReturnType<typeof gmailReadOnly>;

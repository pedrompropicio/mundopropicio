/**
 * #333 handler with injected Auth/DB/storage so it can be tested without network.
 * Identity: verified Auth only. Company and role: canonical SQL resolvers called with the
 * user's own JWT (current_company_id / my_effective_permissions). Service role is used only
 * for private storage bytes and immutable storage receipts — never to decide who the user is.
 */
import { z } from "npm:zod@3";
import {
  MAX_UPLOAD_BODY_BYTES, allowedRole, finalDocumentPath, readCapped, sha256, stagingPath,
  validCivilDate, validMoney, validateDocument, type DocumentType,
} from "./core.ts";
import { GmailConnectError, type GmailConnection } from "../_shared/gmail-app-user.ts";
import { runAssistantTurn, type AssistantModel, type TurnInput } from "../_shared/assistant-orchestrator.ts";
import type { ErpContext } from "../_shared/assistant-ticketline-proposal.ts";
import { signContinuation, verifyContinuation, requestHash, type AssistantContinuation } from "../_shared/assistant-continuation.ts";
import { boundedAnalysis } from "./analysis-deadline.ts";
import { GmailUnavailable, gmailFilterSchema, gmailOrigin, gmailSelectionSchema, type GmailReader as _GmailReader } from "../_shared/gmail-readonly.ts";

export type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };
export type Bucket = "data-entry-staging" | "standalone-invoices";
export interface Deps {
  getUser(token: string): Promise<{ id: string } | null>;
  /** RPC executed with the caller's JWT (auth.uid / current_company_id inside SQL). */
  userRpc(token: string, name: string, args: Record<string, unknown>): Promise<RpcResult>;
  /** Service-role RPC limited to data_entry_record_receipt. */
  recordReceipt(bucket: Bucket, path: string, sha: string, size: number, mime: DocumentType): Promise<RpcResult>;
  scopedReceipt?(owner: string, company: string, session: string, bucket: Bucket, path: string, sha: string, size: number, mime: DocumentType): Promise<RpcResult>;
  storage: {
    upload(bucket: Bucket, path: string, bytes: Uint8Array, mime: string): Promise<{ error: null | { conflict: boolean } }>;
    download(bucket: Bucket, path: string): Promise<Uint8Array | null>;
  };
  /** Upload stays closed until the technical tables/buckets are applied and reviewed. */
  uploadEnabled: boolean;
  /** Pilot candidate only: canonical caller JWT capability, never request flags. */
  pilotScoped?: boolean;
  /** Independent phase10 gate; no upload/execute flag can enable provider calls. */
  analysisEnabled?: boolean;
  analysis?(req: Request, input: { session: string; document: string; message: string; history: { role: "user" | "assistant"; text: string }[] }, scope: { user: string; company: string; role: string }): Promise<Response>;
  /** #333 fase11: Gmail só leitura pela ligação PRÓPRIA do utilizador nesta empresa.
   * Ausente = infraestrutura de ligação ainda não configurada; null = utilizador sem ligação. */
  gmail?: Pick<GmailConnection, "reader"> & Partial<Omit<GmailConnection, "reader">>;
  /** Nome canónico da empresa já resolvida no servidor; null/erro = não mostrar (nunca inventar). */
  companyName?(company: string): Promise<string | null>;
  /** #333 fase12: orquestrador conversacional. Ausente = não ativado (503). Modelo e leitor ERP injetados. */
  assistantEnabled?: boolean;
  assistantScopeAllowed?(user: string, company: string): boolean;
  assistant?: { model: AssistantModel; erpContext(token: string, company: string, text: string, signal?: AbortSignal, number?: string): Promise<ErpContext> };
  assistantFactory?(req: Request, scope: { user: string; company: string }, revalidate: () => Promise<void>): Promise<NonNullable<Deps["assistant"]>>;
  continuationSecret?: string;
  cors: Record<string, string>;
}

const id = z.string().uuid();
const money = z.number().refine(validMoney, "Valor inválido");
export const fieldsSchema = z.object({
  supplier_name: z.string().trim().min(1).max(200),
  supplier_nif: z.string().trim().min(5).max(40).regex(/^[A-Za-z0-9 .\-/]+$/),
  invoice_number: z.string().trim().min(1).max(100),
  invoice_date: z.string().refine(validCivilDate, "Data civil inválida"),
  currency: z.literal("EUR"),
  total_amount: money,
  iva_amount: money,
  customer_nif: z.string().trim().min(5).max(40).regex(/^[A-Za-z0-9 .\-/]+$/),
  paid_by_partner_id: id,
  notes: z.string().max(2000),
}).strict().refine((f) => f.iva_amount <= f.total_amount, "IVA superior ao total");
export const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status") }).strict(),
  z.object({ action: z.literal("session"), session_id: id.optional(), event_id: id.optional() }).strict(),
  z.object({ action: z.literal("note"), session_id: id, body: z.string().trim().min(1).max(4000) }).strict(),
  z.object({ action: z.literal("preview"), session_id: id, document_id: id, fields: fieldsSchema }).strict(),
  z.object({ action: z.literal("execute"), session_id: id, preview_id: id, snapshot_hash: z.string().regex(/^[a-f0-9]{64}$/), authorize: z.literal(true) }).strict(),
  z.object({ action: z.literal("check"), session_id: id, preview_id: id }).strict(),
  z.object({ action: z.literal("document"), session_id: id, document_id: id }).strict(),
  z.object({ action: z.literal("gmail_search"), filters: z.unknown() }).strict(),
  z.object({ action: z.literal("assistant_turn"), text: z.string().max(2000),
    history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) }).strict()).max(20),
    selection: z.object({ message_id: z.string().regex(/^[A-Za-z0-9]{6,64}$/).optional(), event_id: z.string().uuid().optional() }).strict().optional(),
    known_message_ids: z.array(z.string().regex(/^[A-Za-z0-9]{6,64}$/)).max(50).optional(), continuation: z.string().max(8000).optional() }).strict(),
  z.object({ action: z.literal("gmail_read"), message_id: z.string().regex(/^[A-Za-z0-9]{6,64}$/) }).strict(),
  z.object({ action: z.literal("gmail_connection") }).strict(),
  z.object({ action: z.literal("gmail_connect_start"), origin: z.string().url().max(200) }).strict(),
  z.object({ action: z.literal("gmail_connect_complete"), binding: z.string().regex(/^[A-Za-z0-9_-]{43}$/), code: z.string().min(1).max(4096).regex(/^[\x21-\x7e]+$/) }).strict(),
  z.object({ action: z.literal("gmail_disconnect") }).strict(),
  z.object({ action: z.literal("gmail_import"), session_id: id, selection: gmailSelectionSchema }).strict(),
  z.object({ action: z.literal("analyze"), session_id: id, document_id: id, message: z.string(), history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string() }).strict()) }).strict(),
]);

class SafeError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
const DEFINITIVE = new Set(["42501", "23505", "40001", "22023", "P0001"]);
/** Only messages authored by #333 SQL ("#333: ...") reach the user; everything else is generic. */
function fromDb(error: { code?: string; message?: string }): SafeError {
  const msg = error.message?.startsWith("#333: ") ? error.message.slice(6) : null;
  const status = error.code === "42501" ? 403 : error.code === "23505" || error.code === "40001" ? 409 : 400;
  if (msg && DEFINITIVE.has(String(error.code))) return new SafeError(msg, status);
  return new SafeError("Operação recusada pelo servidor. Nenhum lançamento foi criado.", status === 400 ? 503 : status);
}

type Doc = { id: string; sha256: string; mime: DocumentType; path: string; name: string };
type State = { session: { id: string; company_id: string }; company: { id: string }; documents: Doc[];
  preview: { id: string; snapshot_hash: string; document_id: string } | null;
  results: { preview_id: string; result: Record<string, unknown> }[]; capabilities: { execute: boolean } };

export function createHandler(d: Deps) {
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...d.cors, "Content-Type": "application/json" } });

  /** Puts bytes at a deterministic path; an existing object is accepted only with identical bytes. */
  async function putVerified(bucket: Bucket, path: string, bytes: Uint8Array, mime: DocumentType, hash: string, guard?: () => Promise<void>, receipt?: () => Promise<RpcResult>) {
    if (guard) await guard();
    const up = await d.storage.upload(bucket, path, bytes, mime);
    if (up.error && !up.error.conflict) throw new SafeError("Armazenamento não conferido; nada foi registado.", 409);
    // HTTP success is not evidence of stored bytes. Read back success AND conflict.
    if (guard) await guard();
    const existing = await d.storage.download(bucket, path);
    if (!existing || existing.length !== bytes.length || (await sha256(existing)) !== hash)
      throw new SafeError("Armazenamento não conferido; nada foi registado.", 409);
    if (guard) await guard();
    const r = receipt ? await receipt() : await d.recordReceipt(bucket, path, hash, bytes.length, mime);
    if (r.error) throw fromDb(r.error);
  }

  return async function handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { headers: d.cors });
    if (req.method !== "POST") return reply({ error: "Método não permitido" }, 405);
    try {
      const header = req.headers.get("Authorization");
      if (!header?.startsWith("Bearer ")) throw new SafeError("Inicia sessão para continuar.", 401);
      const token = header.slice(7);
      const user = await d.getUser(token);
      if (!user) throw new SafeError("Sessão inválida", 401);
      const rpc = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
        const r = await d.userRpc(token, name, args);
        if (r.error) throw fromDb(r.error);
        return r.data as T;
      };
      const eff = await rpc<{ role?: string; company_id?: string }>("my_effective_permissions", { p_universe: [] });
      if (!eff?.company_id) throw new SafeError("Empresa ativa indisponível", 403);
      if (!allowedRole(eff.role)) throw new SafeError("Sem acesso ao assistente nesta empresa.", 403);
      const company = eff.company_id;
      if ((req.headers.has("X-Data-Entry-User") && req.headers.get("X-Data-Entry-User") !== user.id)
        || (req.headers.has("X-Data-Entry-Company") && req.headers.get("X-Data-Entry-Company") !== company))
        throw new SafeError("Contexto alterado; reabre o assistente na empresa atual.", 409);
      const load = (session: string) => rpc<State>("data_entry_session", { p_session: session, p_event: null });
      const canonicalStorageContext = async () => {
        const currentUser = await d.getUser(token);
        if (!currentUser || currentUser.id !== user.id) throw new SafeError("Sessão inválida", 401);
        const current = await rpc<{ role?: string; company_id?: string }>("my_effective_permissions", { p_universe: [] });
        if (current?.company_id !== company || !allowedRole(current?.role))
          throw new SafeError("Contexto alterado; candidato preservado.", 403);
      };
      const capabilities = async () => {
        const response = await d.userRpc(token, "data_entry_pilot8_capabilities", {});
        if (response.error) {
          // Missing SQL/network is unavailable, never a global flag or service-role fallback.
          if (response.error.code === "42501") throw fromDb(response.error);
          return { preparation: false, execute: false, unavailable: true };
        }
        const parsed = z.object({ preparation: z.boolean(), execute: z.boolean() }).safeParse(response.data);
        return parsed.success ? { ...parsed.data, unavailable: false }
          : { preparation: false, execute: false, unavailable: true };
      };
      const pilot = d.pilotScoped ? await capabilities() : null;
      const uploadEnabled = d.pilotScoped ? pilot?.preparation === true : d.uploadEnabled;
      const revalidateStorage = async (bucket: Bucket) => {
        if (!d.pilotScoped) return;
        await canonicalStorageContext();
        const current = await capabilities();
        if (current.unavailable) throw new SafeError("Piloto indisponível; candidato preservado.", 503);
        if (!(bucket === "data-entry-staging" ? current.preparation : current.execute))
          throw new SafeError("Piloto indisponível; candidato preservado.", 403);
      };
      const putScoped = async (session: string, bucket: Bucket, path: string, bytes: Uint8Array, mime: DocumentType, hash: string) => {
        await putVerified(bucket, path, bytes, mime, hash, () => revalidateStorage(bucket),
          d.pilotScoped ? async () => {
            await canonicalStorageContext();
            if (!d.scopedReceipt) throw new SafeError("Piloto indisponível; candidato preservado.", 503);
            return d.scopedReceipt(user.id, company, session, bucket, path, hash, bytes.length, mime);
          } : undefined);
      };

      if (req.headers.get("Content-Type")?.startsWith("multipart/form-data")) {
        if (!uploadEnabled) throw new SafeError("Envio de documentos ainda não ativado neste ambiente. Nada foi guardado.", 503);
        let raw: Uint8Array;
        try { raw = await readCapped(req.body, MAX_UPLOAD_BODY_BYTES); }
        catch (e) { throw new SafeError(e instanceof RangeError ? e.message : "Pedido inválido", 413); }
        const contentType = req.headers.get("Content-Type");
        if (!contentType) throw new SafeError("Pedido inválido");
        const form = await new Response(new Uint8Array(raw).buffer, { headers: { "Content-Type": contentType } }).formData();
        if ([...form.keys()].some((k) => !["session_id", "file"].includes(k))) throw new SafeError("Campos não permitidos");
        const sessionId = id.parse(form.get("session_id"));
        const state = await load(sessionId);
        if (state.company.id !== company) throw new SafeError("Lote de outra empresa", 403);
        const file = form.get("file");
        if (!(file instanceof File)) throw new SafeError("Seleciona um ficheiro");
        const bytes = new Uint8Array(await file.arrayBuffer());
        let mime: DocumentType;
        try { mime = validateDocument(bytes, file.type); } catch (e) { throw new SafeError((e as Error).message, 422); }
        const hash = await sha256(bytes);
        const path = stagingPath(company, sessionId, hash);
        await putScoped(sessionId, "data-entry-staging", path, bytes, mime, hash);
        const name = file.name.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 255) || "documento";
        return reply(await rpc("data_entry_add_document", { p_session: sessionId, p_name: name, p_sha: hash, p_size: bytes.length, p_mime: mime }));
      }

      const len = Number(req.headers.get("Content-Length") ?? 0);
      if (len > 16000) throw new SafeError("Pedido demasiado grande", 413);
      const text = new TextDecoder().decode(await readCapped(req.body, 16000).catch(() => { throw new SafeError("Pedido demasiado grande", 413); }));
      const body = commandSchema.parse(JSON.parse(text));
      if (body.action === "status") {
        let companyName: string | null = null;
        try { companyName = d.companyName ? await d.companyName(company) : null; } catch { companyName = null; }
        return reply({ user_id: user.id, role: eff.role, company_id: company, company_name: companyName, capabilities: { upload: uploadEnabled, ...(pilot?.unavailable ? { unavailable: true } : {}), analysis: d.analysisEnabled === true && uploadEnabled && !!d.analysis, gmail: !!d.gmail, assistant: d.assistantEnabled !== false && (!d.assistantScopeAllowed || d.assistantScopeAllowed(user.id, company)) && (!!d.assistant || d.assistantEnabled === true && !!d.assistantFactory), drive: false, transactions: false, payments: false, bp: false, bank: false, ticket_office: false } });
      }
      const gmailReader = async () => {
        if (!d.gmail) throw new SafeError("A ligação ao Gmail ainda não está disponível nesta plataforma. Envia o ficheiro manualmente.", 503);
        await canonicalStorageContext();
        const reader = await d.gmail.reader(user.id, company);
        if (!reader) throw new SafeError("Ainda não ligaste a tua conta Gmail a esta empresa.", 409);
        return reader;
      };
      if (body.action === "gmail_connection" || body.action === "gmail_connect_start" || body.action === "gmail_connect_complete" || body.action === "gmail_disconnect") {
        const g = d.gmail;
        if (!g?.status || !g.start || !g.complete || !g.disconnect) throw new SafeError("A ligação ao Gmail ainda não está disponível nesta plataforma. Envia o ficheiro manualmente.", 503);
        if (body.action === "gmail_connection") return reply(await g.status(user.id, company));
        if (body.action === "gmail_connect_start") return reply(await g.start(user.id, company, new URL(body.origin).origin));
        if (body.action === "gmail_connect_complete") return reply(await g.complete(user.id, company, body.binding, body.code));
        return reply(await g.disconnect(user.id, company));
      }
      if (body.action === "gmail_search") {
        const filters = gmailFilterSchema.safeParse(body.filters);
        if (!filters.success) throw new SafeError(filters.error.issues[0]?.message ?? "Filtros inválidos.", 400);
        const reader = await gmailReader();
        const result = await reader.search(filters.data);
        await canonicalStorageContext();
        return reply(result);
      }
      if (body.action === "assistant_turn") {
        if (d.assistantScopeAllowed && !d.assistantScopeAllowed(user.id, company)) throw new SafeError("Assistente fora da janela autorizada para este utilizador e empresa.", 503);
        if (d.assistantEnabled === false || !d.assistant && !(d.assistantEnabled === true && d.assistantFactory)) throw new SafeError("O assistente conversacional ainda não está ativado. Podes usar a pesquisa do Gmail abaixo.", 503);
        await canonicalStorageContext();
        if (body.selection && (!body.continuation || !d.continuationSecret)) throw new SafeError("Seleção sem prova do servidor; repete a pesquisa.", 409);
        let resume: AssistantContinuation | undefined;
        if (body.continuation) {
          try { resume = await verifyContinuation(body.continuation, d.continuationSecret ?? "", { user: user.id, company }, body.text); }
          catch { throw new SafeError("Seleção expirada ou contexto alterado; repete a pesquisa.", 409); }
        }
        const a = d.assistantFactory ? await d.assistantFactory(req, { user: user.id, company }, canonicalStorageContext) : d.assistant;
        if (!a) throw new SafeError("Assistente indisponível.", 503);
        const result = await boundedAnalysis(req.signal, signal => runAssistantTurn(a.model, {
          resume,
          gmailSearch: async (f) => { const r = await (await gmailReader()).search(f); await canonicalStorageContext(); return r; },
          gmailRead: async (id) => { const r = await (await gmailReader()).read(id); await canonicalStorageContext(); return r; },
          erpContext: async (text, number) => { await canonicalStorageContext(); const c = await a.erpContext(token, company, text, signal, number); await canonicalStorageContext(); if (c.company_id !== company) throw new SafeError("Contexto alterado.", 403); return c; },
        }, { text: body.text, history: body.history as TurnInput["history"], selection: body.selection }, signal));
        await canonicalStorageContext();
        const metadata = result.continuation_state; delete result.continuation_state;
        if (metadata && d.continuationSecret && (result.status === "select_message" || result.status === "select_event")) result.continuation = await signContinuation({ ...metadata, user: user.id, company, requestHash: await requestHash(body.text), expires: Date.now() + 10 * 60 * 1000 }, d.continuationSecret);
        if (req.signal.aborted) return reply({ error: "Pedido cancelado." }, 499);
        return reply(result);
      }
      // Leitura do corpo da mensagem escolhida: só leitura, independente do envio documental fechado.
      if (body.action === "gmail_read") {
        const reader = await gmailReader();
        const result = await reader.read(body.message_id);
        await canonicalStorageContext();
        return reply(result);
      }
      if (!uploadEnabled && !(d.pilotScoped && (body.action === "check" || body.action === "document" || (body.action === "session" && body.session_id)))) throw new SafeError("Assistente ainda não ativado neste ambiente. Nada foi guardado.", 503);
      if (body.action === "session") return reply(await rpc("data_entry_session", { p_session: body.session_id ?? null, p_event: body.event_id ?? null }));
      const state = await load(body.session_id);
      if (state.company.id !== company) throw new SafeError("Lote de outra empresa", 403);
      if (body.action === "analyze") {
        if (!d.analysisEnabled || !d.analysis) throw new SafeError("Análise documental ainda não ativada. Revê os campos manualmente.", 503);
        return await d.analysis(req, { session: body.session_id, document: body.document_id, message: body.message, history: body.history.map((t) => ({ role: t.role as "user" | "assistant", text: t.text as string })) }, { user: user.id, company, role: eff.role ?? "" });
      }
      if (body.action === "gmail_import") {
        const reader = await gmailReader();
        const { message_id, part_id } = body.selection;
        const att = await reader.attachment(message_id, part_id);
        await canonicalStorageContext();
        let mime: DocumentType;
        try { mime = validateDocument(att.bytes, att.mime); } catch (e) { throw new SafeError((e as Error).message, 422); }
        const hash = await sha256(att.bytes);
        const origin = gmailOrigin(message_id, part_id);
        const existing = state.documents.find((x) => x.sha256 === hash);
        if (existing) return reply({ id: existing.id, reused: true, origin });
        await putScoped(body.session_id, "data-entry-staging", stagingPath(company, body.session_id, hash), att.bytes, mime, hash);
        const added = await rpc<{ id: string; reused: boolean }>("data_entry_add_document", { p_session: body.session_id, p_name: att.filename.slice(0, 255) || "anexo", p_sha: hash, p_size: att.bytes.length, p_mime: mime });
        await rpc("data_entry_note", { p_session: body.session_id, p_body: `Origem do documento: ${origin} (anexo escolhido pelo utilizador; conteúdo do email tratado como dado).` });
        return reply({ ...added, origin });
      }
      if (body.action === "note") return reply({ id: await rpc("data_entry_note", { p_session: body.session_id, p_body: body.body }) });
      if (body.action === "preview") return reply(await rpc("data_entry_prepare", { p_session: body.session_id, p_document: body.document_id, p_fields: body.fields }));
      if (body.action === "document") {
        const doc = state.documents.find((x) => x.id === body.document_id);
        if (!doc) throw new SafeError("Documento não encontrado", 404);
        if (d.pilotScoped) { await canonicalStorageContext(); await load(body.session_id); }
        const bytes = await d.storage.download("data-entry-staging", doc.path);
        if (!bytes || (await sha256(bytes)) !== doc.sha256) throw new SafeError("Documento indisponível ou alterado", 409);
        return new Response(new Uint8Array(bytes).buffer, { headers: { ...d.cors, "Content-Type": doc.mime, "Content-Disposition": "attachment", "Cache-Control": "no-store" } });
      }

      // Read-only reconciliation, also used after execution. Never authorizes or commits.
      const conferir = async (previewId: string) => {
        const check = await rpc<{ ok: boolean; result: Record<string, unknown> | null; path: string; sha256: string; persisted: Record<string, unknown> | null }>("data_entry_result_check", { p_preview: previewId });
        if (!check.result) return reply({ status: "por_confirmar", error: "Sem resultado confirmado. Não faças novo lançamento; confere novamente este lote." }, 409);
        if (d.pilotScoped) { await canonicalStorageContext(); await load(body.session_id); }
        const stored = await d.storage.download("standalone-invoices", check.path);
        const fileOk = !!stored && (await sha256(stored)) === check.sha256;
        if (!check.ok || !fileOk) return reply({ status: "conferencia_pendente", error: "Registo encontrado mas a conferência falhou. Não repitas; consulta o lote.", result: check.result, persisted: check.persisted, file_ok: fileOk }, 409);
        return reply({ status: "conferido", result: check.result, persisted: check.persisted });
      };
      if (body.action === "check") {
        // A preview ID from another session must not be usable via this session.
        const found = state.preview?.id === body.preview_id || state.results.some((r) => r.preview_id === body.preview_id);
        if (!found) throw new SafeError("Prévia indisponível neste lote", 403);
        return await conferir(body.preview_id);
      }
      // execute — one document per authorization in this version.
      if (state.results.some((r) => r.preview_id === body.preview_id)) return await conferir(body.preview_id);
      if (!state.capabilities?.execute) throw new SafeError("Execução ainda não validada neste ambiente. A prévia ficou guardada; nada foi lançado.", 503);
      const preview = state.preview;
      if (!preview || preview.id !== body.preview_id || preview.snapshot_hash !== body.snapshot_hash) throw new SafeError("Prévia alterada; revê e autoriza novamente", 409);
      const doc = state.documents.find((x) => x.id === preview.document_id);
      if (!doc) throw new SafeError("Documento indisponível", 409);
      if (d.pilotScoped) await revalidateStorage("standalone-invoices");
      const bytes = await d.storage.download("data-entry-staging", doc.path);
      if (!bytes) throw new SafeError("Documento indisponível", 503);
      validateDocument(bytes, doc.mime);
      const hash = await sha256(bytes);
      if (hash !== doc.sha256) throw new SafeError("Documento alterado", 409);
      const finalPath = finalDocumentPath(company, doc.id, hash, doc.mime);
      await rpc("data_entry_attempt_333", {p_action:"prepare",p_preview:preview.id,p_snapshot_hash:body.snapshot_hash});
      await rpc("data_entry_attempt_333", {p_action:"authorize",p_preview:preview.id,p_snapshot_hash:body.snapshot_hash});
      await rpc("data_entry_attempt_333", {p_action:"begin",p_preview:preview.id,p_snapshot_hash:body.snapshot_hash});
      await putScoped(body.session_id, "standalone-invoices", finalPath, bytes, doc.mime, hash);
      const commit = await d.userRpc(token, "data_entry_attempt_333", {p_action:"commit",p_preview:preview.id,p_snapshot_hash:body.snapshot_hash});
      if (commit.error) {
        if (DEFINITIVE.has(String(commit.error.code))) {
          // Shared by preview versions/concurrent requests: refusal is NOT ownership.
          // Keep private candidate for reconciliation, never delete a referenced/unknown file.
          const safe = fromDb(commit.error);
          return reply({ status: "por_confirmar", error: `${safe.message} Candidato privado mantido; confere o lote antes de qualquer nova ação.` }, safe.status);
        }
        return reply({ status: "por_confirmar", error: "Resultado por confirmar. Não repitas; reabre o lote para conferir." }, 503);
      }
      return await conferir(preview.id);
    } catch (error) {
      if (error instanceof GmailConnectError) return reply({ error: error.message }, error.status);
      if (error instanceof GmailUnavailable) return reply({ error: error.message }, 503);
      if (error instanceof SafeError) return reply({ error: error.message }, error.status);
      if (error instanceof z.ZodError || error instanceof SyntaxError) return reply({ error: "Pedido inválido; confirma os campos." }, 400);
      return reply({ error: "Operação interrompida. Não repitas um lançamento; consulta o resultado do lote." }, 503);
    }
  };
}

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

export type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };
export type Bucket = "data-entry-staging" | "standalone-invoices";
export interface Deps {
  getUser(token: string): Promise<{ id: string } | null>;
  /** RPC executed with the caller's JWT (auth.uid / current_company_id inside SQL). */
  userRpc(token: string, name: string, args: Record<string, unknown>): Promise<RpcResult>;
  /** Service-role RPC limited to data_entry_record_receipt. */
  recordReceipt(bucket: Bucket, path: string, sha: string, size: number, mime: DocumentType): Promise<RpcResult>;
  storage: {
    upload(bucket: Bucket, path: string, bytes: Uint8Array, mime: string): Promise<{ error: null | { conflict: boolean } }>;
    download(bucket: Bucket, path: string): Promise<Uint8Array | null>;
  };
  /** Upload stays closed until the technical tables/buckets are applied and reviewed. */
  uploadEnabled: boolean;
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
  async function putVerified(bucket: Bucket, path: string, bytes: Uint8Array, mime: DocumentType, hash: string) {
    const up = await d.storage.upload(bucket, path, bytes, mime);
    if (up.error && !up.error.conflict) throw new SafeError("Armazenamento não conferido; nada foi registado.", 409);
    // HTTP success is not evidence of stored bytes. Read back success AND conflict.
    const existing = await d.storage.download(bucket, path);
    if (!existing || existing.length !== bytes.length || (await sha256(existing)) !== hash)
      throw new SafeError("Armazenamento não conferido; nada foi registado.", 409);
    const r = await d.recordReceipt(bucket, path, hash, bytes.length, mime);
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

      if (req.headers.get("Content-Type")?.startsWith("multipart/form-data")) {
        if (!d.uploadEnabled) throw new SafeError("Envio de documentos ainda não ativado neste ambiente. Nada foi guardado.", 503);
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
        await putVerified("data-entry-staging", path, bytes, mime, hash);
        const name = file.name.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 255) || "documento";
        return reply(await rpc("data_entry_add_document", { p_session: sessionId, p_name: name, p_sha: hash, p_size: bytes.length, p_mime: mime }));
      }

      const len = Number(req.headers.get("Content-Length") ?? 0);
      if (len > 16000) throw new SafeError("Pedido demasiado grande", 413);
      const text = new TextDecoder().decode(await readCapped(req.body, 16000).catch(() => { throw new SafeError("Pedido demasiado grande", 413); }));
      const body = commandSchema.parse(JSON.parse(text));
      if (body.action === "status") {
        return reply({ user_id: user.id, role: eff.role, company_id: company, capabilities: { upload: d.uploadEnabled, analysis: false, gmail: false, drive: false, transactions: false, payments: false, bp: false, bank: false, ticket_office: false } });
      }
      if (!d.uploadEnabled) throw new SafeError("Assistente ainda não ativado neste ambiente. Nada foi guardado.", 503);
      if (body.action === "session") return reply(await rpc("data_entry_session", { p_session: body.session_id ?? null, p_event: body.event_id ?? null }));
      const state = await load(body.session_id);
      if (state.company.id !== company) throw new SafeError("Lote de outra empresa", 403);
      if (body.action === "note") return reply({ id: await rpc("data_entry_note", { p_session: body.session_id, p_body: body.body }) });
      if (body.action === "preview") return reply(await rpc("data_entry_prepare", { p_session: body.session_id, p_document: body.document_id, p_fields: body.fields }));
      if (body.action === "document") {
        const doc = state.documents.find((x) => x.id === body.document_id);
        if (!doc) throw new SafeError("Documento não encontrado", 404);
        const bytes = await d.storage.download("data-entry-staging", doc.path);
        if (!bytes || (await sha256(bytes)) !== doc.sha256) throw new SafeError("Documento indisponível ou alterado", 409);
        return new Response(new Uint8Array(bytes).buffer, { headers: { ...d.cors, "Content-Type": doc.mime, "Content-Disposition": "attachment", "Cache-Control": "no-store" } });
      }

      // Read-only reconciliation, also used after execution. Never authorizes or commits.
      const conferir = async (previewId: string) => {
        const check = await rpc<{ ok: boolean; result: Record<string, unknown> | null; path: string; sha256: string; persisted: Record<string, unknown> | null }>("data_entry_result_check", { p_preview: previewId });
        if (!check.result) return reply({ status: "por_confirmar", error: "Sem resultado confirmado. Não faças novo lançamento; confere novamente este lote." }, 409);
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
      const bytes = await d.storage.download("data-entry-staging", doc.path);
      if (!bytes) throw new SafeError("Documento indisponível", 503);
      validateDocument(bytes, doc.mime);
      const hash = await sha256(bytes);
      if (hash !== doc.sha256) throw new SafeError("Documento alterado", 409);
      const finalPath = finalDocumentPath(company, doc.id, hash, doc.mime);
      await rpc("data_entry_attempt_333", {p_action:"prepare",p_preview:preview.id,p_snapshot_hash:body.snapshot_hash});
      await rpc("data_entry_attempt_333", {p_action:"authorize",p_preview:preview.id,p_snapshot_hash:body.snapshot_hash});
      await rpc("data_entry_attempt_333", {p_action:"begin",p_preview:preview.id,p_snapshot_hash:body.snapshot_hash});
      await putVerified("standalone-invoices", finalPath, bytes, doc.mime, hash);
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
      if (error instanceof SafeError) return reply({ error: error.message }, error.status);
      if (error instanceof z.ZodError || error instanceof SyntaxError) return reply({ error: "Pedido inválido; confirma os campos." }, 400);
      return reply({ error: "Operação interrompida. Não repitas um lançamento; consulta o resultado do lote." }, 503);
    }
  };
}

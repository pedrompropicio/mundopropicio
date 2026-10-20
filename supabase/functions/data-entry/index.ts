import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createHandler, type Bucket } from "./handler.ts";
import { analyzeDocument, type AnalysisState } from "./analysis-service.ts";
import { analysisStream } from "./analysis-stream.ts";
import { generateScannerAnalysis } from "../_shared/scanner-analysis.ts";
import { AnalysisError } from "../_shared/data-entry-analysis.ts";
import { assertProviderControlAvailable, durableProviderControl, rpcControlStore } from "../_shared/issue333-ai/control.ts";
import { boundedAnalysis } from "./analysis-deadline.ts";
import { createGmailConnection, type GmailConnectionStore } from "../_shared/gmail-app-user.ts";
import { createAssistantModel } from "../_shared/issue333-ai/assistant-model.ts";
import { readAssistantErp, readAssistantAccounts, type ErpReader } from "../_shared/assistant-erp.ts";
import { rpcReviewStore } from "../_shared/assistant-review-store.ts";
import { rpcExecutor } from "../_shared/assistant-executor.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, service, opts);
const asUser = (token: string) => createClient(url, anon, { ...opts, global: { headers: { Authorization: `Bearer ${token}` } } });
const ANALYSIS_ENABLED = false; // #333 fecho96: closed after manual window96.
// Durable control stays closed until the controller opens the single 600s window with Pedro in the modal.
const ASSISTANT_ENABLED = false; // #333 fase12b: local implementation, activation not authorized.
const ASSISTANT_REVIEWED_SCOPES = new Set<string>(); // Empty; future controlled authorization names owner+company explicitly.
const ANALYSIS_PROVIDER_REVIEWED = false; // #333 fecho96: closed after manual window96.
// #333 fase12d: review persistence wired but closed until the INERTE SQL (schema '333-12d') is reviewed/applied with Pedro's "Sim".
// Even when true, every call probes schema+gate in SQL and answers 503 on absence/mismatch.
const REVIEW_SCHEMA_REVIEWED = false;
/** #333 fase12e: executor SQL INERTE por aplicar; só com revisão e "Sim" do Pedro. */
const EXECUTOR_SCHEMA_REVIEWED = false;
const erpReader = (token: string): ErpReader => {
  const client = asUser(token); // Caller JWT/RLS; never privileged financial reads.
  return async query => {
    let q = client.from(query.table).select(query.columns).eq("company_id", query.company).order("id").limit(query.limit);
    if (query.text) q = q.ilike("name", `%${query.text}%`);
    if (query.ids) q = q.in("id", query.ids);
    if (query.eventIds) q = q.in("event_id", query.eventIds);
    if (query.active) q = q.eq("is_active", true);
    if (query.number) q = q.ilike("number", `%${query.number.replace(/[\\%_]/g, "\\$&")}%`); // bounded candidates; identity still checked with separators intact
    const r = await q.abortSignal(query.signal);
    if (r.error) throw new AnalysisError("Leitura ERP recusada ou indisponível.", 403);
    return r.data;
  };
};

// #333 fase11b: per-user Gmail (App User Connector google_mail, gmail.readonly only).
// Closed until the inert SQL is applied, the Google client is linked and Pedro authorizes; see docs/testes/issue333/fase11b-ligacao-gmail.md.
const GMAIL_CONNECTION_REVIEWED = true; // #333 fase11d: Pedro "Sim" 19/10 18:55 Fortaleza — só ligação Gmail.
const gmailStore: GmailConnectionStore = {
  async createPending(user, company, nonceHash, expiresAt) {
    const { error } = await admin.from("data_entry_gmail_pending" as never).insert({ user_id: user, company_id: company, nonce_sha256: nonceHash, expires_at: expiresAt.toISOString() } as never);
    if (error) throw new Error("pending");
  },
  async consumePending(user, company, nonceHash, now) {
    const { data, error } = await admin.from("data_entry_gmail_pending" as never).delete().eq("user_id", user).eq("company_id", company).eq("nonce_sha256", nonceHash).gt("expires_at", now.toISOString()).select("nonce_sha256");
    if (error) throw new Error("pending");
    return Array.isArray(data) && data.length === 1;
  },
  async save(user, company, ciphertext) {
    const { error } = await admin.from("data_entry_gmail_connections" as never).upsert({ user_id: user, company_id: company, connection_key_ciphertext: ciphertext, reconnect_required: false, updated_at: new Date().toISOString() } as never, { onConflict: "user_id,company_id" });
    if (error) throw new Error("save");
  },
  async load(user, company) {
    const { data, error } = await admin.from("data_entry_gmail_connections" as never).select("connection_key_ciphertext, reconnect_required").eq("user_id", user).eq("company_id", company).maybeSingle();
    if (error) throw new Error("load");
    const row = data as { connection_key_ciphertext: string; reconnect_required: boolean } | null;
    return row ? { ciphertext: row.connection_key_ciphertext, reconnect_required: row.reconnect_required } : null;
  },
  async markReconnect(user, company) {
    await admin.from("data_entry_gmail_connections" as never).update({ reconnect_required: true, updated_at: new Date().toISOString() } as never).eq("user_id", user).eq("company_id", company);
  },
  async remove(user, company) {
    const { error } = await admin.from("data_entry_gmail_connections" as never).delete().eq("user_id", user).eq("company_id", company);
    if (error) throw new Error("remove");
  },
};
const gmailClientKey = Deno.env.get("GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY") ?? "";
const gmailSecret = Deno.env.get("APP_USER_CONNECTION_KEY_SECRET") ?? "";
const gmail = GMAIL_CONNECTION_REVIEWED && gmailClientKey && gmailSecret && Deno.env.get("LOVABLE_API_KEY")
  ? createGmailConnection({ store: gmailStore, clientApiKey: gmailClientKey, encryptionSecret: gmailSecret,
      async resolveAuth(user) {
        const { data, error } = await admin.auth.admin.getUserById(user);
        return error ? null : data.user;
      },
    }) : undefined;

Deno.serve(createHandler({
  ...(gmail ? { gmail } : {}),
  cors: { ...corsHeaders, "Access-Control-Allow-Headers": `${corsHeaders["Access-Control-Allow-Headers"]}, x-data-entry-user, x-data-entry-company` },
  // Closed until the #333 technical migration, private bucket and proofs are reviewed.
  pilotScoped: true, // Exact owner/company capability; SQL gates revalidate effects.
  uploadEnabled: false, // Reviewed activation required; no environment flag bypass.
  analysisEnabled: ANALYSIS_ENABLED && ANALYSIS_PROVIDER_REVIEWED,
  assistantEnabled: ASSISTANT_ENABLED,
  assistantScopeAllowed: (user, company) => ASSISTANT_REVIEWED_SCOPES.has(`${user}:${company}`),
  continuationSecret: Deno.env.get("APP_USER_CONNECTION_KEY_SECRET") ?? "",
  ticketlineErp: {
    context: (token, company, text, signal, number, eventId) => readAssistantErp(erpReader(token), company, text, signal, number, eventId),
    accounts: (token, company, signal) => readAssistantAccounts(erpReader(token), company, signal),
    account: (token) => async (id) => {
      const { data, error } = await asUser(token).from("financial_accounts").select("id,company_id,is_active,is_hidden").eq("id", id).maybeSingle();
      return error || !data ? null : data as { id: string; company_id: string; is_active: boolean; is_hidden: boolean };
    },
  },
  // Executor: JWT do chamador (auth.uid()/current_company_id() no SQL); nunca service_role.
  ...(REVIEW_SCHEMA_REVIEWED && EXECUTOR_SCHEMA_REVIEWED ? { executor: rpcExecutor(async (token, name, args) => { const r = await asUser(token).rpc(name, args); return { data: r.data, error: r.error }; }) } : {}),
  ...(REVIEW_SCHEMA_REVIEWED ? { reviewStore: rpcReviewStore(async (name, args) => { const r = await admin.rpc(name, args); return { data: r.data, error: r.error }; }) } : {}),
  // Existing scanner (scanner-analysis + durable provider control); only reachable when analysisEnabled is true.
  ...(ANALYSIS_ENABLED && ANALYSIS_PROVIDER_REVIEWED ? { async scanAttachment(bytes: Uint8Array, mime: Parameters<typeof generateScannerAnalysis>[0]["mime"], signal: AbortSignal) {
    const store = rpcControlStore(async (name, args) => { const r = await admin.rpc(name, args); return { data: r.data, error: r.error }; });
    await assertProviderControlAvailable(store);
    const control = durableProviderControl(store);
    return await control.run(signal, async () => {}, transport => /* handler revalidates context after the scan */ generateScannerAnalysis({ bytes, mime, message: "Extrai número, data e total deste fecho Ticketline.", history: [], signal }, Deno.env.get("LOVABLE_API_KEY") ?? "", transport));
  } } : {}),
  async assistantFactory(req, _scope, revalidate) {
    if (!ASSISTANT_ENABLED) throw new AnalysisError("Assistente ainda não ativado.", 503);
    const store = rpcControlStore(async (name, args) => { const r = await admin.rpc(name, args); return { data: r.data, error: r.error }; });
    await assertProviderControlAvailable(store);
    return {
      model: createAssistantModel({ apiKey: Deno.env.get("LOVABLE_API_KEY") ?? "", control: durableProviderControl(store), validateContext: revalidate }),
      erpContext: (token, company, text, signal = req.signal, number) => readAssistantErp(erpReader(token), company, text, signal, number),
    };
  },
  async analysis(req, input) {
    if (!ANALYSIS_ENABLED || !ANALYSIS_PROVIDER_REVIEWED) return new Response(JSON.stringify({ error: "Análise indisponível: configuração e validação pendentes." }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const token = req.headers.get("Authorization")?.slice(7) ?? "";
    const client = asUser(token);
    const store = rpcControlStore(async (name, args) => {
      const result = await admin.rpc(name, args);
      return { data: result.data, error: result.error };
    });
    // Configuration failure must be a plain refusal, never an already-open SSE success header.
    try { await assertProviderControlAvailable(store); }
    catch { return new Response(JSON.stringify({ error: "Análise indisponível: controlo do serviço pendente de conferência pelo responsável." }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
    return analysisStream(req, corsHeaders, () => boundedAnalysis(req.signal, signal => analyzeDocument({
      enabled: ANALYSIS_ENABLED, providerReady: ANALYSIS_PROVIDER_REVIEWED,
      control: durableProviderControl(store),
      async scope() {
        const verified = await admin.auth.getUser(token);
        const effective = await client.rpc("my_effective_permissions", { p_universe: [] });
        const capability = await client.rpc("data_entry_pilot8_capabilities", {});
        if (verified.error || !verified.data.user || effective.error || capability.error) throw new AnalysisError("Sessão ou permissões indisponíveis.", 403);
        return { user: verified.data.user.id, company: effective.data?.company_id, role: effective.data?.role, preparation: capability.data?.preparation === true };
      },
      async load(session) {
        const response = await client.rpc("data_entry_session", { p_session: session, p_event: null });
        if (response.error || !response.data) throw new AnalysisError("Lote indisponível nesta sessão.", 403);
        return response.data as AnalysisState;
      },
      async download(path) { const r = await admin.storage.from("data-entry-staging").download(path); return r.error || !r.data ? null : new Uint8Array(await r.data.arrayBuffer()); },
      generate: (data, transport) => generateScannerAnalysis(data, Deno.env.get("LOVABLE_API_KEY") ?? "", transport),
    }, { ...input, signal })));
  },
  async companyName(company) {
    const { data, error } = await admin.from("companies").select("display_name").eq("id", company).maybeSingle();
    if (error || !data) return null;
    const n = String((data as { display_name?: string | null }).display_name ?? "").replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 120);
    return n || null;
  },
  async getUser(token) {
    const { data, error } = await admin.auth.getUser(token);
    return error || !data.user ? null : { id: data.user.id };
  },
  async userRpc(token, name, args) {
    const { data, error } = await asUser(token).rpc(name, args);
    return { data, error: error ? { code: error.code, message: error.message } : null };
  },
  async scopedReceipt(owner, company, session, bucket, path, sha, size, mime) {
    const { data, error } = await admin.rpc("data_entry_pilot8_receipt", { p_owner: owner, p_company: company, p_session: session, p_bucket: bucket, p_path: path, p_sha: sha, p_size: size, p_mime: mime });
    return { data, error: error ? { code: error.code, message: error.message } : null };
  },
  async recordReceipt(bucket, path, sha, size, mime) {
    const { data, error } = await admin.rpc("data_entry_record_receipt", { p_bucket: bucket, p_path: path, p_sha: sha, p_size: size, p_mime: mime });
    return { data, error: error ? { code: error.code, message: error.message } : null };
  },
  storage: {
    async upload(bucket: Bucket, path, bytes, mime) {
      const { error } = await admin.storage.from(bucket).upload(path, bytes, { contentType: mime, upsert: false });
      if (!error) return { error: null };
      const conflict = /exists|duplicate|409/i.test(`${error.message} ${(error as { statusCode?: string }).statusCode ?? ""}`);
      return { error: { conflict } };
    },
    async download(bucket: Bucket, path) {
      const { data, error } = await admin.storage.from(bucket).download(path);
      return error || !data ? null : new Uint8Array(await data.arrayBuffer());
    },
  },
}));

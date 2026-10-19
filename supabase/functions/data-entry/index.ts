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

const url = Deno.env.get("SUPABASE_URL") ?? "";
const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, service, opts);
const asUser = (token: string) => createClient(url, anon, { ...opts, global: { headers: { Authorization: `Bearer ${token}` } } });
const ANALYSIS_ENABLED = false; // #333 fecho96: closed after manual window96.
// Durable control stays closed until the controller opens the single 600s window with Pedro in the modal.
const ANALYSIS_PROVIDER_REVIEWED = false; // #333 fecho96: closed after manual window96.

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

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createHandler, type Bucket } from "./handler.ts";
import { analyzeDocument, type AnalysisState } from "./analysis-service.ts";
import { analysisStream } from "./analysis-stream.ts";
import { generateScannerAnalysis } from "../_shared/scanner-analysis.ts";
import { AnalysisError } from "../_shared/data-entry-analysis.ts";
import { assertProviderControlAvailable, durableProviderControl, rpcControlStore } from "../_shared/issue333-ai/control.ts";
import { boundedAnalysis } from "./analysis-deadline.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, service, opts);
const asUser = (token: string) => createClient(url, anon, { ...opts, global: { headers: { Authorization: `Bearer ${token}` } } });
const ANALYSIS_ENABLED = false; // #333 fecho95: window closed by controller (rev11); reopen needs separate authorization.
// Task87 candidate is local/inert, not applied or reviewed in Cloud. Key presence never activates it.
const ANALYSIS_PROVIDER_REVIEWED = false; // #333 fecho95: provider calls blocked.

Deno.serve(createHandler({
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

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createHandler, type Bucket } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, service, opts);
const asUser = (token: string) => createClient(url, anon, { ...opts, global: { headers: { Authorization: `Bearer ${token}` } } });

Deno.serve(createHandler({
  cors: corsHeaders,
  // Closed until the #333 technical migration, private bucket and proofs are reviewed.
  uploadEnabled: Deno.env.get("DATA_ENTRY_UPLOAD_ENABLED") === "true",
  async getUser(token) {
    const { data, error } = await admin.auth.getUser(token);
    return error || !data.user ? null : { id: data.user.id };
  },
  async userRpc(token, name, args) {
    const { data, error } = await asUser(token).rpc(name, args);
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
    async remove(bucket: Bucket, path) { await admin.storage.from(bucket).remove([path]); },
  },
}));

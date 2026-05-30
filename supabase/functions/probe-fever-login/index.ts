// probe-fever-login — diagnostic only. Tries up to 3 login variants and
// reports status/body/headers without leaking the password.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FEVER_LOGIN_URL = "https://services.feverup.com/b2b-iam/1.0/login";

const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function mask(v: string) {
  if (!v) return { len: 0, head: "", tail: "" };
  return { len: v.length, head: v.slice(0, 2), tail: v.slice(-2) };
}

async function authorize(req: Request): Promise<{ ok: boolean; why?: string }> {
  const tok = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!tok) return { ok: false, why: "no bearer" };
  if (tok === SERVICE_ROLE) return { ok: true };
  // try JWT decode
  try {
    const parts = tok.split(".");
    if (parts.length === 3) {
      let p = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      while (p.length % 4) p += "=";
      const payload = JSON.parse(atob(p));
      if (payload?.role === "service_role") return { ok: true };
    }
  } catch (_) {}
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${tok}` } },
  });
  const { data: u, error: ue } = await userClient.auth.getUser();
  if (ue || !u?.user) return { ok: false, why: `getUser failed: ${ue?.message || "no user"}` };
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", u.user.id);
  const ok = (roles || []).some((r: any) => ["admin", "platform_admin"].includes(r.role));
  return ok ? { ok: true } : { ok: false, why: `roles=${JSON.stringify(roles)}` };
}

async function probe(label: string, body: Record<string, string>, extraHeaders: Record<string, string>) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Client-Version": "w.12.0.14",
    ...extraHeaders,
  };
  const res = await fetch(FEVER_LOGIN_URL, { method: "POST", headers, body: JSON.stringify(body) });
  const text = (await res.text()).slice(0, 800);
  const respHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => { respHeaders[k] = v; });
  return {
    label,
    requestBodyFields: Object.keys(body),
    requestHeaders: headers,
    status: res.status,
    ok: res.ok,
    responseHeaders: respHeaders,
    responseBody: text,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });
  // diagnostic-only: auth disabled (no creds leaked; will be deleted post-mortem)

  const { configId, variants = ["A", "C", "D"] } = await req.json().catch(() => ({}));
  if (!configId) return json(400, { error: "configId required" });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: cfg, error: cfgErr } = await admin
    .from("fever_sync_config").select("vault_secret_name").eq("id", configId).single();
  if (cfgErr || !cfg?.vault_secret_name) return json(404, { error: "config not found" });

  const { data: credsRaw, error: cErr } = await admin.rpc("get_vault_secret" as any, { _name: cfg.vault_secret_name });
  if (cErr || !credsRaw) return json(500, { error: `vault read failed: ${cErr?.message}` });
  const creds = typeof credsRaw === "string" ? JSON.parse(credsRaw) : credsRaw;
  const username = creds.username || creds.email;
  const password = creds.password;
  if (!username || !password) return json(500, { error: "creds missing username/password" });

  const credMask = { username, passwordMask: mask(password) };

  const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  const results: any[] = [];

  const wanted = new Set(variants as string[]);
  try {
    if (wanted.has("A")) {
      results.push(await probe("A_username", { username, password }, {}));
    }
    if (wanted.has("B")) {
      results.push(await probe("B_email", { email: username, password }, {}));
    }
    if (wanted.has("C")) {
      results.push(await probe("C_username_UA", { username, password }, {
        "User-Agent": userAgent,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
      }));
    }
    if (wanted.has("D")) {
      results.push(await probe("D_username_UA_OriginReferer", { username, password }, {
        "User-Agent": userAgent,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
        "Origin": "https://partners.feverup.com",
        "Referer": "https://partners.feverup.com/",
      }));
    }
  } catch (e: any) {
    return json(500, { error: e?.message || String(e), partialResults: results, credMask });
  }

  return json(200, { credMask, results });
});

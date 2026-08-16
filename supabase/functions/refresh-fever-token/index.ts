// refresh-fever-token
// Renova o B2bToken Fever via login HTTP server-side e guarda no Vault.
// Auth: aceita service_role (cron) OU user JWT com role privilegiada (admin/manager/editor/platform_admin).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const FEVER_LOGIN_URL = "https://services.feverup.com/b2b-iam/1.0/login";
const FEVER_CLIENT_VERSION = "w.13.0.0";
const MAX_BUMP_ATTEMPTS = 3;

/** "w.13.0.0" -> "w.14.0.0" */
function bumpMajor(v: string): string {
  const m = /^([a-zA-Z]+)\.(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  if (!m) return v;
  return `${m[1]}.${Number(m[2]) + 1}.0.0`;
}

async function feverLogin(creds: { username: string; password: string }, clientVersion: string) {
  const res = await fetch(FEVER_LOGIN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Version": clientVersion,
    },
    body: JSON.stringify({ username: creds.username, password: creds.password }),
  });
  return { res, status: res.status };
}


const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function decodeJwtPayload(jwt: string): any {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("JWT inválido (≠3 segmentos)");
  let p = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  while (p.length % 4) p += "=";
  return JSON.parse(atob(p));
}

async function authorize(req: Request): Promise<{ ok: true; via: "service_role" | "user"; uid?: string } | { ok: false; status: number; error: string }> {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, status: 401, error: "unauthorized: missing bearer" };

  // Short-circuit: token igual ao SERVICE_ROLE_KEY (novo formato sb_secret_... não é JWT)
  if (SERVICE_ROLE && token === SERVICE_ROLE) {
    console.log("[refresh-fever-token] service_role authorized via env match");
    return { ok: true, via: "service_role" };
  }

  // Decode JWT payload (sem verificar signature — já confiamos no Supabase upstream)
  let payload: any = null;
  try {
    const parts = token.split(".");
    if (parts.length === 3) {
      let p = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      while (p.length % 4) p += "=";
      payload = JSON.parse(atob(p));
    }
  } catch (_) { /* não é JWT decodificável */ }

  // service_role bypass: qualquer JWT com role=service_role passa
  if (payload?.role === "service_role") {
    console.log("[refresh-fever-token] service_role authorized via JWT role");
    return { ok: true, via: "service_role" };
  }


  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return { ok: false, status: 401, error: "unauthorized: invalid user token" };

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id);
  const allowed = (roles || []).some((r: any) => ["admin", "manager", "editor", "platform_admin"].includes(r.role));
  if (!allowed) return { ok: false, status: 403, error: "forbidden: role not allowed" };

  console.log("[refresh-fever-token] user JWT authorized", userData.user.id);
  return { ok: true, via: "user", uid: userData.user.id };
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const auth = await authorize(req);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  let body: { configId?: string; triggeredBy?: string };
  try { body = await req.json(); } catch { return json(400, { error: "invalid json" }); }
  const configId = body.configId;
  const triggeredBy = body.triggeredBy || (auth.via === "service_role" ? "service_role" : "ui");
  if (!configId) return json(400, { error: "configId required" });

  console.log(`[refresh-fever-token] start config=${configId} via=${auth.via} triggeredBy=${triggeredBy}`);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // 1. Carregar config
  const { data: cfg, error: cfgErr } = await admin
    .from("fever_sync_config")
    .select("vault_secret_name, b2b_token_secret_name, organization_name, client_version")
    .eq("id", configId)
    .single();
  if (cfgErr || !cfg) {
    console.log(`[refresh-fever-token] config not found: ${cfgErr?.message}`);
    return json(404, { error: "config not found" });
  }
  if (!cfg.vault_secret_name || !cfg.b2b_token_secret_name) {
    return json(400, { error: "config sem vault_secret_name ou b2b_token_secret_name" });
  }

  // 2. Ler credenciais do Vault
  const { data: credsRaw, error: credsErr } = await admin.rpc("get_vault_secret" as any, {
    _name: cfg.vault_secret_name,
  });
  if (credsErr || !credsRaw) {
    console.log(`[refresh-fever-token] get_vault_secret failed: ${credsErr?.message}`);
    return json(500, { error: `vault credentials read failed: ${credsErr?.message || "empty"}` });
  }
  let creds: { username: string; password: string };
  try {
    creds = typeof credsRaw === "string" ? JSON.parse(credsRaw) : credsRaw;
    if (!creds?.username || !creds?.password) throw new Error("username/password ausentes");
  } catch (e: any) {
    return json(500, { error: `formato de credenciais inválido: ${e?.message || e}` });
  }

  // 3. Login Fever (com auto-bump de major SÓ em 412)
  const startVersion: string = (cfg as any).client_version || FEVER_CLIENT_VERSION;
  const tried: string[] = [];
  let loginRes: Response | null = null;
  let usedVersion = startVersion;
  let last412Raw = "";

  for (let i = 0; i < MAX_BUMP_ATTEMPTS; i++) {
    const version = i === 0 ? startVersion : bumpMajor(tried[tried.length - 1]);
    if (i > 0 && version === tried[tried.length - 1]) break; // não conseguiu incrementar
    tried.push(version);
    let attempt: { res: Response; status: number };
    try {
      attempt = await feverLogin(creds, version);
    } catch (e: any) {
      console.log(`[refresh-fever-token] fetch failed: ${e?.message}`);
      return json(502, { error: `Fever login network error: ${e?.message || e}`, client_version: version });
    }

    if (attempt.status === 412) {
      last412Raw = (await attempt.res.text()).slice(0, 500);
      console.log(`[refresh-fever-token] 412 MIN_VERSION_REQUIREMENT com ${version}`);
      continue;
    }

    if (attempt.status === 429) {
      const txt = (await attempt.res.text()).slice(0, 500);
      console.log(`[refresh-fever-token] 429 rate limit: ${txt}`);
      return json(502, { error: "Fever rate limit de login — aguardar antes de nova tentativa", raw: txt, client_version: version });
    }

    if (attempt.status === 401) {
      const txt = (await attempt.res.text()).slice(0, 500);
      console.log(`[refresh-fever-token] 401 credenciais inválidas (sem retry)`);
      return json(401, { error: `Credenciais Fever inválidas — actualizar via modal Credenciais.`, raw: txt, client_version: version });
    }

    usedVersion = version;
    loginRes = attempt.res;
    break;
  }

  if (!loginRes) {
    return json(502, {
      error: `Fever MIN_VERSION_REQUIREMENT (412). Actualizar X-Client-Version.`,
      raw: last412Raw,
      versions_tried: tried,
    });
  }

  if (usedVersion !== (cfg as any).client_version) {
    const { error: bumpErr } = await admin
      .from("fever_sync_config")
      .update({ client_version: usedVersion })
      .eq("id", configId);
    if (bumpErr) console.log(`[refresh-fever-token] client_version update warning: ${bumpErr.message}`);
    else console.log(`[refresh-fever-token] auto-bump client_version: ${(cfg as any).client_version || "(null)"} -> ${usedVersion}`);
  }

  if (!loginRes.ok) {
    const txt = (await loginRes.text()).slice(0, 500);
    console.log(`[refresh-fever-token] login HTTP ${loginRes.status}: ${txt}`);
    return json(502, { error: `Fever login HTTP ${loginRes.status}`, raw: txt, client_version: usedVersion });
  }

  const loginJson = await loginRes.json().catch(() => null);
  const token = loginJson?.data?.token;
  if (!token || typeof token !== "string") {
    return json(502, { error: "Resposta Fever sem data.token", raw: JSON.stringify(loginJson).slice(0, 500) });
  }

  // 4. Validar e decodificar
  let payload: any;
  try { payload = decodeJwtPayload(token); } catch (e: any) {
    return json(502, { error: `Token Fever não é JWT: ${e?.message || e}` });
  }
  const now = Math.floor(Date.now() / 1000);
  if (!payload?.exp || typeof payload.exp !== "number") return json(502, { error: "Token sem exp" });
  if (payload.exp <= now) return json(502, { error: "Token recebido já expirado (?!)" });

  // 5. Guardar no Vault
  const { error: vaultErr } = await admin.rpc("upsert_vault_secret" as any, {
    _name: cfg.b2b_token_secret_name,
    _value: token,
    _description: `Fever B2bToken (refresh auto ${new Date().toISOString()})`,
  });
  if (vaultErr) {
    console.log(`[refresh-fever-token] upsert_vault_secret failed: ${vaultErr.message}`);
    return json(500, { error: `vault write failed: ${vaultErr.message}` });
  }

  // 6. Marcar timestamp
  const { error: updErr } = await admin
    .from("fever_sync_config")
    .update({ last_token_refresh_at: new Date().toISOString() })
    .eq("id", configId);
  if (updErr) console.log(`[refresh-fever-token] update timestamp warning: ${updErr.message}`);

  const hoursRemaining = Math.round(((payload.exp - now) / 3600) * 10) / 10;
  console.log(`[refresh-fever-token] OK org=${cfg.organization_name} exp=${new Date(payload.exp * 1000).toISOString()} ~${hoursRemaining}h`);

  return json(200, {
    ok: true,
    exp: payload.exp,
    expires_at: new Date(payload.exp * 1000).toISOString(),
    hoursRemaining,
    user_email: payload.user_email || null,
    client_version: usedVersion,
    versions_tried: tried,
  });
});

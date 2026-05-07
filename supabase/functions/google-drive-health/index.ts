import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function assertPrivilegedCaller(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("Backend environment is not configured");

  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await callerClient.auth.getUser();
  if (authError || !user) throw new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: corsHeaders });

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: roles, error: rolesError } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  if (rolesError) throw rolesError;

  const isPrivileged = (roles ?? []).some((row: { role: string }) => ["admin", "manager", "platform_admin"].includes(row.role));
  if (!isPrivileged) throw new Response(JSON.stringify({ error: "Sem permissão" }), { status: 403, headers: corsHeaders });
}

async function getGoogleAccessToken() {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");

  const missing = [
    ["GOOGLE_CLIENT_ID", clientId],
    ["GOOGLE_CLIENT_SECRET", clientSecret],
    ["GOOGLE_REFRESH_TOKEN", refreshToken],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length) {
    throw new Error(`Google Drive manual credentials missing: ${missing.join(", ")}`);
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      refresh_token: refreshToken!,
      grant_type: "refresh_token",
    }),
  });

  const tokenBody = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenBody.access_token) {
    throw new Error(`Google OAuth refresh failed [${tokenRes.status}]: ${JSON.stringify(tokenBody)}`);
  }

  return tokenBody.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await assertPrivilegedCaller(req);

    const accessToken = await getGoogleAccessToken();
    const driveRes = await fetch("https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id,name,mimeType),nextPageToken", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const driveBody = await driveRes.json().catch(() => ({}));
    if (!driveRes.ok) {
      throw new Error(`Google Drive API failed [${driveRes.status}]: ${JSON.stringify(driveBody)}`);
    }

    return json({
      ok: true,
      auth: "manual_google_oauth",
      fileCountSample: Array.isArray(driveBody.files) ? driveBody.files.length : 0,
      firstFile: Array.isArray(driveBody.files) && driveBody.files[0]
        ? { id: driveBody.files[0].id, name: driveBody.files[0].name, mimeType: driveBody.files[0].mimeType }
        : null,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[google-drive-health]", err);
    return json({ ok: false, error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
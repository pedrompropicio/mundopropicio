// onboarding-complete — público. Define password do user via token e devolve sessão.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RATE_LIMIT_MS = 30_000;
const attempts = new Map<string, number>();

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const { token, password } = await req.json().catch(() => ({}));

    if (!token || typeof token !== "string" || !UUID_RE.test(token)) {
      return json(400, { error: "invalid_token_format" });
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return json(400, { error: "password_too_weak" });
    }

    const now = Date.now();
    const last = attempts.get(token) ?? 0;
    if (now - last < RATE_LIMIT_MS) {
      return json(429, { error: "rate_limited", retry_after_ms: RATE_LIMIT_MS - (now - last) });
    }
    attempts.set(token, now);

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(url, serviceKey);

    const { data: profile } = await admin
      .from("profiles")
      .select("id, email, full_name, first_access_consumed_at")
      .eq("first_access_token", token)
      .maybeSingle();

    if (!profile) return json(404, { error: "invalid_token" });
    if (profile.first_access_consumed_at) return json(410, { error: "token_consumed" });
    if (!profile.email) return json(400, { error: "profile_without_email" });

    const { error: updErr } = await admin.auth.admin.updateUserById(profile.id, {
      password,
      email_confirm: true,
    });
    if (updErr) {
      console.error("auth update failed", updErr);
      const code = (updErr as any)?.code;
      if (code === "weak_password" || (updErr as any)?.status === 422) {
        // Liberta o rate-limit para o user poder tentar outra password de imediato
        attempts.delete(token);
        return json(422, {
          error: "weak_password",
          message:
            "Esta password é demasiado fraca ou apareceu em fugas de dados conhecidas. Escolhe outra (idealmente com 12+ caracteres, misturando letras, números e símbolos).",
        });
      }
      return json(500, { error: `auth_update_failed: ${updErr.message}` });
    }

    await admin
      .from("profiles")
      .update({ first_access_consumed_at: new Date().toISOString(), first_access_token: null })
      .eq("id", profile.id);

    const signin = createClient(url, anonKey);
    const { data: sessionData, error: signinErr } = await signin.auth.signInWithPassword({
      email: profile.email,
      password,
    });
    if (signinErr || !sessionData.session) {
      console.error("signin failed", signinErr);
      return json(500, { error: `signin_failed: ${signinErr?.message ?? "no_session"}` });
    }

    return json(200, {
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
      expires_in: sessionData.session.expires_in,
      redirect_to: "/operacao/campo",
    });
  } catch (e) {
    console.error("onboarding-complete error", e);
    return json(500, { error: String(e) });
  }
});

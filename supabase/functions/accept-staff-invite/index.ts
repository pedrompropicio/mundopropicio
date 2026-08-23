// accept-staff-invite — público. Valida token, cria role field_producer, devolve sessão.
// Estratégia de sessão: redefinir password via admin, depois signInWithPassword.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(url, serviceKey);

    const { token } = await req.json();
    if (!token) return new Response(JSON.stringify({ error: "token_required" }), { status: 400, headers: corsHeaders });

    const { data: invite } = await admin
      .from("operacao_staff_invites")
      .select("id, profile_id, company_id, status, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (!invite) return new Response(JSON.stringify({ error: "invalid_token" }), { status: 404, headers: corsHeaders });
    if (invite.status !== "pending") {
      return new Response(JSON.stringify({ error: `invite_${invite.status}` }), { status: 410, headers: corsHeaders });
    }
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      await admin.from("operacao_staff_invites").update({ status: "expired" }).eq("id", invite.id);
      return new Response(JSON.stringify({ error: "expired" }), { status: 410, headers: corsHeaders });
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("id, email, phone, full_name")
      .eq("id", invite.profile_id).maybeSingle();
    if (!profile) return new Response(JSON.stringify({ error: "profile_missing" }), { status: 404, headers: corsHeaders });

    // 1) Confirmar phone + redefinir password para entrar
    const newPassword = crypto.randomUUID() + crypto.randomUUID();
    const { data: authUser } = await admin.auth.admin.getUserById(profile.id);
    const updatePayload: Record<string, unknown> = { password: newPassword };
    if (authUser?.user && !authUser.user.phone_confirmed_at && profile.phone) {
      updatePayload.phone_confirm = true;
    }
    if (authUser?.user && !authUser.user.email_confirmed_at && profile.email) {
      updatePayload.email_confirm = true;
    }
    const { error: updErr } = await admin.auth.admin.updateUserById(profile.id, updatePayload);
    if (updErr) return new Response(JSON.stringify({ error: `auth_update: ${updErr.message}` }), { status: 500, headers: corsHeaders });

    // 2) Garantir role field_producer
    await admin.from("user_roles").upsert({
      user_id: profile.id,
      role: "field_producer",
      company_id: invite.company_id,
    }, { onConflict: "user_id,role,company_id" });

    // 3) Sign-in para obter tokens (usa email — funciona quer seja real ou sintetizado)
    const signinClient = createClient(url, anon);
    const { data: signinData, error: signinErr } = await signinClient.auth.signInWithPassword({
      email: profile.email!,
      password: newPassword,
    });
    if (signinErr || !signinData.session) {
      return new Response(JSON.stringify({ error: `signin_failed: ${signinErr?.message ?? "no_session"}` }), { status: 500, headers: corsHeaders });
    }

    // 4) Marcar invite como accepted
    await admin.from("operacao_staff_invites").update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
    }).eq("id", invite.id);

    return new Response(JSON.stringify({
      success: true,
      access_token: signinData.session.access_token,
      refresh_token: signinData.session.refresh_token,
      redirect_to: "/operacao/equipa",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});

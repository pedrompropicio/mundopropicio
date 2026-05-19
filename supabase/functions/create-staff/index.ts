// create-staff — cria field_staff (auth.users + profile + invite) e envia WhatsApp.
// Requer JWT do caller com permissão manage_operacao_staff.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const TWILIO_GATEWAY = "https://connector-gateway.lovable.dev/twilio";

interface Body { full_name: string; phone: string; email?: string }

function synthEmail(profileId: string) {
  return `staff-${profileId}@noemail.local`;
}

async function sendInviteWhatsApp(
  to: string, fullName: string, companyName: string, appUrl: string, token: string,
) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
  const TWILIO_FROM = Deno.env.get("TWILIO_WHATSAPP_FROM") ?? "+14155238886";
  if (!LOVABLE_API_KEY || !TWILIO_API_KEY) throw new Error("Twilio credentials missing");

  const body =
    `Olá ${fullName}! Foste convidado para a equipa de produção do ${companyName}.\n` +
    `Acede ao app aqui: ${appUrl}/operacao/accept-invite?token=${token}\n` +
    `O link expira em 14 dias.`;
  const toW = to.startsWith("whatsapp:") ? to : `whatsapp:${to.replace(/\s+/g, "")}`;
  const fromW = TWILIO_FROM.startsWith("whatsapp:") ? TWILIO_FROM : `whatsapp:${TWILIO_FROM}`;

  const res = await fetch(`${TWILIO_GATEWAY}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TWILIO_API_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: toW, From: fromW, Body: body }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${JSON.stringify(data)}`);
  return data.sid;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401, headers: corsHeaders });

    // Verificar permissão do caller (usa anon + token do user)
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr || !user) return new Response(JSON.stringify({ error: "invalid_token" }), { status: 401, headers: corsHeaders });

    const { data: hasPerm } = await userClient.rpc("has_permission", { _user_id: user.id, _permission: "manage_operacao_staff" });
    if (!hasPerm) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: corsHeaders });

    const body = (await req.json()) as Body;
    if (!body.full_name?.trim() || !body.phone?.trim()) {
      return new Response(JSON.stringify({ error: "full_name and phone required" }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(url, serviceKey);
    // Buscar company_id do caller
    const { data: callerProfile } = await admin.from("profiles").select("company_id, company_id").eq("id", user.id).maybeSingle();
    const companyId = callerProfile?.company_id;
    if (!companyId) return new Response(JSON.stringify({ error: "no_company" }), { status: 400, headers: corsHeaders });

    const { data: company } = await admin.from("companies").select("display_name").eq("id", companyId).maybeSingle();
    const companyName = company?.display_name ?? "equipa";

    // 1) Criar auth.users (phone-only, sem confirmar) — email sintetizado se necessário
    const phone = body.phone.replace(/\s+/g, "");
    const email = body.email?.trim() || undefined;
    const tempPwd = crypto.randomUUID() + crypto.randomUUID();

    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      phone,
      email: email ?? `staff-pending-${crypto.randomUUID()}@noemail.local`,
      password: tempPwd,
      email_confirm: false,
      phone_confirm: false,
      user_metadata: {
        full_name: body.full_name,
        company_id: companyId,
        profile_type: "field_staff",
      },
    });
    if (cErr || !created.user) {
      return new Response(JSON.stringify({ error: cErr?.message ?? "create_user_failed" }), { status: 400, headers: corsHeaders });
    }
    const newUserId = created.user.id;

    // 2) Garantir profile (trigger handle_new_user pode criar; fazer upsert para ajustar)
    const finalEmail = email ?? synthEmail(newUserId);
    await admin.from("profiles").upsert({
      id: newUserId,
      full_name: body.full_name,
      phone,
      email: finalEmail,
      company_id: companyId,
      profile_type: "field_staff",
    }, { onConflict: "id" });

    // 3) Criar invite
    const { data: invite, error: invErr } = await admin
      .from("operacao_staff_invites")
      .insert({
        profile_id: newUserId,
        company_id: companyId,
        created_by_profile_id: user.id,
      })
      .select("id, token, expires_at")
      .single();
    if (invErr) {
      return new Response(JSON.stringify({ error: invErr.message }), { status: 500, headers: corsHeaders });
    }

    // 4) Enviar WhatsApp
    const appUrl = Deno.env.get("APP_URL") ?? "https://mpgestaoeventos.com";
    let twilioSid: string | null = null;
    let twilioError: string | null = null;
    try {
      twilioSid = await sendInviteWhatsApp(phone, body.full_name, companyName, appUrl, invite.token);
      await admin.from("operacao_staff_invites").update({
        sent_at: new Date().toISOString(),
        send_count: 1,
      }).eq("id", invite.id);
    } catch (e) {
      twilioError = String(e);
    }

    return new Response(JSON.stringify({
      success: true,
      profile_id: newUserId,
      invite_id: invite.id,
      expires_at: invite.expires_at,
      twilio_sid: twilioSid,
      twilio_error: twilioError,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});

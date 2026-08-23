// accept-invitation — público (não requer JWT). Cria conta a partir de um convite válido.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface AcceptBody {
  token: string;
  password: string;
  full_name?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = (await req.json()) as AcceptBody;
    if (!body.token || !body.password || body.password.length < 8) {
      return new Response(
        JSON.stringify({ error: "token and password (>=8 chars) required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Validar convite
    const { data: invite, error: invErr } = await admin
      .from("company_invitations")
      .select("*")
      .eq("token", body.token)
      .eq("status", "pending")
      .maybeSingle();

    if (invErr || !invite) {
      return new Response(JSON.stringify({ error: "Invalid or used invitation" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (new Date(invite.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: "Invitation expired" }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Criar utilizador (auto-confirmado) com company_id no metadata
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: invite.email,
      password: body.password,
      email_confirm: true,
      user_metadata: {
        full_name: body.full_name ?? invite.email.split("@")[0],
        company_id: invite.company_id,
        invited_role: invite.role,
      },
    });

    if (cErr || !created.user) {
      return new Response(
        JSON.stringify({ error: cErr?.message ?? "Failed to create user" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userId = created.user.id;

    // Garantir profile com company_id (caso o trigger handle_new_user não capture o metadata)
    await admin
      .from("profiles")
      .upsert(
        {
          id: userId,
          email: invite.email,
          company_id: invite.company_id,
          full_name: body.full_name ?? invite.email.split("@")[0],
        },
        { onConflict: "id" },
      );

    // Garantir role admin/manager para a empresa
    await admin
      .from("user_roles")
      .upsert(
        {
          user_id: userId,
          role: invite.role,
          company_id: invite.company_id,
        },
        { onConflict: "user_id,role" },
      );

    // Marcar convite como accepted
    await admin
      .from("company_invitations")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        accepted_user_id: userId,
      })
      .eq("id", invite.id);

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        company_id: invite.company_id,
        email: invite.email,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

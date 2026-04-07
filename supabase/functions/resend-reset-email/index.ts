import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as React from "npm:react@18.3.1";
import { renderAsync } from "npm:@react-email/components@0.0.22";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ResetEmail = ({
  siteName,
  fullName,
  setupUrl,
}: {
  siteName: string;
  fullName: string;
  setupUrl: string;
}) =>
  React.createElement(
    "html",
    { lang: "pt", dir: "ltr" },
    React.createElement("head", null),
    React.createElement(
      "body",
      {
        style: {
          backgroundColor: "#ffffff",
          fontFamily: "'Space Grotesk', Arial, sans-serif",
          margin: 0,
          padding: 0,
        },
      },
      React.createElement(
        "div",
        { style: { padding: "32px 28px", maxWidth: "480px", margin: "0 auto" } },
        React.createElement(
          "h1",
          {
            style: {
              fontSize: "22px",
              fontWeight: "bold",
              color: "#1a1f2e",
              margin: "0 0 20px",
            },
          },
          "Definir Senha"
        ),
        React.createElement(
          "p",
          {
            style: {
              fontSize: "14px",
              color: "#6b7280",
              lineHeight: "1.6",
              margin: "0 0 25px",
            },
          },
          `Olá ${fullName}, clique no botão abaixo para definir a sua senha em `,
          React.createElement("strong", null, siteName),
          "."
        ),
        React.createElement(
          "a",
          {
            href: setupUrl,
            style: {
              display: "inline-block",
              backgroundColor: "#1a6fb8",
              color: "#ffffff",
              fontSize: "14px",
              borderRadius: "12px",
              padding: "12px 24px",
              textDecoration: "none",
              fontWeight: "500",
            },
          },
          "Definir Senha"
        ),
        React.createElement(
          "p",
          {
            style: {
              fontSize: "12px",
              color: "#9ca3af",
              margin: "30px 0 0",
              lineHeight: "1.5",
            },
          },
          "Se não solicitou esta alteração, pode ignorar este email. O link expira em poucos minutos."
        )
      )
    )
  );

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Apenas administradores podem reenviar emails" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: "Email é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const siteUrl = "https://mpgestaoeventos.com";

    // Get user profile for name
    const { data: profile } = await adminClient
      .from("profiles")
      .select("full_name")
      .eq("email", email)
      .single();
    const fullName = profile?.full_name || "Utilizador";

    // Generate direct link (bypasses Lovable/Supabase auth page)
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${siteUrl}/reset-password`,
      },
    });

    if (linkError || !linkData) {
      return new Response(JSON.stringify({ error: linkError?.message || "Erro ao gerar link" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const actionLink = linkData.properties?.action_link || "";
    const actionUrl = new URL(actionLink);
    const tokenHash = actionUrl.searchParams.get("token") || "";
    const linkType = actionUrl.searchParams.get("type") || "recovery";
    const setupUrl = `${siteUrl}/reset-password?token_hash=${encodeURIComponent(tokenHash)}&type=${linkType}`;

    // Render and send branded email
    const siteName = "MP Gestão de Eventos";
    const html = await renderAsync(
      React.createElement(ResetEmail, { siteName, fullName, setupUrl })
    );

    const messageId = crypto.randomUUID();
    const idempotencyKey = `resend-reset-${messageId}`;
    const unsubscribeToken = crypto.randomUUID();

    const { error: unsubscribeError } = await adminClient.from("email_unsubscribe_tokens").upsert(
      { email, token: unsubscribeToken },
      { onConflict: "email" }
    );

    if (unsubscribeError) {
      console.error("Unsubscribe token error:", unsubscribeError);
      return new Response(JSON.stringify({ error: "Erro ao preparar o email" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await adminClient.from("email_send_log").insert({
      message_id: messageId,
      template_name: "resend_reset",
      recipient_email: email,
      status: "pending",
    });

    const { error: enqueueError } = await adminClient.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        idempotency_key: idempotencyKey,
        unsubscribe_token: unsubscribeToken,
        to: email,
        from: `${siteName} <noreply@mpgestaoeventos.com>`,
        sender_domain: "notify.mpgestaoeventos.com",
        subject: "Defina a sua senha — MP Gestão de Eventos",
        html,
        text: `Olá ${fullName}, aceda a ${setupUrl} para definir a sua senha.`,
        purpose: "transactional",
        label: "resend_reset",
        queued_at: new Date().toISOString(),
      },
    });

    if (enqueueError) {
      console.error("Enqueue error:", enqueueError);

      await adminClient.from("email_send_log").insert({
        message_id: messageId,
        template_name: "resend_reset",
        recipient_email: email,
        status: "failed",
        error_message: enqueueError.message,
      });

      return new Response(JSON.stringify({ error: "Erro ao enviar email" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, message: "Email de definição de senha reenviado com sucesso." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

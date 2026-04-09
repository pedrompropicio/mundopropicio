import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as React from "npm:react@18.3.1";
import { renderAsync } from "npm:@react-email/components@0.0.22";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SITE_NAME = "MP Gestão Eventos";
const SENDER_DOMAIN = "notify.mpgestaoeventos.com";
const FROM_DOMAIN = "mpgestaoeventos.com";

const RecoveryEmail = ({ siteName, token }: { siteName: string; token: string }) =>
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
          "Recuperar senha"
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
          `Recebemos um pedido para redefinir a sua senha em ${siteName}. Use o código abaixo para continuar:`
        ),
        React.createElement(
          "p",
          {
            style: {
              fontSize: "32px",
              fontWeight: "bold",
              color: "#1a6fb8",
              letterSpacing: "6px",
              textAlign: "center",
              margin: "16px 0 28px",
              padding: "16px",
              backgroundColor: "#f3f4f6",
              borderRadius: "12px",
            },
          },
          token
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
          "Se não solicitou esta recuperação, pode ignorar este email. O código expira em poucos minutos."
        )
      )
    )
  );

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return new Response(
        JSON.stringify({ error: "Email é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Generate recovery link via admin API — this returns the OTP code
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email,
    });

    if (linkError) {
      // Don't reveal if user exists or not
      console.error("generateLink error:", linkError.message);
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const otp = linkData?.properties?.email_otp;
    if (!otp) {
      console.error("No OTP returned from generateLink");
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Render the email
    const html = await renderAsync(
      React.createElement(RecoveryEmail, { siteName: SITE_NAME, token: otp })
    );
    const text = `Código de recuperação de senha — ${SITE_NAME}: ${otp}`;

    // Enqueue via transactional queue (proven to work)
    const messageId = crypto.randomUUID();
    const idempotencyKey = `recovery-${messageId}`;
    const unsubscribeToken = crypto.randomUUID();

    // Create unsubscribe token
    await adminClient.from("email_unsubscribe_tokens").upsert(
      { email, token: unsubscribeToken },
      { onConflict: "email" }
    );

    // Log pending
    await adminClient.from("email_send_log").insert({
      message_id: messageId,
      template_name: "recovery",
      recipient_email: email,
      status: "pending",
    });

    // Enqueue
    const { error: enqueueError } = await adminClient.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        idempotency_key: idempotencyKey,
        unsubscribe_token: unsubscribeToken,
        to: email,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject: "Código de recuperação de senha",
        html,
        text,
        purpose: "transactional",
        label: "recovery",
        queued_at: new Date().toISOString(),
      },
    });

    if (enqueueError) {
      console.error("Enqueue error:", enqueueError);
      await adminClient.from("email_send_log").insert({
        message_id: messageId,
        template_name: "recovery",
        recipient_email: email,
        status: "failed",
        error_message: enqueueError.message,
      });
    }

    // Always return success (don't reveal if email exists)
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Request error:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
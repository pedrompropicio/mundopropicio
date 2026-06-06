import { createClient } from "npm:@supabase/supabase-js@2";
import * as React from "npm:react@18.3.1";
import { renderAsync } from "npm:@react-email/components@0.0.22";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SENDER_DOMAIN = "notify.mpgestaoeventos.com";
const FROM_DOMAIN = "mpgestaoeventos.com";

// Portal whitelist: only 'erp' supported.
// Removed 'crm-preview' and 'crm-prod' branches (Fase 7, 2026-06-06):
// admin migrated from portal-novo into ERP /crm/* — reset only points to ERP.
const PORTAL_URLS: Record<string, string> = {
  "erp": "https://mpgestaoeventos.com/reset-password",
};

const PORTAL_LABELS: Record<string, string> = {
  "erp": "MP Gestão Eventos",
};

type Portal = keyof typeof PORTAL_URLS;

const RecoveryEmail = ({
  siteName,
  token,
  setupUrl,
}: {
  siteName: string;
  token?: string;
  setupUrl?: string;
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
          setupUrl
            ? `Recebemos um pedido para redefinir a sua senha em ${siteName}. Clique no botão abaixo para definir uma nova senha:`
            : `Recebemos um pedido para redefinir a sua senha em ${siteName}. Use o código abaixo para continuar:`
        ),
        setupUrl
          ? React.createElement(
              "div",
              { style: { textAlign: "center", margin: "24px 0 28px" } },
              React.createElement(
                "a",
                {
                  href: setupUrl,
                  style: {
                    display: "inline-block",
                    backgroundColor: "#1a6fb8",
                    color: "#ffffff",
                    padding: "14px 28px",
                    borderRadius: "10px",
                    textDecoration: "none",
                    fontWeight: "bold",
                    fontSize: "15px",
                  },
                },
                "Definir nova senha"
              )
            )
          : React.createElement(
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
        setupUrl
          ? React.createElement(
              "p",
              {
                style: {
                  fontSize: "11px",
                  color: "#9ca3af",
                  margin: "0 0 20px",
                  wordBreak: "break-all",
                },
              },
              `Se o botão não funcionar, copie este link: ${setupUrl}`
            )
          : null,
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
          "Se não solicitou esta recuperação, pode ignorar este email. O link expira em poucos minutos."
        )
      )
    )
  );

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { email } = body;
    // Param `portal` aceite por extensibilidade futura, mas só 'erp' é válido.
    const portalRaw = (body.portal ?? "erp") as string;
    const portal: Portal = (PORTAL_URLS[portalRaw] ? portalRaw : "erp") as Portal;

    if (!email || typeof email !== "string") {
      return new Response(
        JSON.stringify({ error: "Email é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!PORTAL_URLS[portal]) {
      return new Response(
        JSON.stringify({ error: "Portal inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const siteName = PORTAL_LABELS[portal];
    const portalRedirect = PORTAL_URLS[portal];

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Find the user by email
    const { data: { users } } = await adminClient.auth.admin.listUsers();
    const targetUser = (users ?? []).find((u: any) => u.email?.toLowerCase() === email.toLowerCase());

    if (targetUser) {
      // Revoke all sessions for this user across all devices
      await adminClient.auth.admin.signOut(targetUser.id, 'global').catch((e: any) =>
        console.warn("signOut global error (non-fatal):", e.message)
      );
    }

    // Generate recovery link via admin API
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: portalRedirect },
    });

    if (linkError) {
      console.error("generateLink error:", linkError.message);
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const otp = linkData?.properties?.email_otp;
    const tokenHash = linkData?.properties?.hashed_token;

    if (!otp && !tokenHash) {
      console.error("No OTP or token_hash returned from generateLink");
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ERP: OTP code flow (ResetPassword.tsx).
    const setupUrl: string | undefined = undefined;

    const html = await renderAsync(
      React.createElement(RecoveryEmail, {
        siteName,
        token: otp,
        setupUrl,
      })
    );
    const text = setupUrl
      ? `Recuperação de senha — ${siteName}. Abra o link para definir nova senha: ${setupUrl}`
      : `Código de recuperação de senha — ${siteName}: ${otp}`;

    // Enqueue via transactional queue
    const messageId = crypto.randomUUID();
    const idempotencyKey = `recovery-${portal}-${messageId}`;
    const unsubscribeToken = crypto.randomUUID();

    await adminClient.from("email_unsubscribe_tokens").upsert(
      { email, token: unsubscribeToken },
      { onConflict: "email" }
    );

    await adminClient.from("email_send_log").insert({
      message_id: messageId,
      template_name: "recovery",
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
        from: `${siteName} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject: isCrm ? `${siteName} — Definir nova senha` : "Código de recuperação de senha",
        html,
        text,
        purpose: "transactional",
        label: `recovery-${portal}`,
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

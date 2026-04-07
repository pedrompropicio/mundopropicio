import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as React from "npm:react@18.3.1";
import { renderAsync } from "npm:@react-email/components@0.0.22";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Inline invite email template (branded, no Lovable references)
const InviteSetPasswordEmail = ({
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
          "Bem-vindo(a) ao MP Gestão de Eventos"
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
          `Olá ${fullName}, a sua conta foi criada em `,
          React.createElement("strong", null, siteName),
          ". Clique no botão abaixo para definir a sua senha e aceder à plataforma."
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
          "Se não estava à espera deste convite, pode ignorar este email. O link expira em 24 horas."
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
      return new Response(JSON.stringify({ error: "Apenas administradores podem criar utilizadores" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, full_name, role } = await req.json();

    if (!email || !full_name) {
      return new Response(JSON.stringify({ error: "Email e nome são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validRoles = ["admin", "manager", "editor", "viewer", "user"];
    const targetRole = validRoles.includes(role) ? role : "user";

    // Generate a random temporary password (user will never use it)
    const tempPassword = crypto.randomUUID() + "Aa1!";

    // Step 1: Create user with confirmed email and temporary password
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Update role if not default 'user'
    if (targetRole !== "user" && newUser.user) {
      await adminClient
        .from("user_roles")
        .update({ role: targetRole })
        .eq("user_id", newUser.user.id);
    }

    // Step 3: Generate a recovery link directly (bypasses Supabase/Lovable auth page)
    const siteUrl = "https://mpgestaoeventos.com";
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${siteUrl}/reset-password`,
      },
    });

    if (linkError || !linkData) {
      console.error("Generate link error:", linkError?.message);
      return new Response(
        JSON.stringify({
          success: true,
          user_id: newUser.user?.id,
          message: "Utilizador criado mas houve erro ao gerar o link. Use 'Reenviar convite'.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract the token hash from the generated link
    // The action_link contains the token as a query parameter
    const actionLink = linkData.properties?.action_link || "";
    const actionUrl = new URL(actionLink);
    const tokenHash = actionUrl.searchParams.get("token") || "";
    const linkType = actionUrl.searchParams.get("type") || "recovery";

    // Build a direct URL to the app's reset-password page (no Supabase redirect)
    const setupUrl = `${siteUrl}/reset-password?token_hash=${encodeURIComponent(tokenHash)}&type=${linkType}`;

    // Step 4: Send branded invite email via the email queue
    const siteName = "MP Gestão de Eventos";
    const html = await renderAsync(
      React.createElement(InviteSetPasswordEmail, {
        siteName,
        fullName: full_name,
        setupUrl,
      })
    );

    // Enqueue the email — use transactional purpose with unsubscribe token
    const messageId = crypto.randomUUID();
    const idempotencyKey = `invite-set-password-${newUser.user?.id}`;
    const unsubscribeToken = crypto.randomUUID();

    // Create unsubscribe token entry
    await adminClient.from("email_unsubscribe_tokens").upsert(
      { email, token: unsubscribeToken },
      { onConflict: "email" }
    );

    await adminClient.from("email_send_log").insert({
      message_id: messageId,
      template_name: "invite_set_password",
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
        text: `Olá ${full_name}, a sua conta foi criada. Aceda a ${setupUrl} para definir a sua senha.`,
        purpose: "transactional",
        label: "invite_set_password",
        queued_at: new Date().toISOString(),
      },
    });

    if (enqueueError) {
      console.error("Enqueue error:", enqueueError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: newUser.user?.id,
        message: "Utilizador criado com sucesso. Email de definição de senha enviado.",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

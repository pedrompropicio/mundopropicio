import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as React from "npm:react@18.3.1";
import { renderAsync } from "npm:@react-email/components@0.0.22";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function respond(payload: {
  success?: boolean;
  error?: string;
  user_id?: string;
  message?: string;
  diagnostics?: Record<string, unknown>;
}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function ensureProfileAndRole(
  adminClient: any,
  userId: string,
  email: string,
  fullName: string,
  role: string,
) {
  const { error: profileError } = await adminClient.from("profiles").upsert(
    { id: userId, full_name: fullName, email },
    { onConflict: "id" },
  );

  if (profileError) {
    throw new Error(`Erro ao sincronizar perfil: ${profileError.message}`);
  }

  const { data: existingRole, error: roleLookupError } = await adminClient
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (roleLookupError) {
    throw new Error(`Erro ao localizar permissões: ${roleLookupError.message}`);
  }

  if (existingRole?.id) {
    const { error: roleUpdateError } = await adminClient
      .from("user_roles")
      .update({ role })
      .eq("id", existingRole.id);

    if (roleUpdateError) {
      throw new Error(`Erro ao atualizar permissões: ${roleUpdateError.message}`);
    }

    return;
  }

  const { error: roleInsertError } = await adminClient
    .from("user_roles")
    .insert({ user_id: userId, role });

  if (roleInsertError) {
    throw new Error(`Erro ao criar permissões: ${roleInsertError.message}`);
  }
}

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
    const startTime = Date.now();
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return respond({
        error: "Não autorizado",
        diagnostics: { stage: "auth_header_missing", processing_time_ms: Date.now() - startTime },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return respond({
        error: "Não autorizado",
        diagnostics: { stage: "caller_not_found", processing_time_ms: Date.now() - startTime },
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
      return respond({
        error: "Apenas administradores podem criar utilizadores",
        diagnostics: { stage: "role_check_failed", processing_time_ms: Date.now() - startTime },
      });
    }

    const { email, full_name, role } = await req.json();
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    const normalizedFullName = String(full_name ?? "").trim();

    if (!normalizedEmail || !normalizedFullName) {
      return respond({
        error: "Email e nome são obrigatórios",
        diagnostics: { stage: "validation", processing_time_ms: Date.now() - startTime },
      });
    }

    const validRoles = ["admin", "manager", "editor", "viewer", "user", "partner"];
    const targetRole = validRoles.includes(role) ? role : "user";

    // Generate a random temporary password (user will never use it)
    const tempPassword = crypto.randomUUID() + "Aa1!";

    // Step 1: Create user with confirmed email and temporary password
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: normalizedFullName },
    });

    let userId = newUser.user?.id;

    if (createError) {
      console.error("Create user error:", createError);

      const isDuplicateEmail = /already/i.test(createError.message ?? "");
      if (!isDuplicateEmail) {
        return respond({
          error: createError.message,
          diagnostics: { stage: "auth_create_user", processing_time_ms: Date.now() - startTime },
        });
      }

      const { data: existingUsers, error: listUsersError } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

      if (listUsersError) {
        console.error("List users error:", listUsersError);
        return respond({
          error: "Este email já existe no sistema, mas não consegui recuperar a conta anterior.",
          diagnostics: { stage: "auth_list_users", processing_time_ms: Date.now() - startTime },
        });
      }

      const existingUser = existingUsers.users.find(
        (candidate: { email?: string | null; id: string }) =>
          candidate.email?.toLowerCase() === normalizedEmail,
      );

      if (!existingUser) {
        return respond({
          error: createError.message,
          diagnostics: { stage: "existing_user_not_found", processing_time_ms: Date.now() - startTime },
        });
      }

      const { data: existingProfile, error: existingProfileError } = await adminClient
        .from("profiles")
        .select("id")
        .eq("id", existingUser.id)
        .maybeSingle();

      if (existingProfileError) {
        return respond({
          error: `Erro ao verificar utilizador existente: ${existingProfileError.message}`,
          diagnostics: { stage: "existing_profile_lookup", processing_time_ms: Date.now() - startTime },
        });
      }

      if (existingProfile?.id) {
        return respond({
          error: "Já existe um utilizador com este email. Use 'Reenviar email' na lista de utilizadores.",
          diagnostics: { stage: "existing_visible_user", processing_time_ms: Date.now() - startTime },
        });
      }

      userId = existingUser.id;
    }

    if (!userId) {
      return respond({
        error: "Não foi possível preparar a conta do utilizador.",
        diagnostics: { stage: "missing_user_id", processing_time_ms: Date.now() - startTime },
      });
    }

    try {
      await ensureProfileAndRole(adminClient, userId, normalizedEmail, normalizedFullName, targetRole);
    } catch (syncError) {
      console.error("Sync user error:", syncError);
      return respond({
        error: syncError instanceof Error ? syncError.message : "Erro ao sincronizar utilizador",
        diagnostics: { stage: "profile_role_sync", processing_time_ms: Date.now() - startTime },
      });
    }

    // Step 3: Generate a recovery link directly (bypasses Supabase/Lovable auth page)
    const siteUrl = "https://mpgestaoeventos.com";
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email: normalizedEmail,
      options: {
        redirectTo: `${siteUrl}/reset-password`,
      },
    });

    if (linkError || !linkData) {
      console.error("Generate link error:", linkError?.message);
      return new Response(
        JSON.stringify({
          success: true,
          user_id: userId,
          message: "Utilizador criado mas houve erro ao gerar o link. Use 'Reenviar convite'.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract the token hash from the generated link
    // The action_link contains the token as a query parameter
    const actionLink = linkData.properties?.action_link || "";
    const actionUrl = new URL(actionLink);
    const tokenHash = actionUrl.searchParams.get("token_hash") || actionUrl.searchParams.get("token") || "";
    const linkType = actionUrl.searchParams.get("type") || "recovery";

    // Build a direct URL to the app's reset-password page (no Supabase redirect)
    const setupUrl = `${siteUrl}/reset-password?token_hash=${encodeURIComponent(tokenHash)}&type=${linkType}`;

    // Step 4: Send branded invite email via the email queue
    const siteName = "MP Gestão de Eventos";
    const html = await renderAsync(
      React.createElement(InviteSetPasswordEmail, {
        siteName,
        fullName: normalizedFullName,
        setupUrl,
      })
    );

    // Enqueue the email — use transactional purpose with unsubscribe token
    const messageId = crypto.randomUUID();
    const idempotencyKey = `invite-set-password-${userId}`;
    const unsubscribeToken = crypto.randomUUID();

    // Create unsubscribe token entry
    const { error: unsubscribeError } = await adminClient.from("email_unsubscribe_tokens").upsert(
      { email: normalizedEmail, token: unsubscribeToken },
      { onConflict: "email" }
    );

    if (unsubscribeError) {
      console.error("Unsubscribe token error:", unsubscribeError);
      return new Response(
        JSON.stringify({
          error: "Utilizador criado, mas houve erro ao preparar o email. Use 'Reenviar convite'.",
          user_id: userId,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await adminClient.from("email_send_log").insert({
      message_id: messageId,
      template_name: "invite_set_password",
      recipient_email: normalizedEmail,
      status: "pending",
    });

    const { error: enqueueError } = await adminClient.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        idempotency_key: idempotencyKey,
        unsubscribe_token: unsubscribeToken,
        to: normalizedEmail,
        from: `${siteName} <noreply@mpgestaoeventos.com>`,
        sender_domain: "notify.mpgestaoeventos.com",
        subject: "Defina a sua senha — MP Gestão de Eventos",
        html,
        text: `Olá ${normalizedFullName}, a sua conta foi criada. Aceda a ${setupUrl} para definir a sua senha.`,
        purpose: "transactional",
        label: "invite_set_password",
        queued_at: new Date().toISOString(),
      },
    });

    if (enqueueError) {
      console.error("Enqueue error:", enqueueError);

      await adminClient.from("email_send_log").insert({
        message_id: messageId,
        template_name: "invite_set_password",
        recipient_email: normalizedEmail,
        status: "failed",
        error_message: enqueueError.message,
      });

      return new Response(
        JSON.stringify({
          error: "Utilizador criado, mas o email de definição de senha não foi enviado. Use 'Reenviar convite'.",
          user_id: userId,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        message: "Utilizador criado com sucesso. Email de definição de senha enviado.",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Unexpected create-user error:", err);
    return respond({
      error: err instanceof Error ? err.message : "Erro interno ao criar utilizador",
      diagnostics: { stage: "unexpected" },
    });
  }
});

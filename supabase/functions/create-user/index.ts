import { createClient } from "npm:@supabase/supabase-js@2";
import * as React from "npm:react@18.3.1";
import { renderAsync } from "npm:@react-email/components@0.0.22";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type RespondPayload = {
  success?: boolean;
  error?: string;
  user_id?: string;
  message?: string;
  // Multi-membership response shape
  status?: "will_create" | "will_attach" | "already_member" | "created" | "attached";
  existing_full_name?: string | null;
  diagnostics?: Record<string, unknown>;
};

function respond(payload: RespondPayload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

async function findExistingAuthUser(adminClient: any, email: string) {
  const { data, error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find(
    (u: { email?: string | null; id: string; user_metadata?: any }) =>
      u.email?.toLowerCase() === email,
  );
}

async function attachUserToCompany(
  adminClient: any,
  userId: string,
  companyId: string,
  role: string,
  fullName: string,
  email: string,
  isOperacaoOnly: boolean = false,
) {
  // 1) Profile: only insert if missing — never overwrite another company's primary.
  const { data: existingProfile } = await adminClient
    .from("profiles")
    .select("id, is_operacao_only")
    .eq("id", userId)
    .maybeSingle();

  if (!existingProfile) {
    const { error: pErr } = await adminClient.from("profiles").insert({
      id: userId,
      full_name: fullName,
      email,
      company_id: companyId,
      is_operacao_only: isOperacaoOnly,
    });
    if (pErr) throw new Error(`Erro ao criar perfil: ${pErr.message}`);
  } else if (isOperacaoOnly && existingProfile.is_operacao_only !== true) {
    // Caller pediu operação-only e perfil existente ainda não está marcado.
    await adminClient.from("profiles").update({ is_operacao_only: true }).eq("id", userId);
  }

  // 2) Insert user_role for (user, company, role) — UNIQUE permite N empresas.
  const { error: rErr } = await adminClient
    .from("user_roles")
    .insert({ user_id: userId, role, company_id: companyId });
  if (rErr) throw new Error(`Erro ao associar à empresa: ${rErr.message}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return respond({ error: "Não autorizado", diagnostics: { stage: "auth_header_missing" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return respond({ error: "Não autorizado", diagnostics: { stage: "caller_not_found" } });

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Caller must be admin in their active company
    const { data: callerCompanyIdData } = await callerClient.rpc("current_company_id" as any);
    const callerCompanyId = (callerCompanyIdData as string | null) ?? null;
    if (!callerCompanyId) {
      return respond({ error: "Não foi possível determinar a empresa ativa." });
    }

    // Permitido se caller é admin na empresa ativa OU platform_admin (global)
    const { data: isPa } = await adminClient.rpc("is_platform_admin", { _user_id: caller.id });
    const isPlatformAdmin = Boolean(isPa);
    let isAdminHere = false;
    if (!isPlatformAdmin) {
      const { data: roleData } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", caller.id)
        .eq("company_id", callerCompanyId)
        .eq("role", "admin")
        .maybeSingle();
      isAdminHere = Boolean(roleData);
    }
    if (!isPlatformAdmin && !isAdminHere) {
      return respond({ error: "Apenas administradores podem criar utilizadores." });
    }

    const body = await req.json();
    const normalizedEmail = String(body.email ?? "").trim().toLowerCase();
    const normalizedFullName = String(body.full_name ?? "").trim();
    const dryRun = body.dry_run === true;
    const role = body.role;
    const isOperacaoOnly = body.is_operacao_only === true;

    if (!normalizedEmail || (!dryRun && !normalizedFullName)) {
      return respond({ error: "Email e nome são obrigatórios." });
    }

    const validRoles = ["admin", "manager", "producer", "editor", "viewer", "user", "partner"];
    const targetRole = validRoles.includes(role) ? role : "user";

    // ── Pre-check: existe em auth.users?
    const existingAuthUser = await findExistingAuthUser(adminClient, normalizedEmail);

    if (existingAuthUser) {
      // Já tem membership na empresa ativa?
      const { data: existingMembership } = await adminClient
        .from("user_roles")
        .select("id, role")
        .eq("user_id", existingAuthUser.id)
        .eq("company_id", callerCompanyId)
        .maybeSingle();

      if (existingMembership) {
        return respond({
          status: "already_member",
          error: "Este utilizador já tem acesso a esta empresa. Para alterar o nível, edite na lista abaixo.",
          existing_full_name: existingAuthUser.user_metadata?.full_name ?? null,
        });
      }

      if (dryRun) {
        return respond({
          status: "will_attach",
          existing_full_name: existingAuthUser.user_metadata?.full_name ?? normalizedFullName ?? null,
        });
      }

      // Attach (sem email)
      try {
        await attachUserToCompany(
          adminClient,
          existingAuthUser.id,
          callerCompanyId,
          targetRole,
          existingAuthUser.user_metadata?.full_name ?? normalizedFullName,
          normalizedEmail,
          isOperacaoOnly,
        );
      } catch (e) {
        return respond({ error: e instanceof Error ? e.message : "Erro ao associar utilizador." });
      }

      return respond({
        success: true,
        status: "attached",
        user_id: existingAuthUser.id,
        message: "Utilizador adicionado à empresa.",
      });
    }

    // ── Não existe → criar
    if (dryRun) return respond({ status: "will_create" });

    const tempPassword = crypto.randomUUID() + "Aa1!";
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: normalizedFullName, company_id: callerCompanyId },
    });

    if (createError) {
      return respond({ error: createError.message, diagnostics: { stage: "auth_create_user" } });
    }

    const userId = newUser.user?.id;
    if (!userId) return respond({ error: "Não foi possível preparar a conta do utilizador." });

    if (isOperacaoOnly) {
      await adminClient.from("profiles").update({ is_operacao_only: true }).eq("id", userId);
    }


    // handle_new_user trigger já cria profile + user_roles (role 'user' na company);
    // garantir que a role correta fica registada na empresa ativa.
    const { error: roleErr } = await adminClient
      .from("user_roles")
      .upsert(
        { user_id: userId, role: targetRole, company_id: callerCompanyId },
        { onConflict: "user_id,company_id,role" },
      );
    if (roleErr) {
      return respond({ error: `Utilizador criado mas erro ao definir role: ${roleErr.message}`, user_id: userId });
    }
    // Remover a role default 'user' se não foi a pedida
    if (targetRole !== "user") {
      await adminClient
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("company_id", callerCompanyId)
        .eq("role", "user");
    }

    // ── Generate password recovery link + send branded invite email
    const siteUrl = "https://mpgestaoeventos.com";
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "invite",
      email: normalizedEmail,
      options: { redirectTo: `${siteUrl}/reset-password` },
    });

    if (linkError || !linkData) {
      return respond({
        success: true,
        status: "created",
        user_id: userId,
        message: "Utilizador criado mas erro ao gerar link. Use 'Reenviar convite'.",
      });
    }

    const actionLink = linkData.properties?.action_link || "";
    const actionUrl = new URL(actionLink);
    const tokenHash = actionUrl.searchParams.get("token_hash") || actionUrl.searchParams.get("token") || "";
    const linkType = actionUrl.searchParams.get("type") || "recovery";
    const setupUrl = `${siteUrl}/reset-password?token_hash=${encodeURIComponent(tokenHash)}&type=${linkType}`;

    const siteName = "MP Gestão de Eventos";
    const html = await renderAsync(
      React.createElement(InviteSetPasswordEmail, { siteName, fullName: normalizedFullName, setupUrl }),
    );

    const messageId = crypto.randomUUID();
    const idempotencyKey = `invite-set-password-${userId}`;
    const unsubscribeToken = crypto.randomUUID();

    await adminClient.from("email_unsubscribe_tokens").upsert(
      { email: normalizedEmail, token: unsubscribeToken, company_id: callerCompanyId },
      { onConflict: "email" },
    );

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
      return respond({
        success: true,
        status: "created",
        user_id: userId,
        error: "Utilizador criado, mas o email não foi enviado. Use 'Reenviar convite'.",
      });
    }

    return respond({
      success: true,
      status: "created",
      user_id: userId,
      message: "Utilizador criado com sucesso. Email de definição de senha enviado.",
    });
  } catch (err) {
    return respond({
      error: err instanceof Error ? err.message : "Erro interno ao criar utilizador",
      diagnostics: { stage: "unexpected" },
    });
  }
});

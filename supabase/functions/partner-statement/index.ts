/**
 * (g17) `partner-statement` — prestação de contas de um sócio, calculada NO SERVIDOR.
 *
 * O Portal do Sócio não calcula nada do fecho: pede aqui o mesmo resultado que o
 * Encontro de Contas do ERP produz, com o MESMO código
 * (`_shared/settlement/statement-service.ts`).
 *
 * Segurança — caminho normal (o do sócio): do cliente só vem o `event_id`.
 *  • utilizador autenticado (JWT no Authorization)
 *  • sócio resolvido por `public.user_supplier_id(auth.uid())`
 *  • exige `partner_event_access` activo ao evento
 *  • exige participação com `mode = 'settles'` num fechamento do evento
 *
 * EXCEPÇÃO — "ver como sócio" (inspecção pelo administrador): o corpo pode trazer
 * `supplier_id`. Nesse caso não se usa `user_supplier_id` e exige-se, em vez disso:
 *  • quem chama é `platform_admin` OU tem papel `admin` na empresa do evento
 *  • esse `supplier_id` é de facto sócio do evento (linha em `event_partners`)
 * Não se exige `partner_event_access` — um administrador não é parceiro. Falhando
 * qualquer uma das condições, 403 com a mesma mensagem genérica. A leitura fica em
 * `system_audit_log` com `viewed_as_admin: true`.
 *
 * O nó, o fechamento e as percentagens continuam a ser derivados — nunca aceites
 * por parâmetro.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { buildPartnerStatement, loadStatementBundle } from "../_shared/settlement/statement-service.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Sem sessão." }, 401);

    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await asUser.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "Sem sessão." }, 401);

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      /* corpo vazio */
    }
    const eventId = String(body?.event_id ?? "");
    if (!UUID.test(eventId)) return json({ error: "Evento inválido." }, 400);
    const requestedSupplierId = body?.supplier_id ? String(body.supplier_id) : null;
    if (requestedSupplierId && !UUID.test(requestedSupplierId)) {
      return json({ error: "Sócio inválido." }, 400);
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    let supplierId: string | null = null;
    let companyId: string | null = null;
    const viewedAsAdmin = !!requestedSupplierId;

    if (requestedSupplierId) {
      // ── "Ver como sócio": inspecção por administrador ──
      const { data: eventRow, error: eventErr } = await admin
        .from("events")
        .select("id, company_id")
        .eq("id", eventId)
        .maybeSingle();
      if (eventErr) {
        console.error("partner-statement events", eventErr);
        return json({ error: "Não foi possível preparar a prestação de contas." }, 500);
      }
      if (!eventRow) return json({ error: "Sem acesso a esta informação." }, 403);

      const { data: isPlatformAdmin, error: paErr } = await admin.rpc("is_platform_admin", {
        _user_id: user.id,
      });
      if (paErr) {
        console.error("partner-statement is_platform_admin", paErr);
        return json({ error: "Não foi possível preparar a prestação de contas." }, 500);
      }

      let allowed = isPlatformAdmin === true;
      if (!allowed) {
        const { data: adminRole, error: roleErr } = await admin
          .from("user_roles")
          .select("id")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .eq("company_id", eventRow.company_id)
          .maybeSingle();
        if (roleErr) {
          console.error("partner-statement user_roles", roleErr);
          return json({ error: "Não foi possível preparar a prestação de contas." }, 500);
        }
        allowed = !!adminRole;
      }
      if (!allowed) return json({ error: "Sem acesso a esta informação." }, 403);

      // O sócio pedido tem de ser, de facto, sócio deste evento.
      const { data: partnerRow, error: partnerErr } = await admin
        .from("event_partners")
        .select("id")
        .eq("event_id", eventId)
        .eq("supplier_id", requestedSupplierId)
        .maybeSingle();
      if (partnerErr) {
        console.error("partner-statement event_partners", partnerErr);
        return json({ error: "Não foi possível preparar a prestação de contas." }, 500);
      }
      if (!partnerRow) return json({ error: "Sem acesso a esta informação." }, 403);

      supplierId = requestedSupplierId;
      companyId = eventRow.company_id as string;
    } else {
      // Sócio do utilizador (identidade canónica).
      // Assinatura real na BD: public.user_supplier_id(p_user_id uuid).
      const { data: ownSupplierId, error: supplierErr } = await admin.rpc("user_supplier_id", {
        p_user_id: user.id,
      });
      // Erro de RPC nunca é 403 — é falha nossa.
      if (supplierErr) {
        console.error("partner-statement user_supplier_id", supplierErr);
        return json({ error: "Não foi possível preparar a prestação de contas." }, 500);
      }
      if (!ownSupplierId) return json({ error: "Sem acesso a esta informação." }, 403);

      // Acesso activo ao evento.
      const { data: access, error: accessErr } = await admin
        .from("partner_event_access")
        .select("id, company_id")
        .eq("user_id", user.id)
        .eq("event_id", eventId)
        .eq("is_active", true)
        .maybeSingle();
      if (accessErr) {
        console.error("partner-statement partner_event_access", accessErr);
        return json({ error: "Não foi possível preparar a prestação de contas." }, 500);
      }
      if (!access) return json({ error: "Sem acesso a esta informação." }, 403);

      supplierId = String(ownSupplierId);
      companyId = access.company_id as string;
    }

    const bundle = await loadStatementBundle(admin as any, eventId);

    // Logótipo da empresa (cabeçalho do documento), se existir.
    let logoDataUrl: string | null = null;
    const { data: company } = await admin
      .from("companies")
      .select("logo_url, display_name")
      .eq("id", companyId)
      .maybeSingle();

    const result = buildPartnerStatement(bundle, String(supplierId), { logoDataUrl });
    if (!result) return json({ error: "Sem acesso a esta informação." }, 403);

    await admin.from("system_audit_log").insert({
      entity_type: "partner_statement",
      entity_id: eventId,
      action: "read",
      changed_by: user.email ?? user.id,
      company_id: companyId,
      metadata: { supplier_id: supplierId, event_id: eventId, viewed_as_admin: viewedAsAdmin },
    });

    return json({
      doc: { ...result.doc, companyName: company?.display_name ?? null, logoUrl: company?.logo_url ?? null },
      block: result.block,
      cards: result.cards,
      event: { id: bundle.eventId, name: bundle.eventName, date: bundle.eventDate },
    });
  } catch (e) {
    console.error("partner-statement", e);
    return json({ error: "Não foi possível preparar a prestação de contas." }, 500);
  }
});

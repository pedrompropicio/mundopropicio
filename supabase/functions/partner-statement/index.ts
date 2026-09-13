/**
 * (g17) `partner-statement` — prestação de contas de um sócio, calculada NO SERVIDOR.
 *
 * O Portal do Sócio não calcula nada do fecho: pede aqui o mesmo resultado que o
 * Encontro de Contas do ERP produz, com o MESMO código
 * (`_shared/settlement/statement-service.ts`).
 *
 * Segurança: nada vem do cliente a não ser o `event_id`.
 *  • utilizador autenticado (JWT no Authorization)
 *  • sócio resolvido por `public.user_supplier_id(auth.uid())`
 *  • exige `partner_event_access` activo ao evento
 *  • exige participação com `mode = 'settles'` num fechamento do evento
 * O nó, o fechamento e as percentagens são derivados — nunca aceites por parâmetro.
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

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    // Sócio do utilizador (identidade canónica).
    // Assinatura real na BD: public.user_supplier_id(p_user_id uuid).
    const { data: supplierId, error: supplierErr } = await admin.rpc("user_supplier_id", {
      p_user_id: user.id,
    });
    // Erro de RPC nunca é 403 — é falha nossa.
    if (supplierErr) {
      console.error("partner-statement user_supplier_id", supplierErr);
      return json({ error: "Não foi possível preparar a prestação de contas." }, 500);
    }
    if (!supplierId) return json({ error: "Sem acesso a esta informação." }, 403);

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

    const bundle = await loadStatementBundle(admin as any, eventId);

    // Logótipo da empresa (cabeçalho do documento), se existir.
    let logoDataUrl: string | null = null;
    const { data: company } = await admin
      .from("companies")
      .select("logo_url, display_name")
      .eq("id", access.company_id)
      .maybeSingle();

    const result = buildPartnerStatement(bundle, String(supplierId), { logoDataUrl });
    if (!result) return json({ error: "Sem acesso a esta informação." }, 403);

    await admin.from("system_audit_log").insert({
      entity_type: "partner_statement",
      entity_id: eventId,
      action: "read",
      changed_by: user.email ?? user.id,
      company_id: access.company_id,
      metadata: { supplier_id: supplierId, event_id: eventId },
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

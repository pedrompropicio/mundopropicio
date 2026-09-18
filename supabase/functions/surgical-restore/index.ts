// surgical-restore — restauro de BILHETEIRA de um ou mais eventos.
//
// Desde 18/09/2026 é um invólucro fino: ZERO lógica própria de restauro. Delega
// na `selective-restore` com `scope: 'events'` e as raízes de bilheteira; o
// âmbito real (zonas → lotes → vendas → o que mais o grafo pendurar) sai de
// `restore_event_scope`, derivado de pg_constraint, e a troca é atómica
// (restore_shadow + restore_apply_from_shadow, p_scope 'rows'). Ver #203/D-ERP89.
//
// Contrato do body mantido: { backup_file, event_ids, mode?: 'preview'|'restore' }.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Raízes de bilheteira. O resto da árvore vem do grafo, não daqui. */
const TICKETING_ROOTS = ["event_ticket_zones", "ticket_import_logs"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({} as any));
    const backupFile = body?.backup_file;
    const eventIds = body?.event_ids;
    const mode = body?.mode === "preview" ? "preview" : "restore";

    if (!backupFile) return json({ error: "backup_file é obrigatório" }, 400);
    if (!Array.isArray(eventIds) || eventIds.length === 0) {
      return json({ error: "event_ids é obrigatório" }, 400);
    }

    // As guardas (admin/service_role, multi-tenant, eventos da empresa) são as da
    // selective-restore: passa-se o MESMO Authorization do chamador.
    const auth = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/selective-restore`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        Authorization: auth,
      },
      body: JSON.stringify({
        backup_file: backupFile,
        mode,
        scope: "events",
        event_ids: eventIds,
        roots: TICKETING_ROOTS,
        ...(body?.keep_shadow === true ? { keep_shadow: true } : {}),
        ...(body?.log_scope ? { log_scope: body.log_scope } : {}),
      }),
    });

    const out = await res.json().catch(() => ({ error: "Resposta ilegível da selective-restore" }));
    return json({ ...out, via: "selective-restore", roots: TICKETING_ROOTS }, res.status);
  } catch (err) {
    console.error("[surgical-restore] fatal", err);
    return json({ error: err instanceof Error ? err.message : "Erro desconhecido" }, 500);
  }
});

// Edge function: run-rls-legacy-audit
// Conta policies RLS em `public` que ainda usam o padrão legacy
// `auth.uid() IS NOT NULL` e regista snapshot em rls_legacy_audit_reports.
// Pode ser chamada por:
//   - cron diário (apikey = anon)         → triggered_by = 'cron'
//   - admin/platform_admin no painel      → triggered_by = 'manual'

import { createClient } from "npm:@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '').trim()

    let triggeredBy: 'cron' | 'manual' = 'cron'
    let triggeredByUser: string | null = null

    // Distinguir cron (anon) vs invocação manual de utilizador autenticado
    if (token && token !== ANON_KEY) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      })
      const { data: userData, error: userErr } = await userClient.auth.getUser()
      if (userErr || !userData.user) {
        return new Response(
          JSON.stringify({ error: 'Token inválido' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      // Verificar role admin ou platform_admin
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
      const { data: roles, error: rolesErr } = await admin
        .from('user_roles')
        .select('role')
        .eq('user_id', userData.user.id)
      if (rolesErr) throw rolesErr

      const allowed = (roles ?? []).some(
        (r) => r.role === 'admin' || r.role === 'platform_admin',
      )
      if (!allowed) {
        return new Response(
          JSON.stringify({ error: 'Acesso negado' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      triggeredBy = 'manual'
      triggeredByUser = userData.user.id
    }

    // Executar a auditoria via RPC SECURITY DEFINER
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
    const { data, error } = await admin.rpc('run_rls_legacy_audit', {
      _triggered_by: triggeredBy,
      _triggered_by_user: triggeredByUser,
    })
    if (error) throw error

    return new Response(
      JSON.stringify({ ok: true, report: data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('run-rls-legacy-audit error:', e)
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

// vip-coupon-email — envia o cupom VIP por e-mail e o lembrete de expiração.
//
// Modos (query param `mode` ou body.mode):
//   immediate : body { lead_id } ou { email, event_id }
//   reminder  : varre eventos cujo cupom expira daqui a exatamente 3 dias
//
// dryRun: true em qualquer modo -> apenas loga, não escreve log nem envia.
//
// Idempotência: tabela public.vip_coupon_email_log com
// unique(event_id, email, type). A linha é inserida ANTES do envio; se o envio
// falhar, a linha é removida para permitir nova tentativa.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

type EmailType = 'immediate' | 'reminder'

interface EventRow {
  id: string
  name: string
  slug: string | null
  ticketing_url: string | null
  vip_coupon_code: string | null
  vip_coupon_discount_label: string | null
  vip_coupon_valid_until: string | null
}

const EVENT_COLS =
  'id, name, slug, ticketing_url, vip_coupon_code, vip_coupon_discount_label, vip_coupon_valid_until'

/** Formata YYYY-MM-DD / ISO em DD/MM/AAAA (sem deslocar timezone). */
function formatDate(value: string): string {
  const d = value.slice(0, 10).split('-')
  if (d.length !== 3) return value
  return `${d[2]}/${d[1]}/${d[0]}`
}

/** Cupom ativo = código não vazio e validade >= hoje. */
function couponActive(ev: EventRow): boolean {
  const code = (ev.vip_coupon_code ?? '').trim()
  if (!code) return false
  if (!ev.vip_coupon_valid_until) return false
  const today = new Date().toISOString().slice(0, 10)
  return ev.vip_coupon_valid_until.slice(0, 10) >= today
}

function firstName(name?: string | null): string | null {
  const n = (name ?? '').trim()
  if (!n) return null
  return n.split(/\s+/)[0]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    console.error('[vip-coupon-email] missing env')
    return json({ error: 'Server configuration error' }, 500)
  }

  let body: Record<string, any> = {}
  try {
    if (req.method !== 'GET') body = (await req.json()) ?? {}
  } catch {
    body = {}
  }

  const url = new URL(req.url)
  const mode = String(body.mode ?? url.searchParams.get('mode') ?? 'immediate')
  const dryRun = body.dryRun === true || url.searchParams.get('dryRun') === 'true'

  if (mode !== 'immediate' && mode !== 'reminder') {
    return json({ error: "mode must be 'immediate' or 'reminder'" }, 400)
  }

  const admin = createClient(supabaseUrl, serviceKey)

  /** Envia um e-mail (ou simula) respeitando o log de idempotência. */
  async function sendOne(opts: {
    event: EventRow
    email: string
    leadId: string | null
    name: string | null
    type: EmailType
  }): Promise<{ email: string; event_id: string; type: EmailType; status: string; reason?: string }> {
    const { event, leadId, name, type } = opts
    const email = opts.email.trim().toLowerCase()
    const validUntil = formatDate(event.vip_coupon_valid_until ?? '')

    const templateData = {
      eventName: event.name,
      firstName: firstName(name),
      discountLabel: event.vip_coupon_discount_label,
      couponCode: (event.vip_coupon_code ?? '').trim(),
      validUntil,
      ticketingUrl: event.ticketing_url,
      isReminder: type === 'reminder',
    }

    if (dryRun) {
      console.log('[vip-coupon-email][dryRun] enviaria', { email, type, templateData })
      return { email, event_id: event.id, type, status: 'dry_run' }
    }

    // Reserva do slot de idempotência
    const { data: logRow, error: logError } = await admin
      .from('vip_coupon_email_log')
      .insert({ event_id: event.id, email, lead_id: leadId, type })
      .select('id')
      .maybeSingle()

    if (logError) {
      // 23505 = unique violation -> já enviado
      if ((logError as any).code === '23505') {
        return { email, event_id: event.id, type, status: 'already_sent' }
      }
      console.error('[vip-coupon-email] falha ao registar log', logError)
      return { email, event_id: event.id, type, status: 'error', reason: logError.message }
    }

    const { error: sendError } = await admin.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'vip-coupon',
        recipientEmail: email,
        idempotencyKey: `vip-coupon-${type}-${event.id}-${email}`,
        templateData,
      },
    })

    if (sendError) {
      if (logRow?.id) {
        await admin.from('vip_coupon_email_log').delete().eq('id', logRow.id)
      }
      const reason = sendError instanceof Error ? sendError.message : String(sendError)
      console.error('[vip-coupon-email] falha no envio', { email, type, reason })
      return { email, event_id: event.id, type, status: 'error', reason }
    }

    return { email, event_id: event.id, type, status: 'sent' }
  }

  try {
    // ---------------------------------------------------------------- immediate
    if (mode === 'immediate') {
      const leadId: string | null = body.lead_id ?? body.leadId ?? null
      let email: string | null = body.email ?? null
      let leadName: string | null = body.name ?? null
      let event: EventRow | null = null

      if (leadId) {
        const { data: lead, error } = await admin
          .from('lead_capture')
          .select('id, email, name, consent_email, event_slug, source')
          .eq('id', leadId)
          .maybeSingle()
        if (error) return json({ error: error.message }, 500)
        if (!lead) return json({ error: 'lead not found', lead_id: leadId }, 404)
        if (!lead.email) return json({ skipped: 'lead sem email', lead_id: leadId })
        if (lead.consent_email !== true) {
          return json({ skipped: 'lead sem consent_email', lead_id: leadId })
        }
        email = lead.email
        leadName = lead.name ?? null
        if (lead.event_slug) {
          const { data: ev } = await admin
            .from('events')
            .select(EVENT_COLS)
            .eq('slug', lead.event_slug)
            .maybeSingle()
          event = (ev as EventRow) ?? null
        }
      }

      if (!event) {
        const eventId: string | null = body.event_id ?? body.eventId ?? null
        if (!eventId) {
          return json({ error: 'não foi possível resolver o evento (event_slug/event_id)' }, 400)
        }
        const { data: ev, error } = await admin
          .from('events')
          .select(EVENT_COLS)
          .eq('id', eventId)
          .maybeSingle()
        if (error) return json({ error: error.message }, 500)
        event = (ev as EventRow) ?? null
      }

      if (!event) return json({ error: 'evento não encontrado' }, 404)
      if (!email) return json({ error: 'email é obrigatório' }, 400)
      if (!couponActive(event)) {
        return json({ skipped: 'evento sem cupom ativo', event_id: event.id })
      }

      const result = await sendOne({ event, email, leadId, name: leadName, type: 'immediate' })
      return json({ mode, dryRun, result })
    }

    // ----------------------------------------------------------------- reminder
    const today = new Date()
    const target = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 3))
    const targetDay = target.toISOString().slice(0, 10)

    const { data: events, error: evError } = await admin
      .from('events')
      .select(EVENT_COLS)
      .not('vip_coupon_code', 'is', null)
      .gte('vip_coupon_valid_until', `${targetDay}T00:00:00Z`)
      .lt('vip_coupon_valid_until', `${targetDay}T23:59:59.999Z`)

    if (evError) return json({ error: evError.message }, 500)

    const results: unknown[] = []
    let considered = 0

    for (const raw of (events ?? []) as EventRow[]) {
      if (!couponActive(raw)) continue

      const { data: sentImmediate, error: e1 } = await admin
        .from('vip_coupon_email_log')
        .select('email, lead_id')
        .eq('event_id', raw.id)
        .eq('type', 'immediate')
      if (e1) return json({ error: e1.message }, 500)

      const { data: sentReminder, error: e2 } = await admin
        .from('vip_coupon_email_log')
        .select('email')
        .eq('event_id', raw.id)
        .eq('type', 'reminder')
      if (e2) return json({ error: e2.message }, 500)

      const already = new Set((sentReminder ?? []).map((r: any) => r.email))
      for (const row of (sentImmediate ?? []) as Array<{ email: string; lead_id: string | null }>) {
        if (already.has(row.email)) continue
        considered++
        results.push(
          await sendOne({
            event: raw,
            email: row.email,
            leadId: row.lead_id ?? null,
            name: null,
            type: 'reminder',
          })
        )
      }
    }

    return json({
      mode,
      dryRun,
      target_valid_until: targetDay,
      events: (events ?? []).length,
      considered,
      results,
    })
  } catch (err) {
    console.error('[vip-coupon-email] erro inesperado', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

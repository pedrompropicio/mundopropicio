import { sendLovableEmail } from 'npm:@lovable.dev/email-js'
import { createClient } from 'npm:@supabase/supabase-js@2'

const MAX_RETRIES = 5
const DEFAULT_BATCH_SIZE = 10
const DEFAULT_SEND_DELAY_MS = 200
const DEFAULT_AUTH_TTL_MINUTES = 15
const DEFAULT_TRANSACTIONAL_TTL_MINUTES = 60

// Domínios cujo envio sai pela API do Resend em vez do Lovable Email.
const RESEND_DOMAINS: Record<string, string> = {
  'notify.coalafestival.pt': 'RESEND_API_KEY_COALA',
}

class ResendAPIError extends Error {
  status: number
  retryAfterSeconds: number | null
  constructor(status: number, message: string, retryAfterSeconds: number | null = null) {
    super(message); this.name = 'ResendAPIError'
    this.status = status; this.retryAfterSeconds = retryAfterSeconds
  }
}

async function sendViaResend(payload: Record<string, any>, apiKey: string): Promise<void> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
  if (payload.idempotency_key) headers['Idempotency-Key'] = String(payload.idempotency_key)

  const body: Record<string, unknown> = {
    from: payload.from, to: [payload.to], subject: payload.subject,
  }
  if (payload.html) body.html = payload.html
  if (payload.text) body.text = payload.text
  if (payload.reply_to) body.reply_to = payload.reply_to

  const unsubOneClick = payload.unsubscribe_http_url || payload.unsubscribe_url
  if (unsubOneClick) {
    body.headers = {
      'List-Unsubscribe': `<${unsubOneClick}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers, body: JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = await res.text()
    const retryAfter = res.headers.get('retry-after')
    throw new ResendAPIError(res.status,
      `Resend API ${res.status}: ${detail.slice(0, 500)}`,
      retryAfter ? Number(retryAfter) : null)
  }
}

// Check if an error is a rate-limit (429) response.
// Uses EmailAPIError.status when available (email-js >=0.x with structured errors),
// falls back to parsing the error message for older versions.
function isRateLimited(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status === 429
  }
  return error instanceof Error && error.message.includes('429')
}

// Check if an error is a forbidden (403) response. Retrying won't help.
// Move straight to DLQ.
function isForbidden(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status === 403
  }
  return error instanceof Error && error.message.includes('403')
}

// Extract Retry-After seconds from a structured EmailAPIError, or default to 60s.
function getRetryAfterSeconds(error: unknown): number {
  if (error && typeof error === 'object' && 'retryAfterSeconds' in error) {
    return (error as { retryAfterSeconds: number | null }).retryAfterSeconds ?? 60
  }
  return 60
}

function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length < 2) {
    return null
  }

  try {
    const payload = parts[1]
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=')

    return JSON.parse(atob(payload)) as Record<string, unknown>
  } catch {
    return null
  }
}

// Move a message to the dead letter queue and log the reason.
async function moveToDlq(
  supabase: ReturnType<typeof createClient>,
  queue: string,
  msg: { msg_id: number; message: Record<string, unknown> },
  reason: string
): Promise<void> {
  const payload = msg.message
  const { error: dlqLogError } = await supabase.from('email_send_log').insert({
    message_id: payload.message_id,
    template_name: (payload.label || queue) as string,
    recipient_email: payload.to,
    status: 'dlq',
    error_message: reason,
    company_id: payload.company_id ?? null,
  })
  if (dlqLogError) {
    console.error('Failed to log DLQ send', { queue, msg_id: msg.msg_id, code: dlqLogError.code, message: dlqLogError.message })
  }
  const { error } = await supabase.rpc('move_to_dlq', {
    source_queue: queue,
    dlq_name: `${queue}_dlq`,
    message_id: msg.msg_id,
    payload,
  })
  if (error) {
    console.error('Failed to move message to DLQ', { queue, msg_id: msg.msg_id, reason, code: error.code, message: error.message })
  }
}

Deno.serve(async (req) => {
  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Defense in depth: verify_jwt=true already requires a valid JWT at the
  // gateway layer. This adds an explicit role check so only service-role
  // callers can trigger queue processing.
  const token = authHeader.slice('Bearer '.length).trim()
  const claims = parseJwtClaims(token)
  if (claims?.role !== 'service_role') {
    return new Response(
      JSON.stringify({ error: 'Forbidden' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // 1. Check rate-limit cooldown and read queue config
  const { data: state } = await supabase
    .from('email_send_state')
    .select('retry_after_until, batch_size, send_delay_ms, auth_email_ttl_minutes, transactional_email_ttl_minutes')
    .single()

  if (state?.retry_after_until && new Date(state.retry_after_until) > new Date()) {
    return new Response(
      JSON.stringify({ skipped: true, reason: 'rate_limited' }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  }

  const batchSize = state?.batch_size ?? DEFAULT_BATCH_SIZE
  const sendDelayMs = state?.send_delay_ms ?? DEFAULT_SEND_DELAY_MS
  const ttlMinutes: Record<string, number> = {
    auth_emails: state?.auth_email_ttl_minutes ?? DEFAULT_AUTH_TTL_MINUTES,
    transactional_emails: state?.transactional_email_ttl_minutes ?? DEFAULT_TRANSACTIONAL_TTL_MINUTES,
  }

  let totalProcessed = 0

  // 2. Process auth_emails first (priority), then transactional_emails
  for (const queue of ['auth_emails', 'transactional_emails']) {
    const { data: messages, error: readError } = await supabase.rpc('read_email_batch', {
      queue_name: queue,
      batch_size: batchSize,
      vt: 30,
    })

    if (readError) {
      console.error('Failed to read email batch', { queue, code: readError.code, message: readError.message })
      continue
    }

    if (!messages?.length) continue

    // Retry budget is based on real send failures, not pgmq read_ct.
    // read_ct increments for every message in a claimed batch, including
    // messages not attempted when a 429 stops processing early.
    const messageIds = Array.from(
      new Set(
        messages
          .map((msg) =>
            msg?.message?.message_id && typeof msg.message.message_id === 'string'
              ? msg.message.message_id
              : null
          )
          .filter((id): id is string => Boolean(id))
      )
    )
    const failedAttemptsByMessageId = new Map<string, number>()
    if (messageIds.length > 0) {
      const { data: failedRows, error: failedRowsError } = await supabase
        .from('email_send_log')
        .select('message_id')
        .in('message_id', messageIds)
        .eq('status', 'failed')

      if (failedRowsError) {
        console.error('Failed to load failed-attempt counters', {
          queue,
          code: failedRowsError.code,
          message: failedRowsError.message,
        })
      } else {
        for (const row of failedRows ?? []) {
          const messageId = row?.message_id
          if (typeof messageId !== 'string' || !messageId) continue
          failedAttemptsByMessageId.set(
            messageId,
            (failedAttemptsByMessageId.get(messageId) ?? 0) + 1
          )
        }
      }
    }

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      const payload = msg.message
      const failedAttempts =
        payload?.message_id && typeof payload.message_id === 'string'
          ? (failedAttemptsByMessageId.get(payload.message_id) ?? 0)
          : msg.read_ct ?? 0

      // Drop expired messages (TTL exceeded).
      // Prefer payload.queued_at when present; fall back to PGMQ's enqueued_at
      // which is always set by the queue.
      const queuedAt = payload.queued_at ?? msg.enqueued_at
      if (queuedAt) {
        const ageMs = Date.now() - new Date(queuedAt).getTime()
        const maxAgeMs = ttlMinutes[queue] * 60 * 1000
        if (ageMs > maxAgeMs) {
          console.warn('Email expired (TTL exceeded)', {
            queue,
            msg_id: msg.msg_id,
            queued_at: queuedAt,
            ttl_minutes: ttlMinutes[queue],
          })
          await moveToDlq(supabase, queue, msg, `TTL exceeded (${ttlMinutes[queue]} minutes)`)
          continue
        }
      }

      // Move to DLQ if max failed send attempts reached.
      if (failedAttempts >= MAX_RETRIES) {
        await moveToDlq(supabase, queue, msg, `Max retries (${MAX_RETRIES}) exceeded (attempted ${failedAttempts} times)`)
        continue
      }

      // Guard: skip if another worker already sent this message (VT expired race)
      if (payload.message_id) {
        const { data: alreadySent } = await supabase
          .from('email_send_log')
          .select('id')
          .eq('message_id', payload.message_id)
          .eq('status', 'sent')
          .maybeSingle()

        if (alreadySent) {
          console.warn('Skipping duplicate send (already sent)', {
            queue,
            msg_id: msg.msg_id,
            message_id: payload.message_id,
          })
          const { error: dupDelError } = await supabase.rpc('delete_email', {
            queue_name: queue,
            message_id: msg.msg_id,
          })
          if (dupDelError) {
            console.error('Failed to delete duplicate message from queue', { queue, msg_id: msg.msg_id, code: dupDelError.code, message: dupDelError.message })
          }
          continue
        }
      }

      // A supressão vale para comunicação comercial e transaccional de produto.
      // NUNCA para emails de autenticação: quem deu bounce ou cancelou marketing
      // continua a precisar de recuperar a conta.
      const isAuthEmail = queue === 'auth_emails' || payload.purpose === 'auth'
      if (payload.to && !isAuthEmail) {
        const recipient = String(payload.to).toLowerCase().trim()
        let q = supabase.from('suppressed_emails').select('reason').eq('email', recipient)
        if (payload.company_id) q = q.eq('company_id', payload.company_id)
        const { data: suppressed, error: suppressionError } = await q.maybeSingle()

        if (suppressionError) {
          console.error('Suppression check failed', { queue, msg_id: msg.msg_id, code: suppressionError.code, message: suppressionError.message })
          continue
        }
        if (suppressed) {
          console.warn('Skipping suppressed recipient', { queue, msg_id: msg.msg_id, reason: suppressed.reason })
          const { error: logError } = await supabase.from('email_send_log').insert({
            message_id: payload.message_id,
            template_name: payload.label || queue,
            recipient_email: payload.to,
            status: 'suppressed',
            error_message: `Recipient is suppressed (${suppressed.reason})`,
            company_id: payload.company_id ?? null,
          })
          if (logError) console.error('Failed to log suppressed send', { code: logError.code, message: logError.message })
          const { error: delError } = await supabase.rpc('delete_email', { queue_name: queue, message_id: msg.msg_id })
          if (delError) console.error('Failed to delete suppressed message', { queue, msg_id: msg.msg_id, code: delError.code, message: delError.message })
          continue
        }
      }

      const senderDomain = typeof payload.sender_domain === 'string' ? payload.sender_domain : ''
      const resendEnvVar = RESEND_DOMAINS[senderDomain]

      try {
        if (resendEnvVar) {
          const resendKey = Deno.env.get(resendEnvVar)
          if (!resendKey) throw new Error(`Missing ${resendEnvVar} for sender_domain ${senderDomain}`)
          await sendViaResend(payload, resendKey)
        } else {
          await sendLovableEmail(
            {
              run_id: payload.run_id,
              to: payload.to,
              from: payload.from,
              sender_domain: payload.sender_domain,
              subject: payload.subject,
              html: payload.html,
              text: payload.text,
              purpose: payload.purpose,
              label: payload.label,
              idempotency_key: payload.idempotency_key,
              unsubscribe_token: payload.unsubscribe_token,
              message_id: payload.message_id,
            },
            // sendUrl is optional — when LOVABLE_SEND_URL is not set, the library
            // falls back to the default Lovable API endpoint (https://api.lovable.dev).
            // Set LOVABLE_SEND_URL as a Supabase secret to override (e.g. for local dev).
            { apiKey, sendUrl: Deno.env.get('LOVABLE_SEND_URL') }
          )
        }

        // Log success
        const { error: sentLogError } = await supabase.from('email_send_log').insert({
          message_id: payload.message_id,
          template_name: payload.label || queue,
          recipient_email: payload.to,
          status: 'sent',
          company_id: payload.company_id ?? null,
        })
        if (sentLogError) {
          console.error('Failed to log sent email', { queue, msg_id: msg.msg_id, code: sentLogError.code, message: sentLogError.message })
        }

        // Delete from queue
        const { error: delError } = await supabase.rpc('delete_email', {
          queue_name: queue,
          message_id: msg.msg_id,
        })
        if (delError) {
          console.error('Failed to delete sent message from queue', { queue, msg_id: msg.msg_id, code: delError.code, message: delError.message })
        }
        totalProcessed++
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error('Email send failed', {
          queue,
          msg_id: msg.msg_id,
          read_ct: msg.read_ct,
          failed_attempts: failedAttempts,
          error: errorMsg,
        })

        if (isRateLimited(error)) {
          const { error: rlLogError } = await supabase.from('email_send_log').insert({
            message_id: payload.message_id,
            template_name: payload.label || queue,
            recipient_email: payload.to,
            status: 'rate_limited',
            error_message: errorMsg.slice(0, 1000),
            company_id: payload.company_id ?? null,
          })
          if (rlLogError) {
            console.error('Failed to log rate-limited send', { queue, msg_id: msg.msg_id, code: rlLogError.code, message: rlLogError.message })
          }

          const retryAfterSecs = getRetryAfterSeconds(error)
          await supabase
            .from('email_send_state')
            .update({
              retry_after_until: new Date(
                Date.now() + retryAfterSecs * 1000
              ).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', 1)

          // Stop processing — remaining messages stay in queue (VT expires, retried next cycle)
          return new Response(
            JSON.stringify({ processed: totalProcessed, stopped: 'rate_limited' }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        }

        // 403s are permanent configuration or authorization failures for this
        // message, so move straight to DLQ and stop processing the rest of the batch.
        if (isForbidden(error)) {
          await moveToDlq(supabase, queue, msg, errorMsg.slice(0, 1000))
          return new Response(
            JSON.stringify({ processed: totalProcessed, stopped: 'forbidden' }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        }

        // Log non-429 failures to track real retry attempts.
        const { error: failedLogError } = await supabase.from('email_send_log').insert({
          message_id: payload.message_id,
          template_name: payload.label || queue,
          recipient_email: payload.to,
          status: 'failed',
          error_message: errorMsg.slice(0, 1000),
          company_id: payload.company_id ?? null,
        })
        if (failedLogError) {
          console.error('Failed to log failed send', { queue, msg_id: msg.msg_id, code: failedLogError.code, message: failedLogError.message })
        }
        if (payload?.message_id && typeof payload.message_id === 'string') {
          failedAttemptsByMessageId.set(payload.message_id, failedAttempts + 1)
        }

        // Non-429 errors: message stays invisible until VT expires, then retried
      }

      // Small delay between sends to smooth bursts
      if (i < messages.length - 1) {
        await new Promise((r) => setTimeout(r, sendDelayMs))
      }
    }
  }

  return new Response(
    JSON.stringify({ processed: totalProcessed }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})

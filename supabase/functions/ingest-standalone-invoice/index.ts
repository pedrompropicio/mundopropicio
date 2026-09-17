// ingest-standalone-invoice — ingestão externa de faturas avulsas (#191–#193).
// Regra absoluta: esta função escreve apenas em standalone_invoices e no bucket homónimo.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { z } from 'npm:zod@3.23.8'

const BUCKET = 'standalone-invoices'
const MAX_BYTES = 20 * 1024 * 1024
const EXT_BY_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

const BodySchema = z.object({
  origem: z.string().trim().url().optional(),
  conteudo_base64: z.string().trim().min(1).optional(),
  nome: z.string().trim().min(1).max(255),
  company_id: z.string().uuid(),
  supplier_name: z.string().trim().max(255).nullish(),
  supplier_nif: z.string().trim().max(32).nullish(),
  invoice_number: z.string().trim().max(100).nullish(),
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  currency: z.enum(['EUR', 'USD', 'BRL', 'GBP']).default('EUR'),
  original_amount: z.number().finite().nonnegative().nullish(),
  fx_rate: z.number().finite().positive().nullish(),
  fx_rate_source: z.string().trim().max(100).nullish(),
  total_amount: z.number().finite().nonnegative(),
  iva_amount: z.number().finite().nonnegative().nullish(),
  notes: z.string().trim().max(2000).nullish(),
  paid_by_partner_id: z.string().uuid().nullish(),
  created_by: z.string().uuid().nullish(),
}).superRefine((value, ctx) => {
  if (Boolean(value.origem) === Boolean(value.conteudo_base64)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Indique exatamente uma origem: origem ou conteudo_base64.' })
  }
  if (value.currency !== 'EUR') {
    if (value.original_amount == null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['original_amount'], message: 'Obrigatório para moeda não EUR.' })
    if (value.fx_rate == null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fx_rate'], message: 'Obrigatório para moeda não EUR.' })
    if (value.original_amount != null && value.fx_rate != null) {
      const expected = Math.round(value.original_amount * value.fx_rate * 100) / 100
      if (Math.abs(expected - value.total_amount) > 0.01) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['total_amount'], message: 'O total EUR não corresponde ao valor original × câmbio.' })
      }
    }
  }
})

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

function normalizeDriveUrl(raw: string): string {
  const url = new URL(raw)
  if (url.hostname !== 'drive.google.com') return raw
  const id = url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ?? url.searchParams.get('id')
  return id ? `https://drive.google.com/uc?export=download&id=${id}` : raw
}

function allowedUrl(raw: string): string | null {
  try {
    const normalized = normalizeDriveUrl(raw)
    const url = new URL(normalized)
    const allowedHost = url.hostname === 'drive.google.com' || url.hostname.endsWith('.googleusercontent.com')
    return url.protocol === 'https:' && allowedHost ? normalized : null
  } catch {
    return null
  }
}

function detectType(bytes: Uint8Array): string | null {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return 'application/pdf'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  return null
}

function safeBaseName(name: string): string {
  const stem = name.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return stem.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'fatura'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não suportado — usar POST.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server configuration error' }, 500)

  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  let role = ''
  try {
    const encoded = bearer.split('.')[1]
    if (encoded) role = JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')))?.role ?? ''
  } catch { role = '' }
  if (bearer !== serviceKey && role !== 'service_role') {
    return json({ error: 'Não autorizado — esta função só aceita service_role.' }, 401)
  }

  let raw: unknown
  try { raw = await req.json() } catch { return json({ error: 'Corpo inválido — esperado JSON.' }, 400) }
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400)
  const body = parsed.data
  const admin = createClient(supabaseUrl, serviceKey)

  const { data: company, error: companyError } = await admin.from('companies').select('id').eq('id', body.company_id).maybeSingle()
  if (companyError) return json({ error: `Erro ao validar empresa: ${companyError.message}` }, 500)
  if (!company) return json({ error: 'Empresa não encontrada.' }, 404)

  const canDedupe = Boolean(body.supplier_nif && body.invoice_number)
  const findExisting = async () => {
    if (!canDedupe) return null
    const { data, error } = await admin.from('standalone_invoices')
      .select('id, storage_path').eq('company_id', body.company_id)
      .eq('supplier_nif', body.supplier_nif ?? '').eq('invoice_number', body.invoice_number ?? '').maybeSingle()
    if (error) throw error
    return data
  }
  try {
    const existing = await findExisting()
    if (existing) return json({ id: existing.id, storage_path: existing.storage_path, reused: true })
  } catch (error) {
    return json({ error: `Erro ao verificar duplicado: ${error instanceof Error ? error.message : String(error)}` }, 500)
  }

  let bytes: Uint8Array
  if (body.conteudo_base64) {
    try {
      const binary = atob(body.conteudo_base64.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, ''))
      bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    } catch { return json({ error: 'conteudo_base64 não é base64 válido.' }, 400) }
  } else {
    const source = allowedUrl(body.origem ?? '')
    if (!source) return json({ error: 'origem só aceita URLs HTTPS de Google Drive/Googleusercontent.' }, 400)
    let response: Response
    try { response = await fetch(source, { redirect: 'follow', headers: { 'User-Agent': 'MP-ingest-standalone-invoice/1.0' } }) }
    catch { return json({ error: 'Falha ao descarregar a origem.' }, 502) }
    if (!response.ok) return json({ error: `A origem devolveu HTTP ${response.status}.` }, 502)
    if ((response.headers.get('content-type') ?? '').toLowerCase().startsWith('text/html')) return json({ error: 'A origem devolveu HTML em vez do ficheiro.' }, 422)
    const declared = Number(response.headers.get('content-length') ?? 0)
    if (declared > MAX_BYTES) return json({ error: 'Ficheiro demasiado grande — máximo 20 MB.' }, 413)
    bytes = new Uint8Array(await response.arrayBuffer())
  }
  if (bytes.byteLength === 0) return json({ error: 'Ficheiro vazio.' }, 422)
  if (bytes.byteLength > MAX_BYTES) return json({ error: 'Ficheiro demasiado grande — máximo 20 MB.' }, 413)
  const contentType = detectType(bytes)
  if (!contentType) return json({ error: 'Tipo não suportado — aceites PDF, JPEG e PNG.' }, 415)

  const year = body.invoice_date?.slice(0, 4) ?? new Date().getUTCFullYear().toString()
  const path = `${body.company_id}/${year}/${safeBaseName(body.nome)}-${crypto.randomUUID()}.${EXT_BY_TYPE[contentType]}`
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false })
  if (uploadError) return json({ error: `Falha no upload: ${uploadError.message}` }, 500)

  const cleanup = async () => { await admin.storage.from(BUCKET).remove([path]).catch(() => undefined) }
  const { data: inserted, error: insertError } = await admin.from('standalone_invoices').insert({
    company_id: body.company_id, storage_path: path, file_name: body.nome,
    supplier_name: body.supplier_name || null, supplier_nif: body.supplier_nif || null,
    invoice_number: body.invoice_number || null, invoice_date: body.invoice_date || null,
    currency: body.currency, original_amount: body.original_amount ?? null,
    fx_rate: body.fx_rate ?? null, fx_rate_source: body.fx_rate_source || null,
    total_amount: body.total_amount, iva_amount: body.iva_amount ?? null,
    notes: body.notes || null, paid_by_partner_id: body.paid_by_partner_id ?? null,
    created_by: body.created_by ?? null, status: 'new',
  }).select('id, storage_path').single()

  if (insertError) {
    await cleanup()
    if (insertError.code === '23505' && canDedupe) {
      try {
        const existing = await findExisting()
        if (existing) return json({ id: existing.id, storage_path: existing.storage_path, reused: true })
      } catch { /* devolve o erro original */ }
    }
    return json({ error: `Falha ao gravar fatura: ${insertError.message}` }, 500)
  }
  return json({ id: inserted.id, storage_path: inserted.storage_path, reused: false })
})
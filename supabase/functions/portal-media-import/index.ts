// portal-media-import — importa uma imagem a partir de um URL público e
// grava-a no bucket `portal-marketing-images`, actualizando o slot correspondente
// em `event_marketing`.
//
// POST { event_id, slot: 'poster'|'hero'|'og', source_url }
//
// Autorização: só service_role. A função é chamada por net.http_post (trigger/cron
// com a key do Vault) ou manualmente. Nenhum acesso anónimo — `verify_jwt = true`
// no config.toml e comparação explícita do Bearer com SUPABASE_SERVICE_ROLE_KEY.

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

const BUCKET = 'portal-marketing-images'
const MAX_BYTES = 15 * 1024 * 1024

const SLOT_COLUMN: Record<string, string> = {
  poster: 'poster_vertical_url',
  hero: 'hero_image_url',
  og: 'og_image_url',
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Método não suportado — usar POST.' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    console.error('[portal-media-import] missing env')
    return json({ error: 'Server configuration error' }, 500)
  }

  // Só service_role.
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (bearer !== serviceKey) {
    return json({ error: 'Não autorizado — esta função só aceita a service_role key.' }, 401)
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) ?? {}
  } catch {
    return json({ error: 'Corpo inválido — esperado JSON.' }, 400)
  }

  const eventId = typeof body.event_id === 'string' ? body.event_id.trim() : ''
  const slot = typeof body.slot === 'string' ? body.slot.trim() : ''
  const sourceUrl = typeof body.source_url === 'string' ? body.source_url.trim() : ''

  if (!eventId) return json({ error: 'event_id é obrigatório.' }, 400)
  if (!SLOT_COLUMN[slot]) {
    return json({ error: "slot inválido — usar 'poster', 'hero' ou 'og'." }, 400)
  }
  let parsedUrl: URL
  try {
    parsedUrl = new URL(sourceUrl)
  } catch {
    return json({ error: 'source_url inválido.' }, 400)
  }
  if (parsedUrl.protocol !== 'https:') {
    return json({ error: 'source_url tem de ser https.' }, 400)
  }

  const admin = createClient(supabaseUrl, serviceKey)

  // 1) Evento -> company_id (o path do bucket TEM de começar por company_id).
  const { data: event, error: eventError } = await admin
    .from('events')
    .select('id, company_id')
    .eq('id', eventId)
    .maybeSingle()

  if (eventError) {
    console.error('[portal-media-import] events select', eventError)
    return json({ error: `Erro ao ler o evento: ${eventError.message}` }, 500)
  }
  if (!event) return json({ error: 'Evento não encontrado.' }, 404)
  if (!event.company_id) {
    return json({ error: 'Evento sem company_id — impossível construir o path isolado.' }, 400)
  }

  // 2) Descarregar a imagem (redirects do Drive são seguidos).
  let res: Response
  try {
    res = await fetch(sourceUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MP-portal-media-import/1.0)' },
    })
  } catch (e) {
    return json({ error: `Falha ao descarregar o source_url: ${String(e)}` }, 502)
  }
  if (!res.ok) {
    return json({ error: `source_url devolveu HTTP ${res.status}.` }, 502)
  }

  const rawType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()

  if (rawType.startsWith('text/html')) {
    return json(
      {
        error:
          'O URL devolveu HTML em vez de uma imagem — típico da página de confirmação do Google Drive (ficheiro grande ou aviso de vírus) ou de um link de partilha. Usar um link directo de download da imagem.',
      },
      422,
    )
  }
  const ext = EXT_BY_TYPE[rawType]
  if (!ext) {
    return json(
      { error: `content-type não suportado: ${rawType || 'desconhecido'} — aceites: image/jpeg, image/png, image/webp.` },
      415,
    )
  }

  const declared = Number(res.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    return json({ error: `Imagem demasiado grande (${declared} bytes) — máximo 15 MB.` }, 413)
  }

  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.byteLength === 0) return json({ error: 'Imagem vazia.' }, 422)
  if (bytes.byteLength > MAX_BYTES) {
    return json({ error: `Imagem demasiado grande (${bytes.byteLength} bytes) — máximo 15 MB.` }, 413)
  }

  // 3) Upload — path isolado por empresa (RLS hardening do bucket).
  const path = `${event.company_id}/events/${eventId}/${slot}-${Date.now()}.${ext}`
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: rawType, upsert: false })

  if (uploadError) {
    console.error('[portal-media-import] upload', uploadError)
    return json({ error: `Falha no upload para o storage: ${uploadError.message}` }, 500)
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)
  const publicUrl = pub?.publicUrl
  if (!publicUrl) {
    return json({ error: 'Não foi possível obter o public URL do ficheiro.' }, 500)
  }

  // 4) Actualizar event_marketing (nunca criar a row).
  const column = SLOT_COLUMN[slot]
  const { data: updated, error: updateError } = await admin
    .from('event_marketing')
    .update({ [column]: publicUrl })
    .eq('event_id', eventId)
    .select('event_id')
    .maybeSingle()

  if (updateError) {
    console.error('[portal-media-import] event_marketing update', updateError)
    return json({ error: `Falha ao gravar em event_marketing: ${updateError.message}` }, 500)
  }
  if (!updated) {
    return json(
      {
        error:
          'Não existe row de event_marketing para este evento — criar primeiro o registo de marketing no CRM. Ficheiro carregado no storage mas não associado.',
        uploaded_path: path,
      },
      409,
    )
  }

  return json({
    ok: true,
    slot,
    url: publicUrl,
    bytes: bytes.byteLength,
    content_type: rawType,
  })
})

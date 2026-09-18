// ingest-transaction-document — anexa UM documento a UMA OU VÁRIAS transações,
// sem browser. Issue #180. A origem pode ser um URL do Google Drive OU o
// conteúdo do ficheiro em base64 no próprio pedido.
//
// POST { origem | conteudo_base64, nome, doc_type?, is_accounting?, partner_visible?, alvo }
//   alvo: { transaction_id } | { invoice_group_id } | { supplier_id, invoice_ref }
//
// Autorização: só service_role. `verify_jwt = true` no config.toml valida a
// assinatura; aqui validamos o claim `role` do JWT (a key do Vault é um
// service_role JWT que não é byte-igual à env key) ou a igualdade byte-a-byte
// com a env key (keys novas não-JWT). Molde igual ao `portal-media-import`.
//
// Não altera o fluxo de upload do ecrã, nem `update-transaction`, nem
// `revalidateInvoiceGroupAfterDocument`.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { fetchAllPagedQuery } from '../_shared/paging.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const BUCKET = 'transaction-documents'
const MAX_BYTES = 20 * 1024 * 1024

const EXT_BY_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

/** Normaliza links de partilha do Drive para o URL de download directo. */
function normalizeDriveUrl(raw: string): string {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return raw
  }
  if (u.hostname !== 'drive.google.com') return raw
  const m = u.pathname.match(/\/file\/d\/([^/]+)/)
  const id = m?.[1] ?? u.searchParams.get('id')
  if (!id) return raw
  return `https://drive.google.com/uc?export=download&id=${id}`
}

function isAllowedHost(hostname: string): boolean {
  return hostname === 'drive.google.com' || hostname.endsWith('.googleusercontent.com')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não suportado — usar POST.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    console.error('[ingest-transaction-document] missing env')
    return json({ error: 'Server configuration error' }, 500)
  }

  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  const isServiceRole = ((): boolean => {
    if (serviceKey && bearer === serviceKey) return true
    const parts = bearer.split('.')
    if (parts.length !== 3) return false
    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as {
        role?: unknown
      }
      return payload.role === 'service_role'
    } catch {
      return false
    }
  })()
  if (!isServiceRole) {
    return json({ error: 'Não autorizado — esta função só aceita a service_role key.' }, 401)
  }

  let body: Record<string, any> = {}
  try {
    body = (await req.json()) ?? {}
  } catch {
    return json({ error: 'Corpo inválido — esperado JSON.' }, 400)
  }

  const origem = typeof body.origem === 'string' ? body.origem.trim() : ''
  const conteudoBase64 = typeof body.conteudo_base64 === 'string' ? body.conteudo_base64.trim() : ''
  const nome = typeof body.nome === 'string' ? body.nome.trim() : ''
  const docType = typeof body.doc_type === 'string' && body.doc_type.trim() ? body.doc_type.trim() : 'pdf'
  const isAccounting = body.is_accounting === undefined ? true : body.is_accounting === true
  const partnerVisible = body.partner_visible === undefined ? true : body.partner_visible === true
  const alvo = (body.alvo ?? {}) as Record<string, unknown>

  if (!origem && !conteudoBase64) {
    return json({ error: 'origem ou conteudo_base64 é obrigatório.' }, 400)
  }
  if (origem && conteudoBase64) {
    return json({ error: 'usar origem OU conteudo_base64, nunca os dois.' }, 400)
  }
  if (!nome) return json({ error: 'nome é obrigatório.' }, 400)

  const targetTransactionId = typeof alvo.transaction_id === 'string' ? alvo.transaction_id.trim() : ''
  const targetGroupId = typeof alvo.invoice_group_id === 'string' ? alvo.invoice_group_id.trim() : ''
  const targetSupplierId = typeof alvo.supplier_id === 'string' ? alvo.supplier_id.trim() : ''
  const targetInvoiceRef = typeof alvo.invoice_ref === 'string' ? alvo.invoice_ref.trim() : ''
  const forms = [
    targetTransactionId ? 1 : 0,
    targetGroupId ? 1 : 0,
    targetSupplierId && targetInvoiceRef ? 1 : 0,
  ].reduce((a, b) => a + b, 0)
  if (forms !== 1) {
    return json(
      {
        error:
          'alvo tem de ser exactamente uma de três formas: { transaction_id }, { invoice_group_id } ou { supplier_id, invoice_ref }.',
      },
      400,
    )
  }

  // ---- origem ------------------------------------------------------------
  let sourceUrl = ''
  if (origem) {
    sourceUrl = normalizeDriveUrl(origem)
    let parsed: URL
    try {
      parsed = new URL(sourceUrl)
    } catch {
      return json({ error: 'origem não é um URL válido.' }, 400)
    }
    if (parsed.protocol !== 'https:' || !isAllowedHost(parsed.hostname)) {
      return json(
        { error: 'origem só aceita URLs https de drive.google.com ou *.googleusercontent.com.' },
        400,
      )
    }
  }

  const admin = createClient(supabaseUrl, serviceKey)

  // ---- resolução do alvo -------------------------------------------------
  const TX_COLS = 'id, company_id, invoice_group_id, supplier_id, invoice_ref'
  let rows: Array<{
    id: string
    company_id: string | null
    invoice_group_id: string | null
    supplier_id: string | null
    invoice_ref: string | null
  }> = []
  let groupIdToAssign: string | null = null

  if (targetTransactionId) {
    const { data: tx, error } = await admin
      .from('transactions')
      .select(TX_COLS)
      .eq('id', targetTransactionId)
      .maybeSingle()
    if (error) return json({ error: `Erro ao ler a transação: ${error.message}` }, 500)
    if (!tx) return json({ error: 'Transação não encontrada.' }, 404)
    if (tx.invoice_group_id) {
      const { data: siblings, error: se } = await fetchAllPagedQuery(
        admin
          .from('transactions')
          .select(TX_COLS)
          .eq('invoice_group_id', tx.invoice_group_id),
      )
      if (se) return json({ error: `Erro ao ler o grupo de fatura: ${se.message}` }, 500)
      rows = siblings ?? [tx]
    } else {
      rows = [tx]
    }
  } else if (targetGroupId) {
    const { data, error } = await fetchAllPagedQuery(
      admin.from('transactions').select(TX_COLS).eq('invoice_group_id', targetGroupId),
    )
    if (error) return json({ error: `Erro ao ler o grupo de fatura: ${error.message}` }, 500)
    rows = data ?? []
    if (rows.length === 0) return json({ error: 'Nenhuma transação neste grupo de fatura.' }, 404)
  } else {
    // supplier_id + invoice_ref — igualdade EXACTA, sem normalização tolerante
    // (regra fixa da feature invoice-groups).
    const { data, error } = await fetchAllPagedQuery(
      admin
        .from('transactions')
        .select(TX_COLS)
        .eq('supplier_id', targetSupplierId)
        .eq('invoice_ref', targetInvoiceRef),
    )
    if (error) return json({ error: `Erro ao procurar as transações: ${error.message}` }, 500)
    rows = data ?? []
    if (rows.length === 0) {
      return json({ error: 'Nenhuma transação deste fornecedor com este invoice_ref.' }, 404)
    }
    const withGroup = rows.filter((r) => r.invoice_group_id)
    const withoutGroup = rows.filter((r) => !r.invoice_group_id)
    if (withGroup.length > 0 && withoutGroup.length > 0) {
      return json(
        {
          error:
            'Algumas transações já pertencem a um grupo de fatura e outras não — resolver o agrupamento antes de anexar.',
          com_grupo: withGroup.map((r) => ({ transaction_id: r.id, invoice_group_id: r.invoice_group_id })),
          sem_grupo: withoutGroup.map((r) => r.id),
        },
        409,
      )
    }
    if (withGroup.length === 0 && rows.length > 1) {
      // Agrupamento explícito: a chamada é a confirmação humana (aplica-se
      // também a proformas, porque aqui há confirmação).
      groupIdToAssign = crypto.randomUUID()
    }
  )}

  // Mesma empresa, obrigatoriamente.
  const companies = Array.from(new Set(rows.map((r) => r.company_id)))
  if (companies.length !== 1 || !companies[0]) {
    return json(
      { error: 'As transações do alvo não são todas da mesma empresa (ou têm company_id vazio).', companies },
      422,
    )
  }
  const companyId = companies[0] as string
  const transactionIds = rows.map((r) => r.id)
  const invoiceGroupId = groupIdToAssign ?? rows.find((r) => r.invoice_group_id)?.invoice_group_id ?? null

  // ---- obter o ficheiro (URL do Drive ou base64 no pedido) ---------------
  let bytes: Uint8Array
  let contentType: string
  let ext: string

  if (conteudoBase64) {
    try {
      const clean = conteudoBase64.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '')
      const bin = atob(clean)
      const buf = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
      bytes = buf
    } catch {
      return json({ error: 'conteudo_base64 não é base64 válido.' }, 400)
    }
    if (bytes.byteLength === 0) return json({ error: 'Ficheiro vazio.' }, 422)
    if (bytes.byteLength > MAX_BYTES) {
      return json({ error: `Ficheiro demasiado grande (${bytes.byteLength} bytes) — máximo 20 MB.` }, 413)
    }
    // Tipo detectado pelos magic bytes: %PDF-, JPEG (FF D8 FF), PNG (89 50 4E 47).
    const b = bytes
    const detected =
      b.byteLength >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d
        ? 'application/pdf'
        : b.byteLength >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
          ? 'image/jpeg'
          : b.byteLength >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
            ? 'image/png'
            : ''
    if (!detected) {
      return json(
        {
          error:
            'Tipo de ficheiro não suportado em conteudo_base64 — aceites: application/pdf, image/jpeg, image/png.',
        },
        415,
      )
    }
    contentType = detected
    ext = EXT_BY_TYPE[detected]
  } else {
    let res: Response
    try {
      res = await fetch(sourceUrl, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MP-ingest-transaction-document/1.0)' },
      })
    } catch (e) {
      return json({ error: `Falha ao descarregar a origem: ${String(e)}` }, 502)
    }
    if (!res.ok) return json({ error: `A origem devolveu HTTP ${res.status}.` }, 502)

    contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (contentType.startsWith('text/html')) {
      return json(
        {
          error:
            'A origem devolveu HTML em vez do ficheiro — é a página de aviso do Google Drive (ficheiro grande ou aviso de vírus). Usar um link de download directo.',
        },
        422,
      )
    }
    const maybeExt = EXT_BY_TYPE[contentType]
    if (!maybeExt) {
      return json(
        {
          error: `Tipo de ficheiro não suportado: ${contentType || 'desconhecido'} — aceites: application/pdf, image/jpeg, image/png.`,
        },
        415,
      )
    }
    ext = maybeExt
    const declared = Number(res.headers.get('content-length') ?? '0')
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      return json({ error: `Ficheiro demasiado grande (${declared} bytes) — máximo 20 MB.` }, 413)
    }
    bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength === 0) return json({ error: 'Ficheiro vazio.' }, 422)
    if (bytes.byteLength > MAX_BYTES) {
      return json({ error: `Ficheiro demasiado grande (${bytes.byteLength} bytes) — máximo 20 MB.` }, 413)
    }
  }

  // ---- idempotência ------------------------------------------------------
  // Já existe uma linha com o MESMO nome e o MESMO tamanho de ficheiro em
  // qualquer das N transações? Então reutiliza-se o file_url e criam-se só as
  // linhas em falta, sem subir um segundo objeto.
  const { data: existingDocs, error: exErr } = await fetchAllPagedQuery(
    admin
      .from('transaction_documents')
      .select('id, transaction_id, name, file_url')
      .in('transaction_id', transactionIds)
      .eq('name', nome),
  )
  if (exErr) return json({ error: `Erro ao verificar documentos existentes: ${exErr.message}` }, 500)

  async function storageSize(path: string): Promise<number | null> {
    if (!path || path.startsWith('ref://') || path.includes('://')) return null
    const idx = path.lastIndexOf('/')
    const folder = idx > 0 ? path.slice(0, idx) : ''
    const fileName = idx > 0 ? path.slice(idx + 1) : path
    const { data, error } = await admin.storage.from(BUCKET).list(folder, { search: fileName, limit: 100 })
    if (error || !data) return null
    const hit = data.find((o) => o.name === fileName)
    const size = (hit?.metadata as Record<string, unknown> | undefined)?.size
    return typeof size === 'number' ? size : null
  }

  let fileUrl: string | null = null
  for (const url of Array.from(new Set((existingDocs ?? []).map((d) => d.file_url)))) {
    const size = await storageSize(url)
    if (size !== null && size === bytes.byteLength) {
      fileUrl = url
      break
    }
  }

  const reusedFile = fileUrl !== null
  let uploadedPath: string | null = null
  if (!fileUrl) {
    const path = `${companyId}/${transactionIds[0]}/${Date.now()}.${ext}`
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType, upsert: false })
    if (upErr) {
      console.error('[ingest-transaction-document] upload', upErr)
      return json({ error: `Falha no upload para o storage: ${upErr.message}` }, 500)
    }
    fileUrl = path
    uploadedPath = path
  }

  // Linhas em falta = transações que ainda não têm este file_url com este nome.
  const alreadyLinked = new Set(
    (existingDocs ?? []).filter((d) => d.file_url === fileUrl).map((d) => d.transaction_id),
  )
  const missing = transactionIds.filter((id) => !alreadyLinked.has(id))

  if (missing.length > 0) {
    const { error: insErr } = await admin.from('transaction_documents').insert(
      missing.map((id) => ({
        transaction_id: id,
        name: nome,
        file_url: fileUrl,
        doc_type: docType,
        is_accounting: isAccounting,
        partner_visible: partnerVisible,
        uploaded_by: 'ingest-api',
        // company_id explícito: o trigger set_company_id_on_insert aborta sem
        // contexto de utilizador.
        company_id: companyId,
      })),
    )
    if (insErr) {
      // Nunca deixar ficheiro órfão no storage.
      if (uploadedPath) {
        await admin.storage.from(BUCKET).remove([uploadedPath]).catch(() => {})
      }
      console.error('[ingest-transaction-document] insert', insErr)
      return json({ error: `Falha ao gravar transaction_documents: ${insErr.message}` }, 500)
    }
  }

  // Agrupamento explícito (só no caminho supplier_id + invoice_ref).
  if (groupIdToAssign) {
    const { error: gErr } = await admin
      .from('transactions')
      .update({ invoice_group_id: groupIdToAssign })
      .in('id', transactionIds)
    if (gErr) {
      console.error('[ingest-transaction-document] invoice_group_id', gErr)
      return json(
        {
          error: `Documento anexado mas falhou o agrupamento da fatura: ${gErr.message}`,
          file_url: fileUrl,
          transaction_ids: transactionIds,
        },
        500,
      )
    }
  }

  return json({
    file_url: fileUrl,
    transaction_ids: transactionIds,
    invoice_group_id: invoiceGroupId,
    created: missing.length,
    reused: transactionIds.length - missing.length,
    reused_file: reusedFile,
  })
})

import { fetchAllPagedQuery } from "../_shared/paging.ts";
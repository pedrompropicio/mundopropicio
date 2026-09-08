import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

/**
 * Auditoria dos grupos de fatura existentes.
 *
 * Percorre todas as transações com invoice_group_id, lê os documentos anexos com
 * o OCR (extract-invoice-total) e compara o número impresso com o invoice_ref.
 *
 *  action 'dry-run' → grava veredictos em invoice_group_audit (aplicado=false), NÃO altera transações.
 *  action 'apply'   → aplica só as linhas veredicto='desagrupar' do último dry-run.
 *
 * Nunca cria grupos novos, nunca junta linhas.
 */

const BUCKET = 'transaction-documents';

function normalizeRef(s: string | null | undefined): string {
  return (s ?? '').toString().trim().replace(/\s+/g, ' ').toUpperCase();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // ---- Autorização: só admin / platform_admin ----
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Não autenticado' }, 401);
    const { data: userRes } = await admin.auth.getUser(token);
    const userId = userRes?.user?.id;
    if (!userId) return json({ error: 'Não autenticado' }, 401);
    const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', userId);
    const allowed = (roles ?? []).some((r: any) => r.role === 'admin' || r.role === 'platform_admin');
    if (!allowed) return json({ error: 'Sem permissão' }, 403);

    const body = await req.json().catch(() => ({}));
    const action: string = body?.action === 'apply' ? 'apply' : 'dry-run';

    // ================= APPLY =================
    if (action === 'apply') {
      const { data: last } = await admin
        .from('invoice_group_audit')
        .select('run_at')
        .eq('aplicado', false)
        .order('run_at', { ascending: false })
        .limit(1);
      const runAt = last?.[0]?.run_at;
      if (!runAt) return json({ error: 'Não existe dry-run pendente. Corre primeiro a auditoria.' }, 400);

      const { data: rows } = await admin
        .from('invoice_group_audit')
        .select('id, transaction_id, numero_lido')
        .eq('run_at', runAt)
        .eq('veredicto', 'desagrupar')
        .eq('aplicado', false);

      let applied = 0;
      for (const r of rows ?? []) {
        const patch: Record<string, unknown> = { invoice_group_id: null };
        if (r.numero_lido) patch.invoice_ref = r.numero_lido;
        const { error: upErr } = await admin.from('transactions').update(patch).eq('id', r.transaction_id);
        if (upErr) continue;
        await admin.from('invoice_group_audit').update({ aplicado: true }).eq('id', r.id);
        applied++;
      }
      return json({ action, run_at: runAt, aplicadas: applied });
    }

    // ================= DRY-RUN (incremental) =================
    // O OCR é lento: cada chamada processa no máximo `max_groups` grupos e devolve
    // `remaining`. O painel repete a chamada com o mesmo `run_at` até remaining = 0.
    const maxGroups: number = Math.max(1, Math.min(Number(body?.max_groups ?? 3), 10));
    const runAt: string = typeof body?.run_at === 'string' && body.run_at ? body.run_at : new Date().toISOString();

    const { data: txs } = await admin
      .from('transactions')
      .select('id, invoice_group_id, invoice_ref, amount, date, due_date, supplier_id, description, company_id')
      .not('invoice_group_id', 'is', null);

    const allGroups = new Map<string, any[]>();
    for (const t of txs ?? []) {
      const list = allGroups.get(t.invoice_group_id) ?? [];
      list.push(t);
      allGroups.set(t.invoice_group_id, list);
    }

    // Grupos já auditados nesta corrida
    const { data: done } = await admin
      .from('invoice_group_audit')
      .select('invoice_group_id')
      .eq('run_at', runAt);
    const doneSet = new Set((done ?? []).map((d: any) => d.invoice_group_id));

    const pending = [...allGroups.keys()].filter((g) => !doneSet.has(g)).sort();
    const slice = pending.slice(0, maxGroups);
    const groups = new Map<string, any[]>();
    for (const g of slice) groups.set(g, allGroups.get(g)!);


    // Documentos por transação
    const txIds = [...groups.values()].flat().map((t: any) => t.id);
    const docsByTx = new Map<string, string[]>();
    for (let i = 0; i < txIds.length; i += 200) {
      const chunk = txIds.slice(i, i + 200);
      const { data: docs } = await admin
        .from('transaction_documents')
        .select('transaction_id, file_url')
        .in('transaction_id', chunk);
      for (const d of docs ?? []) {
        if (!d.file_url) continue;
        const arr = docsByTx.get(d.transaction_id) ?? [];
        arr.push(d.file_url);
        docsByTx.set(d.transaction_id, arr);
      }
    }

    // Cache OCR por file_url — cada ficheiro é lido UMA vez só.
    const ocrCache = new Map<string, { number: string | null; type: string | null; confidence: string | null }>();

    async function readDocument(fileUrl: string) {
      if (ocrCache.has(fileUrl)) return ocrCache.get(fileUrl)!;
      let out = { number: null as string | null, type: null as string | null, confidence: null as string | null };
      try {
        // Referências externas (ref://) não são ficheiros no bucket.
        if (/^ref:\/\//i.test(fileUrl) || /^https?:\/\//i.test(fileUrl)) {
          ocrCache.set(fileUrl, out);
          return out;
        }
        const { data: file, error } = await admin.storage.from(BUCKET).download(fileUrl);
        if (error || !file) {
          ocrCache.set(fileUrl, out);
          return out;
        }
        const buf = new Uint8Array(await file.arrayBuffer());
        let binary = '';
        for (let i = 0; i < buf.length; i += 8192) {
          binary += String.fromCharCode(...buf.subarray(i, i + 8192));
        }
        const base64 = btoa(binary);
        const name = fileUrl.split('/').pop() ?? 'documento';
        const mime = name.toLowerCase().endsWith('.pdf')
          ? 'application/pdf'
          : name.toLowerCase().endsWith('.png')
            ? 'image/png'
            : 'image/jpeg';
        const res = await fetch(`${supabaseUrl}/functions/v1/extract-invoice-total`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ fileBase64: base64, fileName: name, mimeType: mime }),
        });
        const payload = await res.json().catch(() => ({}));
        out = {
          number: payload?.document_number ?? null,
          type: payload?.document_type ?? null,
          confidence: payload?.confidence ?? null,
        };
      } catch (_e) {
        // Falha de leitura = "rever", nunca alteração.
      }
      ocrCache.set(fileUrl, out);
      return out;
    }

    const runAt = new Date().toISOString();
    const auditRows: any[] = [];
    let gruposOk = 0;
    let gruposAnalisados = 0;

    for (const [groupId, lines] of groups) {
      // Todas as linhas partilham o mesmo ficheiro → grupo legítimo, nem se lê.
      const urlSets = lines.map((l) => new Set(docsByTx.get(l.id) ?? []));
      const allHaveDocs = urlSets.every((s) => s.size > 0);
      let sharedAll = false;
      if (allHaveDocs) {
        const first = [...urlSets[0]];
        sharedAll = first.some((u) => urlSets.every((s) => s.has(u)));
      }
      if (sharedAll) {
        gruposOk++;
        for (const l of lines) {
          auditRows.push({
            run_at: runAt, transaction_id: l.id, invoice_group_id: groupId,
            file_url: [...(docsByTx.get(l.id) ?? [])][0] ?? null,
            ref_atual: l.invoice_ref, numero_lido: null,
            document_type: null, confidence: null, veredicto: 'ok', aplicado: false,
            company_id: l.company_id ?? null,
          });
        }
        continue;
      }

      gruposAnalisados++;
      // Lê o primeiro documento de cada linha
      const perLine: Record<string, { url: string | null; number: string | null; type: string | null; confidence: string | null }> = {};
      for (const l of lines) {
        const url = (docsByTx.get(l.id) ?? [])[0] ?? null;
        if (!url) {
          perLine[l.id] = { url: null, number: null, type: null, confidence: null };
          continue;
        }
        const read = await readDocument(url);
        perLine[l.id] = { url, ...read };
      }

      // Número canónico: mais frequente entre documentos fatura/recibo com confiança != low
      const counts = new Map<string, number>();
      for (const l of lines) {
        const p = perLine[l.id];
        const usable = p.number && (p.type === 'invoice' || p.type === 'receipt') && p.confidence !== 'low';
        if (!usable) continue;
        const key = normalizeRef(p.number);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      let canonical: string | null = null;
      let best = 0;
      for (const [k, v] of counts) if (v > best) { canonical = k; best = v; }

      for (const l of lines) {
        const p = perLine[l.id];
        const usable = p.number && (p.type === 'invoice' || p.type === 'receipt') && p.confidence !== 'low';
        let veredicto = 'rever';
        if (usable && canonical) {
          veredicto = normalizeRef(p.number) === canonical ? 'ok' : 'desagrupar';
        }
        auditRows.push({
          run_at: runAt, transaction_id: l.id, invoice_group_id: groupId,
          file_url: p.url, ref_atual: l.invoice_ref,
          numero_lido: p.number ?? null, document_type: p.type ?? null, confidence: p.confidence ?? null,
          veredicto, aplicado: false, company_id: l.company_id ?? null,
        });
      }
    }

    for (let i = 0; i < auditRows.length; i += 200) {
      const { error } = await admin.from('invoice_group_audit').insert(auditRows.slice(i, i + 200));
      if (error) return json({ error: `Falha a gravar auditoria: ${error.message}` }, 500);
    }

    const resumo = {
      run_at: runAt,
      grupos_total: groups.size,
      grupos_ok_sem_leitura: gruposOk,
      grupos_analisados: gruposAnalisados,
      linhas_total: auditRows.length,
      linhas_ok: auditRows.filter((r) => r.veredicto === 'ok').length,
      linhas_desagrupar: auditRows.filter((r) => r.veredicto === 'desagrupar').length,
      linhas_rever: auditRows.filter((r) => r.veredicto === 'rever').length,
      ficheiros_lidos: ocrCache.size,
    };
    return json({ action, ...resumo });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

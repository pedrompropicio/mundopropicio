from pathlib import Path
import hashlib,subprocess,tempfile
changes={}
root=Path('/dev-server')
def edit(p,fn):
 s=(root/p).read_text(); changes[p]=(s,fn(s))
changes['supabase/functions/_shared/standalone-identity.ts']=('',(root/'patches/issue333/identity.ts').read_text())
changes['supabase/functions/_shared/standalone-compat.ts']=('',(root/'patches/issue333/compat.ts').read_text().replace('"./identity"','"./standalone-identity.ts"'))
changes['src/lib/standalone-identity-lookup.ts']=('',(root/'patches/issue333/frontend-lookup.ts').read_text().replace('"./compat"','"@shared/standalone-compat"').replace('"./identity"','"@shared/standalone-identity"'))
def scanner(s):
 s=s.replace('import { removeFromCompanyBucket } from "@/lib/storage";', 'import { lookupStandalone, standaloneWriteError } from "@/lib/standalone-identity-lookup";')
 s=s.replace('    let uploadedPath: string | null = null;\n','    let writeStarted = false;\n')
 s=s.replace('  const [saved, setSaved] = useState(false);', '\n'.join(['  const [saved, setSaved] = useState(false);','  const pendingKey = `standalone-create-pending:${user?.id ?? "none"}:${companyId ?? "none"}`;','  const [writePending, setWritePending] = useState(() => sessionStorage.getItem(pendingKey) !== null);']))
 s=s.replace('    if (!file || !companyId) return;', '    if (!file || !companyId || writePending || sessionStorage.getItem(pendingKey) !== null) return;')
 # Existing storage API has different destructuring; reserve immediately before upload.
 pos=s.index('      const up =') if '      const up =' in s else s.index('      const { data: up') if '      const { data: up' in s else s.index('      const { data, error: uploadError }') if '      const { data, error: uploadError }' in s else s.index('      const up =')
 s=s[:pos]+'      sessionStorage.setItem(pendingKey, path);\n      writeStarted = true;\n'+s[pos:]
 s=s.replace('      setSaved(true);','      sessionStorage.removeItem(pendingKey);\n      setSaved(true);')
 s=s.replace('      const duplicate = err?.code','      if (writeStarted) setWritePending(true);\n      const duplicate = err?.code')
 s=s.replace('disabled={busy !== null}', 'disabled={busy !== null || writePending}')
 s=s.replace('      <Tabs value={tab}', '      {writePending && <Alert><AlertDescription>Resultado por confirmar. A captura está bloqueada; confere a lista antes de qualquer nova gravação.</AlertDescription></Alert>}\n      <Tabs value={tab}')
 start=s.index('        const { data: duplicate, error: duplicateError }')
 end=s.index('        if (duplicate) throw',start)
 s=s[:start]+'''        const duplicate = await lookupStandalone(supabase, { company_id: companyId,
          supplier_nif: supplierNif.trim(), invoice_number: invoiceNumber.trim() });
'''+s[end:]
 s=s.replace('      uploadedPath = up.path;\n','')
 start=s.index('      if (uploadedPath) {');end=s.index('      const duplicate = err?.code',start)
 s=s[:start]+'''      // Never remove an object on an uncertain INSERT response. Keep private for review.
      if (writeStarted) setWritePending(true);
'''+s[end:]
 s=s.replace('duplicate ? "Já existe uma fatura deste fornecedor com este número." : err.message','standaloneWriteError(err)')
 return s
def accountant(s):
 s=s.replace('  const canProcess =', '  const pendingKey = `standalone-edit-pending:${user?.id ?? "none"}:${companyId ?? "none"}:${editing?.id ?? "none"}`;\n  const [writePending, setWritePending] = useState(false);\n  const canProcess =')
 s=s.replace('      if (!editing) return;', '      if (!editing || writePending || sessionStorage.getItem(pendingKey) !== null) throw new Error("Conferência pendente");')
 s=s.replace('      const { error } = await (supabase as any)\n        .from("standalone_invoices")\n        .update({', '      sessionStorage.setItem(pendingKey, "pending");\n      const { error } = await (supabase as any)\n        .from("standalone_invoices")\n        .update({',1)
 s=s.replace('      setEditing(null);', '      sessionStorage.removeItem(pendingKey);\n      setEditing(null);',1)
 s=s.replace('    setEditing(r);', '    setWritePending(sessionStorage.getItem(`standalone-edit-pending:${user?.id ?? "none"}:${companyId ?? "none"}:${r.id}`) !== null);\n    setEditing(r);')
 s=s.replace('disabled={saveEdit.isPending}', 'disabled={saveEdit.isPending || writePending}')
 s=s.replace('    onError: (e: any) => toast(', '    onError: (e: any) => { if (sessionStorage.getItem(pendingKey) !== null) setWritePending(true); toast(',1)
 s=s.replace('variant: "destructive" }),\n  });', 'variant: "destructive" }); },\n  });',1)
 s=s.replace('          <DialogFooter>', '          {writePending && <AlertTriangle aria-label="Conferência pendente" />}\n          <DialogFooter>')
 s=s.replace('interface Row {','import { lookupStandalone, standaloneWriteError } from "@/lib/standalone-identity-lookup";\n\ninterface Row {')
 start=s.index('        const { data: duplicate, error: duplicateError }');end=s.index('        if (duplicate) throw',start)
 s=s[:start]+'''        const duplicate = await lookupStandalone(supabase, { company_id: companyId ?? "",
          supplier_nif: form.supplier_nif.trim(), invoice_number: form.invoice_number.trim() }, editing.id);
'''+s[end:]
 s=s.replace('e?.code === "DUPLICATE_INVOICE" || isStandaloneInvoiceDuplicateError(e) ? "Já existe uma fatura deste fornecedor com este número." : e.message','e?.code === "INVALID_MONETARY_FIELDS" ? e.message : standaloneWriteError(e)')
 return s
def ingest(s):
 s=s.replace("import { trashStorageObject } from '../_shared/storage-trash.ts'", "import { findStrongCandidates, persistInvoice } from '../_shared/standalone-compat.ts'\nimport type { Candidate, Expected } from '../_shared/standalone-identity.ts'")
 start=s.index('  const canDedupe =');end=s.index('  // (#195)',start);s=s[:start]+s[end:]
 start=s.index('  const { error: uploadError }');
 s=s[:start]+'''  const expected: Expected = {
    company_id: body.company_id, file_name: body.nome,
    supplier_name: body.supplier_name || null, supplier_nif: body.supplier_nif || null,
    invoice_number: body.invoice_number || null, invoice_date: body.invoice_date || null,
    currency: body.currency, original_amount: body.original_amount ?? null,
    fx_rate: fxRate, fx_rate_source: fxRateSource,
    total_amount: totalAmount, iva_amount: body.iva_amount ?? null,
    notes: body.notes || null, paid_by_partner_id: body.paid_by_partner_id ?? null,
    created_by: body.created_by ?? null,
  };
  const result = await persistInvoice({
    find: (e) => findStrongCandidates(e, async (company, after, size) => {
      let q = admin.from('standalone_invoices').select('*').eq('company_id', company)
        .order('id', { ascending: true }).limit(size);
      if (after) q = q.gt('id', after);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Candidate[];
    }),
    read: async (p) => {
      if (!p.startsWith(`${body.company_id}/`)) return null;
      const { data, error } = await admin.storage.from(BUCKET).download(p);
      if (error || !data || data.size > MAX_BYTES) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
    get: async (id, company) => {
      const { data, error } = await admin.from('standalone_invoices').select('*').eq('id', id).eq('company_id', company).maybeSingle();
      if (error) throw error;
      return data as Candidate | null;
    },
    upload: async (p, b, mime) => {
      const { error } = await admin.storage.from(BUCKET).upload(p, b, { contentType: mime, upsert: false });
      if (error) throw error;
    },
    insert: async (row) => {
      const { data, error } = await admin.from('standalone_invoices').insert({ ...row, status: 'new' })
        .select('id,storage_path').single();
      if (error) throw error;
      return data;
    },
  }, expected, bytes, contentType, path);
  return json(result.body, result.status);
})
'''
 return s
def core(s):
 marker='CREATE FUNCTION public.data_entry_prepare'
 s=s.replace(marker,'''-- Same strong identity expression as global proposal; broad norm remains tax validation ONLY.
CREATE FUNCTION public.data_entry_identity(t text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS
$$ SELECT nullif(translate(btrim(t,' '),'abcdefghijklmnopqrstuvwxyz','ABCDEFGHIJKLMNOPQRSTUVWXYZ'),'') COLLATE "C" $$;
REVOKE ALL ON FUNCTION public.data_entry_identity(text) FROM PUBLIC, anon, authenticated;

'''+marker)
 for field in ['supplier_nif','invoice_number']:
  s=s.replace('public.data_entry_norm('+field+')=public.data_entry_norm(', 'public.data_entry_identity('+field+')=public.data_entry_identity(')
 s=s.replace("public.data_entry_norm(f->>'supplier_nif')||'|'||public.data_entry_norm(f->>'invoice_number')", "public.data_entry_identity(f->>'supplier_nif')||'|'||public.data_entry_identity(f->>'invoice_number')")
 return s
edit('src/pages/StandaloneInvoiceScanner.tsx',scanner)
edit('src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx',accountant)
edit('supabase/functions/ingest-standalone-invoice/index.ts',ingest)
edit('supabase/manual/20261017_issue333_core.PENDENTE.sql',core)
from extend_attempts import extend
extend(changes,root)
parts=[]; manifest=[]
for p,(old,new) in changes.items():
 with tempfile.TemporaryDirectory(dir='/tmp') as td:
  a=Path(td)/'old';b=Path(td)/'new';a.write_text(old);b.write_text(new)
  result=subprocess.run(['diff','-u','--label','a/'+p if old else '/dev/null','--label','b/'+p,str(a),str(b)],capture_output=True,text=True)
  if result.returncode not in (0,1):raise RuntimeError(result.stderr)
  parts.append(result.stdout)
 manifest.append(f'{hashlib.sha256(old.encode()).hexdigest()}  BASE {p}\n{hashlib.sha256(new.encode()).hexdigest()}  PREPARED {p}')
(root/'patches/issue333/compatibility.PENDENTE.patch').write_text(''.join(parts))
(root/'patches/issue333/base-sha256.txt').write_text('\n'.join(manifest)+'\n')
(root/'patches/issue333/core.PENDENTE.sql').write_text(changes['supabase/manual/20261017_issue333_core.PENDENTE.sql'][1])
print('Prepared inert patch only; production entrypoints unchanged. Files:',len(changes))

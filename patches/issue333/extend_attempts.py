"""Called by make_patch.py: transforms candidate strings only, never active destinations."""
from pathlib import Path
def extend(changes, root):
    def add(dest,source,transform=lambda s:s):
        old=(root/dest).read_text() if (root/dest).exists() else ''
        changes[dest]=(old,transform((root/source).read_text()))
    add('supabase/functions/_shared/standalone-attempt.ts','patches/issue333/attempt.ts')
    add('src/lib/standalone-attempt-client.ts','patches/issue333/attempt-client.ts')
    add('supabase/functions/standalone-attempt-333/handler.ts','patches/issue333/attempt-handler.ts',lambda s:s.replace("'./standalone-attempt.ts'","'../_shared/standalone-attempt.ts'"))
    add('supabase/functions/standalone-attempt-333/index.ts','patches/issue333/attempt-index.ts')
    # SQL is a proposed NEW destination; stays outside migrations in both trees.
    add('supabase/manual/20261017_issue333_attempts.PENDENTE.sql','supabase/manual/20261017_issue333_attempts.PENDENTE.sql')
    path='src/pages/StandaloneInvoiceScanner.tsx';old,s=changes[path]
    s=s.replace('import { lookupStandalone, standaloneWriteError }','import { prepareLegacyAttempt, executeLegacyAttempt, checkLegacyAttempt, resumeLegacyAttempt } from "@/lib/standalone-attempt-client";\nimport type { Attempt } from "@shared/standalone-attempt";\nimport { lookupStandalone, standaloneWriteError }')
    s=s.replace('  const pendingKey =', '  const [attempt, setAttempt] = useState<Attempt | null>(null);\n  const [resumeId, setResumeId] = useState("");\n  const [resumeHash, setResumeHash] = useState("");\n  const pendingKey =')
    s=s.replace('    setFile(null);\n    setScanCandidate(null);','    setAttempt(null);\n    setFile(null);\n    setScanCandidate(null);',1)
    start=s.index('      const ext =',s.index('  const save ='));end=s.index('      if (error) throw error;',start)+len('      if (error) throw error;')
    block=s[start:end];payload=block[block.index('        supplier_name:'):block.index('        status:')]
    replacement='''      if (!user) throw new Error("Sessão inválida");
      const context = { user_id: user.id, company_id: companyId };
      const payload = {
        file_name: file.name,
'''+payload+'''        created_by: user.id,
      };
      const reserved = await prepareLegacyAttempt("scanner_create", payload, file, context);
      setAttempt(reserved);
      setResumeId(reserved.id); setResumeHash(reserved.hash);
      sessionStorage.setItem(pendingKey, JSON.stringify({ id: reserved.id, hash: reserved.hash }));
      writeStarted = true;
      const outcome = await executeLegacyAttempt("scanner_create", reserved, file, context);
      if (outcome.status !== "conferido") throw new Error("Conferência pendente");'''
    s=s[:start]+replacement+s[end:]
    marker='  const [tab, setTab] = useState("scan");'
    s=s.replace(marker,'''  const generation = useRef(0);
  useEffect(() => { generation.current += 1; setAttempt(null); setResumeId(""); setResumeHash(""); setWritePending(false); reset(); }, [user?.id, companyId]);
  const reconcile = async () => {
    if (!user || !companyId) return;
    const current = generation.current; setBusy("save");
    try {
      const context = {user_id:user.id,company_id:companyId};
      const out = attempt ? await checkLegacyAttempt("scanner_create",attempt,context) : await resumeLegacyAttempt("scanner_create",resumeId,resumeHash,context);
      if (current !== generation.current) return;
      if (out.status === "conferido") { setSaved(true); setWritePending(false); sessionStorage.removeItem(pendingKey); }
      else { setWritePending(true); toast({title:"Conferência pendente"}); }
    } catch { if (current === generation.current) toast({title:"Conferência pendente"}); }
    finally { if (current === generation.current) setBusy(null); }
  };
'''+marker)
    s=s.replace('      <Tabs value={tab}', '''      <div className="space-y-2">
        <Input aria-label="ID da tentativa" value={resumeId} onChange={e=>setResumeId(e.target.value)} />
        <Input aria-label="Hash da tentativa" value={resumeHash} onChange={e=>setResumeHash(e.target.value)} />
        <Button variant="outline" onClick={reconcile} disabled={busy!==null || (!attempt && (!resumeId || !resumeHash))}>Consultar tentativa</Button>
      </div>
      <Tabs value={tab}''')
    # Guard late write completion on context changes, including after persistent prepare.
    s=s.replace('    setBusy("save");\n    let writeStarted', '    const saveGeneration = generation.current;\n    setBusy("save");\n    let writeStarted')
    s=s.replace('      setAttempt(reserved);','      if (saveGeneration !== generation.current) return;\n      setAttempt(reserved);')
    s=s.replace('      sessionStorage.removeItem(pendingKey);\n      setSaved(true);','      if (saveGeneration !== generation.current) return;\n      sessionStorage.removeItem(pendingKey);\n      setSaved(true);')
    s=s.replace('      if (writeStarted) setWritePending(true);','      if (saveGeneration !== generation.current) return;\n      if (writeStarted) setWritePending(true);')
    changes[path]=(old,s)
    # Assistant still uses canonical commit, wrapped with persistent attempt + atomic audit.
    path='supabase/functions/data-entry/handler.ts'
    old=(root/path).read_text();s=old
    s=s.replace('      await putVerified("standalone-invoices", finalPath, bytes, doc.mime, hash);', '''      await rpc("data_entry_attempt_333", {p_action:"prepare",p_preview:preview.id,p_snapshot_hash:body.snapshot_hash});
      await rpc("data_entry_attempt_333", {p_action:"authorize",p_preview:preview.id,p_snapshot_hash:body.snapshot_hash});
      await rpc("data_entry_attempt_333", {p_action:"begin",p_preview:preview.id,p_snapshot_hash:body.snapshot_hash});
      await putVerified("standalone-invoices", finalPath, bytes, doc.mime, hash);''')
    s=s.replace('const commit = await d.userRpc(token, "data_entry_commit", { p_preview: preview.id, p_snapshot_hash: body.snapshot_hash });','const commit = await d.userRpc(token, "data_entry_attempt_333", {p_action:"commit",p_preview:preview.id,p_snapshot_hash:body.snapshot_hash});')
    changes[path]=(old,s)
    path='src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx';old,s=changes[path]
    s=s.replace('import { lookupStandalone, standaloneWriteError }','import { prepareLegacyAttempt, executeLegacyAttempt, checkLegacyAttempt } from "@/lib/standalone-attempt-client";\nimport type { Attempt } from "@shared/standalone-attempt";\nimport { lookupStandalone, standaloneWriteError }')
    s=s.replace('  const pendingKey =','  const [attempt, setAttempt] = useState<Attempt | null>(null);\n  const pendingKey =')
    start=s.index('      sessionStorage.setItem(pendingKey, "pending");');end=s.index('      if (error) throw error;',start)+len('      if (error) throw error;')
    block=s[start:end];payload=block[block.index('          supplier_name:'):block.index('        })')]
    s=s[:start]+'''      if (!user || !companyId) throw new Error("Contexto inválido");
      const { data: blob, error: downloadError } = await supabase.storage.from("standalone-invoices").download(editing.storage_path);
      if (downloadError || !blob) throw new Error("Documento indisponível");
      const file = new File([blob], editing.file_name, {type:blob.type});
      const payload = {file_name:editing.file_name,created_by:editing.created_by,
'''+payload+'''      };
      const context={user_id:user.id,company_id:companyId};
      const reserved=await prepareLegacyAttempt("accountant_edit",payload,file,context,editing as unknown as Record<string,unknown>);
      setAttempt(reserved); sessionStorage.setItem(pendingKey,JSON.stringify({id:reserved.id,hash:reserved.hash}));
      const result=await executeLegacyAttempt("accountant_edit",reserved,file,context);
      if(result.status!=="conferido")throw new Error("Conferência pendente");'''+s[end:]
    s=s.replace('    setEditing(r);','    setAttempt(null);\n    setEditing(r);',1)
    s=s.replace('          <DialogFooter>', '''          {attempt && <Button variant="outline" onClick={async()=>{
            if(!user || !companyId)return;
            const out=await checkLegacyAttempt("accountant_edit",attempt,{user_id:user.id,company_id:companyId}).catch(()=>null);
            if(out?.status==="conferido"){setWritePending(false);setEditing(null);qc.invalidateQueries({queryKey:["standalone-invoices"]});}
            else toast({title:"Conferência pendente"});
          }}>Consultar tentativa</Button>}
          <DialogFooter>''')
    changes[path]=(old,s)
    # Optional attempt ID on existing ingestion; absent remains untracked, never falsely global.
    path='supabase/functions/ingest-standalone-invoice/index.ts';old,s=changes[path]
    s=s.replace("import { findStrongCandidates", "import { executeAttempt, documentHash, type Attempt } from '../_shared/standalone-attempt.ts'\nimport { findStrongCandidates")
    s=s.replace('const BodySchema = z.object({','const BodySchema = z.object({\n  attempt_id: z.string().uuid().optional(),')
    marker='  const result = await persistInvoice({'
    s=s.replace(marker,'''  if (body.attempt_id) {
    const envelope={payload:(({company_id,...payload})=>payload)(expected),document:{sha256:await documentHash(bytes),size_bytes:bytes.length,mime:contentType},effects:['ingest_create']};
    const rpc=async(action:string,id:string|null,envelope:Record<string,unknown>|null,hash:string|null)=>{
      const {data,error}=await admin.rpc('standalone_ingest_attempt_333',{p_company:body.company_id,p_action:action,p_id:id,p_envelope:envelope,p_hash:hash});
      if(error)throw new Error('Tentativa recusada');return data as Attempt;
    };
    try {
      const reserved=await rpc('prepare',body.attempt_id,envelope,null);
      const out=await executeAttempt({rpc,
        read:async p=>{const {data,error}=await admin.storage.from(BUCKET).download(p);return error||!data||data.size>MAX_BYTES?null:new Uint8Array(await data.arrayBuffer())},
        upload:async(p,b,m)=>{const {error}=await admin.storage.from(BUCKET).upload(p,b,{contentType:m,upsert:false});if(error && !['409','Duplicate'].includes(String(error.statusCode??error.error)))throw Error('Upload recusado')},
        verifyReceipt:async(p,b,m)=>{const {data,error}=await admin.storage.from(BUCKET).download(p);if(error||!data||data.size!==b.length||await documentHash(new Uint8Array(await data.arrayBuffer()))!==await documentHash(b))throw Error('Readback pendente');const r=await admin.rpc('data_entry_record_receipt',{p_bucket:BUCKET,p_path:p,p_sha:await documentHash(b),p_size:b.length,p_mime:m});if(r.error)throw Error('Recibo recusado')},
      },reserved,bytes);
      return json({attempt_id:reserved.id,status:out.status,result:out.attempt.result,reused:out.status==='conferido' && reserved.state==='completed',verified:out.status==='conferido'},out.status==='conferido'?200:409);
    } catch {return json({code:'attempt_pending',error:'Conferência pendente. Não repitas.',reused:false},409)}
  }
'''+marker)
    s=s.replace('  return json(result.body, result.status);','  return json({...result.body,attempt_coverage:"legacy_untracked"}, result.status);')
    changes[path]=(old,s)
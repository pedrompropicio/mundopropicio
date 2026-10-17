"""Local disposable validation only. No deploy, credentials, git writes or network installs.
Usage: python3 docs/testes/issue333/run-integrated.py --base <reviewed SHA> --tsgo <cached binary> --deno <cached binary>
"""
from pathlib import Path
import argparse, hashlib, io, json, os, shutil, subprocess, tarfile, tempfile
p=argparse.ArgumentParser();p.add_argument('--base',required=True);p.add_argument('--tsgo',required=True);p.add_argument('--deno',required=True);a=p.parse_args()
repo=Path.cwd();out=Path(tempfile.mkdtemp(prefix='issue333-integrated-'));root=out/'tree';root.mkdir()
raw=subprocess.check_output(['git','archive',a.base])
with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
    for member in archive.getmembers():
        parts=Path(member.name).parts
        if any(x in parts for x in ['.git','.github','claude-outputs','node_modules','dist']) or any(x.startswith('.env') for x in parts):continue
        archive.extract(member,root,filter='data')
(root/'node_modules').symlink_to(repo/'node_modules',target_is_directory=True)
# Only inert test artefacts are copied from the executing checkout; real destinations come from archive+patch.
shutil.copytree(repo/'docs/testes/issue333',root/'docs/testes/issue333',dirs_exist_ok=True)
shutil.copytree(repo/'patches/issue333',root/'patches/issue333',dirs_exist_ok=True)
shutil.copy2(repo/'supabase/manual/20261017_issue333_attempts.PENDENTE.sql',root/'supabase/manual/20261017_issue333_attempts.PENDENTE.sql')
manifest=(repo/'patches/issue333/base-sha256.txt').read_text().splitlines()
def verify(kind):
    for line in manifest:
        digest,k,path=line.split()
        if k==kind:
            file=root/path;actual=hashlib.sha256(file.read_bytes() if file.exists() else b'').hexdigest()
            if actual!=digest:raise RuntimeError('Hash mismatch '+kind+' '+path)
verify('BASE')
env={'PATH':'/bin:/usr/bin','HOME':str(out/'home'),'TMPDIR':'/tmp','NODE_ENV':'test','CI':'true','VITE_SUPABASE_URL':'http://127.0.0.1:9','VITE_SUPABASE_PUBLISHABLE_KEY':'fixture-not-a-key'}
def run(name,args):
    proc=subprocess.run(args,cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=600)
    (out/(name+'.log')).write_text('COMMAND: '+' '.join(map(str,args))+'\n'+proc.stdout+'\nEXIT: '+str(proc.returncode)+'\n')
    print(name,proc.returncode)
    if proc.returncode:raise RuntimeError(name+' failed; inspect '+str(out))
run('apply',['patch','--batch','--forward','-p1','-i',str(repo/'patches/issue333/compatibility.PENDENTE.patch')]);verify('PREPARED')
pg=root/'docs/testes/issue333/pg/data-entry-pg.test.ts'
pg.write_text(pg.read_text().replace('"../../../../patches/issue333/compat"','"../../../../supabase/functions/_shared/standalone-compat"').replace('"../../../../patches/issue333/identity"','"../../../../supabase/functions/_shared/standalone-identity"'))
# Existing canonical-handler regressions execute the real new wrapper; barrier is at commit only.
pg.write_text(pg.read_text().replace('if(name === "data_entry_commit" && token === "p1")', 'if(name === "data_entry_attempt_333" && args.p_action === "commit" && token === "p1")').replace('if(name === "data_entry_commit") return tx`select public.data_entry_commit(${args.p_preview},${args.p_snapshot_hash}) j`;', 'if(name === "data_entry_attempt_333") return tx`select public.data_entry_attempt_333(${args.p_action},${args.p_preview},${args.p_snapshot_hash}) j`;'))
pg.write_text(pg.read_text().replace('await admin.unsafe(readFileSync("supabase/manual/20261017_issue333_core.PENDENTE.sql", "utf8"));','await admin.unsafe(readFileSync("supabase/manual/20261017_issue333_core.PENDENTE.sql", "utf8"));\n  await admin.unsafe(readFileSync("supabase/manual/20261017_issue333_attempts.PENDENTE.sql", "utf8"));'))
handler_test=root/'docs/testes/issue333/handler/handler.test.ts'
handler_test.write_text(handler_test.read_text().replace('      if (name === "data_entry_commit")', '      if (name === "data_entry_attempt_333" && args.p_action !== "commit") return {data:{id:"attempt"},error:null};\n      if (name === "data_entry_commit" || (name === "data_entry_attempt_333" && args.p_action === "commit"))').replace('if (name === "data_entry_commit" && first)', 'if ((name === "data_entry_commit" || (name === "data_entry_attempt_333" && args.p_action === "commit")) && first)'))
(root/'deno-isolated.json').write_text(json.dumps({'nodeModulesDir':'manual','imports':{'npm:@supabase/supabase-js@2':'./node_modules/@supabase/supabase-js/dist/module/index.d.ts','npm:zod@3.23.8':'./node_modules/zod/index.d.ts','npm:@supabase/supabase-js@2/cors':'./node_modules/@supabase/supabase-js/dist/cors.d.mts'},'compilerOptions':{'strict':False}}))
(root/'vitest.offline.config.ts').write_text('import config from "./vitest.config"; import {defineConfig} from "vitest/config"; export default defineConfig({...config,test:{...config.test,setupFiles:["src/test/setup.ts","docs/testes/issue333/integrated/deny-egress.ts"]}});')
run('tsgo',[a.tsgo,'-p','tsconfig.app.json','--noEmit'])
run('deno',[a.deno,'check','--no-remote','--config','deno-isolated.json','supabase/functions/ingest-standalone-invoice/index.ts','supabase/functions/_shared/standalone-compat.ts','supabase/functions/standalone-attempt-333/handler.ts','supabase/functions/standalone-attempt-333/index.ts','supabase/functions/data-entry/handler.ts'])
for name,config in [('integrated','docs/testes/issue333/vitest.integrated.config.ts'),('pg','docs/testes/issue333/vitest.pg.config.ts'),('handler','docs/testes/issue333/vitest.handler.config.ts'),('general','vitest.offline.config.ts')]:
    run(name,[str(repo/'node_modules/.bin/vitest'),'run','--config',config])
run('build',[str(repo/'node_modules/.bin/vite'),'build'])
verify('PREPARED');print('Evidence directory:',out)

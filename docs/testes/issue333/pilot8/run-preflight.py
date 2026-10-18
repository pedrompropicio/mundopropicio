"""Finite credential-free disposable runner; no Auth/Cloud/activation side effects."""
import json, os, pathlib, shutil, subprocess, sys, tempfile
repo=pathlib.Path.cwd();out=pathlib.Path(tempfile.mkdtemp(prefix='issue333-preflight56-'));tree=out/'tree';tree.mkdir()
def ignore(directory,names): return [n for n in names if n in {'.git','node_modules','dist','__pycache__'} or n.startswith('.env')]
for name in ['src','supabase','drizzle','docs/testes/issue333','public']:
    shutil.copytree(repo/name,tree/name,ignore=ignore)
for name in ['package.json','vitest.config.ts','vite.config.ts','tsconfig.json','tsconfig.app.json','tsconfig.node.json','tailwind.config.ts','postcss.config.js','index.html']:
    shutil.copy2(repo/name,tree/name)
(tree/'node_modules').symlink_to(repo/'node_modules',target_is_directory=True)
pg=next(pathlib.Path('/nix/store').glob('*postgresql-17*/bin/initdb')).parent
env={'PATH':str(pg)+':'+str(pathlib.Path(sys.executable).parent)+':/bin:/usr/bin','HOME':'/tmp','TMPDIR':'/tmp','CI':'true','NODE_ENV':'test','ISSUE333_ISOLATED':'1','ISSUE333_EVIDENCE':str(out),'ISSUE333_PYTHON':sys.executable,'PLAYWRIGHT_BROWSERS_PATH':os.environ.get('PLAYWRIGHT_BROWSERS_PATH',''),'VITE_SUPABASE_URL':'http://127.0.0.1:9','VITE_SUPABASE_PUBLISHABLE_KEY':'local-fixture'}
(tree/'preflight.config.ts').write_text('import {defineConfig} from "vitest/config";export default defineConfig({resolve:{alias:{"npm:zod@3":"zod"}},test:{environment:"node",include:["docs/testes/issue333/pg/activation56.test.ts","docs/testes/issue333/pg/pilot8-browser56.test.ts","docs/testes/issue333/pg/pilot8-inert.test.ts"],testTimeout:160000,hookTimeout:60000,fileParallelism:false}});')
print('Evidence:',out,flush=True)
r=subprocess.run(['node',str(tree/'node_modules/vitest/vitest.mjs'),'run','--config','preflight.config.ts'],cwd=tree,env=env,capture_output=True,text=True,timeout=480)
(out/'tests.log').write_text(r.stdout+r.stderr);print(r.stdout[-8000:]+r.stderr[-8000:]);print('EXIT',r.returncode)
(out/'result.json').write_text(json.dumps({'exit':r.returncode,'cloud_tested':False,'head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()},indent=2))
sys.exit(r.returncode)
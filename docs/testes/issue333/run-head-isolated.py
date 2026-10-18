"""Run current integrated sources, never the historical patch, with a credential-free environment."""
import hashlib, json, os, pathlib, shutil, subprocess, sys, tempfile
repo = pathlib.Path.cwd()
base = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
authorized = 'a3d3689352790e5684a417d8c1eedeb684c1429f'
subprocess.run(['git', 'merge-base', '--is-ancestor', authorized, base], check=True)
changed = subprocess.check_output(['git', 'diff', '--name-only', authorized, base], text=True).splitlines()
allowed = ['docs/testes/issue333/', 'docs/QUADRO.md', 'roadmap.md']
review_file = repo / 'docs/testes/issue333/head/reviewed-product-sha256.json'
reviewed = json.loads(review_file.read_text()) if review_file.exists() else {}
def own_change(p):
    if p in reviewed:
        return (repo/p).is_file() and hashlib.sha256((repo/p).read_bytes()).hexdigest() == reviewed[p]
    return p in allowed[1:] or p.startswith(allowed[0])
if any(not own_change(p) for p in changed):
    raise SystemExit('STOP: unexpected changes since authorized base: ' + base)
out = pathlib.Path(tempfile.mkdtemp(prefix='issue333-head-'))
root = out / 'tree'
excluded = {'.git', '.github', 'node_modules', 'dist', 'claude-outputs', '__pycache__', '.lovable', '.workspace', 'test-reset'}
def ignore(directory, names):
    return [n for n in names if n in excluded or n.startswith('.env')]
root.mkdir()
for name in ['src','public','supabase','drizzle','docs/testes/issue333','docs/manual','scripts','patches/issue333']:
    shutil.copytree(repo/name, root/name, ignore=ignore)
shutil.copytree(repo/'.lovable/memory',root/'.lovable/memory',ignore=ignore)
for name in ['package.json','vitest.config.ts','vite.config.ts','tsconfig.json','tsconfig.app.json','tsconfig.node.json','index.html','tailwind.config.ts','postcss.config.js','components.json']:
    shutil.copy2(repo/name,root/name)
(root / 'node_modules').symlink_to(repo / 'node_modules', target_is_directory=True)
pg = next(pathlib.Path('/nix/store').glob('*postgresql-17*/bin/initdb')).parent
env = {'PATH': str(pg) + ':/bin:/usr/bin', 'HOME': str(out / 'home'), 'TMPDIR': '/tmp',
       'NODE_ENV': 'test', 'CI': 'true', 'VITE_SUPABASE_URL': 'http://127.0.0.1:9',
       'VITE_SUPABASE_PUBLISHABLE_KEY': 'local-fixture', 'ISSUE333_ISOLATED': '1',
       'ISSUE333_PYTHON': sys.executable, 'PLAYWRIGHT_BROWSERS_PATH': os.environ.get('PLAYWRIGHT_BROWSERS_PATH', '')}
env['ISSUE333_EVIDENCE']=str(out)
manifest = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for parent in ['supabase/functions/data-entry', 'supabase/functions/standalone-attempt-333',
                           'supabase/functions/ingest-standalone-invoice', 'supabase/functions/_shared',
                           'src/components/data-entry', 'src/components/standalone', 'src/lib', 'src/pages', 'docs/testes/issue333']
            for p in (root / parent).rglob('*') if p.is_file()}
for p in (root / 'drizzle/migrations').glob('019[012]*.sql'):
    manifest[str(p.relative_to(root))] = hashlib.sha256(p.read_bytes()).hexdigest()
(out / 'manifest.json').write_text(json.dumps({'base': base, 'sha256': manifest}, indent=2))
print('Evidence directory:', out, flush=True)
# Adapt historical regression harnesses ONLY in the disposable copy to the integrated destination.
transforms=[]
def adapt(path, old, new):
    p=root/path
    text=p.read_text()
    if old not in text: raise RuntimeError('Missing historical fixture adaptation '+path+' '+old)
    p.write_text(text.replace(old,new))
    transforms.append({'path':path,'old':old,'new':new})
attempts='docs/testes/issue333/pg/attempts-pg.test.ts'
adapt(attempts,'--reuid=65534','--reuid=1000');adapt(attempts,'--regid=65534','--regid=1000');adapt(attempts,"['65534:65534',dir]","['1000:1000',dir]")
adapt(attempts,"'supabase/manual/20261017_issue333_core.PENDENTE.sql'","'drizzle/migrations/0190_issue333_core_v2_closed_structure.sql'")
adapt(attempts,"'supabase/manual/20261017_issue333_attempts.PENDENTE.sql'","'drizzle/migrations/0191_issue333_attempts_closed_structure.sql','drizzle/migrations/0192_issue333_service_only_capability_reader.sql'")
(root/'head.pg.config.ts').write_text('import {defineConfig} from "vitest/config";export default defineConfig({test:{environment:"node",include:["docs/testes/issue333/pg/attempts-pg.test.ts"],testTimeout:60000,hookTimeout:60000,fileParallelism:false}});')
(root/'vitest.offline.config.ts').write_text('import config from "./vitest.config";import {defineConfig} from "vitest/config";export default defineConfig({...config,test:{...config.test,setupFiles:["src/test/setup.ts","docs/testes/issue333/integrated/deny-egress.ts"]}});')
(root/'deno-isolated.json').write_text(json.dumps({'nodeModulesDir':'manual','imports':{'npm:@supabase/supabase-js@2':'./node_modules/@supabase/supabase-js/dist/module/index.d.ts','npm:zod@3':'./node_modules/zod/index.d.ts','npm:zod@3.23.8':'./node_modules/zod/index.d.ts','npm:@supabase/supabase-js@2/cors':'./node_modules/@supabase/supabase-js/dist/cors.d.mts'},'compilerOptions':{'strict':False}}))
(out/'harness-adaptations.json').write_text(json.dumps(transforms,indent=2))
manifest_after={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (root/'docs/testes/issue333').rglob('*') if p.is_file()}
(out/'executed-harness-sha256.json').write_text(json.dumps(manifest_after,indent=2))
commands = [('head-integration', ['node', str(root/'node_modules/vitest/vitest.mjs'), 'run', '--config', 'docs/testes/issue333/vitest.head.config.ts','--reporter=default','--reporter=json','--outputFile='+str(out/'head-results.json')]),
            ('ui-client', ['node', str(root/'node_modules/vitest/vitest.mjs'), 'run', 'src/components/data-entry/__tests__/DataEntryDialog.test.tsx', 'src/components/standalone/__tests__/StandaloneAttemptsPanel.test.tsx', 'src/lib/__tests__/standalone-attempt-routing.test.ts', 'src/lib/__tests__/standalone-capabilities.test.ts']),
            ('pg-attempts',['node',str(root/'node_modules/vitest/vitest.mjs'),'run','--config','head.pg.config.ts']),
            ('entry-chromium',['node',str(root/'node_modules/vitest/vitest.mjs'),'run','--config','docs/testes/issue333/vitest.entry.config.ts']),
            ('general',['node',str(root/'node_modules/vitest/vitest.mjs'),'run','--config','vitest.offline.config.ts']),
            ('tsgo',['/node_modules/.bin/tsgo','-p','tsconfig.app.json','--noEmit']),
            ('deno',['/bin/deno','check','--no-remote','--config','deno-isolated.json','supabase/functions/data-entry/handler.ts','supabase/functions/standalone-attempt-333/index.ts','supabase/functions/ingest-standalone-invoice/index.ts']),
            ('build',['node',str(root/'node_modules/vite/bin/vite.js'),'build'])]
for name, cmd in commands:
    result = subprocess.run(cmd, cwd=root, env=env, capture_output=True, text=True, timeout=540)
    (out / (name + '.log')).write_text('COMMAND: ' + ' '.join(cmd) + '\n' + result.stdout + result.stderr + '\nEXIT: ' + str(result.returncode) + '\n')
    print(name, 'exit', result.returncode, flush=True)
    if result.returncode:
        print(result.stdout[-14000:] + result.stderr[-3000:])
        sys.exit(result.returncode)
for p in (root/'drizzle/migrations').glob('019[012]*.sql'):
    if hashlib.sha256(p.read_bytes()).hexdigest()!=manifest[str(p.relative_to(root))]:raise RuntimeError('Applied SQL altered')
(out/'result.json').write_text(json.dumps({'exit':0,'base':base,'cloud_tested':False,'scope':'selected integrated tests; not complete acceptance'},indent=2))
print('PASS executed suites only; coverage limitations remain; Cloud not exercised')
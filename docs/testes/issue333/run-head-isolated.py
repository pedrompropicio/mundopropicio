"""Run current integrated sources, never the historical patch, with a credential-free environment."""
import hashlib, json, os, pathlib, shutil, subprocess, sys, tempfile
repo = pathlib.Path.cwd()
base = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
if base != 'a3d3689352790e5684a417d8c1eedeb684c1429f':
    raise SystemExit('STOP: received HEAD differs from authorized base: ' + base)
out = pathlib.Path(tempfile.mkdtemp(prefix='issue333-head-'))
root = out / 'tree'
excluded = {'.git', '.github', 'node_modules', 'dist', 'claude-outputs', '__pycache__', '.lovable'}
def ignore(directory, names):
    return [n for n in names if n in excluded or n.startswith('.env')]
shutil.copytree(repo, root, ignore=ignore)
(root / 'node_modules').symlink_to(repo / 'node_modules', target_is_directory=True)
pg = next(pathlib.Path('/nix/store').glob('*postgresql-17*/bin/initdb')).parent
env = {'PATH': str(pg) + ':/bin:/usr/bin', 'HOME': str(out / 'home'), 'TMPDIR': '/tmp',
       'NODE_ENV': 'test', 'CI': 'true', 'VITE_SUPABASE_URL': 'http://127.0.0.1:9',
       'VITE_SUPABASE_PUBLISHABLE_KEY': 'local-fixture', 'ISSUE333_ISOLATED': '1',
       'ISSUE333_PYTHON': sys.executable, 'PLAYWRIGHT_BROWSERS_PATH': os.environ.get('PLAYWRIGHT_BROWSERS_PATH', '')}
manifest = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for parent in ['supabase/functions/data-entry', 'supabase/functions/standalone-attempt-333',
                           'supabase/functions/ingest-standalone-invoice', 'supabase/functions/_shared',
                           'src/components/data-entry', 'src/components/standalone', 'docs/testes/issue333']
            for p in (root / parent).rglob('*') if p.is_file()}
for p in (root / 'drizzle/migrations').glob('019[012]*.sql'):
    manifest[str(p.relative_to(root))] = hashlib.sha256(p.read_bytes()).hexdigest()
(out / 'manifest.json').write_text(json.dumps({'base': base, 'sha256': manifest}, indent=2))
print('Evidence directory:', out, flush=True)
commands = [('head-integration', ['node', str(root/'node_modules/vitest/vitest.mjs'), 'run', '--config', 'docs/testes/issue333/vitest.head.config.ts']),
            ('ui-client', ['node', str(root/'node_modules/vitest/vitest.mjs'), 'run', 'src/components/data-entry/__tests__/DataEntryDialog.test.tsx', 'src/components/standalone/__tests__/StandaloneAttemptsPanel.test.tsx', 'src/lib/__tests__/standalone-attempt-routing.test.ts', 'src/lib/__tests__/standalone-capabilities.test.ts'])]
for name, cmd in commands:
    result = subprocess.run(cmd, cwd=root, env=env, capture_output=True, text=True, timeout=540)
    (out / (name + '.log')).write_text('COMMAND: ' + ' '.join(cmd) + '\n' + result.stdout + result.stderr + '\nEXIT: ' + str(result.returncode) + '\n')
    print(name, 'exit', result.returncode, flush=True)
    if result.returncode:
        print(result.stdout[-14000:] + result.stderr[-3000:])
        sys.exit(result.returncode)
print('PASS selected integrated and UI/client checks; Cloud not exercised')
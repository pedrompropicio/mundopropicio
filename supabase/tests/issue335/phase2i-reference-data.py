"""#335 fase 2i — dados de referência de permissões SÓ do código versionado (decisão 3 do Pedro).
Extrai, por ordem de migração, todas as instruções INSERT/UPDATE/DELETE sobre public.role_permissions
de supabase/migrations/*.sql e escreve um ficheiro SQL que as repete no harness (nunca lê Live).
Cada instrução corre num SAVEPOINT; as que falharem (ex.: referem papéis/colunas entretanto mudados)
ficam listadas no relatório em vez de esconderem erro.
Uso: phase2i-reference-data.py <migrations-dir> <out.sql> <report.json>"""
import glob, json, os, re, sys

mig, out, rep = sys.argv[1:4]
pat = re.compile(r"(?is)\b(INSERT\s+INTO|DELETE\s+FROM|UPDATE)\s+(public\.)?role_permissions\b")
stmts = []
for f in sorted(glob.glob(os.path.join(mig, '*.sql'))):
    s = open(f, encoding='utf-8').read()
    for m in pat.finditer(s):
        # só instruções de topo: ignora as que estão dentro de corpos $$ (número ímpar de $$ antes)
        if s[:m.start()].count('$$') % 2 == 1:
            continue
        i, q = m.start(), False
        j = i
        while j < len(s):
            c = s[j]
            if c == "'":
                q = not q
            elif c == ';' and not q:
                break
            j += 1
        stmts.append((os.path.basename(f), s[i:j + 1]))

with open(out, 'w', encoding='utf-8') as o:
    o.write('-- GERADO por phase2i-reference-data.py a partir de supabase/migrations (código versionado). LOCAL ONLY.\n')
    o.write('\\set ON_ERROR_STOP off\nSET ROLE service_role;\n')
    for n, (f, st) in enumerate(stmts):
        o.write(f"-- {f}\nBEGIN; SAVEPOINT s; {st}\nRELEASE SAVEPOINT s; COMMIT;\n")
    o.write('RESET ROLE;\n')
json.dump({'statements': len(stmts), 'files': sorted({f for f, _ in stmts})}, open(rep, 'w'), indent=1)
print('reference data:', len(stmts), 'statements from', len({f for f, _ in stmts}), 'migrations')

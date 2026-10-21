"""#335 fase 2h — diferencial harness–Live com a mesma metodologia do 2f (igualdade exacta por chave).
Uso: phase2h-diff.py <live-capture.json> <local-capture.json> <saida.json>
Cada diferença remanescente é classificada por regra explícita (EXPLAINED); o resto fica UNEXPLAINED.
"""
import json, sys
live, local = (json.loads(open(p).read()) for p in sys.argv[1:3])
# Normalização única: um aclitem[] é um conjunto (a ordem dos itens não tem semântica no PostgreSQL).
def _norm(o):
    for f, v in list(o.items()):
        if f == 'acl' and isinstance(v, str) and v.startswith('{'):
            o[f] = '{' + ','.join(sorted(x for x in v[1:-1].split(',') if x)) + '}'
    return o
for cap in (live, local):
    for cat, objs in cap.items():
        if isinstance(objs, list):
            for o in objs:
                if isinstance(o, dict):
                    _norm(o)
keys = {'relations': ['schema', 'name'], 'columns': ['table', 'name'], 'constraints': ['table', 'type_owner', 'name'],
        'indexes': ['table', 'name'], 'triggers': ['table', 'name'], 'policies': ['schemaname', 'tablename', 'policyname'],
        'functions': ['signature'], 'types': ['name'], 'sequences': ['name'], 'views': ['name'],
        'default_acl': ['role', 'schema', 'type'], 'schemas': ['name'], 'extensions': ['name'], 'roles': ['name'],
        'memberships': ['role', 'member']}
STUB_EXT = {'pg_cron', 'pg_net', 'supabase_vault', 'pgmq', 'pg_stat_statements'}
def explain(cat, ident, l, r):
    if cat == 'extensions' and ident[0] in STUB_EXT:
        return 'extensão não instalável localmente; objectos replicados do catálogo como objectos simples (stub)'
    if cat == 'functions' and l and l.get('definition') == 'C/internal':
        return 'função C de extensão substituída por stub plpgsql com assinatura idêntica que lança issue335_stub'
    if cat == 'roles' and l and r and {k for k in l if l[k] != r[k]} <= {'login'}:
        return 'atributo LOGIN irrelevante para o harness'
    if cat == 'indexes' and l and r and {f for f in set(l) | set(r) if l.get(f) != r.get(f)} == {'valid'} and l.get('valid') is False:
        return 'índice INVÁLIDO em Live (construção concorrente interrompida); localmente válido — só afecta o planeador, não a semântica'
    return None
rows = []
for cat, fields in keys.items():
    k = lambda o: tuple(str(o.get(f)) for f in fields)
    a = {k(o): o for o in live.get(cat) or []}
    b = {k(o): o for o in local.get(cat) or []}
    for ident in sorted(a.keys() | b.keys()):
        l, r = a.get(ident), b.get(ident)
        if l == r:
            continue
        status = 'missing' if r is None else 'local_extra' if l is None else 'different'
        why = explain(cat, ident, l, r)
        rows.append(dict(category=cat, object=list(ident), status=status, explained=why is not None, reason=why,
                         differing_fields=None if l is None or r is None else sorted(f for f in set(l) | set(r) if l.get(f) != r.get(f)),
                         live=l, local=r))
summary = {}
for r in rows:
    s = summary.setdefault(r['category'], {})
    s[r['status'] + ('_explained' if r['explained'] else '_UNEXPLAINED')] = s.get(r['status'] + ('_explained' if r['explained'] else '_UNEXPLAINED'), 0) + 1
equal = {cat: len({tuple(str(o.get(f)) for f in fl) for o in live.get(cat) or []}) - sum(1 for r in rows if r['category'] == cat and r['status'] != 'local_extra') for cat, fl in keys.items()}
json.dump(dict(equal=equal, summary=summary, differences=rows), open(sys.argv[3], 'w'), ensure_ascii=False, indent=1)
print('equal', equal)
print('diffs', json.dumps(summary, ensure_ascii=False))
print('UNEXPLAINED total', sum(1 for r in rows if not r['explained']))

"""#335 fase 2h — adapta os SQL de teste antigos ao schema REAL (só fixtures, nunca asserções).
O stub antigo tinha defaults/colunas que Live não tem. Adaptações (cada uma só ACRESCENTA colunas em falta
a INSERTs de fixture; nenhuma asserção, nenhuma chamada a funções do #335 é alterada):
 1) bank_statement_lines: Live exige statement_id e line_hash -> extrato fixture ...040 e hash único;
 2) transactions: status tem default 'pending' em Live (o stub tinha 'approved') -> status='approved'
    explícito (o trigger REAL de aprovação avalia-o); sem company_id o trigger real de aprovação corre antes
    de trg_set_company_id (ordem alfabética) e recusa -> company_id=current_company_id(), como a aplicação;
 3) events: Live exige date e event_nature -> '2026-10-13' e 'producao_propria';
 4) INSERT posicional em user_roles (ordem do stub) -> user_id,role e empresa ...001.
Uso: phase2h-adapt.py <in.sql> <out.sql>"""
import re, sys
s = open(sys.argv[1]).read()
n = {}
s, n['bank_lines'] = re.subn(r"INSERT INTO bank_statement_lines\(([^)]*)\) VALUES\(",
    lambda m: ("INSERT INTO bank_statement_lines(statement_id,line_hash," + m.group(1) + ") VALUES("
               "'00000000-0000-0000-0000-000000000040',md5(clock_timestamp()::text||random()::text),"), s)

def add_cols(src, table, defaults):
    out, i, count = [], 0, 0
    pat = re.compile(r"INSERT INTO (?:public\.)?" + table + r"\(([^)]*)\)\s*VALUES\s*", re.I)
    while True:
        m = pat.search(src, i)
        if not m:
            out.append(src[i:]); break
        cols = [c.strip() for c in m.group(1).split(',')]
        add = [(c, v) for c, v in defaults if c not in cols]
        out.append(src[i:m.start()])
        if not add:
            out.append(m.group(0)); i = m.end(); continue
        out.append(m.group(0).replace('(' + m.group(1) + ')', '(' + ','.join(c for c, _ in add) + ',' + m.group(1) + ')', 1))
        pre = ','.join(v for _, v in add) + ','
        j = m.end()
        while True:  # percorre os tuplos respeitando aspas e parênteses aninhados
            while src[j] in ' \n\t': out.append(src[j]); j += 1
            if src[j] != '(':
                break
            depth, k, q = 0, j, False
            while True:
                ch = src[k]
                if q:
                    if ch == "'":
                        if src[k + 1:k + 2] == "'": k += 1
                        else: q = False
                elif ch == "'": q = True
                elif ch == '(': depth += 1
                elif ch == ')':
                    depth -= 1
                    if depth == 0: break
                k += 1
            out.append('(' + pre + src[j + 1:k + 1]); count += 1
            j = k + 1
            while src[j] in ' \n\t': out.append(src[j]); j += 1
            if src[j] == ',':
                out.append(','); j += 1; continue
            break
        i = j
    return ''.join(out), count

s, n['tx_rows'] = add_cols(s, 'transactions', [('status', "'approved'"), ('company_id', 'public.current_company_id()')])
s, n['event_rows'] = add_cols(s, 'events', [('date', "'2026-10-13'"), ('event_nature', "'producao_propria'")])
s, n['user_roles'] = re.subn(r"INSERT INTO public\.user_roles VALUES\(('[0-9a-f-]{36}'),('[a-z_]+')\)",
    r"INSERT INTO public.user_roles(user_id,role,company_id) VALUES(\1,\2,'00000000-0000-0000-0000-000000000001')", s)
open(sys.argv[2], 'w').write(s)
print(sys.argv[1], 'adaptações:', n)

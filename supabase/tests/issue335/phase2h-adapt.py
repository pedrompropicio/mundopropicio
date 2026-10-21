"""#335 fase 2h — adapta os SQL de teste antigos ao schema REAL (só fixtures, nunca asserções).
Adaptações (todas porque o stub antigo tinha defaults que Live não tem):
 1) bank_statement_lines exige statement_id e line_hash: injecta-se o extrato fixture ...040 e hash único;
 2) transactions.status tem default 'pending' em Live (o stub tinha 'approved'): os INSERT sem coluna
    status passam a declarar status='approved' explicitamente; o trigger REAL de aprovação avalia-o.
Uso: phase2h-adapt.py <in.sql> <out.sql>"""
import re, sys
s = open(sys.argv[1]).read()
n = {'bank_lines': 0, 'tx_rows': 0}
def fix(m):
    n['bank_lines'] += 1
    return ("INSERT INTO bank_statement_lines(statement_id,line_hash," + m.group(1) + ") VALUES("
            "'00000000-0000-0000-0000-000000000040',md5(clock_timestamp()::text||random()::text),")
s = re.sub(r"INSERT INTO bank_statement_lines\(([^)]*)\) VALUES\(", fix, s)
out, i = [], 0
pat = re.compile(r"INSERT INTO (?:public\.)?transactions\(([^)]*)\)\s*VALUES\s*", re.I)
while True:
    m = pat.search(s, i)
    if not m:
        out.append(s[i:]); break
    cols = [c.strip() for c in m.group(1).split(',')]
    out.append(s[i:m.start()])
    if 'status' in cols:
        out.append(m.group(0)); i = m.end(); continue
    out.append(m.group(0).replace('(' + m.group(1) + ')', '(status,' + m.group(1) + ')', 1))
    j = m.end()
    while True:  # percorre tuplos (aspas e parênteses aninhados)
        while s[j] in ' \n\t': out.append(s[j]); j += 1
        if s[j] != '(':
            break
        depth, k, q = 0, j, False
        while True:
            ch = s[k]
            if q:
                if ch == "'":
                    if s[k + 1:k + 2] == "'": k += 1
                    else: q = False
            elif ch == "'": q = True
            elif ch == '(': depth += 1
            elif ch == ')':
                depth -= 1
                if depth == 0: break
            k += 1
        out.append("('approved'," + s[j + 1:k + 1]); n['tx_rows'] += 1
        j = k + 1
        while s[j] in ' \n\t': out.append(s[j]); j += 1
        if s[j] == ',':
            out.append(','); j += 1; continue
        break
    i = j
open(sys.argv[2], 'w').write(''.join(out))
print(sys.argv[1], 'adaptações:', n)

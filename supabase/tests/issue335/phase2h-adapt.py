"""#335 fase 2h — adapta os SQL de teste antigos ao schema REAL (só fixtures, nunca asserções).
Única adaptação: bank_statement_lines exige statement_id e line_hash em Live (o stub não exigia);
injecta-se o extrato fixture ...040 e um hash único. Uso: phase2h-adapt.py <in.sql> <out.sql>"""
import re, sys
s = open(sys.argv[1]).read()
n = 0
def fix(m):
    global n; n += 1
    return ("INSERT INTO bank_statement_lines(statement_id,line_hash," + m.group(1) + ") VALUES("
            "'00000000-0000-0000-0000-000000000040',md5(clock_timestamp()::text||random()::text),")
s = re.sub(r"INSERT INTO bank_statement_lines\(([^)]*)\) VALUES\(", fix, s)
open(sys.argv[2], 'w').write(s)
print(sys.argv[1], 'adaptações:', n)

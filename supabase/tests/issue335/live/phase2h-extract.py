"""#335 fase 2h — extractor de catálogo (SÓ SELECT a pg_catalog; nunca lê linhas de dados).

Uso (sessão Live read-only do sandbox, variáveis PG* já definidas):
    python3 supabase/tests/issue335/live/phase2h-extract.py > supabase/tests/issue335/live/phase2h-catalog-ddl.json
Saída determinística: lista ordenada de instruções DDL com (fase, papel executor, chave, sql).
Todas as queries estão neste ficheiro; nenhuma consulta toca tabelas de aplicação.
"""
import json, os, sys

REAL_EXT = {'plpgsql', 'vector', 'uuid-ossp', 'pgcrypto', 'unaccent', 'pg_trgm'}
SKIP_NS = ('pg_catalog', 'information_schema', 'pg_toast')
# O proxy do sandbox não devolve client_encoding a libpq-python; usa-se um único
# processo psql persistente (só SELECT), com resultados serializados em JSON.
import subprocess
_P = subprocess.Popen(['psql', '-XAtq', '-v', 'ON_ERROR_STOP=1'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding='utf-8')
_P.stdin.write("SET default_transaction_read_only=on;\n"); _P.stdin.flush()
_MARK = '__issue335_eoq__'

def _lit(v):
    if isinstance(v, (list, tuple)):
        return 'ARRAY[' + ','.join(_lit(x) for x in v) + ']::text[]'
    if isinstance(v, int):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"

def q(sql, args=None):
    if args is not None:
        sql = sql % tuple(_lit(a) for a in args)
    else:
        sql = sql.replace('%%', '%')
    wrapped = "SELECT coalesce(json_agg(row_to_json(x)),'[]')::text FROM (" + sql + ") x;\n\\echo " + _MARK + "\n"
    _P.stdin.write(wrapped); _P.stdin.flush()
    lines = []
    while True:
        line = _P.stdout.readline()
        if not line:
            raise RuntimeError('psql terminou: ' + sql[:200])
        if line.rstrip('\n') == _MARK:
            break
        lines.append(line)
    rows = json.loads(''.join(lines), object_pairs_hook=lambda pairs: [v for k, v in pairs])
    return [tuple(r) for r in rows]

import re as _re
_KW = None
def ident(x):
    global _KW
    if _KW is None:
        _KW = {r[0] for r in q("SELECT word FROM pg_get_keywords() WHERE catcode<>'U'")}
    if _re.fullmatch(r'[a-z_][a-z0-9_$]*', x) and x not in _KW:
        return x
    return '"' + x.replace('"', '""') + '"'

ext_member = """(SELECT objid FROM pg_depend d JOIN pg_extension e ON e.oid=d.refobjid
                 WHERE d.deptype='e' AND d.classid=%s::regclass AND e.extname = ANY(%s))"""
real = list(REAL_EXT)
out = []
def emit(phase, role, key, sql):
    out.append(dict(phase=phase, role=role, key=key, sql=sql))

# 0 roles (atributos reais) + memberships
for r in q("""SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls
              FROM pg_roles WHERE rolname !~ '^pg_' ORDER BY rolname"""):
    n, sup, inh, cr, cdb, login, repl, byp = r
    attrs = ' '.join([('SUPERUSER' if sup else 'NOSUPERUSER'), ('INHERIT' if inh else 'NOINHERIT'),
                      ('CREATEROLE' if cr else 'NOCREATEROLE'), ('CREATEDB' if cdb else 'NOCREATEDB'),
                      ('LOGIN' if login else 'NOLOGIN'), ('REPLICATION' if repl else 'NOREPLICATION'),
                      ('BYPASSRLS' if byp else 'NOBYPASSRLS')])
    emit('00_roles', 'supabase_admin', 'role:' + n,
         f"DO $r$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname={_lit(n)}) THEN CREATE ROLE {ident(n)}; END IF; END$r$; ALTER ROLE {ident(n)} {attrs}")
for role, member, grantor, adm, inh, st in q("""SELECT pg_get_userbyid(roleid),pg_get_userbyid(member),pg_get_userbyid(grantor),admin_option,inherit_option,set_option
                                            FROM pg_auth_members ORDER BY 1,2"""):
    if role.startswith('pg_') and member.startswith('pg_'):
        continue
    emit('01_members', 'supabase_admin', f'member:{role}:{member}',
         f"GRANT {ident(role)} TO {ident(member)} WITH ADMIN {str(adm).upper()}, INHERIT {str(inh).upper()}, SET {str(st).upper()} GRANTED BY {ident(grantor)}")

# 1 schemas
schemas = [r[0] for r in q("SELECT nspname FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname<>'information_schema' ORDER BY 1")]
for s, owner in q("SELECT nspname,pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = ANY(%s) ORDER BY 1", (schemas,)):
    emit('02_schemas', 'supabase_admin', 'schema:' + s,
         f"CREATE SCHEMA IF NOT EXISTS {ident(s)}; ALTER SCHEMA {ident(s)} OWNER TO {ident(owner)}")

def acl_stmts(phase, key, objtype, objname, aclcol_sql, owner):
    rows = q(aclcol_sql)
    if rows and rows[0][0] is None:
        return  # ACL por omissão: nada a emitir
    stmts = [f"REVOKE ALL ON {objtype} {objname} FROM PUBLIC"]
    revoke_roles = {owner}
    for grantor, grantee, priv, go in rows:
        if grantee:
            revoke_roles.add(grantee)
    for rr in sorted(revoke_roles):
        stmts.append(f"REVOKE ALL ON {objtype} {objname} FROM {ident(rr)}")
    emit(phase, owner, key + ':revoke', '; '.join(stmts))
    by = {}
    for grantor, grantee, priv, go in rows:
        by.setdefault((grantor, grantee or 'PUBLIC', go), []).append(priv)
    for (grantor, grantee, go), privs in sorted(by.items()):
        g = 'PUBLIC' if grantee == 'PUBLIC' else ident(grantee)
        emit(phase, grantor, f'{key}:{grantor}:{grantee}:{go}',
             f"GRANT {', '.join(sorted(privs))} ON {objtype} {objname} TO {g}{' WITH GRANT OPTION' if go else ''}")

def aclx(col, frm):
    return f"""SELECT pg_get_userbyid(a.grantor), CASE WHEN a.grantee=0 THEN NULL ELSE pg_get_userbyid(a.grantee) END, a.privilege_type, a.is_grantable
               FROM (SELECT {col} acl {frm}) s LEFT JOIN LATERAL aclexplode(s.acl) a ON true ORDER BY 1,2,3"""

for s, owner, has in q("SELECT nspname,pg_get_userbyid(nspowner),nspacl IS NOT NULL FROM pg_namespace WHERE nspname = ANY(%s) ORDER BY 1", (schemas,)):
    if has:
        acl_stmts('03_schema_acl', 'schema:' + s, 'SCHEMA', ident(s), aclx('nspacl', f"FROM pg_namespace WHERE nspname='{s}'"), owner)

# 2 extensões reais
for e, ns, v in q("SELECT extname,extnamespace::regnamespace::text,extversion FROM pg_extension WHERE extname = ANY(%s) ORDER BY 1", (real,)):
    if e != 'plpgsql':
        emit('04_extensions', 'supabase_admin', 'ext:' + e, f'CREATE EXTENSION IF NOT EXISTS {ident(e)} WITH SCHEMA {ns} VERSION {_lit(v)}')

# 3 tipos (enum, domain, composite, range)
for oid, name, typtype, owner in q(f"""SELECT t.oid, format('%%I.%%I',n.nspname,t.typname), t.typtype, pg_get_userbyid(t.typowner)
        FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
        WHERE n.nspname = ANY(%s) AND t.typtype IN ('e','d','c','r')
          AND (t.typtype<>'c' OR (SELECT relkind FROM pg_class WHERE oid=t.typrelid)='c')
          AND t.oid NOT IN {ext_member} ORDER BY 2""", (schemas, 'pg_type', real)):
    if typtype == 'e':
        labels = [r[0] for r in q('SELECT enumlabel FROM pg_enum WHERE enumtypid=%s ORDER BY enumsortorder', (oid,))]
        body = ', '.join(_lit(l) for l in labels)
        sql = f'CREATE TYPE {name} AS ENUM ({body})'
    elif typtype == 'd':
        base, notnull, dflt, coll = q("""SELECT format_type(typbasetype,typtypmod),typnotnull,typdefault,
                 CASE WHEN typcollation<>0 AND typcollation<>(SELECT typcollation FROM pg_type b WHERE b.oid=t.typbasetype) THEN (SELECT format('%%I.%%I',cn.nspname,c.collname) FROM pg_collation c JOIN pg_namespace cn ON cn.oid=c.collnamespace WHERE c.oid=t.typcollation) END
                 FROM pg_type t WHERE oid=%s""", (oid,))[0]
        checks = q("SELECT conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE contypid=%s ORDER BY conname", (oid,))
        sql = f'CREATE DOMAIN {name} AS {base}' + (f' COLLATE {coll}' if coll else '') + (f' DEFAULT {dflt}' if dflt else '') + (' NOT NULL' if notnull else '') + ''.join(f' CONSTRAINT {ident(c)} {d}' for c, d in checks)
    elif typtype == 'c':
        atts = q("""SELECT format('%%I %%s',attname,format_type(atttypid,atttypmod)) FROM pg_attribute
                    WHERE attrelid=(SELECT typrelid FROM pg_type WHERE oid=%s) AND attnum>0 AND NOT attisdropped ORDER BY attnum""", (oid,))
        sql = f"CREATE TYPE {name} AS ({', '.join(a[0] for a in atts)})"
    else:
        sub, = q('SELECT format_type(rngsubtype,NULL) FROM pg_range WHERE rngtypid=%s', (oid,))[0]
        sql = f'CREATE TYPE {name} AS RANGE (subtype={sub})'
    emit('05_types', owner, 'type:' + name, sql + f'; ALTER TYPE {name} OWNER TO {ident(owner)}' if typtype != 'd' else sql + f'; ALTER DOMAIN {name} OWNER TO {ident(owner)}')

# 4 sequências não-identity
for name, owner, typ, st, inc, mn, mx, cache, cyc in q(f"""SELECT format('%%I.%%I',n.nspname,c.relname),pg_get_userbyid(c.relowner),format_type(s.seqtypid,NULL),
        s.seqstart,s.seqincrement,s.seqmin,s.seqmax,s.seqcache,s.seqcycle
        FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname = ANY(%s) AND c.oid NOT IN {ext_member}
          AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=c.oid AND d.classid='pg_class'::regclass AND d.deptype='i') ORDER BY 1""", (schemas, 'pg_class', real)):
    emit('06_sequences', owner, 'seq:' + name,
         f"CREATE SEQUENCE {name} AS {typ} START {st} INCREMENT {inc} MINVALUE {mn} MAXVALUE {mx} CACHE {cache}{' CYCLE' if cyc else ''}")

# 5 tabelas (sem defaults não-generated; defaults depois das funções)
tables = q(f"""SELECT c.oid, format('%%I.%%I',n.nspname,c.relname), pg_get_userbyid(c.relowner), c.relkind, c.relpersistence,
        c.relispartition, CASE WHEN c.relkind='p' THEN pg_get_partkeydef(c.oid) END,
        CASE WHEN c.relispartition THEN (SELECT inhparent::regclass::text FROM pg_inherits WHERE inhrelid=c.oid) END,
        CASE WHEN c.relispartition THEN pg_get_expr(c.relpartbound,c.oid) END,
        c.relrowsecurity, c.relforcerowsecurity, c.reloptions
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname = ANY(%s) AND c.relkind IN ('r','p') AND c.oid NOT IN {ext_member} ORDER BY c.relispartition, 2""", (schemas, 'pg_class', real))
for oid, name, owner, kind, pers, ispart, partkey, parent, bound, rls, frls, opts in tables:
    cols = []
    for an, typ, nn, ident_, gen, expr, coll in q("""SELECT a.attname, format_type(a.atttypid,a.atttypmod), a.attnotnull, a.attidentity, a.attgenerated,
              pg_get_expr(d.adbin,d.adrelid),
              CASE WHEN a.attcollation<>0 AND a.attcollation<>(SELECT typcollation FROM pg_type WHERE oid=a.atttypid) THEN (SELECT format('%%I.%%I',cn.nspname,co.collname) FROM pg_collation co JOIN pg_namespace cn ON cn.oid=co.collnamespace WHERE co.oid=a.attcollation) END
              FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
              WHERE a.attrelid=%s AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum""", (oid,)):
        c = f'{ident(an)} {typ}' + (f' COLLATE {coll}' if coll else '')
        if gen == 's':
            c += f' GENERATED ALWAYS AS ({expr}) STORED'
        if ident_:
            c += ' GENERATED ' + ('ALWAYS' if ident_ == 'a' else 'BY DEFAULT') + ' AS IDENTITY'
        if nn:
            c += ' NOT NULL'
        cols.append(c)
        if expr is not None and gen != 's' and not ident_:
            emit('11_defaults', owner, f'default:{name}.{an}', f'ALTER TABLE {name} ALTER COLUMN {ident(an)} SET DEFAULT {expr}')
    if ispart:
        sql = f'CREATE TABLE {name} PARTITION OF {parent} {bound}'
    else:
        sql = ('CREATE UNLOGGED TABLE ' if pers == 'u' else 'CREATE TABLE ') + f"{name} ({', '.join(cols)})" + (f' PARTITION BY {partkey}' if partkey else '')
    if opts:
        sql += f" WITH ({', '.join(opts)})"
    emit('07_tables', owner, 'table:' + name, sql)
    if rls:
        emit('14_rls', owner, 'rls:' + name, f'ALTER TABLE {name} ENABLE ROW LEVEL SECURITY')
    if frls:
        emit('14_rls', owner, 'frls:' + name, f'ALTER TABLE {name} FORCE ROW LEVEL SECURITY')
    acl_stmts('17_acl_tables', 'tacl:' + name, 'TABLE', name, aclx('relacl', f'FROM pg_class WHERE oid={oid}'), owner)
    for an, in q('SELECT attname FROM pg_attribute WHERE attrelid=%s AND attacl IS NOT NULL AND attnum>0 AND NOT attisdropped ORDER BY attnum', (oid,)):
        for grantor, grantee, priv, go in q(aclx('attacl', f"FROM pg_attribute WHERE attrelid={oid} AND attname='{an}'")):
            g = 'PUBLIC' if grantee is None else ident(grantee)
            emit('18_acl_columns', grantor, f'cacl:{name}.{an}:{grantee}:{priv}', f"GRANT {priv} ({ident(an)}) ON TABLE {name} TO {g}{' WITH GRANT OPTION' if go else ''}")

# sequências: ownership e ACL (após tabelas)
for oid, name, owner, tbl, col, ident_dep in q(f"""SELECT c.oid, format('%%I.%%I',n.nspname,c.relname), pg_get_userbyid(c.relowner),
        (SELECT d.refobjid::regclass::text FROM pg_depend d WHERE d.objid=c.oid AND d.classid='pg_class'::regclass AND d.refclassid='pg_class'::regclass AND d.deptype IN ('a','i') LIMIT 1),
        (SELECT quote_ident(attname) FROM pg_depend d JOIN pg_attribute a ON a.attrelid=d.refobjid AND a.attnum=d.refobjsubid WHERE d.objid=c.oid AND d.classid='pg_class'::regclass AND d.deptype IN ('a','i') LIMIT 1),
        EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=c.oid AND d.classid='pg_class'::regclass AND d.deptype='i')
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='S' AND n.nspname = ANY(%s) AND c.oid NOT IN {ext_member} ORDER BY 2""", (schemas, 'pg_class', real)):
    if tbl and not ident_dep:
        emit('12_seq_owned', owner, 'seqown:' + name, f'ALTER SEQUENCE {name} OWNED BY {tbl}.{col}')
    acl_stmts('17_acl_seq', 'sacl:' + name, 'SEQUENCE', name, aclx('relacl', f'FROM pg_class WHERE oid={oid}'), owner)

# 6 funções/procedures (pg_get_functiondef); C/internal fora de extensões reais -> stub com assinatura idêntica
for oid, sig, owner, lang, kind, rettype, ident_args in q(f"""SELECT p.oid, p.oid::regprocedure::text, pg_get_userbyid(p.proowner), l.lanname, p.prokind,
        pg_get_function_result(p.oid), pg_get_function_arguments(p.oid)
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
        WHERE n.nspname = ANY(%s) AND p.oid NOT IN {ext_member} AND p.prokind IN ('f','p') ORDER BY 2""", (schemas, 'pg_proc', real)):
    if lang in ('c', 'internal'):
        nm = q("SELECT format('%%I.%%I',pronamespace::regnamespace::text,proname) FROM pg_proc WHERE oid=%s", (oid,))[0][0]
        nm = q("SELECT format('%%s.%%I',quote_ident(pronamespace::regnamespace::text),proname) FROM pg_proc WHERE oid=%s", (oid,))[0][0]
        if kind == 'p':
            sql = f"CREATE PROCEDURE {nm}({ident_args}) LANGUAGE plpgsql AS $stub$BEGIN RAISE EXCEPTION 'issue335_stub: {sig} (C) não reproduzida localmente'; END$stub$"
        else:
            sql = f"CREATE FUNCTION {nm}({ident_args}) RETURNS {rettype} LANGUAGE plpgsql AS $stub$BEGIN RAISE EXCEPTION 'issue335_stub: {sig} (C) não reproduzida localmente'; END$stub$"
        emit('09_functions', owner, 'stubfn:' + sig, sql)
        emit('09_functions_meta', 'supabase_admin', 'stubown:' + sig, f'ALTER ROUTINE {sig} OWNER TO {ident(owner)}')
    else:
        emit('09_functions', owner, 'fn:' + sig, q('SELECT pg_get_functiondef(%s)', (oid,))[0][0])
    acl_stmts('17_acl_functions', 'facl:' + sig, 'ROUTINE', sig, aclx('proacl', f'FROM pg_proc WHERE oid={oid}'), owner)
for sig, in q(f"""SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname = ANY(%s) AND p.oid NOT IN {ext_member} AND p.prokind='a' ORDER BY 1""", (schemas, 'pg_proc', real)):
    emit('99_unsupported', 'none', 'aggregate:' + sig, '-- agregado não reproduzido')

# 7 constraints (PK/UNIQUE/EXCLUDE/CHECK antes de FK)
for tbl, cname, ctype, cdef, owner in q(f"""SELECT format('%%I.%%I',n.nspname,c.relname), k.conname, k.contype, pg_get_constraintdef(k.oid), pg_get_userbyid(c.relowner)
        FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname = ANY(%s) AND k.contype IN ('p','u','x','c','f','t') AND k.conislocal AND c.oid NOT IN {ext_member}
          AND NOT (c.relispartition AND k.conparentid<>0)
        ORDER BY CASE k.contype WHEN 'p' THEN 0 WHEN 'u' THEN 1 WHEN 'x' THEN 2 WHEN 'c' THEN 3 ELSE 4 END, 1, 2""", (schemas, 'pg_class', real)):
    if ctype == 't':
        continue  # constraint triggers saem em triggers
    emit('13_constraints_fk' if ctype == 'f' else '13_constraints', owner, f'con:{tbl}.{cname}', f'ALTER TABLE {tbl} ADD CONSTRAINT {ident(cname)} {cdef}')

# 8 índices não associados a constraints (inclui parciais/expressões)
for tbl, iname, idef, owner in q(f"""SELECT i.indrelid::regclass::text, c.relname, pg_get_indexdef(i.indexrelid), pg_get_userbyid(t.relowner)
        FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname = ANY(%s) AND t.oid NOT IN {ext_member}
          AND NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conindid=i.indexrelid AND k.contype IN ('p','u','x'))
          AND NOT EXISTS(SELECT 1 FROM pg_inherits h WHERE h.inhrelid=i.indexrelid)
        ORDER BY 1,2""", (schemas, 'pg_class', real)):
    emit('15_indexes', owner, f'idx:{tbl}.{iname}', idef)

# 9 views / matviews (ordem resolvida por re-tentativa no instalador)
for oid, name, owner, kind, opts in q(f"""SELECT c.oid, format('%%I.%%I',n.nspname,c.relname), pg_get_userbyid(c.relowner), c.relkind, c.reloptions
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname = ANY(%s) AND c.relkind IN ('v','m') AND c.oid NOT IN {ext_member} ORDER BY 2""", (schemas, 'pg_class', real)):
    body = q('SELECT pg_get_viewdef(%s)', (oid,))[0][0].rstrip().rstrip(';')
    w = f" WITH ({', '.join(opts)})" if opts else ''
    emit('10_views', owner, 'view:' + name, (f'CREATE MATERIALIZED VIEW {name}{w} AS {body} WITH NO DATA' if kind == 'm' else f'CREATE VIEW {name}{w} AS {body}'))
    acl_stmts('17_acl_tables', 'vacl:' + name, 'TABLE', name, aclx('relacl', f'FROM pg_class WHERE oid={oid}'), owner)
    for an, dflt in q('SELECT a.attname,pg_get_expr(d.adbin,d.adrelid) FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum WHERE d.adrelid=%s', (oid,)):
        emit('11_defaults', owner, f'vdefault:{name}.{an}', f'ALTER VIEW {name} ALTER COLUMN {ident(an)} SET DEFAULT {dflt}')

# 10 triggers de utilizador (RI nascem das FK) + estado enabled
for tbl, tname, tdef, en, owner in q(f"""SELECT format('%%I.%%I',n.nspname,c.relname), t.tgname, pg_get_triggerdef(t.oid), t.tgenabled, pg_get_userbyid(c.relowner)
        FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname = ANY(%s) AND NOT t.tgisinternal AND c.oid NOT IN {ext_member} AND t.tgparentid=0 ORDER BY 1,2""", (schemas, 'pg_class', real)):
    emit('16_triggers', owner, f'trg:{tbl}.{tname}', tdef)
    if en != 'O':
        mode = {'D': 'DISABLE TRIGGER', 'R': 'ENABLE REPLICA TRIGGER', 'A': 'ENABLE ALWAYS TRIGGER'}[en]
        emit('16_triggers_state', owner, f'trgstate:{tbl}.{tname}', f'ALTER TABLE {tbl} {mode} {ident(tname)}')

# 11 policies
for tbl, pname, perm, cmd, roles, qual, chk, owner in q(f"""SELECT format('%%I.%%I',n.nspname,c.relname), p.polname, p.polpermissive,
        p.polcmd, ARRAY(SELECT CASE WHEN r=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r)) END FROM unnest(p.polroles) r ORDER BY 1),
        pg_get_expr(p.polqual,p.polrelid), pg_get_expr(p.polwithcheck,p.polrelid), pg_get_userbyid(c.relowner)
        FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname = ANY(%s) ORDER BY 1,2""", (schemas,)):
    cmdw = {'r': 'SELECT', 'a': 'INSERT', 'w': 'UPDATE', 'd': 'DELETE', '*': 'ALL'}[cmd]
    sql = f"CREATE POLICY {ident(pname)} ON {tbl} AS {'PERMISSIVE' if perm else 'RESTRICTIVE'} FOR {cmdw} TO {', '.join(roles)}"
    if qual is not None:
        sql += f' USING ({qual})'
    if chk is not None:
        sql += f' WITH CHECK ({chk})'
    emit('16_policies', owner, f'pol:{tbl}.{pname}', sql)

# 12 ownership de tabelas/views já é do executor; default ACL no fim
for role, ns, typ, in q("""SELECT pg_get_userbyid(defaclrole), CASE WHEN defaclnamespace=0 THEN NULL ELSE defaclnamespace::regnamespace::text END, defaclobjtype
                           FROM pg_default_acl ORDER BY 1,2,3"""):
    ot = {'r': 'TABLES', 'S': 'SEQUENCES', 'f': 'FUNCTIONS', 'T': 'TYPES', 'n': 'SCHEMAS'}[typ]
    where = f"defaclrole='{role}'::regrole AND defaclobjtype='{typ}' AND " + (f"defaclnamespace='{ns}'::regnamespace" if ns else 'defaclnamespace=0')
    rows = q(aclx('defaclacl', f'FROM pg_default_acl WHERE {where}'))
    insch = f' IN SCHEMA {ns}' if ns else ''
    pre = f'ALTER DEFAULT PRIVILEGES FOR ROLE {ident(role)}{insch}'
    stmts = [f'{pre} REVOKE ALL ON {ot} FROM PUBLIC', f'{pre} REVOKE ALL ON {ot} FROM {ident(role)}']
    for g, grantee, priv, go in rows:
        stmts.append(f"{pre} GRANT {priv} ON {ot} TO {'PUBLIC' if grantee is None else ident(grantee)}{' WITH GRANT OPTION' if go else ''}")
    emit('19_default_acl', 'supabase_admin', f'dacl:{role}:{ns}:{typ}', '; '.join(stmts))

meta = dict(version=q('SELECT version()')[0][0], schemas=schemas, real_extensions=sorted(REAL_EXT),
            stubbed_extensions=[r[0] for r in q('SELECT extname FROM pg_extension WHERE NOT (extname = ANY(%s)) ORDER BY 1', (real,))],
            not_reproduced=['event triggers', 'publications (supabase_realtime)', 'comments', 'security labels', 'grants on databases/languages', 'pg_cron/pg_net/vault C functions (stubs that RAISE)', 'shared_preload/background workers'])
out.sort(key=lambda s: (s['phase'], s['key']))
json.dump(dict(meta=meta, statements=out), sys.stdout, ensure_ascii=False, indent=1)
print()

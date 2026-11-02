# #486 D1-C3 — verificação de preparação

Nenhum SQL novo foi executado, compilado ou ensaiado. O programa abaixo só lê/escreve texto nos caminhos autorizados: deriva as identidades das 35 definições, compara o manifesto integralmente e regenera TSV/pós/rollback/cópia com `--write`. Não é parser PostgreSQL nem prova de catálogo instalado. A comparação PostgreSQL continua exata (`IS NOT DISTINCT FROM`), incluindo a ordem de `proconfig`; não se removem aspas de um catálogo divergente.

Fonte recebida: #506, commit `3e4dba865515d69b24a027aa25be0675034e81d2`; BZip2 de 63.449 bytes, SHA256 `5eb917ed071e0ffbec40bd7a26f352f808e28a9c0a8472d8dcdfd0dd6f2cd6a1`. Os 21 blobs e a cópia foram validados antes da extração dos 22 caminhos. O checkout inicial limpo era `d1ac522f9e59652a6e34d960fbf77a22f5c0b09c`. SHA/CI #506 `quality41538984338/job125597990083 success` são informação do despacho, sem reconsulta à rede. Não houve integração de #492/#502/#506.

A derivação de `SET` aceita apenas a gramática presente neste candidato e rejeita formas desconhecidas. Para `search_path`, cada item é normalizado individualmente: `TO 'public', 'pg_catalog'` corresponde a `search_path=public, pg_catalog`. Uma string única com vírgula é um identificador único entre aspas duplas; duas aspas SQL escapadas não passam a ser separadores. Referência primária fornecida no anexo: [flatten_set_variable_args](https://doxygen.postgresql.org/guc__funcs_8c_source.html#l00194). Não foi necessária rede para usar o contexto recebido.

Execução local sem SQL: extrair este único bloco `python` e executá-lo com Python 3; `--write` é só regeneração dos ficheiros listados. O modo sem argumento é apenas leitura e assertions, incluindo casos positivos e adulterados em memória.

```python
from pathlib import Path
import hashlib, json, re, sys

ROOT = Path('.')
MIG = ROOT / 'drizzle/migrations/0305_issue486_ads_invoice_generation.sql'
COPY = ROOT / 'supabase/manual/0305_issue486_ads_invoice_generation.sql'
POST = ROOT / 'docs/testes/issue486/pos-verificacoes.sql'
ROLL = ROOT / 'supabase/manual/rollback_0305_issue486_ads_invoice_generation.sql'
TSV = ROOT / 'docs/testes/issue486/function-identities.tsv'
PAT = re.compile(r'CREATE(?: OR REPLACE)? FUNCTION public\.(\w+)\((.*?)\)\s*(RETURNS.*?)\bAS\s*(\$\w*\$)(.*?)\4\s*;', re.S | re.I)

def literal(s):
    return "'" + s.replace("'", "''") + "'"

def array(xs):
    return 'ARRAY[' + ','.join(map(literal, xs)) + ']::text[]' if xs is not None else 'NULL::text[]'

def flatten(name, raw):
    # Liste lexer: commas inside single/double quotes are not separators.
    parts = re.findall(r"'(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"|[A-Za-z0-9_$]+|,", raw)
    assert re.sub(r'\s+', '', ''.join(parts)) == re.sub(r'\s+', '', raw), ('unsupported_SET', raw)
    assert len(parts) % 2 == 1 and all(x == ',' for x in parts[1::2]), raw
    values = []
    for token in parts[::2]:
        if token.startswith("'"):
            value = token[1:-1].replace("''", "'")
        elif token.startswith('"'):
            value = token[1:-1].replace('""', '"')
        else:
            value = token.lower()
        if name == 'search_path' and not re.fullmatch(r'[a-z_][a-z0-9_$]*', value):
            value = '"' + value.replace('"', '""') + '"'
        values.append(value)
    return name + '=' + ', '.join(values)

def derive(sql):
    functions = list(PAT.finditer(sql))
    assert len(functions) == len(re.findall(r'^CREATE(?: OR REPLACE)? FUNCTION ', sql, re.M)) == 35
    rows, inventory = [], []
    for m in functions:
        name, args, header, _, body = m.groups()
        args = ' '.join(args.split())
        declarations = [a.strip() for a in args.split(',')] if args else []
        names, types, defaults = [], [], []
        for arg in declarations:
            argname, tail = arg.split(None, 1)
            typename = re.split(r'\s+DEFAULT\s+', tail, flags=re.I)[0]
            names.append(argname); types.append(typename)
            if re.search(r'\bDEFAULT\b', tail, re.I):
                value = re.split(r'\s+DEFAULT\s+', tail, flags=re.I)[1]
                defaults.append(value if '::' in value else value + '::' + typename)
        signature = 'public.' + name + '(' + ','.join(types) + ')'
        body_md5 = hashlib.md5(body.encode()).hexdigest()
        language = re.search(r'\bLANGUAGE\s+(\w+)', header, re.I)[1].lower()
        secdef = bool(re.search(r'\bSECURITY DEFINER\b', header, re.I))
        volatility = 'i' if re.search(r'\bIMMUTABLE\b', header, re.I) else 's' if re.search(r'\bSTABLE\b', header, re.I) else 'v'
        strict = bool(re.search(r'\bSTRICT\b', header, re.I))
        config = [flatten(k.lower(), v.strip()) for k, v in re.findall(
            r'\bSET\s+(\w+)\s*(?:=|\bTO\b)\s*(.*?)(?=\s+SET\b|$)', header, re.S | re.I)]
        assert config and config[0].startswith('search_path=')
        assert re.search(r'REVOKE ALL ON FUNCTION ' + re.escape(signature) + r' FROM PUBLIC, anon, authenticated, service_role;', sql)
        grant = re.search(r'GRANT EXECUTE ON FUNCTION ' + re.escape(signature) + r' TO ([^;]+);', sql)
        roles = set(grant[1].split(', ')) if grant else set()
        assert roles <= {'authenticated', 'service_role'}
        auth, service = 'authenticated' in roles, 'service_role' in roles
        table_result = re.match(r'RETURNS\s+TABLE\((.*?)\)', header, re.S | re.I)
        all_types = modes = None
        retset = table_result is not None
        if retset:
            outputs = [x.strip().split() for x in table_result[1].split(',')]
            all_types = types + [t for _, t in outputs]
            modes = ['i'] * len(types) + ['t'] * len(outputs)
            names += [n for n, _ in outputs]
            rettype = 'record'
        else:
            rettype = re.match(r'RETURNS\s+(\S+)', header, re.I)[1].lower()
        fields = [literal(signature), literal(body_md5), str(secdef).lower(), literal(language), literal(volatility),
                  array(config), str(auth).lower(), str(service).lower(), literal(rettype), str(retset).lower(),
                  str(strict).lower(), str(len(defaults)), literal(', '.join(defaults)) if defaults else 'NULL::text',
                  array(names if names else None), array(all_types), array(modes)]
        rows.append('  (' + ','.join(fields) + ')')
        inventory.append([signature, body_md5, 'postgres', str(secdef).lower(), language, volatility,
                          json.dumps(config, ensure_ascii=False), str(auth).lower(), str(service).lower(),
                          rettype, str(retset).lower(), str(strict).lower(), args,
                          json.dumps(defaults), json.dumps(names), json.dumps(all_types), json.dumps(modes)])
    return ',\n'.join(rows), inventory

EXTRA = """ AND format_type(p.prorettype,NULL)=r.return_type AND p.proretset=r.retset
    AND p.proisstrict=r.strict AND p.pronargdefaults=r.default_count
    AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM r.default_expression
    AND p.proargnames IS NOT DISTINCT FROM r.argument_names
    AND (SELECT array_agg(format_type(t,NULL) ORDER BY ord) FROM unnest(p.proallargtypes) WITH ORDINALITY q(t,ord)) IS NOT DISTINCT FROM r.all_argument_types
    AND p.proargmodes::text[] IS NOT DISTINCT FROM r.argument_modes
    AND p.prokind='f' AND p.proparallel='u' AND NOT p.proleakproof"""
COLS = 'signature,body_md5,secdef,language,volatility,config,authenticated_exec,service_exec,return_type,retset,strict,default_count,default_expression,argument_names,all_argument_types,argument_modes'

def identity_block(text, rows):
    start = text.index('DO $identities$')
    end = text.index('END $identities$;', start) + len('END $identities$;')
    block = text[start:end]
    block = re.sub(r'(FOR r IN SELECT \* FROM \(VALUES\n).*?(\n \) expected\().*?(\) LOOP)',
                   lambda m: m[1] + rows + m[2] + COLS + m[3], block, flags=re.S)
    if EXTRA not in block:
        block = block.replace("AND pg_get_userbyid(p.proowner)='postgres')", "AND pg_get_userbyid(p.proowner)='postgres'" + EXTRA + ')')
    return text[:start] + block + text[end:]

def main(write=False):
    sql = MIG.read_text()
    rows, inventory = derive(sql)
    sql = identity_block(sql, rows)
    post = identity_block(POST.read_text(), rows)
    rollback_source = '\n'.join(line[3:] if line.startswith('-- ') else '' for line in ROLL.read_text().splitlines()) + '\n'
    rollback_source = identity_block(rollback_source, rows)
    rollback = '\n'.join('-- ' + line if line else '--' for line in rollback_source.splitlines()) + '\n'
    tsv = '\t'.join(['signature','body_md5','owner','security_definer','language','volatility','proconfig_json',
                     'authenticated_execute','service_role_execute','return_type','returns_set','strict',
                     'arguments_and_defaults','defaults_json','argument_names_json','all_argument_types_json','argument_modes_json']) + '\n'
    tsv += ''.join('\t'.join(row) + '\n' for row in inventory)
    if write:
        for path, value in [(MIG, sql), (COPY, sql), (POST, post), (ROLL, rollback), (TSV, tsv)]:
            path.write_text(value)
    for path, value in [(MIG, sql), (COPY, sql), (POST, post), (ROLL, rollback), (TSV, tsv)]:
        assert path.read_bytes() == value.encode(), ('stale_generated_file', str(path))
    assert all(not line.strip() or line.startswith('--') for line in ROLL.read_text().splitlines())
    drops = [line for line in rollback_source.splitlines() if re.match(r'DROP (FUNCTION|TABLE|SCHEMA|TRIGGER) ', line)]
    assert drops and all('RESTRICT;' in line for line in drops)
    assert 'rollback_has_v1_data_or_enabled' in rollback and 'rollback_catalog_changed' in rollback
    assert "VALUES(true,false)" in sql and 'UPDATE ads486_private.control' not in sql
    # Positive equivalence of =/TO and separately quoted values.
    assert flatten('search_path', "'public', 'pg_catalog'") == flatten('search_path', 'public, pg_catalog') == 'search_path=public, pg_catalog'
    assert flatten('search_path', "'public, pg_catalog'") != 'search_path=public, pg_catalog'
    assert flatten('search_path', "'public'', ''pg_catalog'") != 'search_path=public, pg_catalog'
    # Isolated tampering must change derived identity; no SQL is executed.
    for old, new in [("TO 'public', 'pg_catalog'", "TO 'public'', ''pg_catalog'"),
                     ("TO 'public', 'pg_catalog'", "TO 'pg_catalog', 'public'"),
                     ("RETURN snapshot ||", "RETURN snapshot /*changed*/ ||"),
                     ("p_required text[] DEFAULT '{}'", "p_required text[] DEFAULT '{x}'"),
                     ('RETURNS numeric\nLANGUAGE plpgsql IMMUTABLE', 'RETURNS text\nLANGUAGE plpgsql IMMUTABLE'),
                     ('LANGUAGE sql IMMUTABLE STRICT', 'LANGUAGE sql IMMUTABLE'),
                     ('TO authenticated;', 'TO authenticated, service_role;')]:
        assert old in sql, ('missing_mutation_control', old)
        assert derive(sql.replace(old, new, 1))[0] != rows, ('undetected_tampering', old)
    assert len(inventory) == 35 and len({row[0] for row in inventory}) == 35
    print('PASS: 35 bodies/signatures/configurations/defaults/ACL; copy/post/rollback/TSV; positive and tampered controls')
    print('SQL SHA256:', hashlib.sha256(MIG.read_bytes()).hexdigest())

if __name__ == '__main__':
    main('--write' in sys.argv)
```

## Resultado local efetivo

- Verificador Python acima: PASS35 funções e sete adulterações isoladas, incluindo a identidade do setter; migração/cópia/pós/rollback/TSV coerentes.
- Delimitadores dollar-quote, condicionais psql e includes locais: conferidos como texto; não constituem parsing/compilação PostgreSQL.
- `bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit`: exit0, sem diagnósticos.
- `bunx vitest run`: exit0;346 ficheiros aprovados,2 ignorados;3.612 testes aprovados,6 skips e11 TODO; duração211,02s. Nenhum teste, expectativa ou configuração TS foi alterado. Esta suíte não executa o candidato0305 nem os roteiros SQL novos.
- Migração e cópia SHA256 `2cf6d79d60d21b3d43f9f9986d8729716f83bb42dff233e54805847a82a2ac4d`.
- Duas alterações comportamentais adicionais à correção do manifesto: prévia recusa BP EUR com fx_rate diferente de1; conversão v0 aguarda também event_forecasts em SHARE para o unlink já dentro de UPDATE. Contrato, casos C3 e identidades/rollback acompanham ambas.
- Nenhum SQL novo executado, ligação a bases/serviços MP, deploy, ativação, commit/push/merge ou publicação efetuados.

## Inventário de artefactos finais

Hashes SHA256 dos25 ficheiros de preparação abaixo. Este documento e `.executor/resumo.md` são excluídos da tabela para evitar autorreferência; a migração e a cópia têm o mesmo hash. O TSV discrimina as35 funções, não certifica catálogo instalado.

| Caminho | Bytes | SHA256 |
|---|---:|---|
| `docs/testes/issue486/concorrencia-fatura-a.sql` | 882 | `b76727ed7eadc6b4e0befdffcb3c5340d97d5d8c414746ac3d3b3e103ee7ee2f` |
| `docs/testes/issue486/concorrencia-fatura-b.sql` | 1500 | `e804c96c7103e1106bcb23273a0c76070d2121d5e51e6f96fc49b1d082255365` |
| `docs/testes/issue486/concorrencia-financeira-a.sql` | 5581 | `d8f70bc5001d4a135ff2acd4f3b464f8415a6b2fd49280716466b8aac81da912` |
| `docs/testes/issue486/concorrencia-financeira-b.sql` | 13008 | `e1c8cf1bff58a0fd2af83b4e33ca0268bc593a0d6ab34b83ab83ce2ee95e5c47` |
| `docs/testes/issue486/concorrencia-legado-a.sql` | 4618 | `db1068ab4137bfa72475eb1c5dd220b8692632feeb01d5127f99695ad6b9d095` |
| `docs/testes/issue486/concorrencia-legado-b.sql` | 4250 | `724dad6f09e25a9bb9a1ef065ed2e882d1b260605a7787ed366664e92e481cda` |
| `docs/testes/issue486/concorrencia-setup.sql` | 8119 | `06c13b994e716abebb57bb0bb38de3f346a77a397a727acb06299345523f9673` |
| `docs/testes/issue486/concorrencia.md` | 8575 | `aed6a9bd4dbb9addac1924e066061a898844f972339a5ccc102d858c52036d78` |
| `docs/testes/issue486/contrato-d1.md` | 22080 | `128fbe1b70d6e351703ac72e8bce3ed9c38ef25b4c2eae98b2478c9b15cefc6f` |
| `docs/testes/issue486/fixture.sql` | 16583 | `02ceca6e962f5caa6083a1dc57db6fd29ef3a45e73d2e2a18de085f12339002b` |
| `docs/testes/issue486/function-identities.tsv` | 8769 | `6784072af30d0c81bd8b24bda2ee442b325db6294621b51574b406cd15abdf18` |
| `docs/testes/issue486/plano.md` | 12788 | `54e0b142bfd414712dc95d413f8fc888e770203bc65ba036c215c38c8b2ae50f` |
| `docs/testes/issue486/pos-verificacoes.sql` | 13718 | `70947f6e1bbcc1b999df5e7c3650611a3a29303e89d5b64c5dc0adfbe8790d77` |
| `docs/testes/issue486/pre-verificacoes.sql` | 12897 | `16c76d2c4784985acc2b49a6d4fb56cca4e3de0f7d91a02c6a41890a213115ef` |
| `docs/testes/issue486/proposta-memoria.md` | 3520 | `f15b1f3047cfaa616215c83b5f2ed40f0d2995cbebe4664cdf1cc490dfd7d8f9` |
| `docs/testes/issue486/rollback-ensaio.md` | 7005 | `729dcc9580eb40f29b722564362df939de449d4ede8a49c8b2f251e825eaeb06` |
| `docs/testes/issue486/sintetico-destinos.sql` | 20234 | `f200a141d3b4dbebce34fb4eec4e74c7e4a27728df479d0a28fb15ee4fabf58e` |
| `docs/testes/issue486/sintetico-documentos.sql` | 16791 | `9ad4e5eb9a1e324c03fdda4c9765f1dd8e9af6eedb6ce8c3c2429e27734d401f` |
| `docs/testes/issue486/sintetico-financeiro.sql` | 22336 | `f420e1925b4bdee4a09abfd408449348486a33696f676a6aeba0ea865f94ec03` |
| `docs/testes/issue486/sintetico-parcela.sql` | 13309 | `8faa6ae8beaf6357c270729c3ac169485c08dbd5457c4f7782bf27edd031e175` |
| `docs/testes/issue486/sintetico-reversao.sql` | 8843 | `1fc2505cd14baf6253f7a64da7e1d53ea17c8dc8110d315f7e73eca63b75d872` |
| `docs/testes/issue486/sintetico-writers.sql` | 28565 | `a4924928ec7ce78cb6dffe9a34833c558f891894f39aaba5c24162341285a9c5` |
| `drizzle/migrations/0305_issue486_ads_invoice_generation.sql` | 160149 | `2cf6d79d60d21b3d43f9f9986d8729716f83bb42dff233e54805847a82a2ac4d` |
| `supabase/manual/0305_issue486_ads_invoice_generation.sql` | 160149 | `2cf6d79d60d21b3d43f9f9986d8729716f83bb42dff233e54805847a82a2ac4d` |
| `supabase/manual/rollback_0305_issue486_ads_invoice_generation.sql` | 18322 | `1dc8144ffbe866da60dd053315a08f3d77b4ac9d44cc5949c83faca4f2494345` |

## Prova que permanece pendente

A fonte pública versionada foi suficiente para esta preparação; não é um catálogo instalado. Compilação SQL, ensaio P1–P9, rollback, interações com todos os triggers transitivos, catálogo fiel e medição de contenção/limites reais exigem etapa própria. Os casos de pré-condições históricas de âncoras que os controlos atuais impedem não foram fabricados com stubs/disable. Ainda falta a reprodução fiel dessas pré-condições na etapa de ensaio. D3 deverá provar bytes/Storage/PDF/readback e drenagem real. CI do commit final, criação de PR e reconfirmação da fila/reserva/autorização ficam com runner/coordenador, mantendo merge automático desligado e enabled=false. Nenhum desses resultados é inferido dos testes TS ou deste inventário.

# #486 D23 — verificação de preparação

> D23: a proveniência D1 abaixo é conservada como registo da base recebida. Esta execução usa o checkout main b3ee491 e o contrato do despacho; não recuperou o anexo #506. A entrega efetiva e as lacunas estão em dossier.md.

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

## Resultado local efetivo D23

- Verificador Python acima: PASS das 35 funções, controlos positivos e sete adulterações; cópia/pós/rollback/TSV coerentes, sem executar SQL.
- Base: tsgo exit0; Vitest 3.666 PASS/6 skips/11 TODO existentes,348 ficheiros aprovados/2 ignorados.
- D23: 77 testes novos confirmados na suíte integral final, incluindo CAS stale e reversão observada antes do upload; nenhum skip/TODO novo.
- Fecho final: `bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit` exit 0; verificação suplementar dos dois entrypoints com tipos locais/declaração Deno em /tmp exit 0.
- Duas corridas integrais com paralelismo padrão tiveram apenas o timeout de 5 s no teste preexistente #359 “guarda aborta sem as colunas da A”; primeira 3.726 PASS/1 FAIL, segunda 3.740 PASS/1 FAIL; expectativas, limites e ficheiro #359 não foram alterados.
- Repetição integral final `bunx vitest run --maxWorkers=1`: exit 0, 355 ficheiros aprovados/2 ignorados; 3.743 testes passados/6 skips/11 TODO preexistentes; duração 361,83 s. Esse parâmetro só limita paralelismo, sem alterar expectativas/limites. A repetição serial anterior passou 3.741 testes antes dos dois casos finais.
- Migração/cópia finais SHA256 1a0620a35696feb399c48a277743fbb1cec4b20db83944b6c2f0089fc2241d82; hash de partida conferido 2cf6d79d60d21b3d43f9f9986d8729716f83bb42dff233e54805847a82a2ac4d.
- Alterações SQL D23: Master do plano para set_split importado; preflight interno antes de Storage; classificação TikTok após atestação dentro da guarda/contexto attest. Roteiros preparados, sem prova PostgreSQL.
- Nenhum SQL candidato executado, base/serviço MP/Live acedido, deploy/ativação/Publish/commit/push/merge efetuado.

## Inventário de artefactos finais

Os 48 artefactos autorizados existentes abaixo incluem fontes D1 conservadas e implementação D23. Este ficheiro e resumo são excluídos para evitar autorreferência; nenhuma identidade/hash constitui prova de execução PostgreSQL.

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
| `docs/testes/issue486/contrato-d1.md` | 23108 | `71a29b53a46225e6a35b48b7c71fb639d0c42924ca9ab3cf2350443b0f03a047` |
| `docs/testes/issue486/dossier.md` | 10930 | `b2acaa085e7808631374b95f6ec08d4517ebadbd1284650c7fc1ce8e4bd091c5` |
| `docs/testes/issue486/fixture.sql` | 16583 | `02ceca6e962f5caa6083a1dc57db6fd29ef3a45e73d2e2a18de085f12339002b` |
| `docs/testes/issue486/function-identities.tsv` | 8769 | `4e4f9fe6c47e3f9bb3c217eee89408907ebfb72dfda5620c8757e912d4cd97fc` |
| `docs/testes/issue486/plano.md` | 13302 | `8a53c1960217798dba71b8e8feac6e92b37e52db2acd5659c455c804910c6a39` |
| `docs/testes/issue486/pos-verificacoes.sql` | 13718 | `a9394887635ed2f95b53943ab8a9732353cbabbacd18c0592093980918d2968a` |
| `docs/testes/issue486/pre-verificacoes.sql` | 13712 | `d64b43a244bf2f2336da7f0e8fe39b206da7e8c11fccc791ea21cc0b0e3ba23e` |
| `docs/testes/issue486/proposta-memoria.md` | 4420 | `48f91b5c68b014572e300bf471c2231aaee3db6fe4b9f629f183afda4779910d` |
| `docs/testes/issue486/rollback-ensaio.md` | 7543 | `74d093c0dba36aa90640f46dfee66259b98ff73ef9512a3f362986a043bf55cd` |
| `docs/testes/issue486/sintetico-destinos.sql` | 21146 | `a018a478bd09ebf0caac0a19804c2597a314a1314668b5059ce51a505e7d5cd5` |
| `docs/testes/issue486/sintetico-documentos.sql` | 18029 | `f49e1cf206a8843f7aa5c7bf0e927e0a0b7168d1f43e00ae31381cffcd0fc922` |
| `docs/testes/issue486/sintetico-financeiro.sql` | 22336 | `f420e1925b4bdee4a09abfd408449348486a33696f676a6aeba0ea865f94ec03` |
| `docs/testes/issue486/sintetico-parcela.sql` | 15252 | `b1e69eeba72e2b485c8749117c381d3781c6b909d3c75885f2d0b88390c92e0e` |
| `docs/testes/issue486/sintetico-reversao.sql` | 8843 | `1fc2505cd14baf6253f7a64da7e1d53ea17c8dc8110d315f7e73eca63b75d872` |
| `docs/testes/issue486/sintetico-writers.sql` | 28565 | `a4924928ec7ce78cb6dffe9a34833c558f891894f39aaba5c24162341285a9c5` |
| `drizzle/migrations/0305_issue486_ads_invoice_generation.sql` | 161265 | `1a0620a35696feb399c48a277743fbb1cec4b20db83944b6c2f0089fc2241d82` |
| `src/components/ads/AdsInvoiceDestinationSelect.tsx` | 2351 | `207b706dd13c90faf119ab312bdd585cea1ad786fcf9205c22673f86576551f5` |
| `src/components/ads/AdsInvoiceGenerationDialog.tsx` | 18498 | `6cc390dbe4e2b51e30999fc1ed8096d43d1485a0a6c1e9c7bece736506546cb1` |
| `src/components/ads/AdsInvoiceImportDialog.tsx` | 12162 | `9dc1309885e11e3ff68c4d6ddf6187d4eaf235dcb9b8726197429334e4f7807b` |
| `src/components/ads/AdsTourSplitDialog.tsx` | 6720 | `b3c3b9063f8ceee25824c1c7d41cf42979ca9f0ee9e9417e730a085122f39d22` |
| `src/integrations/supabase/types.ts` | 856870 | `80267c1bd882cd48be318d3ba630cd5d04f85792c759ac4f62382953b348884d` |
| `src/lib/__tests__/ads-invoice-generation.test.ts` | 4624 | `121c2c15a8f766a5dd3dd6547b9c5cb09c2aebfe7eb32f39c45fc9485b93d64f` |
| `src/lib/__tests__/ads-invoice-suggestions.test.ts` | 1264 | `50ce279a0f8ba6003fbb4ee0e40764e7c1089b2f121ee21e04eeb2338e1ac018` |
| `src/lib/__tests__/ads-tour-split.test.ts` | 2156 | `206d1d8f13a66ee21503dd2202512e8e519a34d9f68206b448c328f049914ce8` |
| `src/lib/ads-invoice-generation.ts` | 1889 | `84f0ec6e536bd6ab0e2481d7b4db3c73536d26f6107af4b20f547b61c07b097c` |
| `src/lib/ads-invoice-messages.ts` | 4879 | `f4878b65260ed96a7cd5f194ba993d9c7d1691316f9f41decc74b4684cdf9a71` |
| `src/lib/ads-invoice-suggestions.ts` | 920 | `162bf402476cef665fcd90495f6b1f8cf0e2efeb277fb18a74f506dfaa189685` |
| `src/pages/AdsInvoices.tsx` | 10264 | `25efe25aad00fc8e20c27b7ba7245311d53d69a07324c670e6bfc16d42930a1e` |
| `src/test/ads-invoice-documents.test.ts` | 8687 | `a3a93849946cb05bdfdc70d65d2c7c5dba28a508ca0dd4e5cec808f07aa2a2ad` |
| `src/test/ads-invoice-generation-dialog.test.tsx` | 15958 | `953996adb2ff1c0448146df4a70a4384766940c9f431a187f4fcddf9560586a6` |
| `src/test/ads-invoice-handlers.test.ts` | 17185 | `fd2ae3cab92a947f617d987c2b0068fa42a1f0173c74de65f2026d7a220cd876` |
| `src/test/ads-invoice-import-retoma.test.tsx` | 4175 | `40b952d8c627e38927b11af243b3b9d5f54534377fccfe4e24fffa050975b7d7` |
| `src/test/ads-invoice-source.test.ts` | 5880 | `7680b1410b0dafcaf2bf73ed7c6d01023e05f92382f8f460d5b3d6e594d8ec0d` |
| `supabase/functions/_shared/ads-invoice-documents.ts` | 6147 | `9fde6c6d2913fdf30e8365a469843bc2fecc329f537760cab2a4326274bc2fb6` |
| `supabase/functions/_shared/ads-invoice-generation.ts` | 15517 | `35098582e81a36693f681e7f59b7ca4fcaf8e19dbcf14c1778088492f0bd80d7` |
| `supabase/functions/_shared/ads-invoice-source.ts` | 9313 | `181aa8a7f60b5de8056af63f85e7d1009ee2f5c0c7efff328362bbbf29172aea` |
| `supabase/functions/ads-invoice-apply/index.ts` | 4556 | `2887924667645c65e021e394176dc7e7d5f5f64b77e591dbdf888e75618d723f` |
| `supabase/functions/ads-invoice-ingest/index.ts` | 7141 | `a3ad1c8182ca507a415384be916e47d84813e7a2880b0fc7a2034f752cf23397` |
| `supabase/manual/0305_issue486_ads_invoice_generation.sql` | 161265 | `1a0620a35696feb399c48a277743fbb1cec4b20db83944b6c2f0089fc2241d82` |
| `supabase/manual/rollback_0305_issue486_ads_invoice_generation.sql` | 18322 | `e6c4e629c101c24d203b13c0a233231f43809271fd6ab1c25cd2deaad8a7b2d0` |

## Prova que permanece pendente

A revisão do código, os testes TypeScript e os entrypoints com transportes sintéticos não compilam nem validam o catálogo PostgreSQL. P1–P9/rollback/catálogo/2s/15s/contenção global exigem a etapa própria autorizada. Os layouts reais de identidade e o primeiro PDF TikTok continuam sem certificação. O consumidor serial com claim durável e a limpeza via storage-trash ainda não estão ligados; testes de um port de claim sintético não provam exclusão entre instâncias. Drenagem de writers/HTTP/Storage antigos, quality remoto, instalação e ativação permanecem gates; enabled=false e merge automático não foi ativado pelo executor. Ver dossier.md e .executor/resumo.md.

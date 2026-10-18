# Prova67 — validação oficial SELECT: BLOQUEADA na captura integral

HEAD recebido e observado df3535b9f8142adf6dfa1de8d07f13cafe94ad84. Autorização18/10/2026: somente leitura oficial/transporte, sem identidade/login/piloto/writes. Memória lida: .lovable/memory/features/document-entry-assistant.md. INDEX/QUADRO/estado/prova66 lidos. #323/DECISIONS preservados; contas59/63 não usadas. Fases1–7feitas,8PARCIAL,9–18pendentes.

## Mecanismo efetivamente observado
Ferramenta oficial disponível: `supabase.read_query`, schema `query:string`, somente SELECT. Resultado da consulta constante chegou como texto de representação `map[…]`, não JSON cru. Não veio caminho de ficheiro, referência tool-results://, envelope JSON original, stdout local, nem mecanismo de exportação automática. Não presumimos que uma URI inexistente seja acessível via shell.

O conhecimento oficial consultado confirma: read_query é o transporte designado quando disponível; não há mecanismo documentado read_query→ficheiro privado neste ambiente. Não executar CLI/psql ou usar credenciais alternativas para contornar esse limite. O help do CLI não prova captura autorizada de resultados reais neste contexto.

## Comandos/invocações sanitizados
```text
git rev-parse HEAD
df3535b9f8142adf6dfa1de8d07f13cafe94ad84

lovable supabase query --help
Help local apenas; nenhuma consulta CLI executada.

supabase.read_query(query abaixo)
SELECT 67::integer AS integer_value, 1.25::numeric AS numeric_value,
 true AS boolean_value, NULL::text AS null_value,
 'ação — 東京'::text AS unicode_value,
 jsonb_build_object('nested',jsonb_build_object('nullable',NULL,
 'items',jsonb_build_array(1,'ação',true))) AS nested_value,
 ARRAY[1,2,3]::integer[] AS array_value;

Resultado textual tal como devolvido pela ferramenta:
[map[array_value:[1 2 3] boolean_value:true integer_value:67 nested_value:map[nested:map[items:[1 ação true] nullable:<nil>]] null_value:<nil> numeric_value:1.25 unicode_value:ação — 東京]]
```

Essa representação demonstra leitura bem-sucedida e valores visíveis coerentes, mas NÃO estabelece tipos JSON originais nem envelope/bytes integrais. `map`, array sem vírgulas e `<nil>` não são JSON válido. Não foi convertido para JSON nem copiado como baseline. Resultado inclui aviso do limite1000linhas do read_query; não certifica resultados grandes nem ausência de truncamento.

Ficheiro privado `/tmp/issue333-67/mechanism.json` criado0600 dentro de diretório0700: SOMENTE metadados sobre mecanismo/bloqueio, sem resultado de dados/config/ACL. Não alegar que esse ficheiro é captura oficial. O conteúdo da resposta acima é apenas a constante técnica sem dados pessoais, apresentada na prova; não é transporte substituto.

## Paragem exigida
Sem captura JSON automática comprovada, parámos antes de metadados/agregados/preflight/baseline. Não houve consulta a identidades, permissões, tabelas financeiras ou dados pessoais. Nenhuma captura grande, teste do envelope real ou baseline oficial certificado. Nenhuma conta/login/sessão/fatura/allowlist/DML/DDL/deploy/Publish; nenhuma escrita Cloud.

Adaptador/driver/testes inalterados nesta tarefa: não adaptar para parsing da representação map, não transcrever manualmente respostas nem reconstruir ACL. A prova66 continua válida somente localmente; seu default CLI não está validado/autorizado como transporte Cloud substituto nesta tarefa. Nenhum teste local ou typecheck pode resolver a ausência do mecanismo upstream; não declaramos certificação por suite geral.

## Verificações e estado
Diff documental somente, `git diff --check` e build automático por verificar no fecho. Sem nova execução de testes porque nenhum driver/código alterado. CI/GitHub final não confirmados; HEAD inicial confirmado pelo controller e local, não inferir sincronização final.

Bloqueio exato: é necessário suporte oficial que disponibilize o JSON cru completo do read_query como ficheiro legível/privado ou canal invocável com captura integral, mantendo consultas estritamente read-only e sem nova credencial. Até existir, transporte/prova67 BLOQUEADOS. Não pedir conta/piloto como solução. Não há cleanup Cloud pendente.
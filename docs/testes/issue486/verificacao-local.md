# Evidência local D1-I — preparação, sem SQL novo executado

HEAD observado: `b8d76d17ae1cafcff40820cc8b79eeced862de87`; checkout inicialmente limpo, 0305 livre. Leitura: INDEX/QUADRO/estados pertinentes/PROC/memórias ads-invoices, bp-planilha e bp-excesso-de-verba, AGENTS raiz/supabase e fontes públicas locais/transcritas. Não foi consultado catálogo privado nem usado replay/binding #352. O coordenador reconfirma integração da #496 no HEAD aprovado, jobs/quality, autorização e fila; não se infere isso do checkout raso.

O arquivo offline foi validado antes da recuperação: SHA256 `dddf58460e4f51dce19d328ac03c39d645dffa671695c0dc1eda4fece36f6e80`, commit `0f12a5257b2dfe6b42759c486c012b1555042872`, exatamente 17 caminhos, todos os hashes de blobs conferidos. Só esses caminhos foram recuperados; #492 não foi integrada. O blob original das duas cópias SQL era `9e1bbfe455094290a5651cea7b0ff2bbcc0517007fff10b279a51b371fcc7c29`. Os bytes foram lidos e completados dentro da lista D1-I.

## Checks executados

- `bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit`: exit 0; log sem diagnósticos.
- `bunx vitest run`: exit 0; 342 ficheiros passaram, 2 skipped; 3448 testes passaram, 6 skipped e 11 todo preexistentes; duração 203,20s.
- Nenhuma expectativa/skip foi alterada; nenhum roteiro novo #486 entrou na suíte nem foi executado. Testes SQL/PGlite preexistentes correram apenas pela suíte normal.
- Comparação binária da migração/cópia passou; 33 corpos/assinaturas/configurações/ACL foram derivados textualmente para function-identities.tsv e asserts de instalação/pós-verificação/rollback.
- Scanner lexical conferiu parênteses e delimitadores dollar-quoted, sem parser/compilação/execução SQL. Este check não valida semântica PostgreSQL.
- A conferência final encontrou 27 caminhos alterados autorizados e zero caminhos fora da lista; git diff --check e a conferência de whitespace dos ficheiros novos passaram.
- O rollback contém apenas comentários, sem CASCADE; dados v1, controlo aberto, catálogo divergente e dependências impedem remoção. Ensaio não realizado.

Logs locais de ferramentas: `/tmp/issue486-tsgo.log` e `/tmp/issue486-vitest.log`. Não são prova de entrega operacional, Storage, CI remoto ou catálogo final. As migrações novas não foram executadas por nenhuma ferramenta.

## Cobertura preparada e lacunas por aceitação

| Critério | Presente no candidato/roteiros | Lacuna explícita |
|---|---|---|
| 1 · L1–L4 | Generate/confirm/hash/retry, efeitos BP/selos/auditoria, grupo/vínculos/operação/tarefas; revert/guardas/controlo fechado | Código não compilado/executado em catálogo PostgreSQL; união transitiva de triggers e efetividade dos deadlines/pagamentos canónicos exigem conferência fiel. |
| 2 · P1 | Destinos, fee positivo/negativo anónimo, integral explícito, outside, importação/CAS | Faltam casos executáveis completos de Master com duas cidades/adoções/finalidades, base zero, carreira TikTok e ajuste negativo explícito isolado. |
| 2 · P2/P3/P4 | 100/70/20+20, criação draft→approved/baseline/snapshot, auditoria única, deny inclusive platform_admin, USD, tenant | Faltam deny manage_bp/create sem papel de aprovação, BP/compromisso não EUR/metadados incoerentes e composições mãe/filhas completas/parciais em todos os casos. |
| 2 · P5/P6 | Mesmo pedido retorna IDs, aceites diferentes conflitam, outra chave/ciclo, reverted terminal; falhas após raise/audit/parent/child/link/operação/applied/create/approve com digests | Falta matriz completa de duplicados legados com separadores/fornecedor nulo e Fatura Avulsa, chave usada em outra fatura, hash por cada identidade/fonte/BP e falhas em todos os automatismos transitivos. |
| 2 · P7 | Operação real produz tarefas; erro, path/tenant/digest errados, retry e conclusão integral | Bytes/Storage/readback/PDF são D3; falta concorrência callback×revert em duas sessões e casos de ligação preexistente divergente em toda a matriz. |
| 2 · P8 | Reimport no-op/alterado, writers tardios, reversão paga/paid_amount/lista/reembolso/conferência/exportação e idempotência | Faltam fixtures isoladas de transaction_payments/settlement_id/card_session_id/fecho selado, fonte atestada por RPC em todos os estados, ambiguidades/repetidos/outside e reopen na matriz completa. |
| 2 · P9 | Pares independentes CAS, BP partilhado com preview_stale e legado após leitura | Faltam variantes de writer já dentro do UPDATE/DELETE, mãe v0 já escrita, criação concorrente, mesma rubrica/BPs distintos, contenção entre empresas, commit/rollback do vencedor em todas as variantes e não interferência. Nenhuma sessão PostgreSQL foi aberta. |
| 3 · L6 | Cópias idênticas, 33 identidades, três pré-imagens/ACL, manifesto, pre/post e rollback RESTRICT comentado | Catálogo/dependências dinâmicas, instalação sem backfill e rollback integral não ensaiados. |
| 4 · contrato | Requests/responses/erros, fonte, classificação atual, revisão/confirm e enabled=false | Consumidor/ack das tarefas generation_maintenance ainda precisa de contrato operacional D3 e prova de compatibilidade/drenagem; nomes exatos de fornecedor e âmbito da prova de conta TikTok precisam revisão. |
| 5 · aplicação | tsgo/Vitest integrais verdes | Não comprovam SQL novo nem CI remoto. |
| 6 · entrega | Diff local restrito aos caminhos autorizados; resumo por critério | PR/CI/merge automático desligado são responsabilidade do runner/coordenador; executor não fez commit/push/merge. |

Estas lacunas impedem declarar D1/#486 concluídas ou promover o candidato. Nenhuma dificuldade/tempo foi usada como motivo de bloqueio; entregam-se os artefactos preparados e os limites verificáveis. Os cenários pendentes não são skips nem sucessos presumidos.

## Hashes finais

Preenchidos após a conferência final dos bytes; qualquer alteração SQL exige regenerar cópia, identidades, pre/post e rollback conjuntamente.

- `drizzle/migrations/0305_issue486_ads_invoice_generation.sql`: `2dabd3f99378a24cf64c78c00ff347d67174d57bc75ac099ecfb0988703c9c96`.

- `supabase/manual/0305_issue486_ads_invoice_generation.sql`: `2dabd3f99378a24cf64c78c00ff347d67174d57bc75ac099ecfb0988703c9c96`.

- `supabase/manual/rollback_0305_issue486_ads_invoice_generation.sql`: `b71dda82f38545a9a3b1d6dc2d7e4299d3ed73a1795e7bca353ce8c95b01caf3`.

- `docs/testes/issue486/function-identities.tsv`: `e6f36a82edad67728d81f78237028a6bef5bc2c2dedb220f2ab537c92b7043d2`.

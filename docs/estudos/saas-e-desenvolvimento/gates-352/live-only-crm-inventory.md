# #352 — inventário CRM e limite temporal em falta

Executor Codex; parecer Claude [6405248457](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6405248457), autorização Pedro nesta sessão. Reserva #352 confirmada no QUADRO por leitura; não alterada. Esta etapa parou antes de implementar live_only_ddl_reconstructed ou executar G1.

## Inventário

Foram inventariadas 67 relações em crm e pesquisados os 1454 ficheiros do plano privado 03d9e4188b833e0e27c9c3d85f7d08dabd5eb22a, com hashes conferidos e zero ficheiros em falta. A pesquisa incluiu ledger, órfãos, seeds, repo-for-placeholder e Drizzle. CREATE encontrado para 60; sete sem CREATE; destas, três referidas pelo plano e quatro sem referência identificada.

[Inventário com nomes, OIDs, referências e limites](live-only-crm-inventory.json). SHA256: bb4877e3d36f7b53b19b73a3ef3c13ad6f5f30a2e57029ce3b8850711344a8cd. Sem linhas de dados ou SQL integral. A varredura ficou limitada a crm; os outros schemas eram opcionais no despacho.

| Relação candidata | OID | Limite medido / primeira referência |
|---|---:|---|
| crm.google_user_list | 143856 | min(created_at) 2026-06-14 16:57:23.681547 UTC; referência 20260615195703 |
| crm.ads_insights_breakdown_daily | 240229 | min(created_at) 2026-09-19 20:09:32.943101 UTC; referência 20260921180146 |
| crm.google_ad | 241420 | sem coluna created_at, com 73 linhas; referência 20260921180146 |

As quatro sem referência no plano são meta_strategy_creatives, meta_campaign_strategy_deployments, google_user_list_job e ads_publish_plan. Permanecem apenas inventariadas. A candidata sugerida google_user_list_job existe em Live, mas não foi encontrada referência nas fontes do plano efectivamente usado; não foi reconstruída por suposição.

## Catálogo recolhido

Só SELECT: colunas, tipos, defaults, nulabilidade, identidade/geração, constraints, índices, RLS, policies, triggers, grants, owner, comentários, opções e herança das três candidatas. Não foram exportadas linhas das tabelas. Os digests de cada catálogo serializado constam do inventário; horas UTC de recolha também.

O catálogo confirma que google_ad não tem created_at; a contagem confirma que não está vazia. A coluna last_synced_at não foi tratada como data de criação. OID foi usado como identidade/ordem relativa, não como timestamp.

## Ponto devolvido ao revisor

A regra temporal autoriza min(created_at) e, sem linhas, a primeira referência. Não especifica o caso de uma tabela com linhas e sem created_at. Escolher uma data para google_ad com base apenas na primeira referência estenderia essa regra. Por isso não se atribuiu effective_at, não se publicou DDL reconstruído, não se alterou o plano/runner e não se executou parcialmente o lote.

Para parecer: autorizar expressamente a primeira referência como limite superior também quando não existe created_at, deixando claro que o instante escolhido é apenas uma posição de reprodução anterior à referência, não uma data histórica de criação medida; ou fornecer outra prova temporal. Nenhuma dessas alternativas foi aplicada.

## Estado e fecho

Nenhum G1 novo. O último run permanece 40246829514: 735 concluídas de 1454, checkpoint 114/114 aprovado, G1 vermelho por 42P01 em 20260615195703. G2 não executado. Sem escrita Live, DSN, infraestrutura paga, deploy ou Publish.

Fecho desta verificação limitado aos dois ficheiros novos e comentário na #352; #329 reconfirmada antes do push. QUADRO/estado permanecem com Claude Code; reserva mantida, conforme despacho. #352 aberta, lote bloqueado pelo ponto temporal acima.

# #352 — partner_aporte_mirror reconstruída; parecer 6413327729

Data: 26/10/2026. [Parecer](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6413327729). Live somente SELECT; nenhuma linha copiada. G2 não executado.

## Alteração e proveniência

[Commit privado 2a6d24d2](https://github.com/pedrompropicio/mundopropicio-replay/commit/2a6d24d2501c7cd2a42679daa34009af662e4190). [Run G1 40305931951](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40305931951).

Não foi encontrado CREATE da relação no ledger nem nos órfãos. A varredura da fonte Supabase do repositório encontrou somente as referências de 20260916024749 (comentário) e 20260917115514 (UPDATE). Reconstrução pela regra já aprovada live_only_ddl_reconstructed, sem nova regra de salto.

O catálogo Live confirmou oid 208099, sete colunas, sete constraints (quatro FKs, duas UNIQUE, uma PK), três índices pertencentes às constraints, RLS activo sem FORCE, duas políticas, zero triggers e 36 itens de privilégio distribuídos por seis papéis. Definições exactas por pg_get_constraintdef, pg_policy, pg_attribute e ACL expandida; SQL e catálogo detalhado somente no privado.

Prova temporal: min(created_at) = 2026-09-07T16:03:02.425741Z; última versão do ledger anterior = 20260907133345; CREATE no ledger = 0. effective_at = **2026-09-07T16:03:01Z**, depois de 13:33:45 e antes do mínimo menos um segundo. Ordem validada: 20260907133345 → reconstructed_208099 → 20260908155214.

FKs para public.companies, public.financial_accounts e public.transactions. As criações encontram-se, respectivamente, no órfão 20260429021930 L3, ledger 20260318031652 L3 e ledger 20260317112301 L56. O runner verifica a existência efectiva das três imediatamente antes da criação; ausência interrompe o run.

Após criação, o checkpoint compara o catálogo completo: colunas e definições; constraints/índices; RLS/políticas/triggers; proprietário/grants. Não há normalização que esconda divergências nestas definições. Originais ledger/orphan/overlay/seed preservados byte a byte. Plano com 1.465 entradas.

## Validação anterior ao run

Manifesto, hashes e ordem PASS; timestamp inválido rejeitado; cinco testes de detecção de diferença de catálogo PASS (colunas, constraints, RLS, políticas, grants). Compilação Python PASS. check-pii às 10:13:42.340758 UTC: 1.246 ficheiros, zero ocorrências; 899 literais JSON, zero inválidos. Gate de PII do workflow PASS.

## Resultado G1

**G1 vermelho**, UTC 10:15:33–10:21:13. 988 entradas concluídas / 1.465; 989 tentadas, uma falhada, 476 não tentadas.

As três dependências FK existem no ponto da criação (artefacto partner-aporte-dependencies.json). O checkpoint **114/114 PASS**, sem diferenças. O checkpoint **47/47 não foi alcançado**, pois a paragem ocorre em 07/09, antes desse checkpoint de 13/09. As 66 verificações nativas do job passaram.

Primeira falha não coberta: reconstructed/208099_public.partner_aporte_mirror.sql, **linha 107**, GRANT INSERT, SQLSTATE **42704**: papel `sandbox_exec_sfohvvlqccmmebvjgibx` inexistente no replay. Este papel consta da ACL lida em Live. A transação da reconstrução foi revertida integralmente; o checkpoint de comparação do catálogo da tabela não foi alcançado. Não se afirma igualdade final de nenhum dos seus quatro grupos de estado.

Paragem para parecer: não criar o papel por inferência, não omitir grants, não alargar regras de salto. G2 não executado. O bloqueio anterior em 20260917115514 ainda não foi retestado, porque a nova reconstrução fica antes dele.

Saltos: destrutivos 155; idempotentes 2.129 (base 1.161; policy_equal 610; using_index 175; trigger_equal 169; insert_duplicate_equal 1; txn_control 10; insert_duplicate_superseded_by_ledger 3); revistos 1 (orphan_dml_without_effect). Crons 12→0, agendador desligado; compensação ACL final não alcançada.

Artefacto 12642866956; SHA-256 do ZIP conferido: cf0fbfe28bcca43b7ced284b9904e22eab5e658e37cf539d5a8c1421c9038481.

## Provas e digests

No privado: reconstructed/208099_public.partner_aporte_mirror.sql, catálogo homónimo, partner-aporte-catalog-query.sql, partner-aporte-proof.json e manifest.json. O manifesto guarda a query, hora UTC da recolha, limites, dependências e referência ao parecer.

- Catálogo canónico SHA-256: eded4af53ee136b8b8bac3bfa8cd3ebc10aba63356a0fc1cf3eb5e5410a3c503.
- DDL SHA-256: 16ac4256be199962b5afeba9177d6a0b670896d28c3dd2619ba161b92495cc8a.
- Prova SHA-256: fdaee5f779b376a11d7b8889160c89422c97b9fcce109cce5d2daa92ca488c8b.
- Plano SHA-256: f8e64a8f17cd40b17e15e6f80b012495611ad9a7276de177e17f0b83390f9c66.

#329 antes do push privado às 2026-10-26T10:14:56.637Z: GitHub público = Lovable = af4ef33212bce4479bafaa1dbb388c39f1455354, agentFinished=true; privado anterior 2ea7f0be, push CAS sem força. Verificação documental registada no comentário da Issue.

Reserva #352 mantém-se até fecho do gate; QUADRO e estado pertencem ao Claude Code. Issue aberta. Sem escrita em Live, infraestrutura paga, deploy ou Publish.

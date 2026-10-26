# #352 — delta de audiência e continuação do G1

Data: 26/10/2026. Parecer [6416673309](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6416673309). Live apenas SELECT; G2 não executado.

## Delta autorizado

Em public.artist_audience_demographics, a cópia do replay recebeu song_id uuid nullable/sem default, a FK exacta para artist_songs(id) com ON DELETE CASCADE, o índice parcial idx_aad_song e a substituição da constraint uq_artist_audience_demographics. A definição nova é a de Live, com sete colunas e NULLS NOT DISTINCT.

Catálogo recolhido por SELECT em 26/10/2026 às 13:38:31 UTC: attnum14, relação oid216423. Nenhuma coluna removida ou tipo alterado. O runner recusa estas duas classes de delta.

Posição: **2026-10-05T17:29:52.412Z**, um milissegundo antes da Drizzle 0012, após a 0011. Manifesto reconstructed/table-delta-manifest.json com limites, hashes, fontes e query/UTC.

Precisão de proveniência: supabase/manual/20261005_derp172_song_geo_chat2.sql contém ADD COLUMN/FK/índice e uma nota sobre a nova unicidade. Não contém o DDL executável de substituição da constraint; nenhuma migração ledger/orphan/Drizzle produz o estado completo. Esta presença parcial no manual está explicitamente registada, em vez de afirmar ausência absoluta no repositório. O script manual não foi executado.

Antes de aplicar, checkpoint local exige: constraint antiga exacta de seis colunas, song_id ausente e tabela vazia. Depois compara a coluna, default/nulidade, FK, constraints e índices com o catálogo. **Ambos os checkpoints passaram nos dois runs.**

## Dependências reconstruídas pela regra existente

### public.br_estados

OID240113, sem CREATE no ledger ou nas migrações do plano; primeira referência na 0012. Reconstrução exacta de três colunas, PK, índice, grants, RLS/política; nenhuma linha copiada.

effective_at **2026-09-19T11:54:04Z**: um segundo após a âncora inferior oid239024, crm.artist_ads_budget_caps_history, criada pelo ledger20260919115403; antes do vizinho reconstruído oid240229. Query, OIDs, ausência e digest no manifesto de reconstruções.

**Checkpoint estrutural/ACL PASS**, zero diferenças. A 0012 passou.

### public.song_link_diag

O primeiro run parou na Drizzle 0053 por tabela ausente. Foi analisada e resolvida autonomamente pela mesma regra: relação oid353799, sem CREATE no ledger/orphan/Drizzle. A primeira referência é a 0053; os restantes ficheiros apenas alteram o CHECK ou referem a tabela num invariante.

effective_at **2026-10-07T01:09:15Z**, depois da função vizinha inferior artist_growth_summary_rows, oid350151, criada pela Drizzle0023 em 06/10 às 19:11:17.337 UTC; antes do min(created_at) observado, 07/10 às 01:09:16.129269 UTC, e da primeira referência de 09/10.

Reconstruídos oito campos, seis constraints, índices, RLS/política e grants. id é GENERATED ALWAYS AS IDENTITY; a sequência oid353798 foi reproduzida com opções estruturais de pg_sequence e ACL sem os papéis de plataforma. **Nenhum contador actual ou linha foi copiado.** As Drizzle0053/0080/0194 continuam intactas e responsáveis pelas alterações do CHECK.

**Checkpoint da tabela e da estrutura/ACL da sequência PASS**, zero diferenças. As 0053 e 0080 passaram; 0194 ainda não alcançada.

## Publicações e validação

- [Commit 5b8b7e5f](https://github.com/pedrompropicio/mundopropicio-replay/commit/5b8b7e5f308da92aa95d03c208180dca96cf2a27): delta + br_estados.
- [Commit 682db6b5](https://github.com/pedrompropicio/mundopropicio-replay/commit/682db6b56f2a8d53ead70fe1d6d533391b8e6d37): song_link_diag.
- Dezasseis testes locais PASS (nove do delta/reconstrução, sete da identity/sequência).
- check-pii final: 2026-10-26T14:07:58.776761Z, **1.257 ficheiros, zero ocorrências, 913 literais JSON válidos**.

## Resultados G1 desde vazio

| Run | Entradas concluídas | Primeira falha | Resultado das alterações |
|---|---:|---|---|
| [40334846679](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40334846679) | 1.282/1.471 | 0053, 42P01 song_link_diag | Delta e br_estados PASS |
| [40336988104](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40336988104) | **1.311/1.472** | 0081, P0002 em prova operacional misturada com DDL | Delta, br_estados e song_link_diag PASS |

Run final: UTC 14:09:44–14:18:16 de 26/10. 1.312 entradas tentadas, uma falhada e 160 não tentadas. Concluídas todas as 711 entradas ledger, 499 órfãos e **81 entradas Drizzle**.

**47/47 e 114/114 PASS**, zero diferenças. Os checkpoints anteriores de TikTok e da função reconstruída também passaram. 70/70 verificações nativas anteriores PASS. Crons 16→0, agendador desligado.

Saltos no run final:
- destrutivos156; novo salto 0033_derp186b_drop_tmp_growth_check.sql L1, DROP FUNCTION de helper temporário inexistente, 42883, pela regra já aprovada;
- idempotentes2.137: base1.162, policy_equal611, using_index175, trigger_equal169, insert_duplicate_equal1, txn_control12, insert_duplicate_superseded_by_ledger3, grant_revoke_missing_object4;
- revistos9: data_volume_assertion7, orphan_dml_without_effect1, platform_role_grant_excluded1.

Compensação ACL final ainda não alcançada. **G1 permanece vermelho; G2 não executado.**

## Novo limite: Drizzle 0081 mistura prova operacional e DDL

Primeira falha final: **Drizzle id82, public-source/drizzle/migrations/0081_derp235_growth_period.sql, DO L2–93, SQLSTATE P0002**. A chamada de L5 a song_growth_summary para um identificador operacional concreto falha por música inexistente no replay.

O bloco não satisfaz o ponto1 de data_volume_assertion:
- L3–4 lê a definição antiga e cria uma cópia funcional _song_growth_summary_initial;
- L5 calcula o resultado antigo para a música concreta;
- L6 elimina a assinatura antiga song_growth_summary(uuid,date);
- L7–90 cria a função nova com três argumentos;
- L91–93 executa e compara o resultado para a mesma música.

Isto é **DDL persistente dentro do próprio bloco de prova**, sem reversão por sentinela. Não é apenas escrita temporária ou DML de efeito líquido nulo. Saltar o bloco inteiro perderia as alterações funcionais; parti-lo ou remover só a prova exige nova autorização.

SELECT em 2026-10-26T14:20:07.842Z confirmou uma entrada Drizzle com o hash exacto da 0081 e a existência do identificador em Live; só contagem/booleano recolhidos, sem linhas operacionais. A presença em Live não elimina a violação do ponto1.

Paragem neste limite. Não foi criado overlay para a 0081, não se semeou a música, não se partiu nem editou o DO, nem se alargou o predicado. Original intacto e versão revertida no replay. Caso devolvido ao revisor para decidir como preservar o DDL e tratar a prova operacional.

## Digests e coordenação

- Delta: d98a035009292cd98d6b4fbf63f525e3eae37d57ac5fd0c2af4eb1b66a4c1bae.
- Manifesto do delta: 526f3d1288379f0c056f64c3f49344c6df09b7bdfb667869a1cb261caebd390d.
- br_estados: 6b8f20294bf5939e7691cc698b2edb7cd0d5cbed85d5843e606443466cdde1f8.
- song_link_diag: 45b247cdcd3b46ca3ba5c3e62405a61dfaa44f1c08a7c696ece2301807d090a0.
- Manifesto identity: ada51e6004c67c879046484d38bd61699f344574e60cf95676b871ee872d3c37.
- Plano final: 5c8e5f405a0a6439437b7938e5c8a7565d2e3bad31e8460bdb39dee729450a58.
- 0081 original: d4624be6b1631ea76f2d82e3b92c0ee96edca424644523ecc6344fe3555a2668.
- DO L2–93: 49f54b64b39f8beade2d50a1df94139238361266a51e55cad0fdb60d188242ea.
- Artefacto final12657084120, ZIP SHA-256 verificado: f7a881bb8bbaa7efa73933613a6c8dbde0fdf0cabf5640c8b93808d2a6db6c97.
- Artefacto anterior12656098328, ZIP SHA-256 verificado: 1442a2d213956c1e56d8c4f8434446409483ea3cccd959eed38f496266af5fb5.

#329 confirmada imediatamente antes dos pushes privados: 13:55:06.238 e 14:09:10.808 UTC, GitHub=Lovable=4d7d25667618cb27c24a036b440b8e44c2a3aa7c, agentFinished=true. Reconfirmação documental na Issue. Somente documento novo e comentário no público; QUADRO/estado para Claude Code. Reserva mantém-se. Sem escrita em Live, DSN, infra paga, deploy ou Publish.

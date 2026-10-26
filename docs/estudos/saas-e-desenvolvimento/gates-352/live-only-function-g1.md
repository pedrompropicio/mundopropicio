# #352 — reconstrução de função apenas existente em Live

Data: 26/10/2026. Parecer [6414757497](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6414757497). [Commit privado 49548da1](https://github.com/pedrompropicio/mundopropicio-replay/commit/49548da152bb3dc992b23ba5901c5b21efd891e6) · [G1 40316514693](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40316514693). Live apenas SELECT; G2 não executado.

## Prova e reconstrução

pg_get_functiondef(254372) exportado em 2026-10-26T11:23:50.287Z, preservado byte a byte em reconstructed/254372_public._run_invariant_checks_extrato.definition.sql, no privado. Função public._run_invariant_checks_extrato(), plpgsql, STABLE, SECURITY DEFINER, sem argumentos. Nenhum corpo editado e nenhuma linha operacional copiada.

SELECT de proveniência confirmou:
- zero definições correspondentes no ledger;
- vizinho inferior public.reconcile_bank_line, oid 253851, primeira menção no ledger 20260922175952;
- vizinho superior crm.meta_creatives_retention_log, oid 255440, CREATE na versão 20260923024639 e zero DROP TABLE correspondentes no ledger.

effective_at = **2026-09-22T17:59:53Z**, um segundo após a âncora inferior e dentro da janela até 2026-09-23T02:46:39Z. Manifesto com OIDs, versões, query/UTC dos SELECTs, hashes e definição exacta. Plano passa a 1.466 entradas.

A cópia executável acrescenta somente comandos de proprietário e ACL ao texto exacto da função: REVOKE ALL FROM PUBLIC explícito, remoção de privilégios locais herdados por omissão e reprodução dos grants de postgres/service_role. O grant do papel de plataforma é omitido pela lista fechada já autorizada; o nome usa marcador no catálogo publicado. Não são criados papéis.

Checkpoint local após criação compara a definição pg_get_functiondef exacta, proprietário, linguagem, SECURITY DEFINER, configuração, volatilidade e ACL sem os dois papéis de plataforma. Dependências do corpo não são substituídas ou editadas; uma falha ao utilizá-las exige análise própria.

## Âmbito autónomo

live_only_ddl_reconstructed passa a abranger funções. Outros objectos existentes só em Live, sem definição no ledger e com janela demonstrada pelos vizinhos de OID, podem ser reconstruídos sem novo parecer, mantendo prova e hashes no manifesto. Isto não autoriza inventar dependências ou alargar outra regra.

## Validação local

Dez testes PASS: manifesto, corpo inalterado, REVOKE PUBLIC explícito, GRANT service_role, exclusão do papel de plataforma, detecção de diferença de definição/ACL, rejeição de hora inválida e ordem do plano.

check-pii em 2026-10-26T11:27:31.839844Z: 1.249 ficheiros, zero ocorrências; 901 literais JSON, zero inválidos. SQL histórico e seeds mantidos.

## Resultado G1

**Função reconstruída PASS; G1 vermelho em dependência de RLS de tabelas ausentes.** UTC 11:38:30–11:46:22 de 26/10.

**1.234/1.466 entradas concluídas**, 1.235 tentadas, uma falhada e 231 não tentadas. Concluídas todas as 711 entradas do ledger (706 directas + cinco repo-for-placeholder), os 499 órfãos, oito seeds, quatro relações reconstruídas, a reconstrução de colunas, a função nova e **10 entradas Drizzle**.

- Checkpoint reconstructed-function-254372.json PASS: definição exacta e ACL exacta sem papéis de plataforma; nenhuma diferença.
- Migração 20261002120740, anteriormente bloqueada, concluída com exit_code 0.
- **47/47 e 114/114 PASS**, sem diferenças.
- 70/70 verificações nativas anteriores PASS, além do checkpoint da função.
- Saltos: destrutivos 155; idempotentes 2.137; revistos 9 (data_volume_assertion 7, orphan_dml_without_effect 1, platform_role_grant_excluded 1).
- Crons 16→0, agendador desligado; compensação ACL final não alcançada.

## Novo bloqueio analisado autonomamente

Drizzle **id 11**, public-source/drizzle/migrations/0010_derp168_artist_rls_empresa_do_artista.sql, DO **L28**, SQLSTATE **42P01**. O DROP POLICY dinâmico iniciado em L47 refere public.artist_song_tiktok_groups, inexistente no replay. A mesma instrução também passa por artist_song_tiktok_sounds e artist_song_tiktok_sound_daily. A versão foi revertida integralmente.

SELECT de catálogo encontrou as três relações; SELECT de ledger confirmou zero CREATE para cada uma:

| Relação public | OID |
|---|---:|
| artist_song_tiktok_groups | 249629 |
| artist_song_tiktok_sounds | 250004 |
| artist_song_tiktok_sound_daily | 250043 |

Janela de criação demonstrada pelos vizinhos: abaixo artist_ads_campaign_settings, oid 248896, primeira definição em 20260921180223; acima validate_payment_date_not_future, oid 251436, definição em 20260922051848. Foi verificado o catálogo completo das três, sem copiar linhas.

Foram encontrados candidatos históricos em supabase/manual/20260921195500_artist_song_tiktok_groups.sql e 20260921205000_artist_song_tiktok_sounds_module_a.sql. Contêm DDL e DML operacional e a anotação original de não aplicação. Não foram executados nem usados para semear dados. Hashes dos ficheiros: 9dc474f7e26de1d57e37ec18b55f968178e786d3a38b886ed66fd08fe3770e18 e ddb6aed5a2923f3a29b831a06372f767cc27329dae821359be604b989c6e584c.

**Limite concreto da reconstrução exacta:** a RLS actual depende de funções que ainda não existiam no intervalo de criação das tabelas:
- user_has_company_access, oid 317655, criada em Drizzle 0010 L7;
- artist_readable_ids, oid 443694, criada em Drizzle 0125 L4;
- artist_assignment_company_ids, oid 470601, criada em Drizzle 0146 L4.

As duas últimas são usadas nas políticas actuais das tabelas groups/sounds; user_has_company_access é usado nas três. Estas funções têm origem posterior conhecida no plano: não satisfazem a condição de objecto sem definição histórica que permitiria copiá-las para trás. CREATE POLICY valida essas referências ao criar, ao contrário do corpo plpgsql da função reconstruída.

Por isso, copiar a RLS actual no intervalo original é incompatível com a ordem provada. Usar a RLS antiga dos scripts manuais, omitir/adiar políticas ou antecipar funções exigiria uma regra adicional para reconstrução histórica de políticas. Não se presumiu que a política antiga do candidato manual fosse o estado efectivamente aplicado. A regra de salto destrutivo de topo também não permite modificar um DROP dentro do DO.

**Paragem somente neste limite novo de reconstrução temporal de RLS.** Não se saltou o DO, não se inventaram políticas, não se anteciparam funções e não se semeou qualquer linha. As três tabelas foram inventariadas, não materializadas. Caso devolvido ao revisor; **G2 não executado**.

Artefacto 12647556767, ZIP SHA-256 conferido: d1fda75b61702214146ebd1361417176b4aab468faadf1796da96bf95128d769.

## Digests e coordenação

- Definição exacta: 4aa28f42ce3ed6b8ee1bdcf488bbc4f8680be332710f74398bf9f2f571dd33e3.
- Cópia executável com ACL: e9f067d9949b3479c4325ffa68b1c4dc3a42e8f151af7e7e05cb01197f1d2746.
- Manifesto de funções: 6c8a7e3003e86ad8037d80ee92ad2f85cb1e287f554ec0b7555cbdef5dc8be70.
- Plano: c66e0a97366259db3faaa1d07a65566fe6828983ff9387e493ec36390474ec5b.

#329 antes do push privado: aguardada libertação do agente; às 2026-10-26T11:37:49.299Z, GitHub público = Lovable = cd6415cf08838df7c5b6270ac88d73f8314e5e78, agentFinished=true. Privado anterior 158dfecd; push CAS sem força. Reconfirmação documental registada na Issue.

Reserva #352 mantém-se até fecho do gate; QUADRO/estado para Claude Code. Issue aberta. Sem escrita em Live, DSN, infra paga, deploy ou Publish.

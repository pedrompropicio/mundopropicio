# #352 — exclusão dos dois papéis de plataforma e G1

Data: 26/10/2026. Parecer [6413762428](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6413762428). Sem novas consultas a Live nesta etapa; utilizada a prova de catálogo já recolhida e o parecer. G2 não executado.

[Commit privado c0197257](https://github.com/pedrompropicio/mundopropicio-replay/commit/c0197257c2a4dfe666ed28940dcd887b9f9ab4a8) · [run G1 40308166139](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40308166139).

## Regra aplicada

Lista fechada: `sandbox_exec` e `sandbox_exec_<ref Live>`. O segundo é reconhecido pelo SHA-256 exacto do nome; nenhum prefixo ou família de nomes é aceite. Não são criados papéis.

Reconstruções omitem somente as entradas da ACL desses destinatários. No ledger, uma instrução exclusivamente dirigida à lista é omitida; com destinatários mistos, só estes são removidos. Instruções dentro de DO/funções não são alteradas. Formas de ACL não reconhecidas com estes destinatários param para revisão; outros papéis ausentes continuam a falhar.

A comparação de ACL usa a mesma exclusão exacta, tanto para o checkpoint da reconstrução como para a comparação de privilégios. Esta preparação não executa G2. Os restantes atributos, papéis e privilégios mantêm comparação exacta.

## Ocorrências e proveniência

Manifesto privado `proofs/platform-role-exclusions.json`, ligado por hash ao plano e validado antes de iniciar o replay: uma ocorrência do ledger e quatro grants da reconstrução. Cada uma contém ficheiro, linha, SHA-256 da instrução, destinatários excluídos/retidos e acção. O nome com ref aparece sempre com o marcador.

- Ledger `20260921180146`, GRANT iniciado na linha 226: mantém authenticated, service_role e postgres. Original histórico intacto; transformação só ao executar.
- Reconstrução de partner_aporte_mirror: omite os quatro grants das linhas 107, 109, 111 e 113 da versão anterior, commit 2a6d24d2. As ACLs de aplicação permanecem iguais. O manifesto de reconstrução conserva o hash anterior e o novo hash; o snapshot publicado representa o nome com marcador.
- Catálogos/relatórios emitidos pelo runner mascaram somente o nome exacto aprovado; sem ref real nesse nome nos artefactos.
- Plano mantém 1.465 entradas; nenhuma alteração de ordem ou seed.

## Validação

20 testes locais PASS (10 da nova regra e 10 das regras de GRANT/REVOKE). Cobrem destinatário único, lista mista, REVOKE, nomes semelhantes fora da lista, identificadores entre aspas, corpo DO intacto, instrução real, manifesto e diferenças de ACL fora da lista. Manifestos de reconstrução e exclusão validados.

check-pii em 2026-10-26T10:30:32.678739Z: 1.246 ficheiros, zero ocorrências; 899 literais JSON, zero inválidos. Quatro novos testes nativos no workflow verificam grant exclusivo, grant misto mantendo a permissão de authenticated, revoke exclusivo e outro papel ausente com 42704.

## Resultado

**G1 vermelho por novo bloqueio**, depois de validar a correção. Execução UTC 10:32:30–10:40:32 de 26/10. **1.196/1.465 entradas concluídas**, 1.197 tentadas, uma falhada e 268 não tentadas.

- **47/47 cidades e 114/114 categorias PASS**, zero diferenças.
- Reconstrução de partner_aporte_mirror **PASS**, sem diferenças no catálogo após a exclusão aprovada: colunas, constraints/índices, RLS/políticas/triggers e proprietário/grants.
- 20260917115514 (UPDATE antes bloqueado pela tabela ausente) e 20260921180146 (GRANT misto) concluídas com exit_code 0.
- **70/70 verificações nativas PASS**, incluindo as quatro novas. Papel fora da lista provocou 42704 no teste negativo, sem commit; authenticated manteve SELECT no teste misto.
- 60 ficheiros de artefactos JSON/CSV/log verificados: zero nomes do papel aprovado com ref real sem marcador.
- Saltos destrutivos: 155. Idempotentes: 2.137 (base 1.162; policy_equal 611; using_index 175; trigger_equal 169; insert_duplicate_equal 1; txn_control 12; insert_duplicate_superseded_by_ledger 3; grant_revoke_missing_object 4).
- Saltos revistos: 5 (orphan_dml_without_effect 1, data_volume_assertion 3, platform_role_grant_excluded 1). Os quatro grants de reconstrução foram omitidos na geração e constam do manifesto, não são saltos do ledger.
- Crons 15→0, agendador desligado; compensação ACL final não alcançada.

**Novo bloqueio para parecer:** ledger/20260925222026_a964808e-9709-44c1-9563-661fb91b1a2e.sql, DO iniciado na **linha 8**, SQLSTATE **42501**, mensagem “artista inexistente ou sem empresa”. O bloco chama artist_ads_campaigns e falha em artist_ads_assert_access ao calcular hashes para um artista concreto que não está disponível no replay.

A versão foi revertida integralmente. Nenhuma nova classificação automática desse bloco, nenhum artista semeado, nenhuma função ou regra de acesso alterada. Paragem para revisão. **G2 não executado.**

Artefacto 12643484199; SHA-256 do ZIP verificado: 0fe35406efedfbfbd7f52b4a6e816ad6e444be4142522f7b1fb220079c02144a.

## Hashes e coordenação

- Manifesto da exclusão: 73e830cfb181ce4d730df4247efa8ed0c366597a551cdc642f3b44ff091b8f35.
- Plano: a49024f4c8ade07baca1be4beabc67093062713aeaca21f01681af41f20cf7b6.
- DDL reconstruído de partner_aporte_mirror: 7774a0910e21a77bc335d0cb2a0000479788057245d4d9ca6fbbf13c81d1fe2c.

#329 antes do push privado em 2026-10-26T10:31:55.441Z: GitHub público = Lovable = 4dd5e1df319d7309dc79724b3f62a4c06204e8c2, agentFinished=true; privado anterior 2a6d24d2. Push CAS sem força. Reconfirmação documental registada na Issue.

Reserva #352 mantém-se até fecho do gate. QUADRO/estado ficam para Claude Code. Issue aberta. Sem escrita em Live, criação de papéis, infraestrutura paga, deploy ou Publish.

#352 — grant_revoke_missing_object e G1

Data: 26/10/2026, UTC. Executor: Codex. Autorização: parecer Pedro/Claude nesta sessão, regra grant_revoke_missing_object com compensação final de ACL obrigatória.

[Commit privado f0f084f](https://github.com/pedrompropicio/mundopropicio-replay/commit/f0f084f24c13331c6a4480fe2cefbb8d17fe35fc). Apenas runner, módulo, testes e referência de catálogo; plano, SQL histórico e overlays intactos. A função não foi reconstruída.

Regra: GRANT/REVOKE de topo sobre funções/procedimentos/rotinas ou relações, SQLSTATE 42883/42P01, com confirmação de objeto-alvo ausente por lookup de catálogo local. Papel inexistente, outros estados, instruções dentro de DO e formas não reconhecidas continuam a parar. Cada salto regista objeto, privilégio, papéis, versão, linha, estado e hashes em ledger/skipped-idempotent.json, variante grant_revoke_missing_object.

Compensação: após todas as entradas, o runner recolhe proacl/relacl dos objetos afetados e compara privilégios efetivos, papéis, grantor, grant option, proprietário e prosecdef com referência Live obtida por SELECT. Ordenação da ACL é normalizada; diferenças de papéis não são excluídas. Divergência, objeto ausente ou referência em falta deixam G1 vermelho, com objeto nomeado. Se houver falha anterior, o estado é not_reached; nunca se declara compensação aprovada sobre catálogo parcial.

Referência inicial de crm_auto_link_meta_campaigns_to_events(uuid) confirmada em Live por SELECT: oid 423848, prosecdef=true, três concessões EXECUTE. Query, resultado e hora de recolha guardados no privado em proofs/grant-revoke-acl-reference.json. Hora registada: 01:10:50 UTC; SHA256 812e76b69c98a8252ccb75b8a3af1e676d384fbb6ba177356da8366d2cd770f0. Nenhuma escrita em Live.

Testes: 38 locais PASS (10 novos e 28 anteriores); 46 nativos PASS (seis novos). Casos novos: REVOKE de função ausente, GRANT de função ausente, GRANT de relação ausente, objeto existente, papel inexistente e chamada ausente dentro de DO. Scanner completo PASS.

[G1 — run 40253073431](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40253073431): VERMELHO. Replay desde vazio, 01:12:49–01:20:08 UTC. Concluídas 1063/1458; 1064 tentadas, uma falhada, 394 não tentadas. Avanço de 48 entradas. Checkpoint 20260430033938: 114/114, sem diferenças; seed isolado 117 linhas, zero pais por resolver.

A regra produziu quatro saltos, todos 42883 e EXECUTE:
- 20260911145253 L14: crm_auto_link_meta_campaigns_to_events(uuid), PUBLIC.
- 20260911145253 L30: coala_send_early_bird_batch(integer, boolean), PUBLIC.
- 20260911145419 L13: crm_auto_link_meta_campaigns_to_events(uuid), anon e authenticated.
- 20260911145419 L29: coala_send_early_bird_batch(integer, boolean), anon e authenticated.

Os dois ficheiros concluíram. A referência de ACL da segunda função ainda terá de ser recolhida por SELECT antes de fechar a compensação; a ausência dessa referência está coberta pelo bloqueio final implementado. grant-revoke-final-acl.json lista os dois objetos, estado not_reached. A compensação ainda NÃO passou.

Saltos totais: 155 destrutivos, 2133 idempotentes. Variantes: base 1161; policy_equal 610; using_index 175; trigger_equal 169; insert_duplicate_equal 1; txn_control 10; insert_duplicate_superseded_by_ledger 3; grant_revoke_missing_object 4. Registos completos por ficheiro/linha no artefacto privado. Crons: 12 exportados sanitizados, zero após limpeza; agendador desligado.

Primeira falha nova: ledger/20260913132000_352c26e5-1056-451a-8b15-077b8a2a7d89.sql, DO iniciado em L83, SQLSTATE 22P02, JSON inválido. Na cópia publicada, as chamadas de set_config para request.jwt.claims têm um endereço sanitizado como valor integral nas linhas 104 e 114; esse texto não é JSON. O erro surge no SELECT sobre public.cities dentro da prova. Hash original registado: accc3be12f976143572fbf1be97225606ad2371d493ddff01f5be9cef5a748db. Hash publicado/executado: 900d284821c9c3a0946751d0dc18f7bd88f371f650692dc7a0918754c008d505.

Leitura adicional: o mesmo DO compara contagens mínimas de dados operacionais e dispara RAISE condicional nas linhas 106–110. Portanto, corrigir apenas a forma JSON pode revelar outra dependência de dados de Live. Para revisão: corrigir a sanitização preservando a estrutura JSON sem restaurar PII e decidir o tratamento desta prova operacional no replay de schema. Nenhuma destas alterações foi aplicada; não se ignorou o 22P02 nem se criou overlay.

G2: NÃO EXECUTADO, condicionado a G1 e compensação de ACL verdes. Artefacto privado 12621546785; SHA256 ZIP 6c817573f17f7978be779d41a46b0ee0728997a1f00c678285e9d286139b2008. Inclui logs, execução, testes, checkpoint, saltos e estado da compensação.

Reserva #352 mantida; QUADRO/estado a cargo do Claude Code. Fecho público apenas neste ficheiro novo, sem SQL integral nem dados de Live. Scanner documental e reconfirmação #329 imediatamente antes do push registados no comentário da Issue. Sem DSN, infraestrutura, deploy ou Publish.

#352 — sanitização JSON com preservação de tipo e G1

Data: 25/10/2026, America/Fortaleza. Executor: Codex. Origem: despacho Pedro/Claude nesta sessão, correção do 22P02 sem nova regra de salto.

[Commit privado ee9c7ac](https://github.com/pedrompropicio/mundopropicio-replay/commit/ee9c7acfb2ea00059a57fb3390da2f3a185d66a4). A sanitização preserva objetos, arrays e tipos escalares JSON; identificadores pessoais usam UUID sintético fixo, emails usam o domínio reservado example.invalid e texto pessoal usa string curta. Fora de JSON, mantém-se a política anterior. role foi preservado. Nenhum valor original consta do manifesto.

Lista completa de cópias afetadas encontrada na varredura: um ficheiro, ledger/20260913132000_352c26e5-1056-451a-8b15-077b8a2a7d89.sql, literais das linhas 104 e 114. Em cada literal foram substituídos os campos sub e email: quatro substituições. O diff da cópia publicada altera exclusivamente essas duas linhas. O original permanece intacto, confirmado por hash. Não há overlay novo nem regra de salto nova.

Hashes da versão:
- Original: accc3be12f976143572fbf1be97225606ad2371d493ddff01f5be9cef5a748db.
- Cópia publicada anterior: 900d284821c9c3a0946751d0dc18f7bd88f371f650692dc7a0918754c008d505.
- Cópia sanitizada corrigida: 819394a63a8a88ee2b2d4c88bf37d981ce7e66efdcf30893742b77a078019ef9.

Manifestos privados: proofs/json-redactions.json, ledger.json e REDACTIONS.md, com linhas, campos, tipos e hashes; sem valores originais. plan.json mantém as 1458 entradas e a mesma ordem, atualizando os hashes de uma fonte e do manifesto.

Verificação: comparação original/cópia em 1216 fontes do plano não Drizzle, zero fontes em falta; apenas os dois literais acima afetados. Scanner local das cópias: 1234 ficheiros SQL, 893 literais JSON verificados, zero PII e zero JSON inválido. Pré-validação das 1458 entradas efetivamente executadas, incluindo Drizzle: 1232 literais JSON válidos, zero fontes em falta. O scanner do workflow também passou. O runner valida os literais JSON antes de iniciar Docker/SQL; resets intencionais de request.jwt.claims para string vazia são preservados.

Nove testes locais PASS. Dois novos testes no ambiente nativo PASS: set_config com o JSON sintético seguido de leitura/cast JSON e UUID; placeholder inválido rejeitado antes de qualquer envio de SQL. Artefacto json-sanitization-selftest.json. Total nativo: 48 testes PASS.

[G1 — run 40255803655](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40255803655), desde vazio: VERMELHO. Execução em 25/10, 22:46:16–22:53:23, Fortaleza (26/10, 01:46:16–01:53:23 UTC). Concluídas 1063/1458; 1064 tentadas, uma falhada, 394 não tentadas. Não houve avanço de entradas concluídas, mas o 22P02 deixou de ocorrer. Checkpoint 20260430033938: 114/114, sem diferenças.

Bloqueio seguinte no mesmo ficheiro: SQLSTATE P0001, DO iniciado em L83, RAISE na L109. A prova exige 47 linhas visíveis de cities e encontra zero sob o contexto sintético. A lógica de contagens nas L106–110 permaneceu intacta. Isto expõe a dependência da prova histórica de dados operacionais e contexto de autenticação. Para revisão: definir o tratamento dessa prova no replay de schema, preservando o DDL anterior; não inventar dados nem saltar o bloco sem decisão. Nesta etapa não se alterou nem ignorou o teste.

Saltos: 155 destrutivos e 2133 idempotentes; base 1161, policy_equal 610, using_index 175, trigger_equal 169, insert_duplicate_equal 1, txn_control 10, insert_duplicate_superseded_by_ledger 3 e grant_revoke_missing_object 4. Registos detalhados por ficheiro/linha nos artefactos privados. Crons: 12 exportados sanitizados e zero após limpeza, agendador desligado.

Compensação final de ACL: not_reached, ainda não aprovada. G2: NÃO EXECUTADO, condicionado a G1 e à compensação verdes. Não houve consultas nem escritas em Live nesta etapa; os originais locais foram verificados contra hashes previamente recolhidos.

Artefacto privado 12622557275; SHA256 ZIP 302c77ece623a26309b846c9a078c3d387544fed078cd8f9ff684eb1922396eb. Inclui execução, logs, testes, checkpoint, saltos e estado da compensação de ACL.

Reserva #352 mantida; QUADRO/estado a cargo do Claude Code. Fecho público apenas neste documento novo, sem SQL integral nem valores originais. Scanner documental e #329 reconfirmado imediatamente antes do push registados no comentário da Issue. Sem DSN, infraestrutura, deploy ou Publish.

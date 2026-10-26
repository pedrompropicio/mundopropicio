#352 — orphan_dml_without_effect: INSERT único de cities

Data: 25/10/2026, America/Fortaleza. Executor: Codex. Parecer lido: [Claude, comentário 6406869676](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6406869676). Aplicação da decisão de não-efeito apenas ao INSERT do órfão 20260620221854.

[Commit privado e94cf34](https://github.com/pedrompropicio/mundopropicio-replay/commit/e94cf340444cb3dcfe08546e7e33d3bc572e7e00). A regra exige source orphan, versão e caminho exatos, hash integral do ficheiro e hash exato do statement. Qualquer mudança de conteúdo no caso aprovado bloqueia a exceção; outras versões não recebem salto. SQL histórico, plano, seeds e overlays permanecem intactos.

Alvo único: orphan/20260620221854_d0c23c96-b20b-4729-94be-eb8ea582e60d.sql, INSERT SELECT em public.cities iniciado na L8. Hash do ficheiro: 08a6dac6d896bce6593dae083acc2075a92ebf9331d61b182b00529293019a65. Hash do statement, sem normalização: c978b665ff3e0d1e819f85dfcb76371a4957a8cb9a14e17e7495bfcd9c933d06.

Registo privado ledger/skipped-reviewed.json: exatamente um salto, variante orphan_dml_without_effect, contagem 25, as 25 chaves name/country/state, linha, versão, hashes e referência ao parecer. A versão concluiu a transação. As chaves não são publicadas neste documento.

Testes: 34 locais PASS (seis novos, 28 anteriores). Três provas no ambiente nativo PASS: caso aprovado cria state e os dois índices, sem inserir cidades; mesma fonte sob outra versão insere as 25, sem salto; alteração do alvo é rejeitada antes de SQL. Total nativo: 51 testes PASS. Scanner completo do workflow PASS.

[G1 — run 40259830014](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40259830014), desde vazio: VERMELHO. Execução em 25/10, 23:35:38–23:43:02 Fortaleza (26/10, 02:35:38–02:43:02 UTC). 1067/1462 entradas aplicadas; 1068 tentadas, uma falhada e 394 não tentadas.

Checkpoints:
- Cidades antes de 20260913132000: 47/47 PASS, zero em falta, zero adicionais, igualdade exata por name/country/state. Hash das duas projeções igual: 4fd4d6c3d1cf819100e8792ff646de43e0333945b2e957f3b6773c1e92e24dc1.
- Account_categories após 20260430033938: 114/114 PASS, zero diferenças.

O G1 avançou para a execução de 20260913132000 e parou no P0001 do DO iniciado na L83, RAISE na L109: a prova staff espera 47 linhas visíveis em cities e observa zero. O checkpoint imediatamente anterior confirma que as 47 linhas existem e correspondem à referência; o bloqueio ocorre já sob o contexto autenticado sintético da prova.

Leitura da fonte: has_staff_role é definida a partir da L6, verificando is_platform_admin ou papéis em user_roles com contexto de empresa; a política SELECT nova chama essa função na L51. O DO muda para authenticated na L102 e configura request.jwt.claims nas L103–104. A sanitização JSON permanece válida. Esta evidência aponta para a visibilidade no contexto de autenticação/papéis do teste; a ausência ou configuração concreta de cada identidade ainda não foi verificada nesta etapa.

Próxima revisão: decidir como reproduzir o contexto de teste e os papéis necessários, mantendo o DDL e as regras RLS. Não foram concedidos papéis, alteradas permissões, restaurados identificadores pessoais nem suprimido o DO. A regra aprovada não foi alargada a outro INSERT, tabela ou órfão.

Saltos: 155 destrutivos, 2133 idempotentes e um revisto. Variantes idempotentes: base 1161; policy_equal 610; using_index 175; trigger_equal 169; insert_duplicate_equal 1; txn_control 10; insert_duplicate_superseded_by_ledger 3; grant_revoke_missing_object 4. Registos por ficheiro/linha nos artefactos privados. Crons: 12 exportados sanitizados, zero após limpeza, agendador desligado.

Compensação final de ACL: não alcançada. G2: NÃO EXECUTADO, condicionado a G1 e compensação verdes. Artefacto privado 12624008475; SHA256 ZIP ad1fb040d4567f29967dcf7e12bf53ed98eff29cb617bfd6eb1e07d0315f6104. Inclui skipped-reviewed.json, provas nativas, checkpoints, execução e logs.

Reserva #352 mantida; QUADRO/estado a cargo do Claude Code. Fecho público apenas neste documento novo, sem linhas de cidades nem SQL integral. #329 obrigou a aguardar o agente ocupado; push privado apenas após GitHub=Lovable=5fa54152 e agentFinished=true. Nova reconfirmação antes do push documental e scanner documental registados no comentário da Issue. Nenhuma consulta ou escrita em Live nesta etapa; sem DSN, infraestrutura, deploy ou Publish.

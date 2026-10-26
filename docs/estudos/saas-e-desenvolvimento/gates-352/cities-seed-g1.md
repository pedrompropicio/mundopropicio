#352 — G3 fatia 3: cities e checkpoint de referência

Data: 25/10/2026, America/Fortaleza. Executor: Codex. Autorização lida antes da recolha: [comentário 6406603956](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6406603956), “Sim” do Pedro para seed de referência privado, nunca em Live.

SELECT de public.cities às 02:06:26 UTC de 26/10 (23:06:26 de 25/10, Fortaleza): 47 linhas. A linha correspondente ao INSERT do ledger 20260804150902 foi excluída do seed; o seu created_at coincide com o segundo dessa versão. As 46 restantes foram copiadas com id, name, country, created_at e state, sem inventar identificadores.

Quatro ficheiros privados em seed/cities/, agrupados apenas por created_at idêntico: 30, 1, 13 e 2 linhas. Cada linha mantém effective_at igual ao created_at observado, incluindo microssegundos. Nas duas primeiras fatias temporais, state ainda não existia no schema e é nulo na referência; o INSERT omite essa coluna. A origem do schema foi verificada em 20260318050151 (criação da tabela) e no órfão 20260620221854 (coluna state). As linhas de referência permanecem exclusivamente no repositório privado.

Manifesto privado seed/cities/manifest.json: autorização, query, hora UTC, contagens, grupos, hashes e exclusão por origem. Hash canónico do conjunto Live de 47 linhas: 15f66063d4624b7fb5b20890ca6d71ddcd7db439762fec6fb7f651ac1c6cb081. Hash do conjunto do seed de 46 linhas: c335e9c14418f9e3579a4252c37438922a735513c503448692a34c23afdec08d.

[Commit privado 6a120a2](https://github.com/pedrompropicio/mundopropicio-replay/commit/6a120a2d9bdb033690ad62706d8b558e9da434d7). Plano com 1462 entradas: quatro grupos acrescentados; as 1458 entradas anteriores e a sua ordem relativa ficaram intactas. A ordenação preserva agora a precisão de microssegundos da prova de created_at. insert_duplicate_equal permanece sem alterações.

Sete testes locais PASS: conjunto/exclusão, integridade de SQL e referência, ordem temporal, checkpoint exato e colunas disponíveis no instante. Scanner local dos novos ficheiros e scanner completo do workflow PASS. Os 48 testes nativos anteriores PASS.

[G1 — run 40258148716](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40258148716): VERMELHO. Replay desde vazio, 25/10, 23:15:15–23:20:36 Fortaleza (26/10, 02:15:15–02:20:36 UTC). 1067/1462 entradas aplicadas; 395 não tentadas. Os quatro grupos de seed e o INSERT do ledger 20260804150902 concluíram sem erro e sem colisões de cidades. O checkpoint account_categories mantém 114/114.

O novo checkpoint executou imediatamente antes de 20260913132000, com resultado:
- Esperado: 47; observado: 72.
- Linhas esperadas em falta: zero.
- Linhas adicionais: 25.
- Comparação exata por name, country e state; nenhum filtro para esconder linhas adicionais.
- O runner parou antes de tentar 20260913132000. Não houve novo P0001 neste run: o bloqueio é cities_checkpoint_difference.

Origem das 25 linhas adicionais identificada: orphan/20260620221854_d0c23c96-b20b-4729-94be-eb8ea582e60d.sql, INSERT SELECT nas linhas 8–42, com 25 tuplos de referência. A leitura desse conjunto encontrou zero correspondências na referência atual de Live por name/country/state. A entrada foi aplicada neste run, exit_code 0. Hash da fonte: 08a6dac6d896bce6593dae083acc2075a92ebf9331d61b182b00529293019a65. A contagem reconcilia: 46 do seed + 1 do ledger + 25 do órfão = 72.

A autorização excluía do seed apenas a linha produzida por 20260804150902; essa regra foi cumprida. Não se eliminou o DML do órfão nem se apagaram linhas locais para forçar o checkpoint. A evidência atual não distingue entre DML órfão não aplicado em Live e remoção posterior fora do histórico. Para revisão: decidir o tratamento desse INSERT SELECT ou comprovar a remoção posterior, preservando o DDL de state e dos índices que o mesmo ficheiro contém. Nenhuma nova regra ou overlay aplicado.

Saltos: 155 destrutivos e 2133 idempotentes; base 1161, policy_equal 610, using_index 175, trigger_equal 169, insert_duplicate_equal 1, txn_control 10, insert_duplicate_superseded_by_ledger 3 e grant_revoke_missing_object 4. Registos por ficheiro/linha nos artefactos privados. Crons locais: 12 exportados sanitizados, zero após limpeza, agendador desligado.

Compensação final de ACL: não alcançada. G2: NÃO EXECUTADO, condicionado a G1 e compensação verdes. Artefacto privado 12622614858; SHA256 ZIP d12b30e6f01b9839f71b380f6fd8c37f8dcec4cca6ea6d1ee86f4efe69187ee6. Inclui checkpoint-cities-before-20260913132000.json, checkpoint anterior, execução, logs, testes e saltos.

Reserva #352 mantida; QUADRO/estado a cargo do Claude Code. Fecho público apenas neste documento novo, sem linhas de cidades nem SQL integral. Scanner documental e reconfirmação #329 imediatamente antes do push registados no comentário da Issue. Live só SELECT; sem DSN, criação de infraestrutura, deploy, Publish ou execução em homologação.

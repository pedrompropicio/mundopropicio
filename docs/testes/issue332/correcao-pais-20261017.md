# #332 correção país e CAOP — preparação autorizada13:31UTC

SQL: supabase/manual/20261017_issue332_city_correction.PENDENTE.sql; nova migração após0186, ainda NÃO aplicada.0186 permanece imutável. Referência regenerada da lista preparada e comparada aos308 pares oficiais independentes:278Continente/19Açores/11Madeira, zero divergências locais; cinco diferenças0186 confirmadas. Sem backfill incluído.

Regra: perfil confirmado exige birth_date,birth_country,residence_country; país ausente/null/vazio/inválido retorna country_invalid. complete exige residence_country IS NOT NULL e cidade apenasPT. PT cidade vazia:city_invalid; não correspondência:city_unknown. ForaPT país obrigatório,cidade livre/vazia. Capturas sem país não inferem nem exigem país; validam concelho sóPT explícito. Registos demográficos totalmente vazios/clear permanecem incompletos, crédito permanente preservado.

Provas locais13:34–13:36UTC: CITY41/41, REGRESSION33061/61 (inclui rejeições de país ausente/null/vazio/ZZ), handler3/3, unidadeDeno4/4, lista32/32+pessoa41/41+perfil54/54; Vitest1287pass/1skip/11todo em162ficheirospass/1skip. BuildOK13:34:20. Fixtures descartáveis semTCP e semMeta; testes unitários de handler simulam a fronteiraRPC, SQL executa regras reais.

Gate13:36:54: Lovableae567c8b vs GitHub6c5bbe2c; SHA ainda desconhecido(checks422). Espera autorizada até30min, consultas espaçadas. Nenhuma nova escritaLive, deploy, testeLive, backfill ou limpeza; lista/cron intocados. Contrato corrigido ainda não disponívelLive.

## Bloqueio final14:08:45UTC
Espera13:36:54–14:08:45, consultas espaçadas3min, mais31min sem gate. Lovable58414c832cf107e152fa51c2613cb31b79021d06 ≠ GitHub6c5bbe2cbd1c63b00e26a98e6e0ae61352a0a555. Checks422: SHA ainda desconhecido; nenhum CI/quality desseSHA disponível. Parado conforme Pedro; nenhuma escritaLive após0186. Leitura real13:44:08UTC confirma308/278+19+11 e cinco nomes errados aindaLive.

Runner corrigido executou0186 real→SQLcorretivo no descartável: CITY41/41 e regressão33061/61 às13:37:25. Nada aplicadoLive, deployado, testeLive criado ou enviadoMeta. Não há limpeza de teste para aprovar; backfill não apresentado antes da correção/provaLive. Reservas mantidas. Autorizações permanecem, bloqueio é exclusivamente sincronização/CI.

# #332 correção país e CAOP — preparação autorizada13:31UTC

SQL: supabase/manual/20261017_issue332_city_correction.PENDENTE.sql; nova migração após0186, ainda NÃO aplicada.0186 permanece imutável. Referência regenerada da lista preparada e comparada aos308 pares oficiais independentes:278Continente/19Açores/11Madeira, zero divergências locais; cinco diferenças0186 confirmadas. Sem backfill incluído.

Regra: perfil confirmado exige birth_date,birth_country,residence_country; país ausente/null/vazio/inválido retorna country_invalid. complete exige residence_country IS NOT NULL e cidade apenasPT. PT cidade vazia:city_invalid; não correspondência:city_unknown. ForaPT país obrigatório,cidade livre/vazia. Capturas sem país não inferem nem exigem país; validam concelho sóPT explícito. Registos demográficos totalmente vazios/clear permanecem incompletos, crédito permanente preservado.

Provas locais13:34–13:36UTC: CITY41/41, REGRESSION33061/61 (inclui rejeições de país ausente/null/vazio/ZZ), handler3/3, unidadeDeno4/4, lista32/32+pessoa41/41+perfil54/54; Vitest1287pass/1skip/11todo em162ficheirospass/1skip. BuildOK13:34:20. Fixtures descartáveis semTCP e semMeta; testes unitários de handler simulam a fronteiraRPC, SQL executa regras reais.

Gate13:36:54: Lovableae567c8b vs GitHub6c5bbe2c; SHA ainda desconhecido(checks422). Espera autorizada até30min, consultas espaçadas. Nenhuma nova escritaLive, deploy, testeLive, backfill ou limpeza; lista/cron intocados. Contrato corrigido ainda não disponívelLive.

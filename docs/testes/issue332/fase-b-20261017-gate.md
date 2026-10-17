# #332 Fase B — aplicação parcial e bloqueio

17/10/2026, autorização Pedro12:55 e retoma12:58UTC. Sem Publish, cron/config Meta alterado ou sync externo manual.

Gate inicial: cd9b4faa9d26b00bd8e8e2a49cad43fc68140094 igual remoto. CI e quality in_progress12:58–13:00; completed/success13:02:04.

Testes repetidos: CITY40/40 e perfil56/56; LIST32/32+pessoa41/41+perfil54/54; handlercities2/2; Vitestdelivery/coletor/handler12/12.

SELECT12:59:42UTC:63membros,3elegíveis/3emails,60semprova,0revogados. Projeção somente leitura via tabelas/políticas/revisões (helper service-only não executável pelo canalread_query). SELECT13:02:22UTC:63membros;58linhas pontos/5250total global, cron2499ativo35 4 * * *. Inscrições reais continuam; não assumir baseline congelado.

0186_issue332_city_contract aplicada pela ferramenta canónica; types regenerados. Erro do executor: SQL transcrito em vez de byte-identical ao preparado, divergindo cinco nomes da view literal. Verificação imediata do ficheiro aplicado vs CAOP apontou:
-0204:Alvito em vez de Barrancos.
-0405:Miranda do Douro em vez de Macedo de Cavaleiros.
-0406:Mirandela em vez de Miranda do Douro.
-0407:Mogadouro em vez de Mirandela.
-0408:Moncorvo em vez de Mogadouro.

Correção deve substituir a view pela referência CAOP exata via migração, sem editar a0186 já aplicada. Os308códigos existem, mas a referência NÃO deve ser apresentada como validada ou utilizada no portal até correção. Não houve deploy do endpointcities novo. Guardascidade da0186 já afetam escritas existentes.

Gate após migração: HEAD5078351e26f5f3e8fa2b5b05c9849dd13c54e35b local vs remotocd9b4faa. Sem workflow do SHA; check-runs422 enquanto SHA desconhecido no GitHub. Consultas espaçadas120s13:05–13:25 sem sincronização; nenhuma nova escritaLive depois0186. BuildOK13:04:08.

Coletor estrito, deployportal/sync, testeLive, backfill, limpeza e correção NÃO executados. Cron/lista intocados; estadoenabledtrue observado antes mantido, sem nova prova de coleta/Meta. Reservas mantidas. Não há SQLCorro de limpeza porque nenhum teste criado; backfill só após correção e preview atual.

Próximo: confirmar HEAD=remoto+CIqualitysuccess, corrigir referência via migração e validar igualdade por código; aplicar coletor usando SQLpreparado exato, deploy2funções, testeLive semMeta, então apresentar SQLbackfill/limpeza separadamente.
Correção Pedro13:26/13:31: país de residência obrigatório; só cidade estrangeira opcional.0186 contém regra incorreta de país além dos cinco nomes. Testes40/40 históricos não validam esta correção. Nova migração preparada após0186; nenhum backfill incluído.

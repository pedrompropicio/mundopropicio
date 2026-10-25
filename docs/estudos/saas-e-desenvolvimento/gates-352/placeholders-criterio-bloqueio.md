# #352 — bloqueio na regra dos placeholders

Verificação Codex em 25/10/2026, na etapa autorizada de placeholders e enum_value_exists. Nenhuma alteração foi publicada no repositório privado; nenhum replay, consulta Live, deploy ou Publish foi iniciado nesta etapa.

## Divergência encontrada

Foram lidas as seis cópias do ledger já exportadas e reconferidos os hashes Git dos seis ficheiros correspondentes no checkout público fixado em ad160ee9fbc5b7c5a73f0a63fc44b0c1c86a2708.

Cinco placeholders contêm a indicação de aplicação via Claude MCP. A versão 20260510033845, ficheiro ledger/20260510033845_20260510033845_add_marketing_manager_role.sql, linha 1, tem 116 caracteres e indica aplicação anterior pelo Lovable através da migração consolidada 20260510041732. Não contém as expressões See repo file ou applied via Claude MCP usadas no critério autorizado. O texto original e o ficheiro de origem permanecem intactos.

A lista explícita inclui essa versão, mas a condição de substituição descrita no despacho não a cobre. O executor parou antes de alterar o plano publicado, em cumprimento da instrução de não reinterpretar o despacho.

## Confirmação necessária

Confirmar se 20260510033845 deve ser uma exceção explícita: executar o ficheiro do repositório nessa posição, mantendo no manifesto a prova real de aplicação anterior pelo Lovable, sem afirmar remissão inexistente para o repositório. Nenhuma exceção foi aplicada. A variante enum_value_exists e os testes nativos ainda não foram implementados.

O resultado anterior permanece válido: checkpoint 114/114; G1 bloqueado em 3F000 por ausência de crm; G2 não executado. Reserva libertada neste fecho e #329 reconfirmada. #352 permanece aberta.

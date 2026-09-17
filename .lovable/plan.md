# Listas de pagamento em blocos

## Objetivo
Substituir apenas a tabela principal por blocos verticais, preservando ordenação, ações, permissões, navegação e criação de listas. Corrigir também a documentação de “Marcar como Pago”.

## Implementação
1. Ajustar a query agregada existente `['payment-lists', 'totals']` para devolver as cinco fases por `payment_list_id`, sem consultas adicionais por lista.
2. Manter o agregado global no topo e atualizar a identidade apresentada para incluir “Não aprovadas” nos dois lados corretos.
3. Trocar cada linha da tabela por um bloco com:
   - título, data, estado, total, autor e ações atuais;
   - barra segmentada por pagar / pagas por liquidar / liquidadas / legado / não aprovadas;
   - resumo textual apenas das fases não vazias;
   - caso especial “tudo liquidado”;
   - tooltip com contagem e montante das cinco fases.
4. Calcular a barra sobre `Lançadas + Não aprovadas` e validar por lista que os cinco segmentos fecham exatamente nesse denominador.
5. Reescrever a secção da memória para documentar que “Marcar como Pago” altera apenas `manually_marked_paid`; “Liquidar (N)” é a liquidação real. Registar também a marcação visual feita pelo download SEPA.

## Verificação
- Confirmar por teste que, em cada lista, as cinco fases somam `Lançadas + Não aprovadas`.
- Confirmar visualmente os blocos em desktop e mobile, incluindo ações e tooltip.
- Executar a verificação TypeScript/testes relevantes sem alterar schema, dados, funções ou crons.

## Limites
Sem alterações de base de dados, migrações, edge functions, dados ou Publish.

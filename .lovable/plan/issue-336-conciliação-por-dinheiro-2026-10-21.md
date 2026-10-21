# Issue #336 — conciliação por dinheiro

## Resultado
- Comparar todas as camadas, ligação manual e lista sem movimento pela soma das pernas pagas, não revertidas e não compensadas, na conta do extrato.
- Usar paid_amount apenas sem pernas e com data anterior ao primeiro period_from da própria conta; sem corte conhecido, não há recurso.
- Preservar D-ERP28, sem liquidar automaticamente, sem dados alterados e sem Publish.

## Implementação
- Helper puro comum e ReconcileTransaction com conta e pernas; leitura paginada das pernas e primeiro extrato por conta, sem RPC nova.
- Lotes SEPA comparados por dinheiro dos itens; preservar informação de retenção, sem usá-la como regra especial para casar.
- Alinhar valores, somas e candidatos no ecrã de conciliação, incluindo modo link.
- Fixtures Vitest para compensação nas camadas b/c, Casino 23.406,00 + 7.590,00, fronteira por conta, retenção SEPA e dinheiro sem movimento; suite e validação automática de tipos.
- SELECT em Live com corte por conta, indicando predicado e valores efetivamente encontrados.
- Atualizar estado da frente, comentar Issue #336 e libertar reserva; reportar SHA observado e CI posterior pendente se aplicável.

## Atenção
- A Issue tem um comentário antigo contraditório: prevalecem corpo atualizado, D-ERP289 e instrução atual do Pedro.
- Não tocar em generate-historical-transactions, #323, #322 nem implementar #335/#337.
- A função existente de ligação será inspecionada só por leitura; se exigir alteração de escrita, propor sem aplicar.
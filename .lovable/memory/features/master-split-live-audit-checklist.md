---
name: Master/Split live audit checklist
description: Checklist interno para validar com segurança mudanças de BP Master/Split em Live sem confundir filhos virtuais com falhas reais.
type: feature
---
- **Checklist obrigatório antes de afirmar erro em Live**:
  1. confirmar se o evento usa turnê com Master/Split;
  2. confirmar no código se o fluxo em causa usa filhos físicos ou virtuais;
  3. verificar `event_forecasts.transaction_id` das linhas Master;
  4. verificar `transactions.parent_transaction_id` nas despesas-filhas reais dos subeventos;
  5. só depois avaliar `master_forecast_id` se o fluxo depender disso explicitamente.
- **Checklist obrigatório após correções de dados**:
  1. Master forecast voltou a ter `transaction_id`;
  2. transação Master continua com filhas reais nos subeventos;
  3. nenhum trigger está bloqueando fluxo legítimo do modelo virtual;
  4. resposta ao utilizador deve explicitar se o problema era de vínculo de transação ou apenas diferença entre modelo virtual vs físico.
- **Checklist obrigatório antes de mudar código**:
  1. identificar todos os pontos que usam `master_forecast_id`;
  2. identificar todos os pontos que assumem rateio Master consolidado;
  3. evitar converter uma convenção local em regra global sem documentação.
- **Regra de comunicação interna**: em dúvidas sobre Master/Split, documentar primeiro a fonte de verdade do fluxo antes de executar scripts ou concluir que a base está errada.
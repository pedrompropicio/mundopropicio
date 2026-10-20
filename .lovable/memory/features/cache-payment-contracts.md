---
name: cache-payment-contracts
description: Contratos de pagamento do cachê (máx. 4) com retenção IRS opcional por contrato, mãe+filhas por cidade, adiantamentos indivisíveis; revê D15
type: feature
---
- Até 4 contratos por cachê (turnê/evento + artista); soma dos brutos ≤ cachê efetivo; botão "Usar o restante por contratar".
- Cada contrato divide-se por todas as cidades na proporção do cachê da cidade; cêntimos na cidade de maior cachê.
- Retenção IRS opcional por contrato: pergunta Sim/Não sem pré-seleção; taxa da configuração (fallback 25) editável com confirmação; vencimento manual obrigatório (pode sugerir data do artista).
- Mãe de saldo (beneficiário editável) + mãe de retenção (MINISTERIO DAS FINANCAS - IRS da empresa); mães sem evento, filhas na linha do cachê da cidade, categoria 2.1.01, IVA 0.
- Nunca usar transaction_payments.withholding_amount nem declared_withholding_* no cachê (descontaria duas vezes).
- Adiantamentos: indivisíveis, pelo valor total, um só contrato; depois do contrato só dentro dele e até ao saldo restante; saldo negativo numa cidade bloqueia.
- Cancelar/alterar só sem pagamento/lista aprovada; vai para o Lixo 30 dias.
- Nunca criar linha de cachê no Master de turnê.

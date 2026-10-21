---
name: cache-payment-contracts
description: Contratos de pagamento do cachê (máx. 4), tecto = linha BP 2.1.01 da cidade, contrato só após congelar, retenção IRS opcional, adiantamentos indivisíveis; revê D15
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
- Termos: "Congelar cachê" (botão do modal que fixa o valor e gera a linha de BP); "Pagamento do cachê" (definir os contratos de pagamento).
- Tecto por cidade = linha de BP de cachê 2.1.01 ativa: a da configuração do artista; sem configuração a única 2.1.01; várias → o utilizador escolhe a do artista.
- Cidade com cachê configurado: contrato só depois de congelar. Adiantamento livre só antes de congelar; depois, só dentro de um contrato.
- Adiantamentos antigos só oferecidos com o evento em fecho: status active e última data já passada (completed/planning/confirmed não).
- Entradas: passo 2 "Pagamento" no modal de cachê e ação "Pagamento do cachê" na linha 2.1.01 do BP.
- Cancelar/alterar contrato elimina mães/filhas com o tratamento de dependências de delete_transaction_cascade e re-ancora a linha de BP à próxima transação (date, created_at, id) ou NULL.
- Valor bruto e valor do adiantamento: € ou %; % sobre o cachê efetivo (dentro de contrato: saldo disponível), 2 casas; grava sempre €.

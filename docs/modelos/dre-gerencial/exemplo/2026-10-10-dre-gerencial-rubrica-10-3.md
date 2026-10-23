# Exemplo — DRE gerencial: o que a rubrica de transferências escondia (10/10/2026)

> **Origem dos números.** Live, consultados a 10/10/2026. Issue #304.
> Relatório original: `claude/dre-gerencial-rubrica-10-3-e-conta-corrente-do-socio-2026-10-10.md`.
> **Anonimização:** sócio e empresas do grupo por papel. Os valores são os reais.

## O que a Issue dizia, e porque estava errada

A versão original propunha excluir a rubrica 10.3 do resultado, por natureza ou marcando a flag
nas 107 linhas. Aplicar isso teria apagado **55.048,38 de custo real**: os vencimentos brutos do
director, lançados na 10.3 e em mais lado nenhum do sistema.

A premissa — "a rubrica 10.3 é transferência interna por definição" — não resiste aos dados.

## Três afirmações retiradas antes de chegarem ao relatório

Antes de ler o código, construiu-se uma comparação **a bruto** do que os ecrãs somam **a
líquido**, e assumiram-se filtros que o código não tem. Retiradas:

- um "ganho fantasma de +140.251,62";
- uma divergência de 432.774,94 entre três cálculos de resultado;
- uma duplicação de 440.689,55 pelas filhas de rateio.

Nenhuma estava provada. É o mesmo erro de um alarme anterior: um número que parece autoritativo e
mede outra coisa.

## O defeito real

A rubrica 10.3 tem `type = 'expense'`. Daí uma assimetria: as **despesas** entram em Custos
Corporativos, porque o grupo "10.3" está na lista; as **receitas** não entram em lado nenhum,
porque o ramo de receita corporativa exige `type = 'income'` na rubrica **e** na transação. Uma
receita numa rubrica de despesa cai pelas duas e desaparece em silêncio.

Medido para 2026, aprovadas/pagas, sem evento, líquido:

```
289.806,16   33 pernas de despesa de transferência   custo FALSO
485.106,16   72 pernas de receita                    invisíveis
```

O resultado de 2026 estava **subavaliado em 289.806,16** — não inflado.

## O que se executou

**Vencimentos → 10.4.01 Ordenados.** Os 8 lançamentos (55.048,38) moveram-se da rubrica de
transferências para a de ordenados, que já existia com 34 transações. Trava: **total de custos
corporativos idêntico antes e depois**. O custo não mudou, só mudou de grupo.

**Comissões entre empresas do grupo → conta de intercompanhias.** 4 transações, 55.553,14,
comissão de intermediação cobrada a um terceiro e recebida pela empresa do outro país. Estavam na
conta corrente pessoal do sócio; a conta de intercompanhias existia e estava a zero. Moveu-se
também a linha de `transaction_payments` de cada uma — **sem isso o saldo não acompanhava**.

```
Conta Corrente · sócio          233.651,72 → 178.098,58
Acerto · Intercompanhias              0,00 →  55.553,14
```

Receita, rubrica e eventos inalterados.

## A nota de grupo que explica a escolha

A empresa do país de origem capta as turnês, a portuguesa realiza. Quando o recurso sai de uma
empresa do primeiro país, a de origem pode receber para não obrigar a transferência internacional;
emite factura ao pagador, e a operação fecha-se ali. **Não há dívida fiscal de uma empresa à
outra.** Os registos de intercompanhias são gerenciais, para visibilidade, não um saldo a cobrar.

Se a factura é da empresa de origem, a receita dessas comissões é legalmente dela, e esta DRE
mostra-a como receita da portuguesa. É uma visão de grupo deliberada, coerente com a DRE ser
gerencial.

## O que ficou por fazer

Decompor os 178.098,58 da conta corrente do sócio: entraram 233.300,00 em 46 transferências,
saíram 55.048,38 de ordenados e 153,04 de avulsos. O modelo é separar essas transferências em
salários, ajudas de custo por quilómetro e facturas avulsas, ficando o que sobra como distribuição
de resultado ou adiantamento. As ajudas por km ainda não estão nesta conta.

Marcar os pares de transferência que sobrarem com `exclude_from_result`, removendo os 289.806,16
de custo falso — **só depois** da decomposição.

Uma transação cuja natureza não bate com a da rubrica cai fora de todas as secções da DRE sem
aviso. Defeito de código, merece invariante próprio.

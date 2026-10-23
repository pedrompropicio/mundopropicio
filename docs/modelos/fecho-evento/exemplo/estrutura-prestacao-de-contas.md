# Exemplo — estrutura de uma prestação de contas que ficou boa

> **Origem.** `claude/prestacao-contas-anitta-eda-gerador.md` e
> `claude/fecho-socios-anitta-mp-ein-gerador.md` (v23, 02/09/2026), dados do ERP lidos em
> 02/09/2026. **Anonimização:** sócios por papel. Os valores são os reais.

## Os números, como ficaram

| | |
|---|---:|
| Receitas (s/IVA) | 2.527.352,94 |
| Despesas (s/IVA) | 1.668.029,31 |
| IVA das despesas | 262.641,48 |
| **Despesas (c/IVA)** | **1.930.670,79** |
| **Resultado do evento** | **596.682,15** |
| Parte principal 70% · sócio local · sociedade | 417.677,51 · 59.668,21 · 119.336,43 |
| Fora da repartição | 478.166,35 |
| **Total da sociedade** | **597.502,78** |
| Conferências 1 e 2 | 0,00 · 0,00 |

Pagador: sócio A 126 linhas / 1.170.883,85 s/IVA · sócio B 62 / 497.145,46.

## O que este exemplo ensina, e não se descobre sozinho

**O total é a soma das linhas, nunca o cabeçalho do card.** Durante três versões houve uma linha
"Ajuste de arredondamento do IVA" só para reconciliar o anexo com o cabeçalho do card de Custos
(1.933.026,70). O cabeçalho estava errado: apanhava uma transação `pending` que somava 2,46
indevidos. O total passou a ser a soma das 188 linhas, **1.930.670,79**, e a linha de ajuste saiu
dos dois documentos.

**Chegaram a existir três geradores em paralelo.** Um divergia em 2.526,25 € e **as duas
conferências fechavam à mesma a 0,00**, porque o erro era simétrico. Daí a regra: um zero prova
coerência interna, não correcção. E daí a outra regra: um gerador por documento; encontrar um
segundo é motivo para o apagar.

**Filtrar `type='expense'` no BP.** Uma linha de revenue share de 88.446,80 tem `type='income'` e
pagador a NULL: sem o filtro de tipo cai no balde de despesa de um dos sócios.

**`updated_at` não detecta mudanças no BP** — não é mantido quando o montante muda. Sete linhas
mudaram e o timestamp continuava no dia anterior. A única detecção fiável é o diff linha a linha.

**Um milésimo chega para partir a paridade.** Uma linha com 225,821 fazia os 70% cair em
417.677,505 e arredondar para lados diferentes em cada um dos dois documentos. Antes de gerar,
confirmar que nenhuma linha tem mais de duas casas decimais.

**Uma linha pode ter de aparecer duas vezes, e as duas são precisas.** Um direito que nasce de
um não-pagamento (uma taxa lançada a 5% e paga a 3,5%) entra como valor que pertence à sociedade
**e** é abatido ao desembolso de quem não o pagou. É a segunda ponta que dá lastro à primeira:
sem ela a conferência 2 falha por exactamente a diferença.

## A regra de escrita

O documento descreve **o que** cada número é e de onde vem. **Nunca** porque é que um sócio tem
condição diferente de outro: isso está intrínseco na estrutura e não se firma em prosa.

# Exemplo — Posição da conta-corrente MP ↔ Bilheteira A (13/09/2026)

> **Origem dos números.** Live, consultados a 13/09/2026 às 21:47 UTC por `query_database`.
> Relatório original: `claude/ticketline-posicao-conta-corrente-2026-09-13.md`.
> **Anonimização:** a bilheteira e os artistas aparecem por letra; os valores são os reais,
> porque é a aritmética que este modelo ensina.

## A correção que deu origem ao relatório

O chat estava a citar os **−271.416,37 €** do apuramento 2816/2026 como se fosse a posição da
conta-corrente. **Não é.** É o saldo de fecho de um evento, que por regra **transita** e é
abatido das vendas dos eventos seguintes. Somado com o que já se vendeu dos eventos à frente,
o número fica positivo — e essa é a posição real.

## A posição, e fecha ao cêntimo

```
Vendas dos eventos em venda, ainda sem apuramento ....  554.844,00
  Artista A - Porto .................. 192.310,00
  Artista A - Lisboa ................. 150.105,00
  Artista B - Porto ................... 61.449,00
  Artista B - Braga ................... 37.375,00
  Artista B - Lisboa .................. 27.065,00
  Artista B - Almada .................. 24.250,00
  Artista B - Estoril ................. 18.570,00
  Artista B - Albufeira ............... 16.676,00
  Artista C - Braga ................... 14.374,00
  Artista B - Santarém ................ 12.425,00
  Artista B - Montijo .................    245,00

− saldo transitado do apuramento 2816 ................ −271.416,37

                                                      ────────────
POSIÇÃO A FAVOR DA MP ................................  283.427,63
```

**A bilheteira deve 283.427,63 € à MP.**

O ERP chega ao mesmo número por outro caminho, e bate com `_ticket_office_balance_raw`:

```
Vendas totais na bilheteira ......... 3.940.440,70
− despesas .............................. 35.841,40
− transferências ..................... 3.621.171,67
                                      ─────────────
                                         283.427,63
```

## O débito que transita, decomposto

```
Evento D ... 493.152,50 − 2.734,73 (1 fatura) − 706.000,00 (10 repasses)   = −215.582,23
Evento E ... 107.652,70 − 20.242,84 (despesas) − 143.244,00 (acerto abertura) = −55.834,14
                                                                              ───────────
Saldo do apuramento 2816/2026 ............................................... −271.416,37
```

É a passagem de testemunho do apuramento 1158/2026 para o 2816/2026, agora visível na
aritmética e não só na descrição da transação.

## Porque a leitura de 09/09 já não servia

O documento de 09/09 dizia, e estava certo nesse dia: *"nenhum dos 10 repasses do pool
(706.000) está lançado"*. Já estão todos lançados, mais o acerto de abertura de outro evento
(176.290,00 + 184.301,50 = **360.591,50**, liquidado a zero antes do ERP, 31/03/2026). Com
tudo lançado, a conta da bilheteira no ERP passou a ser fonte fiável da posição — e é positiva.

Conferência das despesas, que fecha: 12.863,83 + 20.242,84 + 2.734,73 = **35.841,40**.

## Três factos que não se reinvestigam

**Não existe apuramento mais recente que o 2816/2026.** Só há três em todo o material.

**O fecho de bilheteira do Evento F está feito**, confirmado a 09/09/2026, com 11 adiantamentos
e 6 transações ligados e líquido −0,00. A frase "registar o fecho" era de um documento de
08/09, foi executada a 09/09 e ficou por apagar no `estado-` da frente — propagada duas vezes
sem ser verificada.

**Registar o fecho do Evento D não altera a posição.** As vendas e os repasses já estão ambos
dentro da conta. O fecho só reclassifica.

## O que fica por fazer nesta frente

Registar o fecho de bilheteira do Evento D (apuramento 2816/2026). Tem tudo: bruto 493.152,50
(bate ao cêntimo), fatura lançada, os 10 repasses lançados, e 9 adiantamentos registados no
evento — o apuramento lista 10, portanto **falta ligar um**, a verificar antes de abrir o
wizard. O acerto de 55.834,14 € entra como dedução e é o mesmo valor que saiu do Evento E:
convém ficar explícito, senão daqui a três meses ninguém sabe de onde veio.

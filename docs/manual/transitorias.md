---
capitulo: transitorias
titulo: Transitórias
modulo: erp
atualizado: 2026-10-09
perfis: [editor, manager, admin, accountant, partner]
rotas: [/transacoes, /eventos/:id, /cartoes, /contas, /relatorios/extrato]
fontes: [D-ERP21, D-ERP22, D-ERP24, D-ERP80, transitory-reason, partner-advance-expenses, card-sessions, settlement-transfer-pair]
---

# Transitórias

Uma transitória é dinheiro que **só passa pela conta**: entra ou sai da conta da empresa, mas não é receita nem custo do evento. Move o saldo da conta e mais nada. Toda a transitória diz **porquê** — tem sempre um motivo.

![Ciclo de uma transitória](img/transitorias-ciclo.svg)

---

## O que é uma transitória

```ajuda
id: transitorias.conceito
tooltip: "Transitória é dinheiro que passa pela conta da empresa mas não é receita nem custo do evento. Move o saldo da conta, mas fica fora do DRE, do Fecho, do BP e do custo do evento."
ecras: [transacoes.lista, nova-transacao, editar-transacao, extrato.linha]
perfis: [editor, manager, admin, accountant, partner]
fontes: [D-ERP80, transitory-reason]
termos: [transitória, transitorio, passa-por, só passa pela conta, não entra no resultado, fora do DRE, dinheiro de terceiros, dinheiro do sócio, o que é transitória]
```

Exemplos: uma caução paga à sala que vai ser devolvida, o dinheiro do TPA do bar que é do operador e vai ser repassado, o aporte de um sócio, a carga de um cartão pré-pago.

A transitória **fica fora** de:

- DRE e resultado do evento;
- Fecho do evento (ver **Que números o fecho usa**, no capítulo Fecho do evento — `fecho.numeros`);
- BP: não consome verba nem precisa de linha do BP;
- custo do evento.

A exceção são as **cauções**: o Encontro de Contas com os sócios mostra-as **à parte**, porque é dinheiro do evento que está retido e ainda vai voltar. Esse valor não é para prometer ao sócio.

Na lista de transações, a transitória aparece com a etiqueta **🔄 Transitória**; ao passar o rato lê-se que não impacta o resultado do evento.

---

## Os sete motivos

```ajuda
id: transitorias.motivos
tooltip: "Há sete motivos: Caução / garantia, Repasse a terceiro, Entrada a repassar, Empréstimo ao sócio, Aporte do sócio, Carga de cartão e Extra do Sócio. Toda a transitória tem motivo; sem motivo não se grava."
ecras: [nova-transacao.transitoria, editar-transacao.transitoria]
perfis: [editor, manager, admin, accountant]
fontes: [D-ERP80, transitory-reason]
termos: [motivo da transitória, transitória sem motivo, porquê transitória, caução da sala, garantia, repasse ao promotor, TPA do bar, cashless, carga do cartão, aporte, empréstimo ao sócio, escolher motivo]
```

| Motivo | Quando se usa | Quem marca | Rubrica típica |
|---|---|---|---|
| **Caução / garantia** | caução da sala, garantia que vai ser devolvida | à mão | a da despesa |
| **Repasse a terceiro** | dinheiro que sai para o dono dele (promotor, operador) | à mão ou pelo lançamento do extrato | a do movimento |
| **Entrada a repassar** | dinheiro que chega mas não é nosso: TPA do bar, cashless, vendas do operador | à mão ou pelo lançamento do extrato | a do movimento |
| **Empréstimo ao sócio** | dinheiro emprestado a/por sócio | o sistema, pela rubrica | 10.1.04 |
| **Aporte do sócio** | capital que o sócio mete | o sistema, pela rubrica | restantes 10.1 |
| **Carga de cartão** | as duas pernas da carga de um cartão pré-pago | o sistema | 10.3 |
| **Extra do Sócio** | despesa paga pela empresa que o sócio deve | o sistema, pela conversão ou pelo botão próprio | a da despesa |

Regras:

- **Toda a transitória tem motivo.** O sistema recusa gravar uma transitória sem motivo ("Escolhe o motivo da transitória.").
- Quando uma transação **deixa de ser transitória**, o motivo limpa-se sozinho.
- No **ramo 10.1** o motivo é derivado da rubrica e **sobrepõe-se** ao que o ecrã enviar: 10.1.04 → **Empréstimo ao sócio**; qualquer outra 10.1 → **Aporte do sócio**.

---

## As que o sistema marca sozinho

```ajuda
id: transitorias.automaticas
tooltip: "O sistema marca sozinho: aportes e empréstimos do sócio pela rubrica 10.1, as duas pernas da carga de cartão na 10.3, o espelho do aporte na conta corrente do sócio, e o Extra do Sócio pela conversão ou pelo seu botão."
ecras: [nova-transacao, cartoes.carga, contas.conta-espelho, editar-transacao.extra-socio]
perfis: [editor, manager, admin, accountant]
fontes: [transitory-reason, card-sessions, settlement-transfer-pair, partner-advance-expenses]
termos: [transitória automática, aporte, dinheiro do sócio, empréstimo, carga do cartão, carregar cartão, conta espelho, espelho do aporte, ramo 10.1, capital]
```

- **Aporte e empréstimo do sócio** — qualquer transação numa rubrica 10.1 é transitória por regra. No lançamento a partir do extrato aparece a nota "Movimento de capital (ramo 10.1) — transitória por regra" e o interruptor fica fixo.
- **Carga de cartão** — a carga gera um par de movimentos na 10.3: a saída da conta da empresa e a entrada no cartão. A perna de entrada é criada quando a saída é liquidada. As duas ficam com o motivo **Carga de cartão**.
- **Espelho do aporte** — o aporte lançado gera automaticamente o seu espelho na conta corrente do sócio (conta espelho). Herda a transitória; não se digita.
- **Extra do Sócio** — só nasce pela conversão no modal de edição ou pelo botão **🧳 Extra do Sócio** na criação. Nunca pelo selector de motivo manual.

---

## As que se marcam à mão

```ajuda
id: transitorias.manuais
tooltip: "Na nova transação use o atalho Caução / Transitória; na edição, o interruptor Transitória. Em ambos o Motivo da transitória é obrigatório (seis opções, sem Extra do Sócio). No lançamento do extrato, a caixa Transitória (a repassar) escolhe o motivo pelo sentido."
ecras: [nova-transacao.transitoria, editar-transacao.transitoria, extrato.lancar-linha]
perfis: [editor, manager, admin]
fontes: [D-ERP80, transitory-reason]
termos: [marcar transitória, caução da sala, garantia, repasse ao promotor, TPA do bar, cashless, entrada a repassar, lançar do extrato, transitória a repassar, como marco transitória]
```

**Nova transação.** O atalho **🛡️ Caução / Transitória** (admin e manager) marca a despesa como transitória: "não compõe o resultado do evento". Por baixo aparece o **Motivo da transitória**, com "Escolher motivo…" e seis opções — Caução / garantia, Repasse a terceiro, Entrada a repassar, Empréstimo ao sócio, Aporte do sócio, Carga de cartão. O Extra do Sócio não está na lista: tem o seu próprio botão. Uma caução nunca rateia: com o atalho ligado vai para o Master.

Se a caução foi desembolsada por um sócio, liquide-a depois no modal de pagamento com a forma "Pago pelo Sócio".

**Editar transação.** O interruptor **🔄 Transitória**, com o mesmo campo **Motivo da transitória \*** obrigatório.

**Lançar a partir da linha do extrato bancário.** A caixa **Transitória (a repassar) — não entra no resultado**: "para dinheiro de terceiros que passa pela conta e vai ser repassado". O motivo vem do sentido da linha:

- linha de **entrada** → **Entrada a repassar**;
- linha de **saída** → **Repasse a terceiro**.

Uma linha lançada como transitória nunca fica guardada como regra para as seguintes.

---

## Extra do sócio

```ajuda
id: transitorias.extra-do-socio
tooltip: "Extra do Sócio: a empresa paga, o sócio deve, e abate no acerto. É sempre transitória. Se só parte da fatura é extra, a fatura reparte-se em duas, nunca se duplica. Nunca converter uma filha de rateio em extra."
ecras: [nova-transacao.extra-socio, editar-transacao.extra-socio, editar-transacao.reverter-extra]
perfis: [manager, admin]
fontes: [partner-advance-expenses, D-ERP21, D-ERP22, D-ERP24]
termos: [extra do sócio, extra, dinheiro do sócio, sócio deve, hotel do sócio, passagem do sócio, extra parcial, reverter extra, converter em extra, abate no acerto]
```

A empresa paga uma despesa que é do sócio (hotel, passagem, traslado). O sócio **deve** esse valor e ele **abate** no acerto. É sempre transitória e fica sempre ligada a um evento.

- **Na criação:** botão **🧳 Extra do Sócio** e escolha do sócio.
- **Na edição:** bloco **🧳 Converter em Extra do Sócio**.

**Total ou parcial — a fatura reparte-se, não se duplica.** Com **Apenas parte da fatura é extra do sócio**, a fatura parte-se em duas transações do mesmo grupo de fatura: a principal fica despesa normal do evento (entra no DRE e no BP, com linha do BP) e uma irmã transitória leva a parte do sócio. A soma das duas é o total da fatura.

**Reversão.** Pode reverter-se o total ou só uma parte. Quando a transação está **aprovada** ou **paga**, reverter obriga a escolher uma **linha do BP**: a despesa volta a consumir verba. Numa fatura já repartida, o botão **Remover Extra do Sócio desta fatura** junta a irmã de volta à principal.

⚠️ **Nunca converter uma filha de rateio em Extra do Sócio.** Lance a parte do sócio como transação própria no evento dele, com o **mesmo nº de fatura**. Com rateio ligado, o botão do extra fica desativado.

O acerto completo está no capítulo Fecho do evento (`fecho.encontro-de-contas`) e terá secção própria no futuro capítulo Sócios.

---

## Onde aparecem e onde não aparecem

```ajuda
id: transitorias.onde
tooltip: "Aparecem nas Transações com a etiqueta 🔄 Transitória (ou 🧳 Extra Sócio), no Extrato da conta e na aba Sócios (cauções e extras). Não entram no Fecho, DRE, BP, Previsão vs Real nem no custo do evento."
ecras: [transacoes.lista, extrato.linha, evento.socios]
perfis: [editor, manager, admin, accountant, partner]
fontes: [transitory-reason, partner-advance-expenses]
termos: [onde vejo transitória, não aparece no fecho, fora do DRE, não entra no resultado, caução devolvida, repasse feito, quando volta a caução, conta transitória]
```

**Aparecem:**

- **Transações** — etiqueta **🔄 Transitória**, ou **🧳 Extra Sócio** no caso do extra;
- **Extrato** da conta — movem o saldo como qualquer movimento;
- aba **Sócios** do evento — cauções à parte e extras a abater.

**Não entram:** Fecho, DRE, BP, Previsão vs Real, custo do evento.

**Como "voltam".** A caução devolvida, o repasse feito, a entrada a repassar liquidada: a transitória fica **paga** e o dinheiro sai (ou volta) pela conta. Nunca se "converte" em receita.

---

## Erros comuns

```ajuda
id: transitorias.erros-comuns
tooltip: "Erros frequentes: lançar um repasse como despesa do evento, marcar transitória sem motivo, converter filha de rateio em extra, tirar a transitória a uma despesa aprovada sem linha do BP, prometer ao sócio o saldo com cauções, lançar aporte como receita, lançar o TPA do bar como receita."
ecras: [nova-transacao, editar-transacao, extrato.lancar-linha, evento.socios]
perfis: [editor, manager, admin]
fontes: [transitory-reason, partner-advance-expenses, D-ERP22]
termos: [erro transitória, transitória sem motivo, custo inflado, TPA do bar, cashless, aporte como receita, caução da sala, repasse ao promotor]
```

| Erro | Consequência | Correto |
|---|---|---|
| Lançar um repasse como despesa do evento | Custo do evento inflado | Transitória com motivo **Repasse a terceiro** |
| Marcar transitória sem motivo | O sistema recusa gravar | Escolher o **Motivo da transitória** |
| Converter uma filha de rateio em Extra do Sócio | Rateio e BP do Master deixam de bater | Transação própria no evento do sócio, mesmo nº de fatura |
| Tirar a transitória a uma despesa aprovada sem linha do BP | Não grava: a despesa passa a consumir verba | Escolher a linha do BP no diálogo |
| Prometer ao sócio o saldo que inclui cauções | Promete-se dinheiro ainda retido | Falar do operacional; as cauções à parte |
| Lançar o aporte do sócio como receita | Resultado do evento falso | Rubrica 10.1 — fica transitória sozinho |
| Lançar o TPA do bar como receita da empresa, quando é do operador | Receita inflada | Transitória com motivo **Entrada a repassar** |

---

## Vocabulário da equipa

```ajuda
id: transitorias.vocabulario
tooltip: "Transitória ou passa-por: dinheiro que só passa pela conta. Caução: garantia que volta. Repasse: dinheiro entregue ao dono. Entrada a repassar: chega mas não é nosso. Aporte: capital do sócio. Extra do sócio: o sócio deve. Carga de cartão: par 10.3. Conta espelho: conta corrente do sócio."
ecras: [transacoes.lista, evento.socios]
perfis: [editor, manager, admin, accountant, partner]
fontes: [transitory-reason, partner-advance-expenses, card-sessions, settlement-transfer-pair]
termos: [transitória, passa-por, só passa pela conta, caução, garantia, repasse, entrada a repassar, aporte, extra do sócio, carga do cartão, conta espelho, dinheiro do sócio]
```

| Palavra da equipa | O que é no sistema |
|---|---|
| **transitória** | movimento que muda o saldo da conta mas não é receita nem custo |
| **passa-por**, **só passa pela conta** | o mesmo que transitória |
| **caução**, **garantia** | motivo **Caução / garantia**; volta quando é devolvida |
| **repasse** | motivo **Repasse a terceiro**: saída para o dono do dinheiro |
| **entrada a repassar** | dinheiro de terceiros que chega (TPA do bar, cashless, vendas do operador) |
| **aporte** | capital do sócio, rubrica 10.1 — **Aporte do sócio** |
| **extra do sócio** | despesa paga pela empresa que o sócio deve; abate no acerto |
| **carga de cartão** | o par de movimentos 10.3 que carrega um cartão pré-pago |
| **conta espelho** | a conta corrente do sócio, onde o aporte aparece derivado, nunca digitado |

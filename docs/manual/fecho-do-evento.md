---
capitulo: fecho-do-evento
titulo: Fecho do evento
modulo: erp
atualizado: 2026-09-20
perfis: [manager, admin, editor, partner]
rotas: [/eventos/:id, /bilheteiras, /cartoes, /camarim, /contas, /relatorios/extrato]
fontes: [D-ERP10, D-ERP13, D-ERP14, D-ERP15, D-ERP20, D-ERP22, D-ERP23, D-ERP26, D-ERP69, D-ERP113, D-ERP114, PROC-fecho-evento, event-settlements, partner-settlement, settlement-transfer-pair, fecho-filter-parity, event-cost-basis, event-revenue-basis, ticket-office-reconciliation, card-sessions, camarim-integration-lock, custo-partilhado-terceiros, partner-advance-expenses]
---

# Fecho do evento

Fechar um evento é **parar de o alimentar**, conferir o que entrou e o que saiu, acertar com os sócios e trancar o resultado. São seis passos, sempre pela mesma ordem. Saltar um passo não dá erro no momento — dá números diferentes mais tarde, quando já houver um documento na mão do sócio.

---

## A ordem do fecho

```ajuda
id: fecho.ordem
tooltip: "Pela ordem: fechar sessões de camarim e cartões, zerar as contas de circuito, conferir receitas e custos, fazer o Encontro de Contas até C1 e C2 darem 0,00 €, selar o fechamento e só depois concluir o evento."
ecras: [evento.fecho, evento.socios, evento.concluir]
perfis: [manager, admin]
fontes: [PROC-fecho-evento, event-settlements]
termos: [fechar evento, fecho do evento, fechamento, concluir evento, como fecho o evento, ordem do fecho, passos do fecho, encerrar evento, fechar a turnê]
```

![Sequência do fecho do evento](img/fecho-sequencia.svg)

1. **Fechar as sessões abertas** — camarim por integrar e sessões de cartão.
2. **Zerar as contas de circuito** — acerto com promotores e coprodutores.
3. **Conferir receitas e custos** na aba **Fecho**.
4. **Encontro de Contas** com os sócios, até as duas conferências darem **0,00 €**.
5. **Selar o fechamento** e exportar os PDFs **depois** de selar.
6. **Concluir o evento**, que bloqueia alterações.

Numa turnê, o fecho faz-se no **Master**: é lá que vivem os sócios, o Encontro de Contas e o selo. As cidades entram pela quebra por cidade.

---

## 1. Sessões abertas e circuitos

```ajuda
id: fecho.bloqueios
tooltip: "Camarim por integrar e sessões de cartão abertas impedem o fecho: é custo que ainda vai cair no evento. Contas de circuito com posição diferente de zero também impedem — falta o acerto com terceiros."
ecras: [evento.concluir, camarim.sessao, cartoes.sessao, contas.conta-circuito]
perfis: [manager, admin]
fontes: [card-sessions, camarim-integration-lock, custo-partilhado-terceiros, D-ERP69]
termos: [não consigo fechar, não deixa concluir, bloqueio do fecho, sessão aberta, camarim por integrar, cartão aberto, conta de circuito, posição do circuito, blocker]
```

Ao carregar em **Concluir evento** abre o diálogo **Concluir evento**, que verifica o estado real antes de gravar:

- **Sessões de cartão abertas** → não fecha. Feche a sessão em **Cartões** (saldo real conferido e, se houver diferença, acerto de fecho com nota).
- **Sessões de camarim por integrar** → não fecha. Integre a sessão em **Camarim**: é a integração que cria as transações do evento. Depois de integrada, a sessão fica só de leitura.
- **Despesas pendentes ou atrasadas** → **não bloqueia**, avisa. Para avançar tem de marcar a caixa "Fechar mesmo assim". A decisão fica registada na planilha do evento.
- **Contas de circuito com posição diferente de zero** → não fecha. Uma posição aberta significa que o acerto com o terceiro não está feito: ou falta a devolução, ou falta passar a quota da MP às rubricas. A tolerância é de 0,01 €. Numa turnê, o circuito é comum: contam as contas usadas pelo Master e por todas as cidades.

⚠️ A recusa por **conta de circuito** vem da base de dados, mas o diálogo ainda **não lista** as contas em causa: aparece só a mensagem de recusa. Até isso mudar, confirme a posição em **Contas** (contas de circuito) ou no **Extrato**.

---

## 2. Que números o fecho usa

```ajuda
id: fecho.numeros
tooltip: "Receita = bilheteira das vendas + receitas lançadas, sem duplicar a rubrica 1.1.01. Custo = BP aprovado mais o excedido rubrica a rubrica, ou só o realizado, conforme o critério escolhido. Contam apenas transações aprovadas e pagas."
ecras: [evento.fecho, evento.fecho.criterio, evento.resumo]
perfis: [manager, admin, editor]
fontes: [fecho-filter-parity, event-cost-basis, event-revenue-basis, D-ERP113, D-ERP114]
termos: [números do fecho, receita do fecho, custo do fecho, previsto mais excedido, realizado, base de cálculo, porque não bate, diferença entre cards e fecho, resultado do evento]
```

**Só entra o que é realidade contabilística.** Contam as transações **aprovadas** e **pagas**. Ficam fora, em qualquer vista de fecho: transitórias (cauções), linhas excluídas do resultado, transações estornadas e linhas mascaradas. Pendentes, rascunhos e recusados **não entram**.

**Receita.** Bilheteira a partir das vendas registadas, mais as transações de receita. Quando o evento tem vendas registadas, as transações da rubrica **1.1.01 Bilheteira** são o mesmo dinheiro e **não se somam** — senão a bilheteira contava duas vezes. A receita é sempre **sem IVA**.

**Custo.** Há um só critério por evento, partilhado entre o card da capa e o Fecho — muda num ecrã, muda no outro:

| Critério | O que soma |
|---|---|
| **Realizado** | só as transações |
| **Previsto + excedido** | o previsto aprovado no BP **mais** o que já foi gasto acima do previsto, rubrica a rubrica |

O **excedido** entra sempre na base "Previsto + excedido" — não é um botão. É sinal de BP desactualizado e deve tender para zero; veja-o na vista **Previsão vs Real** do BP.

**Overhead** (custos de estrutura da empresa imputados ao evento) entra por interruptor, ligado por omissão no Fecho. A vista da empresa é **sem** overhead; a vista do sócio é **com**.

**Depois do evento, o previsto deixa de mandar.** Passada a última data (ou com o evento concluído), bilheteira e A&B passam a valer pelo real. Onde não há real nem módulo, a linha do BP alimenta o valor — a linha do módulo **substitui** a do BP, nunca soma.

---

## 3. Encontro de Contas

```ajuda
id: fecho.encontro-de-contas
tooltip: "O Encontro de Contas reparte o resultado pelos participantes do fechamento: quota, despesas pagas pelo sócio, extras e cauções. C1 confere que as partes mais o residual dão o resultado; C2 confere que as percentagens fecham."
ecras: [evento.socios, evento.socios.fechamentos, evento.socios.encontro-de-contas]
perfis: [manager, admin, partner]
fontes: [event-settlements, partner-settlement, D-ERP10, D-ERP13, D-ERP14, D-ERP23]
termos: [encontro de contas, acerto, acerto com sócios, acerto final, distribuição, quota, parte do sócio, quanto recebe o sócio, quanto pagamos ao sócio, lucro do sócio, prejuízo do sócio, conta espelho]
```

![Cascata de fechamentos](img/fecho-cascata.svg)

Cada evento tem um **fechamento raiz** ("Fechamento do evento") com os seus participantes: a **casa** (a MP) e os **sócios**. O fechamento pode ter **filhos em cascata** — um fechamento filho recebe uma **quota** (uma percentagem do resultado do pai) e junta-lhe as linhas que lhe foram marcadas em exclusivo. As linhas marcadas para um filho saem do resultado da raiz: não contam duas vezes.

**O que compõe o acerto de cada sócio:**

- **Quota** — a percentagem dele no resultado do fechamento. O resultado negativo usa a percentagem de prejuízo, que pode ser diferente da de lucro.
- **Despesas pagas pelo sócio** — despesas do evento adiantadas do bolso do sócio. Não consomem verba do BP nem criam despesa nova: marcam quem desembolsou e viram **crédito** a favor dele.
- **Extras do sócio** — despesas pessoais do sócio pagas pela empresa. **Abatem** o que ele tem a receber.
- **Cauções (transitórias)** — dinheiro retido fora do resultado (caução de recinto, por exemplo). Aparecem à parte, porque só se liquidam quando voltam.

Por isso o card de cada sócio mostra **Operacional** (liquidável agora) e **Saldo com cauções** (só depois de as cauções voltarem). Não prometa ao sócio o saldo com cauções.

**Base de IVA.** Cada participante tem a sua: sede fiscal em Portugal acerta **sem IVA**, sede no Brasil acerta **com IVA**; a receita é sempre sem IVA. É critério contratual, não uma vista — o botão c/IVA · s/IVA dos cards é só apresentação e não deve alterar o acerto.

**As duas conferências:**

- **C1** — soma das partes pagas mais o residual da MP **igual** ao resultado do evento.
- **C2** — o resto dá **zero**. Diferente de zero significa percentagens que não fecham; corrija antes de avançar.

---

## 4. Selar o fechamento

```ajuda
id: fecho.selar
tooltip: "Selar tranca o fechamento: guarda uma versão do Business Plan e o resultado do momento. Participantes, quotas e filhos deixam de se alterar. Exportar os PDFs depois de selar. Reabrir exige motivo e fica registado."
ecras: [evento.socios.fechamentos, evento.socios.selo]
perfis: [manager, admin]
fontes: [event-settlements, PROC-fecho-evento]
termos: [selar, selar fechamento, selo, trancar fecho, reabrir fechamento, valor selado, desvio do selo, pdf do sócio, documento do sócio]
```

Quando **C1 e C2 dão 0,00 €**, e **antes** de mostrar qualquer documento ao sócio:

1. Na aba **Sócios**, no painel dos fechamentos, carregue em **Selar**.
2. Escreva a nota (opcional): a planilha ou a versão que serviu de base.
3. Confirme a marca **"Selado em … por …"** e o **valor selado**.
4. Exporte os PDFs **depois** de selar.

Selar cria uma **versão do Business Plan** com o nome do selo e guarda o resultado do momento. Se mais tarde o valor ao vivo divergir do valor selado, aparece o **desvio** — é informação interna para perceber a causa e **nunca** sai em documento de sócio.

Selado, o fechamento fica **só de leitura**: participantes, quotas e filhos não se alteram. Para corrigir, use **Reabrir** com **motivo obrigatório** (fica registado), corrija e **sele outra vez**. Um fechamento selado não pode ser escolhido como pai de um fechamento novo.

---

## 5. Concluir o evento

```ajuda
id: fecho.concluir
tooltip: "Concluir passa o evento a Concluído e bloqueia alterações. Só um administrador pode reabrir. Faça-o depois de selar o fechamento, nunca antes."
ecras: [evento.concluir, evento.estado]
perfis: [manager, admin]
fontes: [PROC-fecho-evento, card-sessions]
termos: [concluir evento, evento concluído, bloquear evento, reabrir evento, desbloquear evento, estado do evento]
```

**Concluir evento** passa o estado a **Concluído** e mostra o aviso "Evento Concluído — Bloqueado para alterações". Só um **administrador** pode reabrir.

Antes de concluir, confirme a lista curta:

- [ ] Receitas conferidas (bilheteira sem duplicar a rubrica 1.1.01)
- [ ] Custo = BP aprovado + excedido, ou realizado, conforme o critério
- [ ] Sem taxas públicas com IVA no BP (taxas públicas não levam IVA)
- [ ] Rubricas sem transação explicadas — quem devia pagar, e se pagou
- [ ] Sessões de camarim integradas e sessões de cartão fechadas
- [ ] Contas de circuito a zero
- [ ] Fecho de bilheteira feito e a transferência do líquido registada
- [ ] Fechamento **selado** e PDFs exportados depois do selo

---

## 6. Bilheteira e dinheiro retido

```ajuda
id: fecho.bilheteira
tooltip: "O fecho de bilheteira liga as despesas pagas pelo recinto, apura o líquido e registra a transferência para a conta da empresa. O retido só deixa de ser retido quando a transferência existe."
ecras: [bilheteiras.fecho, bilheteiras.saldo, evento.bilheteira]
perfis: [manager, admin]
fontes: [D-ERP15, D-ERP20, settlement-transfer-pair, ticket-office-reconciliation]
termos: [fecho de bilheteira, bilheteira, recinto, retido, base a transferir, transferência do fecho, líquido da bilheteira, adiantamento de bilheteira, estorno do fecho]
```

**O retido em bilheteira não é caixa da empresa.** É dinheiro que existe, mas ainda está no operador ou no recinto. A leitura é sempre a mesma fórmula:

> vendas − despesas − transferências − adiantamentos ± outros movimentos = **retido**

No fecho de bilheteira do evento: ligam-se as despesas que o recinto pagou, apura-se o **líquido** (ajustável, com justificação), abatem-se os **adiantamentos** já recebidos e registra-se a **transferência** do líquido para a conta da empresa. A transferência é um par de movimentos na rubrica **10.3 Transferências Internas** — sai de uma conta e entra na outra, e não toca no resultado do evento. Só um administrador estorna um fecho.

Numa turnê, uma despesa rateada abate-se **uma só vez**, pela transação-mãe. A lista mostra "fatura completa · parte deste evento" para se perceber que só uma parte é do evento à frente.

---

## Erros comuns

```ajuda
id: fecho.erros-comuns
tooltip: "Os erros mais frequentes: exportar PDFs antes de selar, prometer ao sócio o saldo com cauções, concluir com sessões abertas, e comparar o Lucro do card com o Resultado do Encontro de Contas."
ecras: [evento.fecho, evento.socios, evento.concluir]
perfis: [manager, admin]
fontes: [fecho-filter-parity, partner-settlement, event-cost-basis]
termos: [erro no fecho, fecho errado, números não batem, corrigir fecho, dúvida no fecho, diferença no acerto]
```

| Erro | Consequência | Correto |
|---|---|---|
| Exportar o PDF do sócio antes de selar | O documento deixa de ter um valor trancado por trás | Selar primeiro, exportar depois |
| Prometer ao sócio o **Saldo com cauções** | Promete-se dinheiro que ainda está retido | Falar do **Operacional** e explicar as cauções à parte |
| Concluir com sessões de camarim ou cartão abertas | Custo que aparece depois do fecho | Integrar/fechar as sessões primeiro |
| Comparar o **Lucro** do card com o **Resultado** do Encontro de Contas | Respondem a perguntas diferentes; o badge "≠ fecho" avisa | A base contratual do sócio é o Encontro de Contas |
| Usar o botão c/IVA · s/IVA para "arrumar" o acerto | O botão é vista; a base do sócio é contratual | Corrigir a base de IVA do participante |
| Contar bilheteira das vendas **e** as transações da rubrica 1.1.01 | Receita duplicada | Com vendas registadas, a rubrica 1.1.01 não soma |
| Fechar com a conta de circuito diferente de zero | Custo da MP ou devolução por lançar | Fazer o acerto com o terceiro antes |
| Somar as cidades e esquecer o Master | O total fica abaixo do resumo | A quebra por cidade tem de incluir a linha "Master / Geral" |

---

## Vocabulário da equipa

```ajuda
id: fecho.vocabulario
tooltip: "Fechamento é o nó que reparte o resultado; acerto e encontro de contas são o mesmo passo; cascata é a árvore de fechamentos; quota é a parte que desce do pai; extra abate ao sócio; ajuste é a conciliação de saldo de um cartão."
ecras: [evento.socios, evento.fecho]
perfis: [manager, admin, editor, partner]
fontes: [event-settlements, partner-settlement, card-sessions, settlement-transfer-pair]
termos: [fechamento, apuramento, acerto, encontro de contas, cascata, quota, extra, extra do sócio, ajuste, base a transferir, conta espelho, retido, casa]
```

| Palavra da equipa | O que é no sistema |
|---|---|
| **fechamento** | o nó que reparte o resultado; a raiz chama-se "Fechamento do evento" (o termo antigo era "apuramento") |
| **acerto**, **encontro de contas** | o mesmo passo: repartir o resultado pelos participantes e ver quem paga a quem |
| **cascata** | a árvore de fechamentos: raiz, filhos, netos |
| **quota** | a parte do resultado do pai que desce a um fechamento filho |
| **extra** | despesa pessoal do sócio paga pela empresa; abate ao que ele tem a receber |
| **ajuste** | a conciliação de saldo no fecho de uma sessão de cartão; não é receita nem despesa do evento |
| **base a transferir** | o líquido do fecho de bilheteira que sai do recinto para a conta da empresa |
| **conta espelho** | a conta corrente de um sócio, onde o aporte em espécie é **derivado** do que foi lançado, nunca digitado |
| **casa** | a participação da MP no fechamento, o que sobra depois das partes dos sócios |

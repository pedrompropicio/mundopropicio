---
capitulo: rateios
titulo: Rateios
modulo: erp
atualizado: 2026-09-22
perfis: [editor, manager, admin, accountant]
rotas: [/transacoes, /eventos/:id, /faturas-plataformas, /contas, /relatorios/extrato]
fontes: [D-ERP20, D-ERP26, D-ERP32, D-ERP69, D-ERP70, D-ERP72, D-ERP73, D-ERP76, D-ERP77, PROC-rateio-dayoffs-turne, PROC-fatura-rateada-com-terceiros, custo-partilhado-terceiros, master-split-rateio-source-of-truth, rateio-mae-filhas-agregacao, ads-invoices, overhead-allocations, bp-linha-obrigatoria]
---

# Rateios

Um rateio é uma despesa que não pertence a um só evento. O sistema tem **cinco formas** de a tratar, e cada uma serve um caso diferente. Escolher a forma certa no lançamento evita correções no fecho.

---

## Qual uso?

```ajuda
id: rateios.escolher
tooltip: "Só da MP e entre cidades do mesmo Master em partes iguais → lance no Master. Eventos diferentes ou partes desiguais → Dividir por vários eventos. Parte é de outro promotor → Custo partilhado com terceiros."
ecras: [nova-transacao]
perfis: [editor, manager, admin]
fontes: [D-ERP76, D-ERP69]
termos: [rateio, ratear, dividir despesa, dividir custo, dividir fatura, repartir custo, que rateio uso, como dividir]
```

![Escolha do tipo de rateio](img/rateios-escolher.svg)

Responda a três perguntas, por esta ordem:

1. **Parte do custo é de outra entidade** (outro promotor, coprodutor, cidade que não é nossa)?
   → Sim: **Custo partilhado com terceiros**.
2. **É uma fatura de publicidade Meta ou Google?**
   → Sim: **Faturas Ads**. O rateio pelos eventos faz-se a partir do PDF.
3. **É só da MP. É entre cidades do mesmo Master e em partes iguais?**
   → Sim: **Master de várias cidades**.
   → Não (eventos diferentes, ou cidades em partes desiguais): **Vários eventos**.

Há ainda os **custos de estrutura da empresa** (assessoria, jurídico, escritório) atribuídos a um evento com sócios. Esses não são transações: são **Rateios de Overhead**, no próprio evento.

| Caso | Onde se faz | Transações criadas | Linha do BP |
|---|---|---|---|
| Master de várias cidades | Nova Transação, evento = Master | 1, no Master | a do Master |
| Vários eventos | Nova Transação → Dividir por vários eventos | 1 mãe sem evento + 1 por evento | uma por evento |
| Custo com terceiros | Nova Transação → Custo partilhado com terceiros | 1 ou 2 (parte MP + parte de terceiros) | só na parte da MP |
| Faturas Ads | Faturas Ads | 1 mãe + 1 por evento | uma por evento |
| Overhead | Evento → Rateios de Overhead | nenhuma | opcional (BP de overhead) |

---

## 1. Master de várias cidades

```ajuda
id: rateios.master
tooltip: "Custo da tour inteira, dividido por igual pelas cidades: lance uma vez no Master, na linha do BP do Master. Cada cidade vê a sua parte nos relatórios — não se criam transações nas cidades."
ecras: [nova-transacao.evento-master, nova-transacao.confirmar-rateio-master, nova-transacao.dialogo-tour-ou-cidade]
perfis: [editor, manager, admin]
fontes: [D-ERP76, D-ERP72, D-ERP73, master-split-rateio-source-of-truth]
termos: [turnê, tour, tourné, master, cidades, dividir pelas cidades, custo da tour, rateio master, dividir igual pelas datas, voo da equipa, tráfego da turnê, custo da tour ou desta cidade]
```

![Rateio igual de um custo lançado no Master](img/rateios-master.svg)

**Quando:** a despesa serve a turnê inteira e reparte-se **em partes iguais** pelas cidades (ex.: voos da equipa, tráfego pago da turnê, rateio de day-offs previsto no Master).

**O que acontece:** fica **uma única transação no Master**, ligada à linha do BP do Master. A divisão pelas cidades é **virtual**: os relatórios (DRE, BP, acerto com sócios) mostram a cada cidade a sua parte ÷N. Não existem transações nas cidades.

### Quem lança

1. Em **Nova Transação**, escolha como evento o **Master** da turnê (não uma cidade).
2. Na tabela **BP — Despesas previstas**, clique na **linha do Master** que esta despesa consome.
3. Preencha o resto como numa despesa normal e grave.
4. Aparece o aviso **"Lançamento master (rateio) — Este valor será rateado igualmente por N datas nos relatórios DRE e BP"**. Confirme com **Confirmar Rateio**. Se afinal a despesa é de uma cidade, use **Voltar e Escolher Data**.

**Se começou pela cidade:** se escolheu uma cidade e a rubrica só existe no BP do Master, abre o diálogo **"Custo da tour ou desta cidade?"**:

- **Custo da tour — lançar no Master** muda o evento para o Master e liga à linha do Master. É o caso desta secção.
- **Exclusivo deste evento** mantém a despesa na cidade. Se a cidade não tem essa rubrica no BP, a transação fica marcada como **Fora do BP**.

### Quem aprova e fecha

- A transação do Master segue a regra de qualquer despesa de evento com BP: **sem linha do BP não se aprova**.
- Para ver quanto cabe a cada cidade, use os relatórios da cidade (DRE, BP). A parte vinda do Master aparece aí.
- Se a repartição tiver de ser **desigual** entre cidades, este não é o caso certo. Use **Vários eventos**.

---

## 2. Vários eventos

```ajuda
id: rateios.varios-eventos
tooltip: "Reparte uma fatura por eventos diferentes (ou cidades em partes desiguais). Cria uma transação por evento, cada uma com a linha do BP desse evento. O pagamento sai uma vez, pela transação-mãe."
ecras: [nova-transacao.dividir-varios-eventos, nova-transacao.split-linha-bp, nova-transacao.split-aviso-master]
perfis: [editor, manager, admin]
fontes: [D-ERP72, D-ERP73, D-ERP76, D-ERP70, D-ERP26]
termos: [vários eventos, varios eventos, multi-evento, split, dividir por eventos, campanha de vários shows, fatura de vários eventos, rateio personalizado, percentagem por evento, transação mãe, partes do rateio]
```

![Divisão de uma fatura por vários eventos](img/rateios-varios-eventos.svg)

**Quando:** a mesma fatura cobre **eventos diferentes** (ex.: uma campanha que divulgou três espetáculos), ou cidades do mesmo Master em **partes desiguais**.

**O que acontece:** o sistema cria uma **transação-mãe sem evento** (é ela que é paga e move a conta) e **uma transação por evento** (as partes), cada uma com a percentagem e a linha do BP do seu evento. Um Master pode ser um dos destinos: nesse caso a parte dele fica no Master, e não nas cidades.

### Quem lança

1. Em **Nova Transação**, preencha categoria, fornecedor e valor da **fatura inteira**.
2. Clique em **💡 Dividir por vários eventos**. O painel **Rateio Multi-Evento** abre.
3. Em **Adicionar evento…**, junte os eventos (mínimo 2).
4. Escolha como dividir:
   - **Iguais**: o sistema calcula as percentagens e volta a calcular quando junta ou retira eventos;
   - **Personalizado**: indique cada parte em **%** ou em **€**. O total tem de dar 100 %.
5. Em cada evento, escolha a **Linha do BP** dessa parte. A lista mostra o previsto e o disponível de cada linha.
   - Se o evento não tem linha nessa rubrica, aparece **"sem linha nesta rubrica — resolve-se na aprovação"**. A parte grava-se como **pendente**.
6. Grave.

**Aviso "Esta rubrica também tem linha no BP do Master":** é informação, não bloqueia. Se o custo é da tour inteira e em partes iguais, é o caso **Master de várias cidades**. Se é de cada cidade, siga e escolha a linha de cada uma.

⚠️ **Não se combina** com **Custo partilhado com terceiros** nem com **Extra do Sócio**. Faça primeiro a divisão pelos eventos. Depois lance a parte de terceiros, ou a do sócio, como transação própria, com o mesmo fornecedor e o mesmo nº de fatura.

### Quem aprova e fecha

- **Confirme que cada parte tem linha do BP antes de aprovar.** ⚠️ Hoje o sistema **ainda não obriga** a linha nas partes de um rateio: uma parte sem linha pode ser aprovada. A regra decidida é "sem linha não se aprova" (D-ERP73), mas a trava ainda não a aplica.
- **Paga-se a mãe, nunca as partes.** As partes não têm conta e não aparecem para pagamento. O pagamento da mãe desce às partes.
- **Relatórios.** Nos relatórios da **empresa** conta a mãe. Nos relatórios de **evento** contam as partes. Nunca as duas ao mesmo tempo (D-ERP70).
- **Fecho de bilheteira.** Se a despesa foi paga pela bilheteira, abate-se **uma vez, pela mãe**. A lista mostra "fatura completa · parte deste evento" para se ver que só uma parte é deste evento (D-ERP20).
- **Parcelas não são rateio.** Uma fatura em prestações também tem transações ligadas, mas cada prestação é um pagamento real, na sua data e da sua conta, e todas herdam a linha do BP da primeira. Não confunda as duas coisas ao conferir (D-ERP26, D-ERP77).

---

## 3. Custo partilhado com terceiros

```ajuda
id: rateios.terceiros
tooltip: "A MP paga a fatura toda, mas parte é de outro promotor. Marque a conta de rateio de terceiros e indique a parte de terceiros: essa parte fica fora do resultado e passa a ser o que o terceiro nos deve."
ecras: [nova-transacao.custo-partilhado, editar-transacao.custo-partilhado, contas.conta-circuito, extrato.posicao-circuito, fecho.bloqueio-circuito]
perfis: [editor, manager, admin]
fontes: [D-ERP69, PROC-rateio-dayoffs-turne, PROC-fatura-rateada-com-terceiros, custo-partilhado-terceiros, D-ERP32]
termos: [day off, dayoff, day-off, day offs, dayoffs, folga, folga da turnê, dias sem show, hotel da folga, rateio day off, rateio com outros promotores, outro promotor, promotor de outra cidade, promotor de madrid, coprodutor, coprodução, parceiro, acerto com promotores, custo dividido com terceiros, conta de circuito, conta corrente do circuito, conta de rateio de terceiros, conta de rateio, posição do rateio, rateio com terceiros, adiantamento por conta de terceiros, devolução do promotor, onde fica o custo partilhado, não encontro o campo, não aparece o campo, campo não aparece, parte de terceiros não aparece, desdobrar fatura, desdobrar depois, editar parte de terceiros, terceiro opcional, contraparte, sem contraparte atribuída, quem deve, fatura desdobrada]
```

![Separação do custo da MP e da parte de terceiros](img/rateios-terceiros.svg)

**Quando:** a MP paga uma fatura em que **parte do custo é de terceiros**, que depois devolvem. O caso típico são os day-offs de turnê partilhados com os promotores de outras cidades, mas vale também para coprodutores e parceiros.

**A regra:** a fatura entra **uma só vez, pelo total**. A parte da MP é custo normal. A parte de terceiros **não é custo**: é um adiantamento, registado numa **conta de rateio de terceiros**. O saldo dessa conta é o que os terceiros nos devem (positivo) ou o que temos deles por aplicar (negativo). **No fim tem de estar a zero.**

### Antes de começar: a conta de rateio de terceiros

Uma conta por rateio (ex.: uma turnê). Em **Contas**, crie ou edite a conta e ligue **Conta de rateio de terceiros**. O ecrã propõe desligar "contabilística" e manter o controlo de saldo. Carregue em **Aplicar**. Uma conta de rateio de terceiros não pode ser, ao mesmo tempo, espelho de aporte de sócio.

⚠️ **Sem acesso a contas de rateio de terceiros, o bloco continua visível**, mas ao abrir explica que deve pedir acesso ao administrador.

### Onde fica o bloco

O bloco **🤝 Custo partilhado com terceiros** vive no **formulário da transação** — tanto ao criar como ao editar.

⚠️ **Não existe no ecrã de liquidação.** Ao registar um pagamento, o sistema pergunta apenas conta, data e valor. Quem o procurar aí não o encontra.

Dentro do formulário, três razões para parecer que não está lá:

- **nasce recolhido** — é uma barra clicável, que só abre já expandida se a transação já tiver conta de rateio marcada;
- **só aparece em despesas** — numa receita não é desenhado;
- **aberto, mostra só dois selectores** — o campo **Parte de terceiros** só nasce depois de escolher a conta de rateio, e só aceita escrita com o **Valor Base** já preenchido (até lá diz *"Preenche o Valor (€) da fatura primeiro"*).

### Quem lança

1. Em **Nova Transação** (despesa), escolha o evento e preencha o **Valor Base pelo total da fatura**. Escolha a linha do BP **clicando na tabela BP — Despesas previstas**.
2. Abra o bloco **🤝 Custo partilhado com terceiros**.
3. Em **Conta de rateio de terceiros**, escolha a conta de rateio. É este passo que faz aparecer o resto do bloco.
4. Em **Terceiro (opcional)**, decida pela regra da secção seguinte.
5. Em **Parte de terceiros (sobre a base s/IVA)**, escolha **%** ou **€**:
   - **com valor**: o sistema cria **duas transações no mesmo grupo de fatura**, a parte da MP (custo, com linha do BP) e a parte de terceiros (fora do resultado). O quadro "Como fica a repartição" mostra as duas;
   - **vazio**: a fatura inteira é de terceiros.
6. Antes de gravar, confirme o selo no canto do bloco: **"Fatura desdobrada"** quando a fatura ficou repartida, **"Parte de terceiros"** quando vai inteira para o rateio.
7. Grave. Na lista, a parte de terceiros aparece com o badge **🤝 Parte de terceiros**.

**Não sabe ainda quanto é da MP?** Lance o que sabe:

- **parte conhecida**: indique-a;
- **parte estimada**: lance a estimativa e corrija no acerto;
- **parte desconhecida**: deixe **Parte de terceiros** vazio. A fatura inteira fica como adiantamento.

⚠️ **Deixar a parte em branco por distracção não é neutro.** Com a conta escolhida e o campo vazio, a fatura **inteira** passa a ser de terceiros e o custo da MP desaparece do evento. O selo do cabeçalho é a verificação.

### Desdobrar só se faz na criação

Ao **editar** uma transação pode marcar a conta de rateio e atribuir o terceiro, mas **o campo Parte de terceiros não existe**: só consegue marcar a **linha inteira** como sendo de terceiros.

⚠️ **Uma fatura repartida tem de ser lançada desdobrada desde o início.** Se foi lançada inteira, não se corrige na edição: apaga-se e lança-se de novo. Se a linha já estiver ligada a uma linha do BP, essa ligação trava a eliminação e desfaz-se primeiro.

Marcar a conta de rateio numa transação **já paga** é permitido, e o adiantamento nasce no momento em que grava.

### O campo "Terceiro (opcional)"

O "Terceiro" é a **contraparte do adiantamento** — quem nos vai devolver aquele dinheiro. Quando a despesa é paga, o adiantamento criado na conta de rateio fica com esse nome na entidade.

O **saldo** do rateio é o mesmo com ou sem terceiro. O que muda é a **leitura**: o painel **Posição por contraparte** agrupa por entidade e mostra, por cada um, quanto foi adiantado, quanto devolveu e quanto falta. Sem terceiro, tudo cai em **"Sem contraparte atribuída"**.

O critério **não é o número de cidades**. É **quantos donos tem a parte de terceiros**:

| Situação | O que fazer |
|---|---|
| As outras cidades são **nossas** | Não é este caso. É **Vários eventos** — a conta de rateio não entra. |
| As outras cidades são de **promotores diferentes** | **Deixar vazio.** O sistema cria só **uma** perna de terceiros, e ela tem vários donos: um nome seria falso para os restantes. |
| As outras cidades são todas do **mesmo promotor** | **Pôr o nome dele**, ainda que sejam várias cidades. A posição do rateio passa a ser legível. |

⚠️ **A devolução tem de trazer o mesmo terceiro.** Se o adiantamento fica sem contraparte e a devolução vem com o nome do promotor, as duas caem em grupos diferentes: nenhum fica a zero, e o painel mostra um promotor a dever e um grupo anónimo a crédito. Só o total continua certo.

Quando o vazio é inevitável (vários donos), a regra prática é: **cada devolução traz o nome de quem pagou**. Lê-se então quanto foi adiantado sem dono e quanto já voltou de cada um.

É corrigível depois: o terceiro continua editável mesmo com a transação paga, e o adiantamento é reescrito ao gravar.

⚠️ **Linha do BP:** escolha-a na **tabela de previsões**. Se escolher só a categoria pelo selector, a parte da MP fica sem linha e a aprovação é recusada.

⚠️ **Fatura com várias taxas de IVA ("Dividir por IVA")**: a parte de terceiros só se indica em **%**, e aplica-se a cada linha de IVA. O modo **€** fica desactivado, por ser ambíguo entre as linhas.

⚠️ **Não se combina** com parcelas, com **Dividir por vários eventos** nem com **Extra do Sócio**. O ecrã explica o motivo quando o bloco fica indisponível.

### Quando o terceiro devolve

O dinheiro entra no banco como **transferência** da conta de rateio para a conta bancária, com o nome do terceiro na entidade. O saldo do rateio desce.

### Quando se sabe a parte verdadeira da MP

Faça um lançamento **por rubrica**, dentro do resultado e com a linha do BP respetiva, **pago pela conta de rateio**. O custo da MP sobe e o saldo do rateio desce no mesmo lançamento. É a **única** forma de passar valores do rateio para o resultado.

### Quem aprova e fecha

- **Posição do rateio.** Abra o extrato da conta de rateio. O cartão **Posição do rateio** e o painel **Posição por contraparte** mostram quanto foi adiantado, devolvido e em falta por terceiro. O que não tem terceiro atribuído aparece em "Sem contraparte atribuída".
- **Acerto final.** Passe às rubricas tudo o que já se sabe ser custo da MP, pago pela conta de rateio. Ajuste as linhas do BP ao real. Confira que a conta de rateio **fica a zero**.
- **Fecho do evento.** Se a conta de rateio ligada ao evento, ao Master ou às cidades não estiver a zero, o fecho **bloqueia**. ⚠️ O bloqueio só vê movimentos **com evento**: um lançamento do rateio sem evento não é apanhado. Confira sempre o extrato da conta.
- **Verba por usar.** As partes de terceiros não consomem verba, por isso não aparecem nesse painel.

---

## 4. Faturas Ads (Meta e Google)

```ajuda
id: rateios.faturas-ads
tooltip: "Faturas Meta e Google entram pelo PDF em Faturas Ads. O sistema reparte a fatura pelos eventos das campanhas; promoções e taxas sem campanha repartem-se na proporção da mídia de cada evento."
ecras: [faturas-ads.importar, faturas-ads.gerar]
perfis: [manager, admin, accountant]
fontes: [ads-invoices, D-ERP73]
termos: [meta, facebook, instagram, google ads, fatura meta, fatura google, tráfego pago, anúncios, ads, rateio de tráfego, campanha, pdf da fatura, gerar lançamentos]
```

![Fluxo de importação e rateio das Faturas Ads](img/rateios-faturas-ads.svg)

**Quando:** qualquer fatura de publicidade Meta ou Google que cubra campanhas de vários eventos.

**A regra:** o **PDF é a fatura**. Os números da API servem para acompanhar campanhas, nunca para lançar custo, porque não incluem os créditos promocionais.

### Quem lança

1. Abra **Faturas Ads**.
2. Importe em três fases: escolha a **plataforma** e o **PDF**. Reveja a leitura (número, período, total, linhas e avisos), que ainda não grava nada. Só depois **confirme**.
3. A ligação campanha → evento é **automática**: cada linha chega já com o evento proposto (por vínculo da campanha no sistema ou por aproximação ao nome; a coluna **Origem** diz qual). Reveja no **Detalhe das linhas** e, onde for preciso, corrija com **Escolher evento** / **Trocar evento**, ou marque **Fora do sistema** (linha que não pertence a nenhum evento). Quando não restarem linhas sem evento, carregue em **Confirmar rateio** e depois em **Gerar lançamentos**: a fatura divide-se pelos eventos, com uma transação por evento e a linha do BP de cada um.

**Ajustes da fatura:**

- ajuste **com campanha identificada** (ex.: atividade inválida) vai inteiro para o evento dessa campanha;
- ajuste **sem campanha** (promoções, taxas) reparte-se **na proporção da mídia** de cada evento na mesma fatura;
- os ajustes **não criam transações próprias**: somam-se às partes dos eventos.

### Quem aprova e fecha

- O sistema **recusa gerar** se a soma das partes e do que fica fora do sistema não der o total da fatura.
- O PDF fica arquivado com a fatura.
- Na aprovação, pagamento e relatórios valem as regras de **Vários eventos**: paga-se a mãe, e nos relatórios de evento contam as partes.

---

## 5. Rateios de Overhead (custos de estrutura)

```ajuda
id: rateios.overhead
tooltip: "Custos da estrutura da empresa (assessoria, jurídico, escritório) atribuídos a um evento com sócios. Não geram transação nem pagamento: reduzem o resultado do sócio, não o da empresa."
ecras: [evento.rateios-overhead]
perfis: [manager, admin]
fontes: [overhead-allocations]
termos: [overhead, custos de estrutura, assessoria, jurídico, advogado, escritório, equipa de escritório, rateio de estrutura, custo fixo, custos de fecho, rateio de equipa]
```

![Rateio de custos de estrutura pelo Master](img/rateios-overhead.svg)

**Quando:** a empresa quer imputar a um evento com sócios uma parte de custos que **já pagou noutro momento** (assessoria de imprensa, jurídico, equipa de escritório).

**O que acontece:** cria-se uma linha no BP do evento marcada como **Overhead**. Essa linha:

- **já nasce aprovada** e **não gera transação** nem pagamento;
- **não entra no resultado da empresa**, porque o custo já foi pago;
- **entra no acerto com sócios**, reduzindo o resultado de que o sócio participa;
- numa turnê, lançada no Master, reparte-se **por igual (÷N)** pelas cidades, onde aparece com o badge **via Master**.

### Quem lança

1. No evento, abra **Rateios de Overhead** e carregue em **Adicionar**.
2. Preencha tipo, descrição, valor sem IVA, IVA e categoria.
3. Se existir previsão de overhead no BP (do evento ou do Master), escolha-a em **Vincular a linha do BP de Overhead**. Sem vínculo, a linha fica com o badge **Sem previsão no BP**.
4. Se a categoria já tem linhas no BP, aparece um aviso: o overhead **soma-se** ao valor planeado dessa categoria. Confirme que é isso que pretende.
5. Anexe o documento de suporte, se houver, e grave.

### Quem aprova e fecha

- Os relatórios têm um seletor **Com / Sem Overhead**. **Sem** mostra a vista da empresa. **Com** mostra a vista do sócio.
- O **acerto com sócios** inclui sempre o overhead.
- O **DRE Empresarial** (mensal da empresa) **nunca** inclui overhead.
- O badge **Overhead** só é visível a admin e gestor. O sócio vê a linha como uma despesa normal.

---

## Erros comuns

```ajuda
id: rateios.erros-comuns
tooltip: "Os erros mais frequentes: dividir pelas cidades o que é da tour, lançar a parte de terceiros como custo, escolher a linha do BP pelo selector de categoria, e pagar uma parte em vez da mãe."
ecras: [nova-transacao]
perfis: [editor, manager, admin]
fontes: [D-ERP73, D-ERP69, D-ERP76]
termos: [erro no rateio, rateio errado, corrigir rateio, lancei errado, dúvida rateio]
```

| Erro | Consequência | Correto |
|---|---|---|
| Dividir pelas cidades um custo da tour em partes iguais | Transações a mais, linhas do BP das cidades consumidas sem razão | Lançar no Master |
| Lançar no Master um custo desigual entre cidades | Cada cidade fica com ÷N, que não é a parte real | Vários eventos, com % personalizada |
| Lançar como custo da MP a parte de outro promotor | Custo inflacionado e resultado do evento errado | Custo partilhado com terceiros |
| Escolher a linha do BP só pelo selector de categoria | A parte da MP fica sem linha e a aprovação é recusada | Clicar na linha na tabela de previsões |
| Aprovar uma parte de rateio sem linha do BP | A verba do evento parece livre quando não está | Escolher a linha de cada parte antes de aprovar |
| Fechar o evento com a conta de rateio diferente de zero | Custo da MP ou devolução por lançar | Acerto final antes do fecho |

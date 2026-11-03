---
capitulo: conciliacao-bancaria
titulo: Conciliação Bancária
modulo: erp
atualizado: 2026-11-03
perfis: [manager, admin]
rotas: [/conciliacao-bancaria]
fontes: [conciliacao-bancaria, src/pages/BankReconciliation.tsx, src/lib/bank-statement/reconcile.ts, docs/DECISIONS.md]
---

# Conciliação Bancária

## Consultar a conta e escolher a ação

```ajuda
id: conciliacao.consultar
tooltip: "Compare o extrato com os pagamentos da conta. A conciliação automática só liga registos; conciliar uma transação em aberto ou lançar pela linha pode registar pagamentos."
ecras: [conciliacao-bancaria]
perfis: [manager, admin]
fontes: [src/pages/BankReconciliation.tsx, src/lib/bank-statement/reconcile.ts, src/components/bank/BankLineLaunchModal.tsx, src/components/bank/BankLineOffsetModal.tsx]
termos: [conciliação bancária, conciliacao, extrato, extracto, banco, movimento por explicar, Santander]
```

Abra **Conciliação Bancária** e escolha a conta. O acesso exige ser admin ou ter a permissão de gerir conciliação bancária. O seletor apresenta contas bancárias ativas e não ocultas. Depois de importar, pode escolher um dos extratos apresentados para essa conta.

| Situação | Ação no ecrã | Efeito a conferir |
|---|---|---|
| O movimento corresponde a dinheiro já registado | **Conciliar** e escolher a transação paga | Liga o movimento ao registo existente; divergências de data pedem decisão. |
| Existe uma transação aprovada ou parcialmente paga | **Conciliar** e escolher a transação em aberto | Regista o recebimento ou pagamento na conta do extrato, até ao valor disponível. |
| Falta o lançamento na plataforma | **Lançar** | Cria o lançamento e o pagamento a partir do movimento, depois da confirmação. |
| Receitas e despesas da mesma entidade são acertadas pelo valor líquido | **Encontro de contas**, quando disponível | Abre um assistente próprio, com prévia antes de confirmar. |
| A linha deve ficar fora da conciliação | **Ignorar**, com nota | Conserva a linha como ignorada; não corrige o saldo nem cria um lançamento. |

Comece por procurar o registo existente, para não lançar a mesma despesa ou receita duas vezes. A frase do topo «a conciliação só liga» descreve o motor automático; as ações manuais da tabela têm efeitos distintos.

A conferência do direito e do dinheiro retido numa bilheteira tem [capítulo próprio](/ajuda?artigo=bilheteiras#bilheteiras.consultar). Um fecho de bilheteira confirmado não substitui a conferência do recebimento no banco.

## Importar e conferir o extrato

```ajuda
id: conciliacao.importar
tooltip: "Escolha a conta bancária e o ficheiro Santander tabulado. Confira período, saldos e prévia antes de gravar; uma cadeia de saldos incoerente impede a importação."
ecras: [conciliacao-bancaria.importar]
perfis: [manager, admin]
fontes: [src/pages/BankReconciliation.tsx, src/lib/bank-statement/parse-santander.ts]
termos: [importar extrato, ficheiro do banco, tabulado Excel, abertura, fecho, reimportar, duplicados, sobreposição]
```

1. Escolha a **conta** antes de selecionar o ficheiro. O formato implementado é o Santander **tabulado Excel**, sem cabeçalho, com campos separados por ponto e vírgula. Não é um PDF do extrato.
2. Confira na prévia o período, a quantidade de movimentos, a abertura, o fecho e os resultados das camadas automáticas.
3. Confira a referência usada para comparar a abertura. Quando o ficheiro cobre a data do saldo implantado, a comparação usa o saldo no fecho dessa data. Nos restantes casos, procura-se o saldo anterior ao início do ficheiro, recorrendo às linhas já importadas, a extratos anteriores, ao saldo apurado à véspera ou ao implantado.
4. Leia os avisos antes de **gravar**. Uma quebra da cadeia de saldos dentro do ficheiro bloqueia a importação. Uma diferença de abertura superior simultaneamente a 1.000 € e a 10% da maior referência absoluta também bloqueia: confirme se escolheu a conta certa. Diferenças menores podem ser avisos informativos; não são uma confirmação de que o saldo está correto.

O ficheiro original é arquivado com o extrato. A identidade de cada movimento inclui a conta, as datas, a descrição, o valor e o saldo após o movimento. Reimportar uma linha com a mesma identidade não cria outra linha. Períodos sobrepostos podem, por isso, deixar o movimento no primeiro extrato que o trouxe; a procura de transações já explicadas considera as ligações da conta, não apenas o extrato aberto.

Uma importação sem linhas novas pode reutilizar o extrato existente. Confira a mensagem com as linhas novas e as que já existiam, em vez de interpretar a ausência de novas linhas como perda de movimentos.

## Como funciona a conciliação automática

```ajuda
id: conciliacao.automatica
tooltip: "O motor tenta lotes SEPA, valor e descrição, por esta ordem, usando dinheiro efetivo na conta. Voltar a conciliar preserva ligações manuais, lançamentos pela linha, ignoradas e movimentos anteriores ao corte."
ecras: [conciliacao-bancaria.conciliadas]
perfis: [manager, admin]
fontes: [src/lib/bank-statement/reconcile.ts, src/pages/BankReconciliation.tsx, src/lib/string-similarity.ts]
termos: [automática, voltar a conciliar, lote SEPA, valor exato, descrição semelhante, retenção na fonte, cinco dias]
```

O motor faz três passagens sobre os movimentos, reservando as transações já usadas para que não sejam novamente consumidas nas passagens seguintes:

1. **Lotes SEPA:** procura exportações de listas de pagamento cujo dinheiro efetivo na conta corresponde ao valor do banco, com tolerância de um cêntimo. Usa a data na descrição para preferir candidatos; sem correspondência de data, ainda pode usar os candidatos pelo valor. Várias exportações da mesma lista podem explicar um único lote; candidatos de listas diferentes não são escolhidos como se fossem inequívocos.
2. **Valor:** compara o montante com o dinheiro efetivo das transações da conta, com tolerância de um cêntimo e uma janela de cinco dias em torno da data do movimento. Havendo várias candidatas, prefere a data mais próxima.
3. **Descrição:** exige o mesmo montante ao cêntimo e semelhança de texto de pelo menos 0,8 com a descrição ou com a descrição acompanhada do fornecedor. Esta passagem não impõe a janela de cinco dias da passagem por valor.

O dinheiro efetivo considera pagamentos pagos, não estornados, desta conta, descontando retenções e créditos de fornecedor. Compensações não representam saída de banco. O recurso ao valor pago histórico tem a fronteira descrita na [secção de saldos e corte](/ajuda?artigo=conciliacao-bancaria#conciliacao.saldos-e-corte).

O motor automático liga movimentos a registos existentes; não liquida transações em aberto nem cria despesas. **Voltar a conciliar** repete as camadas nas linhas por explicar e nas conciliadas automaticamente. Preserva conciliações manuais, lançamentos criados pela linha, ignoradas e anteriores ao corte. Não é uma ação para desfazer pagamentos.

## Saldos, diferença e corte de implantação

```ajuda
id: conciliacao.saldos-e-corte
tooltip: "Compare sistema e banco na data final do extrato e reveja os dois lados por explicar. O saldo implantado e o primeiro período importado delimitam o histórico; valores anteriores não provam falta de pagamentos."
ecras: [conciliacao-bancaria.saldos, conciliacao-bancaria.sem-movimento]
perfis: [manager, admin]
fontes: [src/pages/BankReconciliation.tsx, src/lib/bank-statement/reconcile.ts, docs/DECISIONS.md]
termos: [diferença, saldo do sistema, saldo do banco, implantação, data de corte, histórico, transações sem movimento, residual]
```

O confronto do topo compara o **saldo do sistema na data final do extrato** com o **saldo declarado pelo banco**. A diferença tem o sentido **sistema − banco**. Se o saldo não estiver visível para o utilizador, o ecrã protege também a diferença que o poderia revelar.

Confira os dois lados:

- **Linhas do banco por explicar:** há um movimento bancário ainda sem explicação na plataforma.
- **Transações sem movimento no banco:** há dinheiro registado nesta conta, no período, ainda sem uma linha que o explique nas ligações da conta.

O ecrã mostra o peso de cada lado na diferença e o residual que sobra. Retenção na fonte pode explicar bruto diferente do líquido de um lote; já é descontada no saldo do sistema e não se soma outra vez à diferença. Uma diferença zero não dispensa conferir as linhas: montantes opostos podem compensar-se.

Há duas referências históricas a distinguir:

- A **data do saldo implantado** da conta é um saldo ao fecho do dia. Movimentos até essa data ficam em **Anteriores ao corte**, para histórico e cadeia de saldos, e não se conciliam.
- O **primeiro início de período importado da conta** delimita a utilização do valor pago legado quando não existem pagamentos detalhados. Depois dessa fronteira, uma transação sem pagamentos bancários efetivos não passa a ter dinheiro de banco apenas por estar marcada como paga.

Qualquer contagem ou diagnóstico financeiro histórico tem de declarar o corte da conta usado, conforme D-ERP289. Antes da implantação havia importações agregadas, sem obrigação de conciliar nem pagamentos detalhados; esse histórico não prova um defeito. Não use uma data fixa de outra conta como referência.

## Conciliar manualmente e liquidar o que está em aberto

```ajuda
id: conciliacao.manual
tooltip: "Escolha uma ou mais transações do sentido da linha e confira a soma. As pagas só ligam; as em aberto recebem pagamento nesta conta. Divergências de data exigem escolha antes de concluir."
ecras: [conciliacao-bancaria.manual]
perfis: [manager, admin]
fontes: [src/pages/BankReconciliation.tsx, src/lib/bank-link-date.ts]
termos: [conciliar à mão, várias transações, ligar, liquidar, parcialmente paga, outra conta, alinhar data]
```

Em **Linhas do banco por explicar**, clique em **Conciliar**. Uma linha a crédito oferece receitas; uma linha a débito oferece despesas. A seleção admite várias transações, mas a soma tem de explicar o valor inteiro da linha, com tolerância de um cêntimo.

1. Procure primeiro em **Pagas nesta conta, sem movimento no banco**. Estas escolhas ligam o dinheiro já registado.
2. Se o documento está por pagar ou receber, procure em **Em aberto (por receber / por pagar)**. Ao selecionar, o modal mostra quanto será registado nesta conta, na data-valor do banco ou, na sua ausência, na data do movimento.
3. Confira a repartição. Uma transação em aberto pode receber apenas parte do saldo; o restante continua em aberto e é mostrado. A linha bancária, porém, tem de ficar explicada por inteiro.
4. Se aparecer uma candidata de outra conta, leia o aviso e confirme a divergência antes de prosseguir. Não interprete essa ligação como correção automática da conta de liquidação.
5. Se a data divergir, escolha **Alinhar pela data do banco** ou **Manter (fica registado)**. Reveja a escolha antes de confirmar.

A confirmação envia a ligação e as liquidações escolhidas numa operação de conciliação. O efeito depende das transações selecionadas: não clique como se fosse sempre uma ação apenas documental.

## Lançar o que falta a partir do banco

```ajuda
id: conciliacao.lancar
tooltip: "Lançar cria um registo com pagamento a partir da linha ou da soma selecionada. Valor e data vêm do banco; confirme rubrica, evento e linha de BP quando exigida."
ecras: [conciliacao-bancaria.lancar]
perfis: [manager, admin]
fontes: [src/components/bank/BankLineLaunchModal.tsx, src/pages/BankReconciliation.tsx, docs/manual/transitorias.md, docs/manual/bp-e-cache.md]
termos: [lançar, criar transação, lançar pela soma, despesa, receita, transferência, transitória, linha de BP]
```

Use **Lançar** quando confirmou que falta o registo. Pode partir de uma linha ou selecionar várias para **lançar pela soma**. O montante e a data de pagamento vêm do banco; o modal não oferece a sua edição livre.

Escolha despesa, receita ou transferência e confira a descrição. Despesas e receitas pedem rubrica, salvo a exceção de transitórias. Quando uma despesa não transitória pertence a um evento com BP, é obrigatório escolher a **Linha de BP** antes de gravar. O seletor permite escolher uma linha e, para quem tem permissão, criar a linha necessária.

Uma **transferência** cria as duas pernas entre contas; o sinal do banco determina o sentido. Um débito para a conta corrente de uma plataforma de anúncios pode representar transferência de dinheiro; o custo da publicidade vem da fatura, pelo [fluxo de Faturas Ads](/ajuda?artigo=faturas-e-fornecedores#fornecedores.faturas-ads). Conferir esse destino evita duplicar custo.

Marcar **Transitória (a repassar)** indica dinheiro que passa pela conta sem entrar no resultado. A rubrica torna-se opcional e não se guarda uma regra que pudesse perder essa marca. Consulte [Transitórias](/ajuda?artigo=transitorias#transitorias.conceito) e o capítulo [BP e Cachê](/ajuda?artigo=bp-e-cache#bp.modo) para o contexto de cada lançamento.

A criação e a ligação às linhas passam pela operação própria de lançamento. Só depois do sucesso se tenta guardar uma regra. Um aviso de que a regra não ficou guardada não significa que o lançamento tenha falhado: confira o resultado antes de repetir.

## Regras e taxas de transferências

```ajuda
id: conciliacao.regras-e-taxas
tooltip: "As regras preenchem uma proposta e exigem confirmação. Taxas internacionais agrupam-se pela referência da transferência; confira a mãe, o evento e a linha de BP antes de lançar."
ecras: [conciliacao-bancaria.regras, conciliacao-bancaria.taxas]
perfis: [manager, admin]
fontes: [src/lib/bank-statement/rules.ts, src/lib/bank-statement/transfer-fees.ts, src/components/bank/BankLineLaunchModal.tsx, src/pages/BankReconciliation.tsx]
termos: [regra, aprender, padrão, comissão, imposto de selo, SWIFT, taxas internacionais, transferência-mãe]
```

Uma regra ativa que corresponda à direção, ao intervalo de valor e ao texto do banco mostra uma proposta sob a descrição. Entre regras compatíveis, o padrão mais longo tem preferência. A regra preenche o formulário: **não cria movimentos sem confirmação humana**. No separador **Regras** pode ativar, desativar ou apagar regras.

Ao lançar, pode guardar um padrão sugerido a partir da parte estável da descrição. Reveja-o antes de guardar. A linha de BP não é guardada na regra, porque pertence a um evento concreto.

As taxas de transferência internacional são agrupadas pela referência numérica comum. Quando há uma transferência-mãe conciliada, **Lançar taxas** abre a proposta com o evento e a linha de BP da mãe, quando existem. O serviço SWIFT com IVA e as despesas do banco com imposto de selo ficam em lançamentos distintos, na rubrica de taxas bancárias. Sem mãe conciliada, o ecrã indica essa ausência; não atribua um evento por adivinhação.

Se for necessária uma linha de BP, o modal pode propô-la pela rubrica da mãe. Confira **Previsto**, **Utilizado** e **Disponível**. A indicação de excesso não aumenta a verba; essa alteração pertence ao BP. A ausência de linha obrigatória impede gravar.

Quando aparece **Ligar também a transferência-mãe**, a tentativa de ligação da mãe é posterior ao lançamento das taxas. Se falhar, **as taxas já estão lançadas** e o aviso pede a ligação manual da mãe. Não repita o lançamento das taxas para resolver esse aviso. Estes grupos não geram uma regra por padrão de descrição.

## Encontro de contas pela linha bancária

```ajuda
id: conciliacao.encontro-de-contas
tooltip: "O encontro acerta documentos da mesma entidade com o dinheiro da linha do banco. Escolha documentos e ordem do dinheiro, reveja a prévia e confirme; a disponibilidade depende do papel e do controlo da operação."
ecras: [conciliacao-bancaria.encontro-de-contas]
perfis: [manager, admin]
fontes: [src/components/bank/BankLineOffsetModal.tsx, src/lib/offset-plan/contracts.ts, src/lib/offset-plan/rpc.ts]
termos: [encontro de contas, compensação, acerto, valor líquido, ordem do dinheiro, documentos da entidade]
```

O botão **Encontro de contas** abre o assistente para acertar receitas e despesas da mesma entidade. Pode ficar desativado por falta de permissão, controlo indisponível ou operação temporariamente desativada; não se deve contornar esse estado com lançamentos manuais equivalentes.

Escolha a entidade, os documentos a acertar e a ordem de aplicação do dinheiro. Reveja a prévia antes de confirmar. Na entrada pela linha bancária, conta, sinal, data e valor vêm do movimento; não são valores livres para fazer a soma parecer correta.

O assistente também é usado a partir de um pagamento fora do banco, com um passo próprio para indicar o dinheiro ou a sua ausência. Essa entrada tem contexto diferente da linha de extrato. Se a resposta da confirmação for incerta, o assistente oferece **Repetir o mesmo pedido**, preservando a identificação e o conteúdo da tentativa. Não recrie o encontro como uma nova operação para resolver a incerteza; fechar o modal não prova que a operação tenha sido desfeita.

## Documentos e linhas ignoradas

```ajuda
id: conciliacao.documentos-e-ignoradas
tooltip: "Documentos anexados ao movimento não o conciliam. Ao anexar, as transações já ligadas recebem réplicas para a contabilidade; ignorar exige uma nota e não acerta o saldo."
ecras: [conciliacao-bancaria.documentos, conciliacao-bancaria.ignorar]
perfis: [manager, admin]
fontes: [src/components/bank/BankLineDocumentsDialog.tsx, src/pages/BankReconciliation.tsx]
termos: [anexar documento, comprovativo, documento contábil, contabilidade, ignorar, nota obrigatória, réplica]
```

**Documentos** abre os anexos do movimento, esteja ele conciliado, por explicar ou ignorado. Pode anexar PDF ou imagem até 10 MB e indicar se é documento contábil. Anexar um comprovativo não cria uma fatura nem concilia a linha.

No momento do anexo, o ecrã procura as transações já ligadas e cria referências ao mesmo ficheiro para a contabilidade. Essas réplicas não ficam visíveis ao sócio do evento. Se ainda não houver transações ligadas, o documento fica apenas no movimento; não conte com uma réplica automática futura. Confira os anexos depois de conciliar. A remoção, disponível a admin/manager, retira também as réplicas desse ficheiro.

**Ignorar** exige uma nota com o motivo. A linha passa a aparecer esbatida entre as conciliadas, com a nota, e deixa de explicar transações. Não regista uma despesa, não liquida documentos e não força a diferença de saldos a zero. Use uma explicação verificável e conserve o documento quando necessário.

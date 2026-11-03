---
capitulo: faturas-e-fornecedores
titulo: Faturas e Fornecedores
modulo: erp
atualizado: 2026-11-03
perfis: [editor, manager, accountant, admin]
rotas: [/fornecedores, /faturas-plataformas, /scanner-faturas]
fontes: [supplier-lifecycle, supplier-iban-validation, supplier-credits, invoice-groups, standalone-invoices, ads-invoices, src/pages/Suppliers.tsx, src/pages/AdsInvoices.tsx, docs/procedimentos/PROC-entrada-de-dados.md]
---

# Faturas e Fornecedores

## Consultar entidades e beneficiários

```ajuda
id: fornecedores.consultar
tooltip: "Consulte entidades, dados de contacto, transações e créditos. Procure um registo existente antes de criar fornecedor; desativar preserva o histórico financeiro."
ecras: [fornecedores]
perfis: [editor, manager, accountant, admin]
fontes: [src/pages/Suppliers.tsx, src/components/SupplierTransactions.tsx, src/components/SupplierCreditsPanel.tsx]
termos: [fornecedor, fornecedores, entidade, beneficiário, parceiro, sócio, nome fantasia, procurar fornecedor]
```

Em **Entidades / Beneficiários** encontra fornecedores e parceiros. A pesquisa considera nome, nome fantasia, NIF e categoria. Pode alternar entre cartões e lista, ordenar pelo nome ou nome fantasia e ocultar parceiros. O ecrã oferece as opções **Ativos**, **Inativos** e **Todos**, com Ativos como seleção inicial.

Na ficha pode abrir as transações do fornecedor e os respetivos documentos, quando disponíveis, ou **Ver créditos**. A aba **Créditos** apresenta a consulta agrupada por fornecedor. Ter um fornecedor registado não significa que uma fatura esteja lançada nem que tenha sido paga.

O lápis abre a edição. Para deixar de usar uma entidade sem perder os seus movimentos, consulte o [ciclo de vida](/ajuda?artigo=faturas-e-fornecedores#fornecedores.ciclo-de-vida). Para decidir como entra um documento, consulte [Faturas e documentos](/ajuda?artigo=faturas-e-fornecedores#fornecedores.documentos).

## Criar ou editar um fornecedor

```ajuda
id: fornecedores.criar
tooltip: "Preencha o nome e confira entidades parecidas antes de guardar. Dados fiscais e bancários dependem do país da empresa; um IBAN duplicado pode exigir usar ou reativar a entidade existente."
ecras: [fornecedores.novo, fornecedores.editar]
perfis: [editor, manager, admin]
fontes: [src/components/SupplierFormModal.tsx, src/components/SimilarSuppliersNotice.tsx, src/lib/validations.ts, src/lib/bank-account-value.ts, supplier-iban-validation]
termos: [novo fornecedor, editar entidade, NIF, IBAN, SWIFT, dados bancários, fornecedor parecido, duplicado, reativar]
```

Clique em **Novo Fornecedor** ou no lápis de uma ficha. O nome da entidade é obrigatório. Pode registar nome fantasia, identificação fiscal, categoria, contacto, email, telefone, condições de pagamento, morada e notas. Os campos fiscais e bancários são **campos por país da empresa**; preencha os que o formulário apresentar.

No formulário que apresenta IBAN/SWIFT, há até três contas. IBAN e NIF são opcionais. Valores reconhecidos como IBAN passam por validação estrutural e de dígitos de controlo; o formulário também consulta duplicação nas contas de outros fornecedores da empresa. Outros formatos de conta têm tratamento próprio: não se deve concluir que qualquer texto bancário passou por uma validação de IBAN.

Se o IBAN pertence a um fornecedor ativo, corrija a escolha ou use a entidade existente. Se pertence a um inativo, o formulário propõe reativá-lo a admin, platform_admin ou manager; quem não tem esse papel deve pedir a reativação. A edição exclui o próprio fornecedor da procura de duplicados. Alterações de IBAN/SWIFT ficam registadas na auditoria.

Na criação, depois das validações bancárias, o aviso de fornecedores parecidos permite **Usar**, **Acrescentar IBAN** quando há um espaço livre e permissão, ou **Criar mesmo assim** quando permitido. Identificação fiscal igual à de um ativo bloqueia a criação pelo aviso. Confira a entidade antes de acrescentar dados bancários.

Marcar **Parceiro / Sócio** identifica uma entidade que pode participar nos fluxos de parceiros e que fica fora dos relatórios de fornecedores indicados no formulário. A marca, por si só, não define uma percentagem nem cria o acerto de um evento.

## Desativar, reativar e eliminar

```ajuda
id: fornecedores.ciclo-de-vida
tooltip: "Desativar retira o fornecedor dos seletores e conserva o histórico. Eliminar é recusado quando existe movimento; sem movimento, a confirmação apresenta os registos associados e usa o Lixo."
ecras: [fornecedores.desativar, fornecedores.eliminar]
perfis: [manager, admin]
fontes: [src/pages/Suppliers.tsx, src/lib/supplier-lifecycle.ts, src/lib/trash.ts, supplier-lifecycle]
termos: [desativar fornecedor, inativo, reativar fornecedor, eliminar entidade, apagar, lixo, restaurar, histórico]
```

**Desativar** é a ação normal quando deixa de trabalhar com uma entidade. Retira-a dos seletores de fornecedores ativos, mantém os movimentos e acrescenta uma nota datada. Admin, platform_admin e manager podem desativar e reativar.

O botão de eliminar abre uma conferência da utilização atual. Com transações, orçamentos ou outras ligações de movimento, a eliminação é recusada e o diálogo oferece desativação a quem tem permissão. Não elimine o histórico financeiro para limpar um seletor.

Sem movimento impeditivo, o diálogo enumera os registos associados que serão também apagados. Ao confirmar, guarda a entidade e os dados relacionados no **Lixo** antes de eliminar. O ecrã indica um prazo de **30 dias** para restauro. Confira as contagens e os anexos antes de confirmar; desativar e eliminar têm consequências diferentes.

## Escolher o caminho da fatura e guardar o documento

```ajuda
id: fornecedores.documentos
tooltip: "O tipo de documento e quem pagou determinam a entrada: Faturas Ads, transação ou Fatura Avulsa. Um comprovativo é anexo e não substitui a fatura nem prova, sozinho, o lançamento."
ecras: [transacoes.documentos, scanner-faturas, faturas-plataformas]
perfis: [editor, manager, accountant, admin]
fontes: [docs/procedimentos/PROC-entrada-de-dados.md, src/pages/StandaloneInvoiceScanner.tsx, src/components/TransactionDocumentsModal.tsx, src/components/ads/AdsInvoiceImportDialog.tsx]
termos: [fatura, factura, recibo, comprovativo, nota, anexo, conta pessoal, conta da empresa, quem pagou]
```

| Documento e pagamento | Onde entra |
|---|---|
| Fatura Meta, Google ou TikTok | **Faturas Ads**, pelo PDF e com prévia antes de gravar a proposta. |
| Fatura paga por uma conta da empresa | **Transação**, com a conta e o pagamento correspondentes. |
| Fatura em nome da empresa paga com recursos pessoais de um sócio | **Fatura Avulsa**, identificando quem pagou. |
| Recibo, comprovativo ou nota de um lançamento existente | **Anexo** à transação; não cria outro custo só por ser um novo ficheiro. |

Antes de inserir, procure o mesmo fornecedor e número nas transações e nas Faturas Avulsas. Os dois caminhos têm conferências próprias; não presuma que uma verificação num deles prova ausência no outro. Uma fatura repartida por várias linhas também não é necessariamente um duplicado.

Confira fornecedor, identificação fiscal, número, data, valor e IVA pelo documento. Ter um comprovativo de pagamento não equivale a ter a fatura. A presença de um anexo não significa que o pagamento tenha saído da conta: para isso, confira os pagamentos e a [conciliação bancária](/ajuda?artigo=conciliacao-bancaria#conciliacao.consultar).

Ao anexar a uma transação de um grupo de fatura, o documento pode ser partilhado pelas linhas do grupo. Sem grupo, quando existem várias linhas do mesmo fornecedor e número exato, o ecrã pede confirmação antes de aplicar às linhas candidatas e agrupá-las. Confira a lista apresentada. Desagrupar uma linha não apaga os seus documentos.

## Uma fatura com várias linhas

```ajuda
id: fornecedores.grupos
tooltip: "Uma fatura pode reunir várias transações. Confira documentos e total antes de agrupar; liquidar uma linha deixa as restantes em aberto, salvo escolha de liquidar a fatura completa."
ecras: [transacoes.grupo-fatura, transacoes.pagamento, listas-pagamento]
perfis: [editor, manager, admin]
fontes: [src/lib/invoice-group.ts, src/components/InvoiceGroupAction.tsx, src/components/TransactionPaymentModal.tsx, src/components/BatchPaymentModal.tsx, invoice-groups]
termos: [fatura agrupada, agrupar fatura, desagrupar, várias linhas, IVA diferente, liquidar fatura completa, pagamento parcial]
```

Uma fatura pode estar repartida por linhas de BP, eventos ou taxas de IVA. O grupo formal identifica as linhas como partes do mesmo documento. A coincidência de fornecedor e número ajuda a detetar candidatas, mas não dispensa conferir o papel.

**Agrupar fatura** mostra as linhas, a soma das bases e o total com IVA. Se houver documentos diferentes, o aviso exige segunda confirmação para **Agrupar mesmo assim**. Esse aviso pode indicar faturas diferentes com uma referência mal preenchida; não o confirme apenas para reduzir o número de transferências.

Na Lista de Pagamento, o grupo pode resultar numa transferência pela soma em aberto. Uma seleção parcial do grupo gera aviso: confira se estão todas as linhas que pretende pagar. Agrupar não significa liquidar.

No pagamento individual, o modal apresenta as irmãs em aberto e, quando o fluxo o disponibiliza, **Liquidar a fatura completa** abre a liquidação em lote com essas linhas. Liquidar apenas a linha atual continua possível e deixa as outras por pagar. Créditos de fornecedor são tratados no pagamento individual; não conte com o mesmo abate no lote.

Não confunda grupo de fatura com rateio mãe/filhas. O primeiro reúne partes do documento; o segundo reparte um custo. Para o funcionamento dos rateios, consulte [Rateios](/ajuda?artigo=rateios#rateios.escolher).

## Créditos de fornecedor

```ajuda
id: fornecedores.creditos
tooltip: "Consulte saldo, validade e usos dos créditos. O abate exige escolha no pagamento e reduz o dinheiro a sair; não muda o custo do evento de origem nem cria receita."
ecras: [fornecedores.creditos, transacoes.pagamento]
perfis: [manager, admin]
fontes: [src/components/SupplierCreditsPanel.tsx, src/components/supplier-credits/SupplierCreditsTab.tsx, src/components/supplier-credits/NewSupplierCreditModal.tsx, src/components/TransactionPaymentModal.tsx, src/lib/supplier-credits.ts, supplier-credits]
termos: [crédito de fornecedor, nota de crédito, saldo disponível, validade, esgotado, expirado, abater crédito, estorno]
```

A aba **Créditos** agrupa os créditos por fornecedor, permite procurar por fornecedor, motivo ou documento e consultar saldo, estado, validade, anexo e histórico de usos. **Só ativos** limita a consulta; um crédito expirado ou esgotado não é saldo disponível para um novo pagamento. Na ficha, **Ver créditos** abre o painel desse fornecedor.

Um crédito pode nascer de um estorno de pagamento ou de **Novo crédito**, com valor e motivo obrigatórios, referência documental, evento de origem e validade quando aplicáveis. Não crie outro crédito para representar um estorno que já o originou. No painel da ficha, um crédito já utilizado não pode ser eliminado nem reduzido abaixo do montante usado.

No pagamento individual, escolha explicitamente o crédito e o valor a abater. Confira quanto é liquidado e quanto sai efetivamente da conta. Criar ou usar um crédito não cria receita nem transfere o custo para outro evento: o custo conserva a sua origem, e o crédito reduz a saída de caixa.

A consulta de créditos e a gravação do pagamento são passos diferentes. Perante uma falha, confira o pagamento e o histórico de usos antes de repetir; a existência de um helper transacional de créditos não prova que todos os ecrãs gravem crédito e pagamento numa única operação.

## Faturas Avulsas: documento sem movimento de conta

```ajuda
id: fornecedores.avulsas
tooltip: "O Scanner Faturas guarda documento e metadados de uma fatura paga por fora das contas da empresa. Confira OCR, pagador e valores; não cria transação, BP ou movimento financeiro."
ecras: [scanner-faturas, scanner-faturas.conferencia]
perfis: [editor, manager, accountant, admin]
fontes: [src/pages/StandaloneInvoiceScanner.tsx, src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx, src/lib/standalone-invoices.ts, standalone-invoices]
termos: [fatura avulsa, scanner faturas, tirar foto, OCR, conferência, pagador, processada, sem data, câmbio]
```

Em **Scanner Faturas**, tire uma foto ou escolha um ficheiro. As imagens passam pela preparação do documento, com ajuste do recorte e opção de usar a original; PDFs seguem sem esse recorte. O OCR propõe campos para conferir, não certifica os valores do documento.

Reveja fornecedor, NIF, número, data da fatura, moeda, valor original, câmbio, total, IVA, pagador e notas. Campos não extraídos podem ser preenchidos à mão; não invente uma data para completar o OCR. Em moeda estrangeira, confira o câmbio e o contravalor apresentado. O utilizador ligado é o pagador inicial e o seletor limita-se a membros da empresa.

**Guardar fatura** conserva o documento e os metadados; este caminho não cria transação, linha de BP, lista de pagamento, reembolso nem movimento de conta. Se a saída foi de uma conta da empresa, confirme o caminho de entrada antes de guardar como avulsa.

Se a captura indicar **Resultado por confirmar** ou revisão pendente, use a conferência disponibilizada e consulte a lista antes de uma nova gravação. Uma resposta incerta não prova que nada tenha ficado guardado.

Na aba **Conferência**, partilhada com o Portal Contabilidade, os documentos agrupam-se pelo mês da data da fatura; os sem data têm grupo próprio. Pode abrir o documento e exportar o mês. **Marcar processada** e **Reabrir** pertencem a admin/contabilista. Uma fatura processada tem de ser reaberta antes de poder ser apagada por quem tem permissão. Processada é um estado de conferência documental, não um novo pagamento.

## Faturas Ads: do PDF aos lançamentos

```ajuda
id: fornecedores.faturas-ads
tooltip: "Importe o PDF, confira a prévia e grave a proposta. Resolva as linhas, confirme o rateio e só depois gere os lançamentos; o espelho de campanhas não substitui a fatura."
ecras: [faturas-plataformas, faturas-plataformas.detalhe]
perfis: [manager, accountant, admin]
fontes: [src/pages/AdsInvoices.tsx, src/components/ads/AdsInvoiceImportDialog.tsx, src/components/ads/AdsTourSplitDialog.tsx, docs/manual/rateios.md, ads-invoices]
termos: [Faturas Ads, fatura Meta, fatura Google, fatura TikTok, tráfego pago, proposta, confirmar rateio, gerar lançamentos, fora do sistema, reverter]
```

Abra **Faturas Ads**. A lista distingue plataforma, número, período, total, soma das linhas, reconciliação, linhas **Sem evento** e estado. O botão **Importar fatura** é apresentado a admin, manager e contabilista. A fonte é o **PDF da fatura**, não o gasto estimado no espelho das campanhas.

1. Escolha Meta, Google ou TikTok e o PDF.
2. Peça a leitura e confira número, período, total, soma, reconciliação, linhas e avisos. Nesta fase ainda não é gravada a proposta, mas o **PDF já é carregado e arquivado**. Cancelar não deve ser interpretado como ausência de ficheiro no arquivo.
3. Confirme a gravação da proposta. Importar ainda não é gerar os lançamentos financeiros.
4. Abra a fatura e resolva as linhas pendentes. Confira o evento atribuído, ajuste-o quando necessário, reparta pela turnê quando aplicável ou marque **Fora do sistema** com motivo. Uma linha sem evento não é automaticamente um custo de evento em falta: há tratamentos próprios para ajustes, carreira e exclusões explícitas.
5. Confira o rateio por evento. **Confirmar rateio** exige estado de proposta, soma reconciliada e ausência de pendências. A confirmação torna as linhas só de leitura.
6. Use **Gerar lançamentos** apenas depois da confirmação. O detalhe apresenta os lançamentos gerados; mensagens de duplicação ou impedimento devem ser resolvidas antes de insistir.

**Reabrir rateio** está disponível quando está confirmado e ainda não aplicado: devolve a proposta à edição. Depois de aplicado, a ação é **Reverter lançamentos**, com confirmação própria e possíveis impedimentos por pagamentos, fechos, listas ou conferência contabilística. Não é equivalente a reabrir uma proposta sem lançamentos.

Os ajustes fazem parte da conferência do total e do rateio. Para a explicação da fatura mãe, das filhas por evento e dos ajustes, consulte [Faturas Ads no capítulo Rateios](/ajuda?artigo=rateios#rateios.faturas-ads). O débito bancário à plataforma também precisa de [conferência na conta](/ajuda?artigo=conciliacao-bancaria#conciliacao.lancar), para não ser lançado outra vez como custo.

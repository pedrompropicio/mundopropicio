/**
 * Textos de ajuda contextuais para todas as páginas do app.
 * Chave = identificador da página/secção.
 */
const helpTexts: Record<string, string> = {
  // Dashboard
  dashboard:
    "Visão geral do estado financeiro da empresa. Acompanhe receitas, despesas, saldo e os próximos compromissos.",

  // Eventos
  events:
    "Lista de todos os eventos. Aqui pode criar, editar e acompanhar o estado de cada evento, desde o planeamento até ao fecho.",
  eventDetail:
    "Detalhe completo do evento: datas, bilhetes, Business Plan (BP), parceiros, bilheteiras e fecho final.",
  eventBP:
    "O Business Plan (BP) contém as previsões de receitas e despesas do evento. É a base para aprovações e acompanhamento financeiro.",
  eventClosing:
    "Custos de Fecho são despesas que não geraram transações de pagamento (ex: rateio de equipa, assessoria jurídica) mas que impactam o resultado final do evento e o cálculo de participação de sócios.",
  eventPartners:
    "Gerencie os sócios/parceiros do evento e respetivas percentagens de participação no resultado. A soma das percentagens não pode exceder 100%.",
  eventTicketOffices:
    "Associe bilheteiras ao evento para acompanhar vendas por ponto de venda e gerir conciliações.",

  // Transações
  transactions:
    "Registe e acompanhe todas as transações financeiras. Filtre por tipo, estado, evento ou período. Cada transação pode ter documentos anexados.",

  // Contas
  financialAccounts:
    "Contas de Movimentação representam onde o dinheiro está: contas bancárias, bilheteiras, caixas, cartões. O saldo é calculado automaticamente a partir do saldo inicial e das transações pagas.",

  // Fornecedores
  suppliers:
    "Base de dados de fornecedores e parceiros. Registe dados de contacto, NIF, IBANs e documentação. Parceiros podem ser associados a eventos.",

  // Calendário
  calendar:
    "Visualize todos os eventos e reservas de espaços num calendário. Alterne entre vistas semanal, anual e agenda.",

  // Bilheteiras
  ticketOffices:
    "Gestão dos pontos de venda de bilhetes. Configure bilheteiras, associe contas financeiras e acompanhe o histórico de vendas.",

  // Gestão de Bilhetes
  ticketManagement:
    "Configure zonas, lotes e preços de bilhetes por evento. Registe vendas manuais e importe dados de vendas.",

  // Plano de Contas
  accountCategories:
    "O Plano de Contas organiza receitas e despesas em categorias hierárquicas (com códigos). É a base para relatórios DRE e BP.",

  // Cotações
  quotations:
    "Registe e compare cotações de fornecedores para eventos. Aprove ou recuse propostas antes de criar transações.",

  // Transações Recorrentes
  recurringTransactions:
    "Automatize lançamentos que se repetem periodicamente (rendas, seguros, serviços mensais). O sistema gera transações automaticamente conforme a frequência definida.",

  // IVA
  ivaManagement:
    "Consulte e gerencie as taxas de IVA aplicáveis (0%, 6%, 13%, 23%). Veja como o IVA impacta receitas e despesas nas transações.",

  // Relatórios
  reports:
    "Acesso centralizado a todos os relatórios financeiros e operacionais da empresa.",
  reportDRE:
    "Demonstração do Resultado do Exercício — apresenta receitas e despesas agrupadas por categoria, com cálculo do resultado líquido. A Visão Sócio inclui custos de fecho.",
  reportDREBrasil:
    "DRE no formato brasileiro, com estrutura adaptada às normas contabilísticas do Brasil. A Visão Sócio inclui custos de fecho.",
  reportPL:
    "Business Plan consolidado — compara previsões (BP) com valores reais por evento e categoria.",
  reportBankStatement:
    "Extrato detalhado de cada conta financeira, mostrando todas as movimentações e saldo acumulado.",
  reportCashFlow:
    "Fluxo de Caixa — projeção de entradas e saídas futuras com base nas datas de vencimento e pagamentos agendados.",
  reportContasPagar:
    "Lista de compromissos financeiros pendentes, com valores, datas de vencimento e estado de pagamento.",
  reportMovements:
    "Conciliação de movimentações — cruze transações registadas com extratos bancários para garantir a integridade dos dados.",
  reportPaymentLists:
    "Listas de pagamentos agrupados para aprovação. Organize transações em lotes para processamento eficiente.",
  reportSuppliers:
    "Relatório consolidado com dados e movimentações por fornecedor.",
  reportTicketAudit:
    "Auditoria de vendas por bilheteira — verifique totais, comissões e conciliação de valores recebidos.",
  reportAccountCategories:
    "Relatório do Plano de Contas com totais por categoria e análise da distribuição de receitas e despesas.",

  // Admin
  adminPanel:
    "Painel de administração com acesso à gestão de utilizadores, segurança, backups e configurações do sistema.",
  userManagement:
    "Crie e gerencie utilizadores. Defina perfis (Admin, Gerente, Editor, Viewer, Parceiro) e personalize permissões individuais.",
  securityDashboard:
    "Monitoramento de segurança: tentativas de login, alterações de dados, MFA e atividade do sistema.",
  databaseBackups:
    "Gerencie backups da base de dados. Crie backups manuais ou configure rotinas automáticas.",

  // Event sub-tabs / components
  eventTicketing:
    "Configure zonas e lotes de bilhetes para o evento. Defina capacidades, preços e taxas de IVA. O sistema calcula automaticamente receita bruta, IVA e receita líquida.",
  eventCache:
    "Cachê é o valor pago aos artistas. Pode ser um valor fixo ou uma percentagem da receita (bruta ou líquida). Configure deduções por categoria para calcular a base correta.",
  eventForecast:
    "O Business Plan (BP) contém as previsões de receitas e despesas do evento. Cada linha pode ser aprovada e convertida em transação real. Compare previsão vs realizado.",
  eventClosingTab:
    "Custos de Fecho são despesas que não geram transação de pagamento (ex: rateio de equipa, assessoria jurídica) mas que impactam o resultado final do evento e o cálculo da participação dos sócios.",

  // Partner-related tabs
  partnerExpenses:
    "Despesas pagas diretamente por sócios do evento. Estas despesas não movimentam contas da empresa e são integradas no encontro de contas do Fecho Parceiros.",
  partnerSettlement:
    "Encontro de contas automático com cada sócio. Consolida a quota-parte do resultado, extras a descontar e despesas pagas pelo sócio para determinar o acerto final. Exportável em PDF.",

  // Key buttons/actions
  newTransaction:
    "Crie uma nova transação de receita ou despesa. Associe a um evento, fornecedor e categoria do plano de contas.",
  transferBetweenAccounts:
    "Transferência entre contas: move saldo de uma conta para outra. Gera automaticamente uma saída e uma entrada.",
  approveTransaction:
    "Aprovar uma transação significa validar que a despesa/receita é legítima e pode ser processada para pagamento.",
  bulkApprove:
    "Aprovar múltiplas transações em lote. Apenas transações em estado 'Aguardando' ou 'Atrasada' serão processadas; as restantes são ignoradas automaticamente.",
  payTransaction:
    "Registar pagamento: indica que a transação foi efetivamente paga/recebida. Informe o valor pago, conta utilizada e data.",
  newEvent:
    "Crie um novo evento com nome, data, local e tipo. Eventos podem ser simples, multi-data (turnê) ou festival.",
  newSupplier:
    "Adicione um novo fornecedor ou parceiro com dados de contacto, NIF e dados bancários para pagamentos.",
  exportPDF:
    "Exportar para PDF: gera um documento PDF com os dados atuais do relatório para impressão ou envio.",
  conciliateTicketOffice:
    "Conciliar bilheteira: confirme que os valores de venda registados coincidem com os valores recebidos na conta.",
  reportArtistCache:
    "Relatório analítico do cachê de cada artista do evento. Demonstra o cálculo completo (fixo ou variável com deduções), os custos extras a descontar e o valor líquido final a pagar.",
  reportDocumentPendencies:
    "Auditoria de conformidade documental — identifica transações com conta bancária que não possuem documentos contábeis (faturas, recibos, notas fiscais) anexados. Use para regularizar pendências antes da exportação contábil.",
  financialOperations:
    "Registe movimentos não operacionais (taxas bancárias, juros, parcelas de empréstimo). Selecione a conta, descreva a operação e o sistema detecta automaticamente se é receita ou despesa. Suporta criação de modelos recorrentes.",
  cacheExtras:
    "Despesas extras pagas pelo evento em nome do artista (ex: hotel extra, transfer). São descontadas analiticamente do cachê bruto para determinar o valor líquido a pagar. Não geram transações separadas.",
  partnerExtras:
    "Despesas extras pagas pelo evento em nome de um sócio específico (ex: alojamento, despesas pessoais). São descontadas apenas da quota-parte desse sócio no resultado, sem afetar o resultado global do evento.",
  ticketOfficeBalance:
    "Saldo calculado: Vendas − Despesas Diretas − Transferências. Mostra o valor que permanece retido na bilheteira. Transferências superiores ao saldo retido são bloqueadas pelo sistema.",
  accountingDocFlag:
    "Marque como 'Documento contábil' apenas ficheiros fiscais: faturas, notas fiscais, recibos, notas de crédito/débito e comprovativos de pagamento bancário. Propostas, contratos e riders NÃO devem ser marcados.",
  uploadDocuments:
    "Anexe aqui os ficheiros comprobatórios da transação (faturas, recibos, contratos, etc.). Marque a checkbox 'Documento contábil' APENAS para documentos fiscais que devem ser enviados à contabilidade. Ficheiros não marcados ficam registados mas não são incluídos na exportação contábil.",
  exportPendencies:
    "Exporta a lista de pendências documentais em Excel. Inclui todas as transações com conta bancária que não possuem documentos contábeis anexados — útil para partilhar com a equipa e regularizar em lote.",
  accountingExport:
    "Exportação para contabilidade: selecione o período e descarregue todos os documentos fiscais (faturas, recibos, notas fiscais) anexados às transações. Apenas ficheiros marcados como 'Documento contábil' são incluídos. O sistema regista cada exportação para controlo e rastreabilidade.",
  reimbursements:
    "Notas de Reembolso permitem agrupar despesas pagas do bolso de um funcionário e processá-las num único pagamento. Crie a nota, adicione despesas marcadas como 'Reembolso', aprove (todas devem ter fatura contábil) e pague. O sistema gera automaticamente a transação de pagamento.",
  reportPartnerExpenses:
    "Consulte todas as despesas pagas diretamente por sócios/parceiros em qualquer evento. Filtre por evento ou sócio e exporte o relatório em PDF. Estas despesas compõem a apuração do resultado do evento independentemente de terem previsão no Business Plan.",
  reportBPTransactions:
    "Comparação detalhada entre as previsões do Business Plan (BP) e as transações de despesa efectivamente lançadas por evento. Cada categoria mostra o valor previsto vs. realizado, com as transações individuais listadas abaixo. Inclui despesas de reembolso, pagas por sócios e lançamentos fora do BP.",
  paidByPartnerToggle:
    "Despesa paga diretamente pelo sócio, sem movimentar contas da empresa. A despesa segue o ciclo de aprovação normal e aparece no encontro de contas do Fecho Parceiros.",
  reimbursementToggle:
    "Despesa paga do bolso de um funcionário. Não movimenta contas bancárias até à liquidação via Nota de Reembolso. Indique o nome do funcionário a reembolsar.",
  transitoryToggle:
    "Transação transitória (cauções, depósitos, garantias). Não impacta o resultado financeiro do evento (DRE/PL) mas aparece no fecho de sócios para encontro de contas.",
  excludeFromResultToggle:
    "Despesa real que não compõe o resultado financeiro do evento (DRE/PL). Fica registada para histórico e rastreabilidade mas não afeta lucro/prejuízo.",
  excludeFromResultTransaction:
    "Transação excluída do resultado — registada apenas para efeito de histórico, sem impacto no DRE/PL.",
  splitTransaction:
    "Permite dividir uma única fatura/despesa por vários eventos com percentuais iguais ou personalizados.\n\n" +
    "• Funciona com sub-eventos de uma turnê E com eventos totalmente independentes (ex: pacote de mídia para vários shows).\n" +
    "• Ao ativar, selecione os eventos desejados e defina as percentagens.\n" +
    "• O sistema cria uma transação 'Master' (consolidada) e transações 'Split' individuais por evento.\n" +
    "• Alterações e pagamentos na transação Master propagam-se automaticamente para as filhas.\n" +
    "• O BP de cada evento é validado individualmente.",
  splitEqual:
    "Divide o valor igualmente entre todos os eventos selecionados. As percentagens são recalculadas automaticamente ao adicionar ou remover eventos.",
  splitCustom:
    "Permite definir manualmente a percentagem de cada evento. O total deve somar exatamente 100%. Ideal para pacotes com valores desiguais por evento.",
  partnerPortal:
    "Portal de acesso dedicado para parceiros/sócios. Mostra apenas os eventos autorizados pelo administrador, com dados somente leitura (bilhetes, BP e transações).",
  eventCompleted:
    "Evento concluído — todas as operações estão bloqueadas (lockdown). Apenas administradores podem reabrir o evento para edições.",
  auditLog:
    "Histórico detalhado de todas as alterações desta transação. Cada modificação regista o campo alterado, o valor antigo, o novo valor e o autor.",
  linkPartnerExpense:
    "Vincular uma despesa existente a um sócio. A despesa será integrada no encontro de contas do Fecho Parceiros deste evento.",
  reportForecastPayables:
    "Exposição Financeira por evento: cruza as previsões do Business Plan com as transações lançadas para calcular o fluxo de caixa necessário. 'Em Aberto' = lançado mas não pago; 'Saldo BP' = previsto mas ainda não lançado; 'Total a Pagar' = necessidade total de caixa.",
};

export default helpTexts;

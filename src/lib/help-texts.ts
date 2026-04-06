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
    "Gerencie os sócios/parceiros do evento e respetivas percentagens de participação no resultado.",
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
    "Consulte e gerencie as taxas de IVA aplicáveis. Veja como o IVA impacta receitas e despesas nas transações.",

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
    "Crie e gerencie utilizadores. Defina perfis (Admin, Gerente, Editor, Viewer) e personalize permissões individuais.",
  securityDashboard:
    "Monitoramento de segurança: tentativas de login, alterações de dados, MFA e atividade do sistema.",
  databaseBackups:
    "Gerencie backups da base de dados. Crie backups manuais ou configure rotinas automáticas.",
};

export default helpTexts;

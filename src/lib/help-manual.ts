/**
 * Manual de orientação completo — organizado por módulos.
 * Cada secção contém tópicos com título e conteúdo detalhado.
 */

export interface HelpTopic {
  title: string;
  content: string;
  image?: string; // import key for illustration
}

export interface HelpSection {
  id: string;
  title: string;
  icon: string; // lucide icon name
  image?: string; // import key for illustration
  topics: HelpTopic[];
}

const helpManual: HelpSection[] = [
  {
    id: "getting-started",
    title: "Primeiros Passos",
    icon: "Rocket",
    image: "user-roles",
    topics: [
      {
        title: "Visão geral do sistema",
        content:
          "O sistema é uma plataforma de gestão financeira e operacional para empresas de entretenimento e eventos. Permite gerir eventos, transações financeiras, fornecedores, bilheteiras e gerar relatórios detalhados. O Dashboard apresenta um resumo de indicadores-chave, facilitando o acompanhamento da saúde financeira.",
      },
      {
        title: "Perfis de utilizador",
        content:
          "Existem 5 perfis: Admin (acesso total), Gerente (gestão operacional e financeira), Editor (registo de dados com restrições de edição), Viewer (apenas consulta) e User (perfil base). Cada perfil tem permissões pré-definidas que podem ser personalizadas por utilizador na secção Admin > Utilizadores.",
      },
      {
        title: "Navegação",
        content:
          "O menu lateral (sidebar) dá acesso a todas as secções. No desktop, o menu mostra ícones e texto; no mobile, apenas ícones. Use a pesquisa global (lupa no cabeçalho) para encontrar rapidamente eventos, transações ou fornecedores.",
      },
    ],
  },
  {
    id: "events",
    title: "Eventos",
    icon: "Calendar",
    image: "event-lifecycle",
    topics: [
      {
        title: "Criar um evento",
        content:
          "Clique em 'Novo Evento' na listagem. Preencha o nome, data, local e tipo (Simples, Festival ou Múltiplos Dias/Turnê). Eventos iniciam no estado 'Planeamento'. Após preencher e aprovar o Business Plan (BP), o evento pode avançar para 'Confirmado' e depois 'Ativo'.",
      },
      {
        title: "Estados do evento",
        content:
          "Planeamento → estado inicial, permite editar tudo livremente.\nConfirmado → o BP foi aprovado e o evento está agendado.\nAtivo → o evento está em curso ou próximo de acontecer.\nConcluído → evento finalizado. Bloqueia edições operacionais, mas permite ajustes administrativos de bilheteira.",
      },
      {
        title: "Tipos de evento",
        content:
          "Simples: evento com uma única data.\nFestival: evento com múltiplas atrações na mesma data/local.\nMúltiplos Dias (Turnê): mesmo evento repetido em diferentes datas/cidades. Permite gerir cada data individualmente mantendo a estrutura do evento-pai.",
      },
      {
        title: "Business Plan (BP)",
        image: "bp-workflow",
        content:
          "O BP é o orçamento detalhado do evento. Liste todas as receitas e despesas previstas, associando cada linha a uma categoria do Plano de Contas. Após aprovação, as linhas do BP podem ser convertidas em transações reais. Compare sempre previsão vs realizado para controlar desvios.",
      },
      {
        title: "Modos do BP: Ativo vs Passivo",
        content:
          "O BP pode operar em dois modos:\n\nBP Ativo — restringe a criação de transações apenas às categorias previamente orçamentadas. Qualquer despesa ou receita fora do orçamento exige o mecanismo de bypass ('Categoria não prevista?'), que obriga ao preenchimento de uma justificação. Estas transações ficam marcadas como 'Fora do BP' e entram no estado 'Aguardando' para revisão, sem auto-aprovação.\n\nBP Passivo — permite criar transações em qualquer categoria do plano de contas, sem restrição de bypass. O BP funciona apenas como referência de comparação (previsto vs realizado), sem bloquear operações.\n\nEscolha o modo na configuração do evento. Use 'Ativo' para controlo rigoroso e 'Passivo' para flexibilidade operacional.",
      },
      {
        title: "Regras: BP × Transações",
        content:
          "Relação entre linhas do BP e transações:\n\n1. Aprovação — Apenas Admins e Gestores podem aprovar linhas do BP. A primeira aprovação de uma linha em eventos 'Planeamento' ou 'Confirmado' transita automaticamente o evento para 'Ativo'. Em eventos 'Concluídos', a aprovação não altera o estado.\n\n2. Conversão — Uma linha aprovada do BP pode ser convertida numa transação real, vinculando previsão ao registo financeiro efetivo.\n\n3. Alteração de valores aprovados — Admins e Gestores podem alterar valores de linhas já aprovadas em eventos ativos, mas é obrigatória uma justificação que fica registada no log de auditoria. O histórico de alterações é visível na interface e pode ser incluído no PDF do relatório.\n\n4. Bypass (BP Ativo) — Se precisar de uma categoria não prevista no orçamento, utilize o link 'Categoria não prevista?'. A transação criada por bypass:\n   • Exige justificação obrigatória\n   • Entra como 'Aguardando' (sem auto-aprovação)\n   • Fica marcada com badge 'Fora do BP' nos relatórios\n\n5. Ordenação — Todas as linhas do BP seguem obrigatoriamente a ordem do código numérico do plano de contas, tanto na interface como nas exportações.",
      },
      {
        title: "Limites de edição por estado do evento",
        content:
          "Planeamento — Edição livre de todas as linhas do BP e transações.\nConfirmado — BP editável; transações podem ser criadas normalmente.\nAtivo — Linhas aprovadas do BP só podem ser alteradas por Admin/Gestor com justificação. Transações seguem o fluxo padrão de aprovação.\nConcluído — Edições operacionais bloqueadas. Apenas ajustes administrativos de bilheteira são permitidos. Aprovações de linhas do BP não alteram o estado do evento.",
      },
      {
        title: "Cachê de artistas",
        content:
          "Configure o cachê na aba dedicada do evento. Pode ser um valor fixo ou uma percentagem da receita (bruta ou líquida). Defina deduções por categoria para calcular a base correta do cachê variável. O sistema calcula automaticamente o valor final.\n\nCachê Fixo — Valor pré-acordado, independente da receita do evento.\n\nCachê Variável — Percentagem sobre a receita de bilheteira, podendo usar a base bruta ou líquida (sem IVA). Antes de aplicar a percentagem, o sistema subtrai:\n  • Deduções por categoria — despesas do BP associadas a categorias selecionadas (ex: som, luz)\n  • Dedução fixa percentual — uma percentagem direta sobre a receita\n\nO cálculo é: (Receita − Deduções) × Percentagem do Artista = Cachê Bruto.",
      },
      {
        title: "Despesas Extras do Artista",
        content:
          "São custos adicionais pagos pelo evento em nome do artista (ex: quarto de hotel extra, transfer especial, catering adicional) que devem ser descontados do cachê final. Estas despesas não geram transações financeiras separadas — são registadas apenas para efeito de cálculo e demonstração no acerto.\n\nAceda à secção 'Extras a Descontar' dentro da configuração de cachê de cada artista. Cada extra tem descrição, valor e pode ter documentos anexados (recibos, faturas).\n\nNo Relatório de Cachê do Artista, os extras aparecem analiticamente após o cachê bruto:\n  Cachê Bruto\n  (-) Extra 1\n  (-) Extra 2\n  = Cachê Líquido a Pagar",
      },
      {
        title: "Parceiros / Sócios",
        content:
          "Associe fornecedores marcados como 'Parceiro' ao evento e defina a percentagem de participação no resultado. O sistema calcula automaticamente a divisão de lucros/prejuízos com base nas receitas, despesas e custos de fecho.",
      },
      {
        title: "Despesas Extras do Sócio",
        content:
          "São despesas pagas pelo evento em nome de um sócio específico (ex: quarto de hotel extra, despesas pessoais) que devem ser descontadas apenas da parte desse sócio no resultado. Não afetam o resultado global do evento nem geram movimentações nas contas.\n\nAceda à secção 'Extras a Descontar' dentro do painel de cada sócio na aba Sócios do evento. Cada extra tem descrição, valor, notas e pode ter documentos anexados.\n\nNo DRE com visão Sócio, os extras aparecem analiticamente:\n  Quota Bruta do Sócio (X%)\n  (-) Despesa Extra 1\n  (-) Despesa Extra 2\n  = Quota Líquida do Sócio",
      },
      {
        title: "Custos de Fecho",
        content:
          "São despesas que não geram transação de pagamento (ex: rateio de equipa, assessoria jurídica), mas que impactam o resultado final do evento e o cálculo da participação dos sócios. Adicione-os na aba de Fecho do evento.",
      },
      {
        title: "Bilheteira do evento",
        content:
          "Configure zonas (ex: Pista, Camarote) e lotes de bilhetes com preços e capacidades. O sistema calcula automaticamente a receita bruta, IVA e receita líquida. Associe bilheteiras (pontos de venda) para acompanhar vendas por canal.",
      },
    ],
  },
  {
    id: "transactions",
    title: "Transações",
    icon: "ArrowUpDown",
    image: "transaction-lifecycle",
    topics: [
      {
        title: "Criar uma transação",
        content:
          "Clique em 'Nova Transação'. Escolha o tipo (Receita ou Despesa), associe a um evento (se aplicável), selecione fornecedor e categoria do Plano de Contas. Defina o valor, data e vencimento. Pode anexar documentos (faturas, contratos).\n\nAntes de confirmar uma despesa, o sistema apresenta um painel de verificação com os dados bancários do fornecedor (NIF, IBAN, SWIFT/BIC) para garantir que a conta de destino está correta.",
      },
      {
        title: "Ciclo de vida da transação",
        content:
          "Aguardando → transação registada, pendente de aprovação. Pode ser editada livremente.\nAprovada → validada por um gestor/admin. Apenas admins podem editar.\nPaga → pagamento registado. Bloqueada para qualquer edição.",
      },
      {
        title: "Pagamentos parciais",
        content:
          "O sistema permite liquidações parciais. Ao registar pagamento, informe o valor efetivamente pago. O campo 'Valor Pago' é atualizado progressivamente até atingir o valor total da transação.",
      },
      {
        title: "Transferências entre contas",
        content:
          "Use 'Transferência entre Contas' para mover saldo. O sistema cria automaticamente duas transações: uma saída na conta de origem e uma entrada na conta de destino, mantendo o histórico completo.",
      },
      {
        title: "Documentos anexados e classificação contábil",
        content:
          "Cada transação pode ter múltiplos documentos (faturas, recibos, contratos). Clique no ícone de documentos na linha da transação para ver, adicionar ou remover ficheiros.\n\nDocumentos contábeis — Ao fazer upload, marque a checkbox 'Documento contábil' para documentos fiscais (faturas, notas fiscais, recibos, notas de crédito/débito, comprovativos de pagamento bancário). Use o ícone de informação (ℹ️) junto da checkbox para ver exemplos.\n\nNÃO marcar como contábil: propostas, contratos, riders técnicos, e-mails ou screenshots internos.\n\nEsta classificação é essencial para a exportação contábil e para o relatório de pendências documentais.",
      },
      {
        title: "Listas de Pagamento (nas transações)",
        content:
          "Dentro do módulo de transações, pode criar Listas de Pagamento diretamente. Selecione transações aprovadas e agrupe-as numa lista para processamento em lote. As listas passam por um fluxo de aprovação (Rascunho → Submetida → Aprovada) antes de serem executadas.",
      },
    ],
  },
  {
    id: "accounts",
    title: "Contas de Movimentação",
    icon: "Landmark",
    image: "accounts-flow",
    topics: [
      {
        title: "O que são contas de movimentação",
        content:
          "Representam onde o dinheiro está: contas bancárias, caixas, bilheteiras, cartões. O saldo é calculado automaticamente a partir do saldo inicial + transações pagas (entradas) − transações pagas (saídas).",
      },
      {
        title: "Controlo de acesso por conta",
        content:
          "Cada conta pode ter visibilidade restrita. Na configuração da conta, defina quais utilizadores têm acesso. Utilizadores sem acesso não verão a conta nem o seu saldo. Administradores veem sempre todas as contas.",
      },
    ],
  },
  {
    id: "suppliers",
    title: "Fornecedores e Parceiros",
    icon: "Users",
    topics: [
      {
        title: "Gerir fornecedores",
        content:
          "Registe dados de contacto, NIF, IBANs (até 3) e documentação. Fornecedores marcados como 'Parceiro' podem ser associados a eventos para divisão de resultados.",
      },
      {
        title: "Dados bancários",
        content:
          "Cada fornecedor pode ter até 3 contas bancárias (IBAN + SWIFT/BIC). Ao criar transações, selecione qual IBAN usar para pagamento.",
      },
    ],
  },
  {
    id: "categories",
    title: "Plano de Contas",
    icon: "BookOpen",
    topics: [
      {
        title: "Estrutura hierárquica",
        content:
          "O Plano de Contas organiza receitas e despesas em categorias com códigos numéricos (ex: 1 → Produção, 1.1 → Som e Luz). A ordenação é sempre pelo código. Categorias podem ser Receita ou Despesa.",
      },
      {
        title: "Vínculo a eventos",
        content:
          "Categorias operacionais (grupos 1 a 4) exigem associação a um evento nas transações. O grupo 10 (Administrativo/Financeiro) trata de custos fixos e estruturais sem essa exigência.",
      },
      {
        title: "Impacto nos relatórios",
        content:
          "O DRE e o BP agrupam valores pela hierarquia do Plano de Contas. Uma categorização correta é essencial para relatórios precisos.",
      },
    ],
  },
  {
    id: "ticket-offices",
    title: "Bilheteiras",
    icon: "Store",
    topics: [
      {
        title: "Configurar bilheteiras",
        content:
          "Bilheteiras são pontos de venda de bilhetes (físicos ou online). Cada bilheteira pode estar associada a uma conta financeira para receber os valores de venda.",
      },
      {
        title: "Conciliação",
        content:
          "Após o evento, concilie os valores de venda registados com os valores efetivamente recebidos na conta da bilheteira. Marque como conciliado após conferência.",
      },
    ],
  },
  {
    id: "reports",
    title: "Relatórios",
    icon: "BarChart3",
    topics: [
      {
        title: "DRE — Demonstração de Resultado",
        content:
          "Apresenta receitas e despesas agrupadas por categoria, com cálculo do resultado líquido. A 'Visão Sócio' inclui custos de fecho para refletir o impacto total na divisão de resultados.",
      },
      {
        title: "Business Plan (BP) Consolidado",
        content:
          "Compara previsões do BP com valores reais por evento e categoria. Permite identificar desvios e ajustar o planeamento.",
      },
      {
        title: "Extrato Bancário",
        content:
          "Extrato detalhado de cada conta financeira com todas as movimentações e saldo acumulado. Use para conferir com extratos do banco.",
      },
      {
        title: "Fluxo de Caixa",
        content:
          "Projeção de entradas e saídas futuras com base nas datas de vencimento. Essencial para planear a liquidez da empresa.",
      },
      {
        title: "Contas a Pagar",
        content:
          "Lista de compromissos financeiros pendentes com valores, datas de vencimento e estado de pagamento.",
      },
      {
        title: "Cachê do Artista",
        content:
          "Relatório analítico dedicado ao cachê de cada artista do evento. Para cachê variável, demonstra passo a passo: receita de bilheteira → deduções por categoria → dedução fixa percentual → base de cálculo → percentagem do artista → cachê bruto. Para cachê fixo, apresenta o valor acordado.\n\nEm seguida, lista analiticamente todos os custos extras a descontar, chegando ao cachê líquido a pagar. Pode ser exportado em PDF para prestação de contas ao artista ou à sua equipa.",
      },
      {
        title: "Listas de Pagamento",
        content:
          "Agrupe transações aprovadas em listas para processamento em lote. As listas passam por aprovação antes de serem executadas.",
      },
      {
        title: "Exportar para PDF / Excel",
        content:
          "Todos os relatórios podem ser exportados para PDF (impressão) ou Excel (análise). O PDF preserva a hierarquia e formatação visual.",
      },
    ],
  },
  {
    id: "quotations",
    title: "Cotações",
    icon: "FileCheck",
    topics: [
      {
        title: "Fluxo de cotações",
        content:
          "Solicite cotações a fornecedores para serviços de eventos. Compare propostas lado a lado. Ao aprovar uma cotação, pode convertê-la diretamente numa transação no BP do evento.",
      },
    ],
  },
  {
    id: "recurring",
    title: "Transações Recorrentes",
    icon: "RefreshCw",
    topics: [
      {
        title: "Configurar recorrência",
        content:
          "Crie modelos de transações que se repetem periodicamente (rendas, seguros, serviços mensais). Defina a frequência, dia do mês, data de início e fim. O sistema gera automaticamente as transações na data definida.",
      },
    ],
  },
  {
    id: "calendar",
    title: "Calendário",
    icon: "CalendarDays",
    topics: [
      {
        title: "Vistas disponíveis",
        content:
          "Semanal: detalhe dia a dia com eventos e reservas.\nAnual: visão de 12 meses para planeamento a longo prazo.\nAgenda: lista cronológica de próximos eventos.",
      },
      {
        title: "Reservas de espaço",
        content:
          "Reserve espaços (venues) para datas específicas, mesmo antes de criar o evento. Útil para garantir disponibilidade durante o planeamento.",
      },
    ],
  },
  {
    id: "admin",
    title: "Administração",
    icon: "Settings",
    topics: [
      {
        title: "Gestão de utilizadores",
        content:
          "Crie contas para novos utilizadores com perfil pré-definido. Personalize permissões individuais quando necessário. É possível revogar ou conceder permissões específicas sem alterar o perfil base.",
      },
      {
        title: "Segurança",
        content:
          "O painel de segurança mostra tentativas de login, alterações de dados sensíveis e atividade do sistema. Monitorize para detetar acessos não autorizados.",
      },
      {
        title: "Backups",
        content:
          "Gerencie backups da base de dados. Crie backups manuais antes de alterações importantes ou configure rotinas automáticas para proteção contínua.",
      },
    ],
  },
  {
    id: "iva",
    title: "Gestão de IVA",
    icon: "Receipt",
    topics: [
      {
        title: "Taxas de IVA",
        content:
          "Consulte e configure as taxas de IVA aplicáveis. Ao criar transações ou linhas de BP, selecione a taxa correta. O sistema calcula automaticamente o valor líquido e o IVA em todos os relatórios.",
      },
    ],
  },
];

export default helpManual;

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
    id: "reports",
    title: "Relatórios",
    icon: "BarChart3",
    topics: [
      {
        title: "DRE — Demonstração de Resultado",
        content:
          "Apresenta receitas e despesas agrupadas por categoria, com cálculo do resultado líquido. O sistema oferece duas versões:\n\nDRE Padrão — Layout de 3 colunas (Sem IVA, IVA e Com IVA). A linha 'Mundo Propício' aparece como sócia (com a quota residual: 100 − Σ sócios externos) e reflete o lucro real (ex-IVA) que cabe à empresa gestora.\n\nDRE Brasil — Relatório adaptado para sócios com base 'Despesas c/IVA', com layout de coluna única (Receitas s/IVA e Despesas c/IVA).\n\nEm ambos, a 'Visão Sócio' inclui custos de fecho para refletir o impacto total na divisão de resultados.",
      },
      {
        title: "Business Plan (BP) Consolidado",
        content:
          "Compara previsões do BP com valores reais por evento e categoria. Permite identificar desvios e ajustar o planeamento. Inclui opção de visualizar o histórico de alterações de linhas aprovadas.",
      },
      {
        title: "Extrato Bancário",
        content:
          "Extrato detalhado de cada conta financeira com todas as movimentações e saldo acumulado. Inclui visualização de documentos anexados por transação. Use para conferir com extratos do banco.",
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
        title: "Movimentações",
        content:
          "Relatório analítico de movimentações financeiras que consolida todas as transações (liquidadas e em aberto) agrupadas por evento. Suporta filtros por período, multi-seleção de contas e eventos, e inclui visualização de anexos e log de auditoria para liquidações parciais.",
      },
      {
        title: "Cachê do Artista",
        content:
          "Relatório analítico dedicado ao cachê de cada artista do evento. Para cachê variável, demonstra passo a passo: receita de bilheteira → deduções por categoria → dedução fixa percentual → base de cálculo → percentagem do artista → cachê bruto. Para cachê fixo, apresenta o valor acordado.\n\nEm seguida, lista analiticamente todos os custos extras a descontar, chegando ao cachê líquido a pagar. Pode ser exportado em PDF para prestação de contas ao artista ou à sua equipa.",
      },
      {
        title: "Despesas de Sócios",
        content:
          "Relatório consolidado de todas as despesas pagas diretamente por sócios/parceiros em qualquer evento. Filtre por evento ou sócio e exporte o relatório em PDF. Estas despesas compõem a apuração do resultado do evento no encontro de contas.",
      },
      {
        title: "Auditoria de Bilheteiras",
        content:
          "Relatório de consolidação financeira de bilheteiras com visões Sintética e Analítica. A visão Analítica suporta agrupamento 'Por Categoria' ou 'Por Evento' em três níveis de detalhe. Vendas e despesas diretas são separadas por evento; comissões são distribuídas proporcionalmente pelo volume de vendas; transferências são tratadas como movimentos globais. Exportável em PDF e Excel.",
      },
      {
        title: "Pendências Documentais",
        content:
          "Relatório de auditoria que identifica transações com conta bancária associada que não possuem documentos contábeis (faturas, recibos, notas fiscais) anexados. Filtre por período, conta ou evento. Use como ferramenta de conformidade contínua para regularizar pendências antes da exportação contábil.\n\nOs cards resumo permitem alternar rapidamente entre transações pendentes, conformes ou todas. Exportável em Excel.",
      },
      {
        title: "Listas de Pagamento",
        content:
          "Agrupe transações aprovadas em listas para processamento em lote. As listas passam por aprovação antes de serem executadas. Pode criar listas tanto no módulo de relatórios como diretamente nas transações.",
      },
      {
        title: "Exportar para PDF / Excel",
        content:
          "Todos os relatórios podem ser exportados para PDF (impressão) ou Excel (análise). O PDF preserva a hierarquia e formatação visual.",
      },
    ],
  },
  {
    id: "partner-portal",
    title: "Portal do Parceiro",
    icon: "UserCheck",
    topics: [
      {
        title: "O que é o Portal do Parceiro",
        content:
          "Utilizadores com perfil 'Parceiro' acedem a um layout simplificado e dedicado, sem acesso ao sistema principal. O portal mostra apenas os eventos a que o parceiro foi autorizado pelo administrador.",
      },
      {
        title: "Acesso a eventos",
        content:
          "O administrador controla quais eventos cada parceiro pode ver através da tabela de acessos (partner_event_access). Os acessos podem ser ativados ou desativados a qualquer momento.\n\nPara eventos multi-cidade (Turnês), pode-se autorizar o evento Master (acesso a tudo) ou apenas eventos Split específicos.",
      },
      {
        title: "Informações disponíveis",
        content:
          "Ao clicar num evento autorizado, o parceiro tem acesso read-only a 3 abas:\n  • Bilhetes — zonas, lotes, vendas\n  • Business Plan — receitas e despesas previstas\n  • Transações — movimentos financeiros do evento\n\nTodos os dados são somente leitura — nenhum botão de criar, editar ou eliminar.",
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
          "Consulte e configure as taxas de IVA aplicáveis (0%, 6%, 13%, 23%). Ao criar transações ou linhas de BP, selecione a taxa correta. O sistema calcula automaticamente o valor líquido e o IVA em todos os relatórios.",
      },
    ],
  },
  {
    id: "accounting",
    title: "Contabilidade",
    icon: "BookOpen",
    topics: [
      {
        title: "Classificação de documentos contábeis",
        content:
          "Ao anexar documentos a transações, marque a checkbox 'Documento contábil' para ficheiros fiscais (faturas, notas fiscais, recibos, notas de crédito/débito, comprovativos de pagamento). O ícone de informação (ℹ️) junto da checkbox lista exemplos do que marcar e do que não marcar.\n\nEsta classificação é o filtro principal para a exportação contábil e o relatório de pendências.",
      },
      {
        title: "Relatório de Pendências Documentais",
        content:
          "Disponível em Relatórios → Pendências Documentais. Identifica transações com conta bancária que não possuem documentos marcados como contábeis. Filtre por período, conta financeira ou evento.\n\nOs cards resumo clicáveis permitem alternar entre transações pendentes (⚠️), conformes (✅) ou todas. Use como ferramenta de auditoria contínua para regularizar pendências antes de qualquer exportação.",
      },
      {
        title: "Registo de exportações",
        content:
          "Cada exportação contábil fica registada no sistema com a data, o período exportado, quem exportou e as contagens de transações, documentos e pendências. Este registo permite rastrear o que já foi enviado à contabilidade.",
      },
    ],
  },
];

export default helpManual;

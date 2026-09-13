# Estado — Fecho, Fechamentos e Sócios (#146)

Actualizado em 2026-09-13 (g9a). **Nada publicado** — tudo construído e provado em
Live por leitura; o Publish é decisão do Pedro.

## Construído

- **(b)** `event_settlement_id` em transações e linhas de BP.
- **(c)** motor puro dos fechamentos (`src/lib/event-settlement-engine.ts`).
- **(d)** operações de terceiros (bares, bengaleiro, …) com participações por nó.
- **(e)** espelho `event_partners` a partir de qualquer fechamento + trigger de sync.
- **(e2)** critério de custo do evento na BD (`events.cost_expense_source`,
  `cost_include_overhead`).
- **(f)** selo do fechamento (`seal_event_settlement`, snapshot + validações C1/C2).
- **(g1)** casa em qualquer fechamento, IVA dedutível devolvido ao nó, nominal gap.
- **(g2)** Anitta EDA 2026 a três níveis provada em Live (ANITTA 417.293,42;
  nível 3 547.906,69; C1 e C2 a 0,00).
- **(g3)** resultado do evento = perímetro do fechamento raiz, em toda a app e no
  Portal do Sócio.
- **(g4)** base de cálculo é do fechamento; documento do sócio em formato
  Prestação de Contas (PDF + Excel), estanque.
- **(g4·2/g5)** desembolso efectivo, ajustes manuais, receitas em poder do sócio,
  financiamento a devolver, painel "Posição de caixa por sócio" e RPC
  `get_partner_settlement_summary` para o Portal.
- **(g6)** devolução de linhas de BP a um fechamento abaixo (custos internos da
  sociedade) — motor e testes; raiz imutável.
- **(g7)** "Recebido por" nas receitas por encontro de contas: campo no editor,
  quarta fonte de receitas em poder do sócio, testes; DDL aplicada.
- **(g8)** auditoria de estanqueidade entre sócios (só leitura):
  `docs/auditorias/AUD-estanqueidade-socios-2026-09-13.md` — P0 5 · P1 5 · P2 3,
  issues #158 a #167.
- **(g9a)** #158 fechada: as 51 políticas RLS abertas
  (`auth.uid() IS NOT NULL`) foram substituídas por
  `<tabela>_select_privileged_roles` com `has_staff_role`, mais políticas
  estanques de sócio em `account_categories` e `role_permissions`. Prova
  antes/depois na mesma transação; sócio passa de 45 tabelas visíveis a 0.

## Falta

- **Auditoria (g8)** — correcções #159 a #167, uma a uma, por gravidade.
- **(g6)** UI restante (badge e linha no painel do filho, documento do sócio).
- **(g7)** marcar a transação do A&B Food no ecrã depois do Publish (sem DML).
- **Prova formal contra a planilha v23** (02/09): EDA 417.677,51 · MP+EIN
  597.502,78 · EIN 298.751,39.
- **Selar** o fechamento da Anitta depois dessa prova.
- **Papel de staff** para `producaotec@mundopropicio.com` na empresa Coala
  Festival Portugal — decisão do Pedro, é DML.
- **Publish** — não feito, por decisão explícita.

## Notas

- DRE Empresarial e DRE Brasil são vistas de EMPRESA e mantêm os exclusivos.
- Descrições de transações e de linhas de BP são texto de negócio: sem notas de
  implementação, referências a fechamentos ou "planilha vNN".
- Políticas PERMISSIVE abertas são proibidas: padrão `privileged_roles` (staff)
  + política estanque de sócio.
- 1 cêntimo de diferença de apresentação no Encontro de Contas da raiz
  (417.293,41 no ecrã vs 417.293,42 no motor) — truncatura, não cálculo.

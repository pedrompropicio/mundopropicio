# Estado — Fecho, Fechamentos e Sócios (#146)

Actualizado em 2026-09-13 (g9c). **Nada publicado** — tudo construído e provado em
Live por leitura e por prova em transação; o Publish é decisão do Pedro.

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
  (`auth.uid() IS NOT NULL`) substituídas por `<tabela>_select_privileged_roles`
  com `has_staff_role`, mais políticas estanques de sócio em `account_categories`
  e `role_permissions`. Sócio passa de 45 tabelas visíveis a 0.
- **(g9b)** #159 #160 #161 #163 #164 #165 fechadas: identidade canónica do sócio
  (`user_supplier_id` + `user_event_partner_ids`), `is_settlement_staff` =
  `has_staff_role`, visibilidade que nunca sobe, despesas e percentagens só do
  próprio nó, `get_partner_event_tx_aggregates` com permissão + participação +
  perímetro da raiz + confidencialidade, e `get_partner_visible_settlements`
  (fechamento visível = onde o sócio acerta contas). Fuga fechada:
  34 linhas / 749.207,58 € → 0.
- **(g9c)** #162 #166 #167 fechadas + P2-12:
  - `user_settlement_ids` só devolve nós com `mode='settles'` — presença nominal
    deixa de dar vista (lobo: 3 → **1** fechamento; 0 operações de terceiros).
  - `get_partner_event_shares` mostra **MUNDO PROPÍCIO** quando não há outro sócio
    no nó, casa explícita ou implícita ("Sócios locais 80" → "MUNDO PROPÍCIO 80").
  - Portal escolhe o fechamento por `get_partner_visible_settlements`.
  - Documento do sócio sem vocabulário interno ("IVA dedutível recuperado",
    "Custos internos da sociedade", folha "Resumo"); `FORBIDDEN_DOC_TERMS` inclui
    "fechamento"/"fecho", com teste nos 3 sócios em pt-PT e pt-BR.
  - Cache limpa na troca de identidade e no `signOut`; queryKeys do Portal
    prefixadas pelo `user.id`.
  - Ligação sócio ↔ utilizador do Portal na ficha do fornecedor + aviso em
    `PartnerAccessManager` quando falta.

## Falta

- **Prova formal contra a planilha v23** (02/09): EDA 417.677,51 · MP+EIN
  597.502,78 · EIN 298.751,39.
- **Selar** o fechamento da Anitta depois dessa prova.
- **(g6)** UI restante (badge e linha no painel do filho).
- **(g7)** marcar a transação do A&B Food no ecrã depois do Publish (sem DML).
- **Papel de staff** para `producaotec@mundopropicio.com` na empresa Coala
  Festival Portugal — decisão do Pedro, é DML.
- **Ligar os utilizadores dos sócios ao respectivo fornecedor**
  (`profiles.linked_supplier_id`) — nenhum dos 3 suppliers o tem hoje; agora
  faz-se no ecrã (ficha do fornecedor), sem SQL.
- **Publish** — não feito, por decisão explícita. g7–g9c estão prontos.

## (g14) IVA não recuperável pela sociedade — feito

- Coluna `event_forecasts.vat_non_recoverable` aplicada (sem Publish).
- Semântica (13/09): marca IVA pago e legalmente não dedutível (viaturas,
  refeições, entretenimento). IVA negocial sem fatura NÃO se marca.
- Motor: sai da devolução e abate ao resultado real (âncora C1); não é valor
  retido pela casa. C2 sem parcela nova.
- UI: checkbox no editor da linha do BP + badge; "IVA não recuperável (custo,
  fora da devolução)" na Posição da MP; documento do sócio com o valor líquido.
- Anitta: nenhuma linha marcada — referências intactas.
- Testes: 27 no motor, 66 no conjunto fecho/sócios; `tsgo` limpo.
- Marcação das linhas fica para o Pedro no BP (sem DML).

## Notas

- DRE Empresarial e DRE Brasil são vistas de EMPRESA e mantêm os exclusivos.
- Descrições de transações e de linhas de BP são texto de negócio: sem notas de
  implementação, referências a fechamentos ou "planilha vNN".
- Políticas PERMISSIVE abertas são proibidas: padrão `privileged_roles` (staff)
  + política estanque de sócio.
- 1 cêntimo de diferença de apresentação no Encontro de Contas da raiz
  (417.293,41 no ecrã vs 417.293,42 no motor) — truncatura, não cálculo.
- `get_partner_event_shares` está gateada por `user_has_event_access`: o ramo de
  staff só responde a quem tem `partner_event_access` no evento.
- Testes: 7 falhas pré-existentes e alheias a este trabalho
  (`storage-multi-tenant`, `forecast-boost`, `EventABTab`).

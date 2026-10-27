# P4 — get_financial_position_base — provas (27/10/2026)

R2, Sim do Pedro a 27/10/2026. HEAD antes: `f02c1ea826d22306eef394061c17ed178da3c804`. Migração `drizzle/migrations/0282_p4_financial_position_base.sql`, cópia byte-idêntica `supabase/manual/0282_p4_financial_position_base.sql` (sha256 `6f174c92624a6738ae843bb78c7396b7686305e71013d724457ae02c78ea53a7` nas duas), rollback comentado `supabase/manual/rollback_0282_p4_financial_position_base_comentado.sql`. Só cria uma função; nenhum DML, UI, edge function ou Publish. Decisão D-ERP320.

## (a) ACL
has_function_privilege: anon f, authenticated t, PUBLIC f. Chamada REST com chave anónima: 401 `permission denied for function get_financial_position_base`.

## (b) Funções existentes
md5 agregado (`oid::regprocedure || md5(pg_get_functiondef)`, schema public, prokind f/p): antes `8d2beba2881cd8dc91689e159ea681df` / 827; depois, excluindo a nova, `8d2beba2881cd8dc91689e159ea681df` / 827. Nenhuma alterada.

## (c) Blocos contra SELECT independente (MP, p_year nulo, referência 2026-10-27 Lisboa)
Chamada com sessão do Pedro (platform_admin). SELECT independente em psql, com o estágio replicado a partir do código de event_stage (o leitor não tem EXECUTE). Os números coincidem ao cêntimo.

| Bloco | RPC | Independente |
|---|---|---|
| a pagar BP em_fecho (4 eventos começados) | 570.307,41 / 56 linhas | 570.307,41 / 56 |
| a pagar BP fechado (3 eventos) | 184.924,51 / 41 | 184.924,51 / 41 |
| tx sem BP em_fecho / fechado | 0,02 / 17,89 (5) | 0,02 / 17,89 (5) |
| em_curso (3 eventos futuros) só transações | 252.664,94 (27 tx) | 252.664,94 (27) |
| a receber em_fecho (sem 1.1.*) | 22.636,89 (3) | 22.636,89 (3) |
| planeamento | 0 eventos | 0 |

Total a pagar 1.007.914,78; transitórias de repasse a pagar 64.703,88 (4, bruto); a receber transitória 5.192,19 (1).
Sublinhas: em_fecho lançado 338.152,83 · confirmado 175,20 · por rever 231.293,96 · ajustado 685,42 · partner_paid 0; fechado lançado 10.795,73 · por rever 174.122,55 · ajustado 6,23.
Alertas: pago acima do BP 22 linhas / 4.661,86; BP sem transação 38 linhas / 367.302,78 (37 por rever).

Exclusões contadas (Live): mães de rateio 58 / 371.639,97 base (excluídas); cadeias de parcelas 11 / 194.955,29 (contam); BP com sócio pagador 157 linhas / 1.486.866,31 bruto (fora); estornos 1 / 3.177,96; transitórias 57 / 541.434,34 base (só abertas em sublinha); raízes em histórico 11 (fora; inclui Turnê Maiara e Maraisa 2026 + 2 sub-eventos). Anitta: status active, em_fecho, entra no BP.

## (d) IVA e evento futuro
Cenografia Label EDA: base 57.194, iva 23 ⇒ bruto 70.348,62 (= base×1,23). Com divisão inteira daria 57.194 (erro evitado). Teste PGlite cobre.
Correção eventos futuros: antes (BP contado em em_curso) 981.244,72 em 134 linhas; depois só transações 252.664,94. Critério: primeira data (events.date e event_dates, raiz e sub-eventos) ≤ hoje em Europe/Lisbon.

## (e) Caixa
Banco Santander Totta 552.638,88; Conta Caixa 0,00; cartões 0663 600,89 + 8363 288,66 = 889,55 ⇒ caixa+cartões 553.528,43.
get_event_cash_position_invariant(MP) com sessão: lhs 553.528,43 = rhs 553.528,43, diff 0, is_balanced true. Bate ao cêntimo. O valor esperado no plano (530.122,43) estava desatualizado: o banco subiu 23.406,00 desde a medição (movimento posterior; não investigado aqui).
Retido: visível ECI 295.748,25; ocultas BOL 45.015,00 + Ticketline 170.842,41 + Blueticket 0 + Fever 0 = 215.857,41 (via ticket_office_balances). Nunca somado à caixa.
Acerto informativo (fora do total): EIN 955.138,82; Conta Corrente Pedro 183.098,58; PNI 162.553,14; Turnê Deive 1.162,19; caução a recuperar 34.000,00.

## (f) Testes
`src/test/financial-position-base-p4.test.ts` (PGlite, carrega a migração manual): IVA 23; mãe de rateio vs parcelas; sócio pagador; mínimo 0 com alerta; futuro só transações; sub-evento herda estágio; histórico fora; contrato substitui cache_module; sublinhas da revisão; caixa e retido não somam; empresa alheia recusada salvo platform_admin; membro sem admin/manager recusado. 12/12; com P1/P1b 30/30.

## Por verificar
- Recusa de empresa alheia em Live: a sessão do Pedro é platform_admin, por isso passa (por desenho). A recusa só está provada em PGlite. Prova Live exige uma conta admin/manager não platform_admin.
- Limite de 1000 linhas: a resposta é um único jsonb; não há listas por linha de BP.
- CI remoto do commit não verificado.

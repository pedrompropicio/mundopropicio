# HANDOFF — 2026-09-16 · Pernas de rateio e linhas de BP

> Arquivo. **Não é fonte de estado** — o estado vive em `docs/estado/estado-bp-verbas-e-rateio.md`.

## O que se fez

- **Regularização das pernas de rateio sem linha de BP: 74 → 35.** Tratadas SM Lisboa/Porto e
  Deive Braga/Lisboa (14 pernas), Anitta (23 pernas, 860,96 €) e Ivete (1 perna).
- **Dois modelos de rateio ganharam nome (D-ERP76):** A (multi-evento, mãe sem evento + filhas
  reais com a linha de cada evento) e B (Master/sub-evento, mãe no Master + proração virtual ÷N).
  **Conversões A → B** feitas onde a repartição já era ÷N, sem perder um cêntimo (SM
  94.370,54 → 94.370,53 — o cêntimo era um erro real; Deive 11.403,64 inalterado).
- **Parcelas passam a herdar a linha da 1.ª prestação (D-ERP77).** Na Ivete: 8 parcelas,
  61.428,59 €; sete linhas fecharam com folga 0,00. Excepções: Palácio do Estoril elevado em
  188,00 € (7.260,00 → 7.448,00) e Hotel Londres fechado a zero com a despesa solta da PATRIHOTEL
  (1.040,40).
- **Ivete sanada por inteiro para fecho:** 62 lançamentos, 101.243,85 €. Despesa 458.648,20 € e
  receita 44.022,78 € **inalteradas**; restam 8 lançamentos sem linha, todos transitórios; zero
  violações da D1.
- **Tour M&M — Verão Europa 2026 + 4 sub-eventos marcados `without_bp`** (partner_managed /
  Workshow, zero linhas de BP).
- **Anitta, os 860,96 €:** rota de panfletagem partilhada com Ivete e SM Lisboa, faturas divididas
  a três (flyers a quatro, com SM Porto). Vincular não moveu número nenhum.

## O que NÃO se fez

- **Henry & Klauss Porto + Lisboa — 26 pernas, 69.730,83 €.** O maior e mais antigo bloco que
  resta; aplicar o critério do D-ERP76.
- **Maiara e Maraisa Porto + Lisboa — 2 pernas, 6.314,80 €**; Ivete 1 perna de 3.020,00 € noutro
  evento (confirmar antes); M&M 4 pernas (17,88 €) e RG 2 (7,60 €).
- **Fase 3 da trava (D-ERP72/D-ERP73)** — estreitar a isenção a parcelas
  (`installment_group_id IS NOT NULL`). Depende de tratar as 35 pernas que faltam.
- **6 eventos `partner_managed`** ainda por marcar `without_bp`.
- **457 transações aprovadas sem linha de BP** em eventos `with_bp` (Coala 326, Anitta 103), todas
  anteriores a 03/09.
- **Sessões de cartão fechadas em Agosto não se reabrem** (decisão do Pedro a 16/09).

## Ponteiros

- **#100** — `events.budget_mode` sem UI, NULL nos 56 eventos, lista dos `partner_managed`.
- **#111** — tabela das transações aprovadas sem linha de BP, por evento.
- **#122** — marca própria da elevação em `raise_forecast_budget` + a função recusa `service_role`.
- **#183** — fatura Meta 252466632, 1.174,57 € por atribuir a evento (chat `audience-meta`).

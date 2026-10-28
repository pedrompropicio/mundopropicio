# Estado — bp-hk-madrid-2026

> Reescrito por cima no fecho de cada sessão. Não é datado; o que está aqui é o que vale agora.
> **Confidencialidade:** o repo é público. Termos contratuais com parceiros, valores negociados e dados pessoais não entram aqui (D-ERP307); vivem no Projeto do Claude, no Drive com partilha restrita ou no chat.

## O evento

- **Henry & Klauss - Madrid** · `events.id` `bf9ce2d8-754e-4485-8427-e2d486c39919` · empresa Mundo Propício `7c858982-6ccd-47ca-bd65-e0dd3eebf01c`.
- Sala: UMusic Hotel Teatro Albéniz, Madrid. Primeira data registada: 21/11/2026. Estado `active`. Evento único (sem cidades filhas).
- `budget_mode` nulo no evento → herda o da empresa, `with_bp` (despesa precisa de linha do BP para ser aprovada).
- Origem: `SELECT … FROM events WHERE id = 'bf9ce2d8-…'`, 28/10/2026.

## Onde estamos (28/10/2026)

Chat aberto a 28/10/2026 por decisão do Pedro. Ainda sem sessão de trabalho.

Fotografia na base em 28/10/2026 (consultar de novo antes de usar):
- BP de trabalho (`version_id IS NULL`): 20 linhas de **despesa**, todas aprovadas, base 650.210,44 €. **Nenhuma linha de receita.** Nenhuma versão congelada.
- Transações de despesa (sem estornadas): 4 aprovadas, base 184.670,96 €; 20 pagas, base 377.209,30 €.
- Entradas: 25 transações em 10.1.01 Aporte de Sócios (transitórias), base 353.810,51 €. Não são receita do evento.
- Origem: `event_forecasts` e `transactions` agrupados por tipo/estado para este `event_id`, 28/10/2026.

## Pontos abertos vistos na base (para a primeira sessão confirmar com o Pedro)

- O BP só tem despesa: falta a receita.
- As linhas de despesa ainda não foram revistas contra o realizado neste chat.

## Issues abertas ligadas

- #80 (MP-CRM) — artes do portal H&K Madrid. Pertence ao 9, não a este chat.

## Fora deste chat

Regra de rateio/verbas → 5 · Vínculo transação↔linha → 6 · Fecho e sócios → `fecho-hk-madrid-2026` (a abrir depois do evento) · Bilheteira → 3 · Banco e tesouraria → 4 · Contratos → `juridico` · Plataforma → 2.

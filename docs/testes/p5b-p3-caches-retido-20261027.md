# P6b — Cachês por pagar, composição do retido, Resultado da MP (27/10/2026)

Classe R2. Migração 0285 aplicada em Live com Sim do Pedro (passo 2). Sem alterações de dados, sem edge function, sem Publish.

## Passo 2 — 0285 (`a_pagar.caches` na RPC `get_financial_position_base`)

Ficheiros: `drizzle/migrations/0285_0285_p6b_a_pagar_caches.sql` = `supabase/manual/0285_p6b_a_pagar_caches.sql` (cmp idêntico); rollback comentado `supabase/manual/rollback_0285_p6b_a_pagar_caches_comentado.sql` (corpo 0284, md5 4f400797457805d041c2a6973d70328e).

Origem das medições: chamada da RPC com `set_config('request.jwt.claims', sub=admin MP)`, `p_company_id` MP, `p_year` null; md5 de `(v #- '{a_pagar,caches}')::text`; tempo por clock_timestamp.

| Medida | Antes | Depois |
|---|---|---|
| md5 do resto do JSON | 754677af244e2b457614952103fd13e5 | 754677af244e2b457614952103fd13e5 (igual) |
| a_pagar.total | 999.665,12 | 999.665,12 (igual) |
| tempo | 86 ms | 88 ms |
| md5 do corpo | 4f400797… (0284) | 320be1df40d2a273d1d54b459a7f2710 (22.383 caracteres) |
| anon EXECUTE | false | false |

Predicado de `a_pagar.caches`: linhas `tx` da RPC (eventos contados, reversed_at nulo, approved/paid, sem paying_partner), type expense, não transitórias, categoria `2.1%`, aberto = bruto − pago > 0,005, com `parent_transaction_id` = `artist_mother_id` ou `withholding_mother_id` de `cache_payment_contracts` com `cancelled_at` nulo. As mães (event_id nulo) nunca entram. A retenção são as filhas da mãe de retenção. Filhas 2.1.x sem contrato vão para `sem_contrato`. É informativo: o valor já está dentro de `a_pagar.total`.

Valores devolvidos em Live (iguais a SELECT independente com o mesmo predicado):
- NON STOP PRODUCOES LTDA (contrato «Deive Leonardo»): 22.944,57 = Braga 7.639,93 + Lisboa 15.304,64; retenção 2.294,46; sem retenção 20.650,11.
- SIMONE MENDES PRODUCOES MUSICAIS LTDA: 145.420,19 = SM Lisboa 58.926,15 + SM Porto 86.494,04; retenção 21.250,00; sem retenção 124.170,19. A referência de 135.420,19 foi descartada (decisão 44 = A).
- Total 168.364,76 = soma por artista; retenção 23.544,46; sem contrato 0 (n 0).

Testes: PGlite `src/test/p6b-a-pagar-caches.test.ts` 4/4 e `p5b-a-pagar-por-evento` 6/6.

## Passo 3 — cliente

- `decomposeTicketOfficeRetained` extraída para `src/lib/ticket-office-balance.ts`. O painel da bilheteira usa-a sem mudar o resultado.
- `src/hooks/useRetainedComposition.ts`: faz as mesmas leituras do painel, com o JWT do utilizador.
- `src/components/financial-position/P6bSections.tsx`: cachês, composição do retido e Resultado da MP.
  - Nome do artista: `event_cache_configs.artist_name` (sem o prefixo «Cachê»), com o fornecedor entre parênteses.
- `a_pagar.caches` entra no schema como opcional e estrito. p5-v3 não muda.
- Testes: `src/test/p6b-financial-position-sections.test.tsx`. Suíte completa: 2.985 passaram, 6 saltados. Tipos (tsgo) limpos.

## Passo 4 — verificação em Live

Ticketline (`bb741051…`). Origem: `get_ticket_office_sales` + transactions da conta + adiantamentos abertos (mesma fórmula de `computeTicketOfficeBalance`). Eventos abertos = atribuídos, sem fecho e fora de linhas de apuramento.
- Vendas 4.151.543,70 + transações −3.980.701,29 − adiantamentos 0 = **170.842,41**, igual a `rpc.retido`.
- Posição do apuramento 3163/2026 (rascunho, 08/10): −49.050,59.
- Eventos RG sem fecho: Lisboa 40.055 + Almada 33.485 + Braga 50.545 + Estoril 25.685 + Santarém 18.365 + Albufeira 24.282 + Montijo 13.579 + Porto 73.897 = **279.893,00**.
- Resíduo = 170.842,41 + 49.050,59 − 279.893,00 = **−60.000,00** (repasse de 20/10).

ECI, diferença de 1.136,00: a conta só tem vendas (sem transações nem adiantamentos). Todas as 71 linhas de `ticket_sales` do ECI têm o mesmo `created_at`: 21:35 UTC numa leitura e 22:35 UTC na seguinte. As vendas são regravadas por inteiro em cada sincronização horária, por isso o retido acompanha o último valor importado: 297.462,25, depois 298.598,25, depois 298.692,75 (RPC às 22:46). A diferença vem da hora da leitura, não da fórmula. Retido e Saldo Geral leem a mesma fonte.

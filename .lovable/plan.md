# P6b — Posição Financeira: cachês por pagar, composição do retido, Resultado da MP

HEAD confirmado: `a9140bd50` (merge #352, outro escritor). Classe proposta: **R2** (DDL aditiva numa RPC). Nada escrito em produção.

Ficheiros lidos: docs/INDEX.md, docs/QUADRO.md, docs/estado/estado-financeiro-e-tesouraria.md, docs/testes/p5b-p1-a-pagar-por-evento-20261027.md, docs/testes/p5b-p2-cobertura-futuros-20261027.md, supabase/functions/_shared/financial-position/{assemble.ts, future-coverage.ts, future-coverage-loader.ts}, supabase/functions/financial-position/index.ts, src/pages/FinancialPosition.tsx, src/components/financial-position/{FinancialPositionView.tsx, FinancialPositionAccess.tsx, FutureCoverageCard.tsx}, src/components/TicketOfficeBalancePanel.tsx, src/lib/ticket-office-balance.ts, drizzle/migrations/0284 (corpo atual da RPC), .lovable/memory/features/cache-payment-contracts.md (+ lista de memórias com "cache"/"bilheteira").

## Medições em Live (27/10, MP, só SELECT)

Predicado do cachê: `transactions` type expense, `reversed_at` null, status approved, `paid_amount < amount − 0,05`, categoria `2.1%`, company MP.

- **Deive Leonardo** (filhas com evento): 22.944,57 = Braga 7.639,93 + Lisboa 15.304,64. Inclui retenção IRS 2.294,46 (763,99 + 1.530,47). Sem retenção: 20.650,11. Bate com a referência.
- **Simone Mendes** (filhas com evento, contratos 1 e 2): **145.420,19**, não 135.420,19. Retenção IRS 21.250,00 (9.424,01 + 11.825,99) confirmada. Sem retenção: 124.170,19. A diferença de 10.000,00 para a referência corresponde ao valor do adiantamento. Ver pergunta 44.
- As mães sem evento (Simone 145.420,19; Deive 22.944,57) têm o mesmo valor que as filhas, por isso são excluídas. Contá-las duplicaria o valor.
- Os fornecedores das filhas variam (HENZA, NICHADOS, NON STOP, Finanças-IRS). O artista **não** pode sair do fornecedor. Tem de sair de `cache_payment_contracts.artist_supplier_id` (mãe `artist_mother_id`/`withholding_mother_id` → filhas).
- **ECI 1.136,00**: hoje todas as linhas de `ticket_sales` do ECI têm `created_at` entre as 21:00 e as 21:35 UTC, e a soma é 298.598,25. Causa provável: o ECI foi reimportado (todas as linhas substituídas) depois da leitura do Saldo Geral, que mostrava 297.462,25. Não é um erro de fórmula. Confirmação no passo 1: chamar a RPC agora e ver se o retido visível já dá 298.598,25.
- Não consegui ler o `ticket_office_balances` com o leitor SQL (permission denied, função restrita a utilizadores autenticados). A reconciliação do retido faz-se com a sessão admin, no passo de verificação.

## a) Onde nascem os dados

1. **Cachês**: migração **0285**, só aditiva, na RPC `get_financial_position_base`. Acrescenta `a_pagar.caches`: `{ total, retencao_irs_total, linhas[{ artist_supplier_id, artista, evento_id, evento, valor, retencao_irs, valor_sem_retencao }], por_artista[{ artista, valor, retencao_irs }] }`.
   - O resto do JSON não muda: md5 sem `caches` igual antes e depois, como na 0284.
   - Gate `view_financial_position`; versão p4-v1.
   - Cópia em supabase/manual e rollback comentado (CREATE OR REPLACE com o corpo 0284, md5 `4f400797…`).
   - O bloco é informativo. O `a_pagar.total` já inclui estas filhas e não muda.
2. **Composição do retido**: sem DDL e sem edge.
   - Extraio de `TicketOfficeBalancePanel` (linhas 227–245) uma função pura `decomposeTicketOfficeRetained(...)` para `src/lib/ticket-office-balance.ts`. O painel passa a usá-la, com o mesmo resultado.
   - O ecrã Posição Financeira faz as mesmas leituras que o painel, por conta, com o JWT do utilizador (vendas, transações, adiantamentos, fechos, apuramentos).
   - A fórmula fica num único sítio.
3. **Resultado da MP**: só leitura de `resultado_mp_ano` (com e sem estrutura), que já vem no payload p5-v3. Não há dados novos.

## b) Identificação do cachê

- Uma filha conta quando: categoria 2.1.x, `event_id` não nulo, approved, não paga, e o `parent` é uma mãe registada em `cache_payment_contracts` (`artist_mother_id` ou `withholding_mother_id`), num contrato com `cancelled_at` nulo.
- A primeira tarefa depois do Sim é confirmar a coluna que liga a filha à mãe. Se essa ligação não existir, a migração não avança e volto com alternativa.
- As mães (`event_id` nulo) nunca contam.
- O agrupamento é por `artist_supplier_id`. Simone e Deive ficam em linhas separadas, cada uma com o detalhe por cidade.
- A retenção (filhas de `withholding_mother_id`) aparece numa linha à parte, «Retenção IRS (não é custo do evento)».
- Filhas 2.1.x sem contrato aparecem como «Outros cachês (sem contrato)», para que a soma das linhas feche com o total.

## c) Composição do retido

- **Por conta**, com a mesma fórmula do painel: posição do apuramento mais recente (qualquer estado), mais as vendas de eventos sem fecho e fora do apuramento, mais o resíduo (retido − posição − abertos).
- Mostro ECI, Ticketline e BOL; Fever e Blueticket só quando forem diferentes de zero.
- **Apuramento em rascunho**: etiqueta «apuramento nº X (rascunho, data)».
- **Resíduo**: rótulo «por conciliar (repasses posteriores ao apuramento)».
- **Quando o apuramento muda**: nota «Composição baseada no apuramento nº X de dd/mm; muda quando houver novo apuramento».
- O pool da Ticketline nunca é rateado por evento; as linhas por evento só aparecem quando o evento não tem fecho.
- Os saldos ocultos ficam escondidos se o utilizador não os puder ver.
- O total por conta tem de bater com `rpc.retido`. Se não bater, aviso «composição não fecha com o Saldo Geral (dif X)».
- O retido continua fora do caixa (D-ERP27).

## d) Contrato

- **p5-v3 mantém-se.** A edge function não é alterada.
- `a_pagar.caches` entra no schema da RPC lido pelo painel P6a, opcional e estrito (se existir, tem de ser válido). Assim o painel não falha se a 0285 ainda não estiver aplicada.
- O zod do P5 não muda.

## e) Testes e prova

**Vitest:**
- soma das linhas = total;
- mães excluídas: um cenário com mãe e filhas tem de dar o valor das filhas, uma vez;
- retenção mostrada em linha à parte;
- Simone e Deive em linhas separadas;
- decomposição da Ticketline: posição 49.050,59 + abertos + resíduo = 170.842,41, com vendas RG 279.893,00 e repasse 60.000,00;
- o painel de bilheteira dá o mesmo resultado antes e depois da extração;
- secção Resultado da MP com e sem estrutura;
- falta de `caches` não derruba o ecrã.

**PGlite:** migração 0285 com mães e filhas, contrato cancelado, retenção.

Também: tsc limpo e CI.

**Prova em Live**, com queries minhas a mostrar origem e predicado:
- Σ filhas por artista contra `a_pagar.caches`;
- md5 do resto do JSON igual;
- EXPLAIN ANALYZE antes e depois;
- retido por conta contra `rpc.retido`.

## f) Redeploy

A edge `financial-position` não é alterada, por isso não é preciso redeploy. Se, por decisão, o bloco passar para a edge, toco `supabase/functions/financial-position/index.ts`, espero cerca de 2 min e confirmo pelo `meta.version` devolvido.

## g) Riscos e fora do âmbito

**Riscos:**
- ligação filha→mãe por confirmar;
- leituras de bilheteira no cliente: cerca de 6 consultas por conta, sem impacto na edge;
- composição desatualizada logo depois de uma reimportação (é o caso do ECI de hoje).

**Fora do âmbito:** pagador estruturado e aportes (#384–#386), ratear o pool, alterar o retido total, Publish.

**Rollback:**
- RPC: CREATE OR REPLACE com o corpo 0284;
- código: reverter o commit.

## Perguntas

44. Simone: o por pagar é 145.420,19 (filhas). A referência de 135.420,19 parece descontar o adiantamento de 10.000,00. Mostrar A) as filhas por pagar, 145.420,19 (recomendada); ou B) descontar o adiantamento?
45. Valor principal do cachê: A) com retenção, e retenção em linha à parte (recomendada); ou B) sem retenção?
46. Composição do retido: A) no cliente, reutilizando a função do painel (recomendada, sem edge); ou B) na edge, com redeploy?

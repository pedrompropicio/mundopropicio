# P5b passo 1 — 0284 `a_pagar.por_evento` (R2) — 27/10/2026

Autorização: Sim do Pedro (via 0, 20:28 UTC). Classe R2, só este passo. Sem edge functions, sem Passo 2, sem Publish.
HEAD no arranque: bf960160b.

## Arranque
- #116 (fechada): «Publish não reconstrói edge functions grandes — confirmar versão em produção após cada Publish».
- Aportes / conta de acerto (abertas): #85 Despesas pagas por sócio (registo, redébito e acerto); #303 Fecho de bilheteira por apuramento (saldo negativo = adiantamento para eventos futuros); #314 provisão do crédito no fecho de bilheteira; #262 dois critérios de proração Master→cidades.
- Abertas agora (fora do P5b): #384 pagador estruturado (paid_by); #385 partner_id nos aportes de sócio; #386 conta corrente por sócio fora do evento.

## Ficheiros
- drizzle/migrations/0284_0284_p5b_a_pagar_por_evento.sql (aplicada) = supabase/manual/0284_p5b_a_pagar_por_evento.sql (cmp idêntico; sha256 7b1ecb61045eadd21e909a0da7d56d6ebfe66046b8004d16d22aee9fe60becd7).
- supabase/manual/rollback_0284_p5b_a_pagar_por_evento_comentado.sql: corpo 0283 comentado (md5 do corpo fd18f727860fc1d2f550f474812756b0).
- src/test/p5b-a-pagar-por-evento.test.ts (PGlite, 6 testes).

## Antes da aplicação
- Corpo Live = ficheiro 0283: md5 fd18f727860fc1d2f550f474812756b0, 16.700 caracteres.
- md5 do JSON (MP, ano null) sem a_pagar.por_evento, a_pagar.por_evento_nota e meta.reference_date: a27bdae6dd7a9c55c95e2935cf4cc0f3.
- Tempo (3 execuções, DO block): 80 / 48 / 45 ms.
- Pré-verificação independente de Madrid (SELECT direto às tabelas): bp_total 666.560,59; bp_por_lancar 265.640,50; a_pagar 184.670,96; sem linha 162.336,96; pagas 378.586,08; contratos de cachê 0.

## Depois da aplicação
- Corpo Live md5 4f400797457805d041c2a6973d70328e (19.854 caracteres) = corpo do ficheiro 0284.
- md5 do JSON sem as chaves novas: a27bdae6dd7a9c55c95e2935cf4cc0f3 (igual ao antes).
- ACL: anon EXECUTE false; authenticated true. Versão p4-v1 (chave nova, nenhum campo mudou; o zod do P6a não é strict em a_pagar).
- Tempo: 86 / 55 / 51 ms (+~6 ms).
- por_evento: 10 eventos.

### Prova por estágio
| estágio | por_estagio.total | Σ por_evento.a_pagar_total | diferença |
|---|---|---|---|
| planeamento | 0,00 | 0,00 | 0,00 |
| em_curso | 245.094,94 | 245.094,94 | 0,00 |
| em_fecho | 569.627,77 | 569.627,77 | 0,00 |
| fechado | 184.942,40 | 184.942,41 | −0,01 |

A diferença de −0,01 em fechado é só de arredondamento: cada evento é arredondado a 2 casas antes da soma, e o total do estágio é arredondado uma vez. Os valores sem arredondamento coincidem por construção (mesmos CTE `ls`/`txo` agrupados por root_id em vez de stage). No PGlite a diferença dá 0,00. Quem consumir isto deve tolerar 0,01 × n eventos.

### Madrid (bf9ce2d8-754e-4485-8427-e2d486c39919)
em_curso, first_day 2026-11-21, started false: a_pagar_total 184.670,96; a_pagar_lancado 184.670,96; a_pagar_sem_linha 162.336,96; bp_total 666.560,59; bp_por_lancar 265.640,50; despesas_pagas 378.586,08. Corrige a aproximação 103.303,55 do plano: o valor certo, linha a linha, é 265.640,50.

## Query de verificação (para o 0)
```sql
with s as (select set_config('request.jwt.claims','{"sub":"<uid admin>","role":"authenticated"}',true) x),
b as (select public.get_financial_position_base('7c858982-6ccd-47ca-bd65-e0dd3eebf01c'::uuid, null) j from s)
select st.key estagio, round((st.value->>'total')::numeric,2) por_estagio,
  round(coalesce((select sum((e->>'a_pagar_total')::numeric) from jsonb_array_elements(b.j->'a_pagar'->'por_evento') e
                  where e->>'estagio'=st.key),0),2) soma_por_evento
from b, jsonb_each(b.j->'a_pagar'->'por_estagio') st;
```

## Testes
PGlite 0284: 6/6 (cópias idênticas; em_curso não iniciado; em_fecho com contrato, partner_paid válido/obsoleto, mãe de rateio, transitória; histórico fora; resto igual à 0283; gate). Suites P4/P4b/P5/P6a: 90/90.

## Rollback
Executar o CREATE OR REPLACE do ficheiro rollback (descomentado) mais os REVOKE/GRANT da 0283. Sem dados a repor.

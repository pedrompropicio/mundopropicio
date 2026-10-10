---
name: Barreira dos 1.000 do PostgREST
description: Leituras de tabelas grandes só paginadas (fetchAllPaged/fetchAllPagedQuery) ou por RPC; somas na base
type: constraint
---
- Tabelas vigiadas: src/lib/postgrest-large-tables.json (cresce com o invariante tabelas_acima_de_1000).
- Leitura no cliente/edge: fetchAllPagedQuery(builder) ou fetchAllPaged((from,to)=>...range(from,to)) com order total; ou RPC.
- Somas/contagens: na base (RPC/vista), nunca no cliente.
- O teste postgrest-row-limit.test.ts falha o build; escapes aceites: .range/.single/.maybeSingle/count:/.limit/.rpc/escritas.
- Porquê: corte silencioso (#129 Ticketline −3,2 M€; #206 DRE −789.161,63 €).

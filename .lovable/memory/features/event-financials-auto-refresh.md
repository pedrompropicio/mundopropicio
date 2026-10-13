---
name: Event financials auto-refresh
description: Cartões calculados atualizam-se sozinhos — invalidação central por prefixo + Realtime com debounce 1 s (D-ERP266)
type: feature
---
- Helper único `invalidateEventFinancials` (src/lib/invalidate-event-financials.ts); nunca invalidar só a chave do painel — o cartão lê chaves próprias (ex.: `event_cache_configs_impact`, `efc-*`).
- MutationCache global agenda-o (1 s) em todas as mutações; hooks de sync assíncrono chamam-no ao gravar.
- `useRealtimeInvalidation` em EventDetail (evento+Master+subs), camarim, cartões, conciliação e listas de pagamento.
- Chave nova de um cartão do evento → acrescentar o prefixo a EVENT_FINANCIAL_KEY_PREFIXES. Chaves cujo refetch grava (bp-formula-sync, cache-sync-*) ficam excluídas para evitar ciclos.
- Tabela nova que mude números → ALTER PUBLICATION supabase_realtime ADD TABLE (migração).

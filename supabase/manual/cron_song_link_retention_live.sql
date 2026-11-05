-- #202 / 0328 — aplicar só depois da 0328, pelo 0, com Sim.
-- Classe R2 — PREPARAÇÃO PARCIAL, NÃO APLICADA; não aplicar este ficheiro incompleto.
-- Autorização 6621085645; decisão 6633703391; correcção 6634413910 (#647).
-- PENDENTE: esclarecer a contradição do despacho para ip_geo_cache:
-- §3 exige de hora a hora; «Crons (4)» exige três diários fora das 06–09 UTC.
-- Nenhuma cadência para a cache é escolhida sem essa clarificação.
-- UTC: diag às 03:11 e slots às 03:13; uma chamada/um lote por execução.
-- Minutos 11 e 13 livres, incluindo expansões */n e intervalos do inventário:
-- docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json (24/10/2026).
-- Conferir o inventário actual na janela; não há loop nem chamada HTTP.

SELECT cron.schedule('song-link-diag-retention-daily', '11 3 * * *', $cmd$
  SELECT public.purge_song_link_diag();
$cmd$);

SELECT cron.schedule('song-link-delivery-slots-retention-daily', '13 3 * * *', $cmd$
  SELECT public.purge_song_link_delivery_slots();
$cmd$);

-- Reversão, só pelo 0 com Sim, antes do rollback da 0328:
-- SELECT cron.unschedule('song-link-diag-retention-daily');
-- SELECT cron.unschedule('song-link-delivery-slots-retention-daily');

-- ====== PARTE 4 de 4 — VALIDACAO (LIVE) ======
-- Onde correr: Lovable Cloud -> SQL Editor -> toggle LIVE
-- Esta parte NAO altera nada — so confirma o resultado.

SELECT f.name AS frente, count(*) AS etapas
FROM operacao_etapas e
JOIN operacao_frentes f ON f.id = e.frente_id
WHERE f.event_id = '5a1da5fb-3115-4ae3-af50-15ce1f869a5c'
GROUP BY f.name
ORDER BY count(*) DESC;

-- Esperado: 186 etapas no total.
-- Palco Principal 52 | Producao Geral 40 | Bares e Foods 21 |
-- Limpeza/Banheiros 20 | Controle de Acessos 14 | Marketing 10 |
-- Palco 2 8 | Camarins 4 | Credenciamento 4 | Midias 3 |
-- Logistica Artistica 3 | Stage Hands 2 | Merchadising 2 |
-- Backstage 2 | Area VIP 1

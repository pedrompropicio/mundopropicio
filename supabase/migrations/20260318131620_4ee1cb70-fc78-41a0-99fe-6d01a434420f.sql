-- Fix Lisboa forecast amounts: stored values were TOTAL (com IVA), correcting to base values (sem IVA)
-- Only items with iva_rate > 0 need correction

-- Transfers Artistas: was 2862.00 (total), correct is 2700.00 (base)
UPDATE event_forecasts SET amount = 2700.00 WHERE id = 'ece98dc2-6ae6-464f-92f8-869e1a0fd062';

-- Som / Luz / Ecran / LED: was 21525.00 (total), correct is 17500.00 (base)
UPDATE event_forecasts SET amount = 17500.00 WHERE id = '633f2b04-6ab0-4613-b1ab-19dacab2833a';

-- Camera Extra - Backlight: was 430.50 (total), correct is 350.00 (base)
UPDATE event_forecasts SET amount = 350.00 WHERE id = '1b9dd834-9584-4634-8664-a38a9f9c0a3f';

-- Backline: was 1599.00 (total), correct is 1300.00 (base)
UPDATE event_forecasts SET amount = 1300.00 WHERE id = '377f9a75-acc9-4ef8-bfc3-564f43739f6f';

-- Equipe Produção: was 2398.50 (total), correct is 1950.00 (base)
UPDATE event_forecasts SET amount = 1950.00 WHERE id = 'f64cee71-9d22-426b-ae9c-66e1e1b2a47f';

-- Stage Hands: was 615.00 (total), correct is 500.00 (base)
UPDATE event_forecasts SET amount = 500.00 WHERE id = 'c4cba24b-a0ac-471e-b7e6-26586f0c8f3b';

-- Locação de Espaço: was 28905.00 (total), correct is 23500.00 (base)
UPDATE event_forecasts SET amount = 23500.00 WHERE id = '5cac8e04-13eb-4473-bb0b-ecf66f3a10fa';

-- Comissão de Vendas: was 61.50 (total), correct is 50.00 (base)
UPDATE event_forecasts SET amount = 50.00 WHERE id = '6b8662bb-1295-4f0b-ab65-e1f69940d30f';

-- Comissão de Emissão de Convites: was 153.87 (total), correct is 125.10 (base)
UPDATE event_forecasts SET amount = 125.10 WHERE id = '2375c96f-011a-4ae0-9ce2-a65d84a4972d';

-- Rigger: was 2287.80 (total), correct is 1860.00 (base)
UPDATE event_forecasts SET amount = 1860.00 WHERE id = 'bb8902c5-16e2-42cf-ace0-e1fa4b6d105c';

-- Empilhador: was 344.40 (total), correct is 280.00 (base)
UPDATE event_forecasts SET amount = 280.00 WHERE id = '60418a77-24ae-4960-867a-73663d128e0f';

-- Plataforma Elevatória: was 430.50 (total), correct is 350.00 (base)
UPDATE event_forecasts SET amount = 350.00 WHERE id = '406aa846-d472-426d-9243-94d5cbf97b61';

-- Assistentes de Pulseiras Golden: was 442.80 (total), correct is 360.00 (base)
UPDATE event_forecasts SET amount = 360.00 WHERE id = '8542ff93-22d0-4d9e-96de-9d9346d45de8';

-- Catering Camarim Artista: was 209.10 (total), correct is 170.00 (base)
UPDATE event_forecasts SET amount = 170.00 WHERE id = 'e3834d90-6679-4cec-883a-2ec59cc2e126';

-- Catering Camarim Banda: was 482.16 (total), correct is 392.00 (base)
UPDATE event_forecasts SET amount = 392.00 WHERE id = 'cad67858-1736-498c-8de5-af3e861c3682';

-- Alimentação Técnica e Produção PT: was 1594.08 (total), correct is 1296.00 (base)
UPDATE event_forecasts SET amount = 1296.00 WHERE id = '704d59ee-5242-48ba-bd05-98c37a94bc2a';

-- Vinis Elevadores: was 31.98 (total), correct is 26.00 (base)
UPDATE event_forecasts SET amount = 26.00 WHERE id = '98e7ba30-7705-4ea7-b55c-e4eebd612ad5';

-- Mupies (Veiculação): was 8610.00 (total), correct is 7000.00 (base)
UPDATE event_forecasts SET amount = 7000.00 WHERE id = '0723c7e2-3b42-4a92-a10e-3f6aacceaec0';

-- Rádio Tropical FM: was 1968.00 (total), correct is 1600.00 (base)
UPDATE event_forecasts SET amount = 1600.00 WHERE id = 'd5193d58-ea1a-4b78-ab31-dfd627b625a4';

-- Voz Off - Record Spot: was 24.60 (total), correct is 20.00 (base)
UPDATE event_forecasts SET amount = 20.00 WHERE id = '31b51718-11b7-4b13-a3a5-ad5dc3887412';

-- Campanha na TV SIC: was 3075.00 (total), correct is 2500.00 (base)
UPDATE event_forecasts SET amount = 2500.00 WHERE id = '0abe3b61-5be0-4583-b570-da5049b52214';

-- Aftermovie + Fotos: was 830.25 (total), correct is 675.00 (base)
UPDATE event_forecasts SET amount = 675.00 WHERE id = 'd458563c-f725-431a-a408-05109e4dee69';

-- Materiais Iprint: was 381.30 (total), correct is 310.00 (base)
UPDATE event_forecasts SET amount = 310.00 WHERE id = '9f016d0b-25c9-49f2-ab6f-ab932acaf6ee';

-- Pulseiras Golden: was 304.43 (total), correct is 247.50 (base)
UPDATE event_forecasts SET amount = 247.50 WHERE id = '33e579dd-80db-4463-b9b3-47f0b3828b4e';

-- Beware (Assessoria de Imprensa): was 984.00 (total), correct is 800.00 (base)
UPDATE event_forecasts SET amount = 800.00 WHERE id = '7542e216-5d07-4445-bb19-4f0d6762d64b';

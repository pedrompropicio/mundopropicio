
-- Fix ticket_sales quantities to match actual sold data from PDF
-- PDF shows: Total 2,939 sold for 184,301.50€

-- Balcão 1 - Lote 2: 348 sold (not 354)
UPDATE ticket_sales SET quantity = 348
WHERE lot_id = (
  SELECT l.id FROM event_ticket_lots l
  JOIN event_ticket_zones z ON z.id = l.zone_id
  WHERE z.name = 'Balcão 1' AND l.name = 'Lote 2'
  AND z.event_id IN (SELECT id FROM events WHERE parent_event_id = (SELECT id FROM events WHERE name LIKE '%Maiara%' AND parent_event_id IS NULL) AND name LIKE '%Porto%')
);

-- Balcão 1 - Lote 3: 0 sold (not 60)
UPDATE ticket_sales SET quantity = 0
WHERE lot_id = (
  SELECT l.id FROM event_ticket_lots l
  JOIN event_ticket_zones z ON z.id = l.zone_id
  WHERE z.name = 'Balcão 1' AND l.name = 'Lote 3'
  AND z.event_id IN (SELECT id FROM events WHERE parent_event_id = (SELECT id FROM events WHERE name LIKE '%Maiara%' AND parent_event_id IS NULL) AND name LIKE '%Porto%')
);

-- Balcão 2 - Lote 3: 0 sold (not 20)
UPDATE ticket_sales SET quantity = 0
WHERE lot_id = (
  SELECT l.id FROM event_ticket_lots l
  JOIN event_ticket_zones z ON z.id = l.zone_id
  WHERE z.name = 'Balcão 2' AND l.name = 'Lote 3'
  AND z.event_id IN (SELECT id FROM events WHERE parent_event_id = (SELECT id FROM events WHERE name LIKE '%Maiara%' AND parent_event_id IS NULL) AND name LIKE '%Porto%')
);

-- Golden Circle - Lote Prom.: 833 sold (not 949)
UPDATE ticket_sales SET quantity = 833
WHERE lot_id = (
  SELECT l.id FROM event_ticket_lots l
  JOIN event_ticket_zones z ON z.id = l.zone_id
  WHERE z.name = 'Golden Circle' AND l.name = 'Lote Prom.'
  AND z.event_id IN (SELECT id FROM events WHERE parent_event_id = (SELECT id FROM events WHERE name LIKE '%Maiara%' AND parent_event_id IS NULL) AND name LIKE '%Porto%')
);

-- Mobilidade Reduzida: 9 sold (not 28)
UPDATE ticket_sales SET quantity = 9
WHERE lot_id = (
  SELECT l.id FROM event_ticket_lots l
  JOIN event_ticket_zones z ON z.id = l.zone_id
  WHERE z.name = 'Mobilidade Reduzida' AND l.name = 'Lote 1'
  AND z.event_id IN (SELECT id FROM events WHERE parent_event_id = (SELECT id FROM events WHERE name LIKE '%Maiara%' AND parent_event_id IS NULL) AND name LIKE '%Porto%')
);

-- Plateia em pé - Lote 2: 0 sold (not 37)
UPDATE ticket_sales SET quantity = 0
WHERE lot_id = (
  SELECT l.id FROM event_ticket_lots l
  JOIN event_ticket_zones z ON z.id = l.zone_id
  WHERE z.name = 'Plateia em pé' AND l.name = 'Lote 2'
  AND z.event_id IN (SELECT id FROM events WHERE parent_event_id = (SELECT id FROM events WHERE name LIKE '%Maiara%' AND parent_event_id IS NULL) AND name LIKE '%Porto%')
);

-- Plateia em pé - Lote 3: 0 sold (not 60)
UPDATE ticket_sales SET quantity = 0
WHERE lot_id = (
  SELECT l.id FROM event_ticket_lots l
  JOIN event_ticket_zones z ON z.id = l.zone_id
  WHERE z.name = 'Plateia em pé' AND l.name = 'Lote 3'
  AND z.event_id IN (SELECT id FROM events WHERE parent_event_id = (SELECT id FROM events WHERE name LIKE '%Maiara%' AND parent_event_id IS NULL) AND name LIKE '%Porto%')
);

-- Plateia em pé - Lote Prom.: 595 sold (not 617)
UPDATE ticket_sales SET quantity = 595
WHERE lot_id = (
  SELECT l.id FROM event_ticket_lots l
  JOIN event_ticket_zones z ON z.id = l.zone_id
  WHERE z.name = 'Plateia em pé' AND l.name = 'Lote Prom.'
  AND z.event_id IN (SELECT id FROM events WHERE parent_event_id = (SELECT id FROM events WHERE name LIKE '%Maiara%' AND parent_event_id IS NULL) AND name LIKE '%Porto%')
);

-- Fix "Colaboradores Worten" lot name to "Colaboradores"
UPDATE event_ticket_lots SET name = 'Colaboradores'
WHERE name = 'Colaboradores Worten'
AND zone_id IN (
  SELECT z.id FROM event_ticket_zones z
  WHERE z.name = 'Campanha'
  AND z.event_id IN (SELECT id FROM events WHERE parent_event_id = (SELECT id FROM events WHERE name LIKE '%Maiara%' AND parent_event_id IS NULL) AND name LIKE '%Porto%')
);

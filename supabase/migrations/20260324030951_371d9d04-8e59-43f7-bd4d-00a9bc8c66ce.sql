
-- Renumber lot_number by price ASC within each zone
WITH ranked AS (
  SELECT l.id, ROW_NUMBER() OVER (PARTITION BY l.zone_id ORDER BY l.price ASC) as new_num
  FROM event_ticket_lots l
)
UPDATE event_ticket_lots
SET lot_number = ranked.new_num
FROM ranked
WHERE event_ticket_lots.id = ranked.id;

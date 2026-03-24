
-- Move "Campanha Colaboradores" lot from its own zone to "Balcão 2" zone
-- First update the lot's zone_id
UPDATE event_ticket_lots
SET zone_id = '8c205d85-682e-423c-9f37-b77db70d44f1',
    name = 'Campanha Colaboradores',
    lot_number = 3
WHERE zone_id = 'd3128fb2-67dc-4e0b-8470-615ef4bfd52f';

-- Update Balcão 2 total_capacity to include the Campanha ticket (20 + 874 + 1 = 895)
UPDATE event_ticket_zones
SET total_capacity = 895
WHERE id = '8c205d85-682e-423c-9f37-b77db70d44f1';

-- Delete the now-empty Campanha zone
DELETE FROM event_ticket_zones
WHERE id = 'd3128fb2-67dc-4e0b-8470-615ef4bfd52f';

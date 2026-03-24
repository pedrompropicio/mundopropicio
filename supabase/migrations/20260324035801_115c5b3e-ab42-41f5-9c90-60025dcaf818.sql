
-- Maiara & Maraisa - Lisboa (completed, no prior planning → salesOnlyMode)
-- Capacity = sold quantities only

-- 1. BANCADA zone (3 lots, sold: 606+388+35 = 1029)
INSERT INTO event_ticket_zones (event_id, name, total_capacity)
VALUES ('d0159fb2-6fc4-4ae1-8425-aae7e0a4f133', 'BANCADA', 1029);

-- 2. CAMAROTES 1ª IMPAR zone (0 sold)
INSERT INTO event_ticket_zones (event_id, name, total_capacity)
VALUES ('d0159fb2-6fc4-4ae1-8425-aae7e0a4f133', 'CAMAROTES 1ª IMPAR', 0);

-- 3. GALERIA 1ª zone (344 sold)
INSERT INTO event_ticket_zones (event_id, name, total_capacity)
VALUES ('d0159fb2-6fc4-4ae1-8425-aae7e0a4f133', 'GALERIA 1ª', 344);

-- 4. GALERIA 2ª zone (684 sold)
INSERT INTO event_ticket_zones (event_id, name, total_capacity)
VALUES ('d0159fb2-6fc4-4ae1-8425-aae7e0a4f133', 'GALERIA 2ª', 684);

-- 5. GOLDEN CIRCLE zone (952+0 = 952 sold)
INSERT INTO event_ticket_zones (event_id, name, total_capacity)
VALUES ('d0159fb2-6fc4-4ae1-8425-aae7e0a4f133', 'GOLDEN CIRCLE', 952);

-- 6. MOBILIDADE CONDICIONADA zone (7 sold)
INSERT INTO event_ticket_zones (event_id, name, total_capacity)
VALUES ('d0159fb2-6fc4-4ae1-8425-aae7e0a4f133', 'MOBILIDADE CONDICIONADA', 7);

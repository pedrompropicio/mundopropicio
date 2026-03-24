
-- BANCADA lots (sorted by price ASC): Lote Prom 60€, Lote 2 65€, Lote 3 70€
-- salesOnlyMode: quantity = sold qty
INSERT INTO event_ticket_lots (zone_id, name, quantity, price, iva_rate, lot_number) VALUES
('78d90bd4-cf23-4ca5-b0d4-8dd6e812320b', 'Lote Prom.', 606, 60.00, 6, 1),
('78d90bd4-cf23-4ca5-b0d4-8dd6e812320b', 'Lote 2', 388, 65.00, 6, 2),
('78d90bd4-cf23-4ca5-b0d4-8dd6e812320b', 'Lote 3', 35, 70.00, 6, 3);

-- CAMAROTES 1ª IMPAR (0.01€, 0 sold)
INSERT INTO event_ticket_lots (zone_id, name, quantity, price, iva_rate, lot_number) VALUES
('2ed63fe8-ad2f-4c65-8f31-af674be3a783', 'Lote 1', 0, 0.01, 6, 1);

-- GALERIA 1ª (42€, 344 sold)
INSERT INTO event_ticket_lots (zone_id, name, quantity, price, iva_rate, lot_number) VALUES
('560cacf2-d400-4aa9-b180-731040abc031', 'Lote 1', 344, 42.00, 6, 1);

-- GALERIA 2ª (38€, 684 sold)
INSERT INTO event_ticket_lots (zone_id, name, quantity, price, iva_rate, lot_number) VALUES
('c439e8e1-b241-4992-b496-3361589448bf', 'Lote 1', 684, 38.00, 6, 1);

-- GOLDEN CIRCLE lots (sorted by price ASC): Lote Prom 75€, Lote 2 95€
INSERT INTO event_ticket_lots (zone_id, name, quantity, price, iva_rate, lot_number) VALUES
('272b5cd5-c885-4824-8cfb-eec93560416a', 'Lote Prom.', 952, 75.00, 6, 1),
('272b5cd5-c885-4824-8cfb-eec93560416a', 'Lote 2', 0, 95.00, 6, 2);

-- MOBILIDADE CONDICIONADA (60€, 7 sold)
INSERT INTO event_ticket_lots (zone_id, name, quantity, price, iva_rate, lot_number) VALUES
('7fcc4ab1-82cd-4af2-8305-8e81d1ba78e7', 'Lote 1', 7, 60.00, 6, 1);

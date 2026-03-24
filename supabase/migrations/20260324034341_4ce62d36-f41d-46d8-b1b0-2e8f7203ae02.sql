
-- Fix Maiara Porto: completed event without prior planning, capacity should = sales only
-- Update lots to have quantity = sold quantity
UPDATE event_ticket_lots SET quantity = 279 WHERE id = 'd5a2bd8f-fc3b-4135-beeb-c90791f113c8';
UPDATE event_ticket_lots SET quantity = 348 WHERE id = '957d0cb9-c926-4012-8511-abbe0c5481a3';
UPDATE event_ticket_lots SET quantity = 0 WHERE id = 'f0f45aca-dc18-49c6-a07d-c66980629ccf';
UPDATE event_ticket_lots SET quantity = 1 WHERE id = 'c3e20220-828c-4f3e-9bf8-fcea38e54147';
UPDATE event_ticket_lots SET quantity = 874 WHERE id = '977b5a57-ef49-411c-bf22-efb1781c4073';
UPDATE event_ticket_lots SET quantity = 0 WHERE id = 'd1e973d1-c40f-4560-9edb-89afa108d283';
UPDATE event_ticket_lots SET quantity = 833 WHERE id = '9ffc57dc-dae7-4e84-a697-d83af2df8eaa';
UPDATE event_ticket_lots SET quantity = 0 WHERE id = 'c60b7a0e-04e4-4367-bb4f-b5148b741b48';
UPDATE event_ticket_lots SET quantity = 9 WHERE id = 'f3947a24-7501-4dc9-920e-c96087cd7d17';
UPDATE event_ticket_lots SET quantity = 595 WHERE id = '12c7137f-53d7-43ec-aa12-362222d50800';
UPDATE event_ticket_lots SET quantity = 0 WHERE id = '31653cea-15fc-45d3-88bf-d3e993e45a76';
UPDATE event_ticket_lots SET quantity = 0 WHERE id = '104d8730-dc25-4952-9a9d-2eea9fb3e213';

-- Update zone capacities to sum of sales
UPDATE event_ticket_zones SET total_capacity = 627 WHERE id = 'e187177d-6858-4538-a12e-214ec021e8c2';
UPDATE event_ticket_zones SET total_capacity = 875 WHERE id = '8c205d85-682e-423c-9f37-b77db70d44f1';
UPDATE event_ticket_zones SET total_capacity = 833 WHERE id = '3bafa115-0569-47e5-9a09-e132674f4123';
UPDATE event_ticket_zones SET total_capacity = 9 WHERE id = '00e6f4de-b69d-4ce7-9c0c-30aedea74185';
UPDATE event_ticket_zones SET total_capacity = 595 WHERE id = 'fb5b3b11-afef-473e-92a6-e9b74bd5cb0c';

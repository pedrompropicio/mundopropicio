-- Delete forecasts for Lajeado event
DELETE FROM event_forecasts WHERE event_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0002';

-- Delete the Lajeado sub-event
DELETE FROM events WHERE id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0002';

-- Delete the Lajeado city
DELETE FROM cities WHERE id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0001';

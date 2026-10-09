-- #234: a política "Card docs viewable by accountant" (20260923023459) já cobria o caso; remove o duplicado criado em 0057.
DROP POLICY IF EXISTS "Card docs select accountant" ON storage.objects;
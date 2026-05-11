ALTER ROLE authenticator SET pgrst.db_schemas = 'public, crm';
ALTER ROLE anon SET pgrst.db_schemas = 'public, crm';
ALTER ROLE authenticated SET pgrst.db_schemas = 'public, crm';
ALTER ROLE service_role SET pgrst.db_schemas = 'public, crm';

SELECT pg_notify('pgrst', 'reload config');
SELECT pg_notify('pgrst', 'reload schema');
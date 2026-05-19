-- OP-6: novo role 'producer' na company (Diretores e Produtores Gerais)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'producer';
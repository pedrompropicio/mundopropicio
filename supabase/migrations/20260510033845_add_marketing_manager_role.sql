-- Add 'marketing_manager' to public.app_role enum, positioned BEFORE 'editor'.
--
-- Isolated in its own migration on purpose: PostgreSQL forbids using a newly
-- added enum value in the same transaction in which it is added (PG12+).
-- The companion migration that INSERTs role_permissions rows and seeds
-- crm.role_budget_limits with this value must run as a separate transaction.
--
-- Reference: ARCHITECTURE.md §2.5 (permissions namespacing) and §5.2.4
-- (crm.role_budget_limits — caps de gasto por papel).

ALTER TYPE public.app_role
  ADD VALUE IF NOT EXISTS 'marketing_manager' BEFORE 'editor';

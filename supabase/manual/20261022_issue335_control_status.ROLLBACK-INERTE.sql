-- #335 — rollback da leitura do controlo pelo ecrã.
-- Já instalado em Live a 22/10/2026 com Sim do Pedro; mantido para registo.
-- Efeito: o botão "Encontro de contas" volta a falhar fechado.
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP FUNCTION public.transaction_offset_control_status();
COMMIT;

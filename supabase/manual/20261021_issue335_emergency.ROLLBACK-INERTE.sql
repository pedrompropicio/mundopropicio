-- LOCAL/INERTE ONLY. #335 operational script `emergency_rollback`. Return from level 2 to level 1 (N2 -> N1); new admissions stay closed. Separate Sim required.
-- 2n-Bloco3: origin-state guard. States: N0=(enabled,reverse_enabled)=(t,t); N1=(f,t); N2=(f,f).
-- Accepted origin: N2 -> N1. Origin already N1: no change (idempotent, NOTICE).
-- Any other origin (other level, (t,f) invalid, missing/extra control row) RAISES estado_origem_inesperado
-- and writes nothing. ACLs are NEVER changed by any level script: closure is a flag checked by the core
-- (error encontro_desativado), so reactivation restores the captured ACL by construction.
BEGIN;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(335,1);
DO $issue335_ops$ DECLARE n bigint; e boolean; r boolean; origem text; BEGIN
 SELECT count(*) INTO n FROM public.transaction_offset_control;
 IF n<>1 THEN RAISE EXCEPTION 'estado_origem_inesperado: script=emergency_rollback origem=desconhecido (linhas de controlo=%)',n; END IF;
 SELECT enabled,reverse_enabled INTO e,r FROM public.transaction_offset_control WHERE singleton FOR UPDATE;
 origem:=CASE WHEN e AND r THEN 'N0' WHEN NOT e AND r THEN 'N1' WHEN NOT e AND NOT r THEN 'N2' ELSE 'invalido' END;
 IF origem='N1' THEN RAISE NOTICE 'issue335 emergency_rollback: origem já N1, sem alteração'; RETURN; END IF;
 IF origem NOT IN ('N2') THEN
  RAISE EXCEPTION 'estado_origem_inesperado: script=emergency_rollback origem=% (aceite: N2; destino N1)',origem;
 END IF;
 UPDATE public.transaction_offset_control SET enabled=false,reverse_enabled=true WHERE singleton;
 RAISE NOTICE 'issue335 emergency_rollback: % -> N1',origem;
END $issue335_ops$;
COMMIT;

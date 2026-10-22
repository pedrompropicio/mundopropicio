-- LOCAL/INERTE ONLY. #335 operational script `kill_switch_rollback`. Undo level 1 (N1 -> N0). Reopening requires separate technical and Pedro approval.
-- 2n-Bloco3: origin-state guard. States: N0=(enabled,reverse_enabled)=(t,t); N1=(f,t); N2=(f,f).
-- Accepted origin: N1 -> N0. Origin already N0: no change (idempotent, NOTICE).
-- Any other origin (other level, (t,f) invalid, missing/extra control row) RAISES estado_origem_inesperado
-- and writes nothing. ACLs are NEVER changed by any level script: closure is a flag checked by the core
-- (error encontro_desativado), so reactivation restores the captured ACL by construction.
BEGIN;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(335,1);
DO $issue335_ops$ DECLARE n bigint; e boolean; r boolean; origem text; BEGIN
 SELECT count(*) INTO n FROM public.transaction_offset_control;
 IF n<>1 THEN RAISE EXCEPTION 'estado_origem_inesperado: script=kill_switch_rollback origem=desconhecido (linhas de controlo=%)',n; END IF;
 SELECT enabled,reverse_enabled INTO e,r FROM public.transaction_offset_control WHERE singleton FOR UPDATE;
 origem:=CASE WHEN e AND r THEN 'N0' WHEN NOT e AND r THEN 'N1' WHEN NOT e AND NOT r THEN 'N2' ELSE 'invalido' END;
 IF origem='N0' THEN RAISE NOTICE 'issue335 kill_switch_rollback: origem já N0, sem alteração'; RETURN; END IF;
 IF origem NOT IN ('N1') THEN
  RAISE EXCEPTION 'estado_origem_inesperado: script=kill_switch_rollback origem=% (aceite: N1; destino N0)',origem;
 END IF;
 UPDATE public.transaction_offset_control SET enabled=true,reverse_enabled=true WHERE singleton;
 RAISE NOTICE 'issue335 kill_switch_rollback: % -> N0',origem;
END $issue335_ops$;
COMMIT;

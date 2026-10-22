-- LOCAL/INERTE ONLY. #335 operational script `emergency`. Level 2 exceptional stop: blocks new encounters AND reversal. Separate Sim required.
-- Ordem de instalação única (correcção D, docs/testes/issue335-quadro-final.md): storage → core → approval → status → invariants → balance → cash_position → cash_position_invariant → restore → kill_switch/emergency/reactivation → trigger_watch/cash_watch; ROLLBACK na ordem inversa.
-- 2n-Bloco3: origin-state guard. States: N0=(enabled,reverse_enabled)=(t,t); N1=(f,t); N2=(f,f).
-- Accepted origin: N0/N1 -> N2. Origin already N2: no change (idempotent, NOTICE).
-- Any other origin (other level, (t,f) invalid, missing/extra control row) RAISES estado_origem_inesperado
-- and writes nothing. ACLs are NEVER changed by any level script: closure is a flag checked by the core
-- (error encontro_desativado), so reactivation restores the captured ACL by construction.
BEGIN;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(335,1);
DO $issue335_ops$ DECLARE n bigint; e boolean; r boolean; origem text; BEGIN
 SELECT count(*) INTO n FROM public.transaction_offset_control;
 IF n<>1 THEN RAISE EXCEPTION 'estado_origem_inesperado: script=emergency origem=desconhecido (linhas de controlo=%)',n; END IF;
 SELECT enabled,reverse_enabled INTO e,r FROM public.transaction_offset_control WHERE singleton FOR UPDATE;
 origem:=CASE WHEN e AND r THEN 'N0' WHEN NOT e AND r THEN 'N1' WHEN NOT e AND NOT r THEN 'N2' ELSE 'invalido' END;
 IF origem='N2' THEN RAISE NOTICE 'issue335 emergency: origem já N2, sem alteração'; RETURN; END IF;
 IF origem NOT IN ('N0','N1') THEN
  RAISE EXCEPTION 'estado_origem_inesperado: script=emergency origem=% (aceite: N0/N1; destino N2)',origem;
 END IF;
 UPDATE public.transaction_offset_control SET enabled=false,reverse_enabled=false WHERE singleton;
 RAISE NOTICE 'issue335 emergency: % -> N2',origem;
END $issue335_ops$;
COMMIT;

CREATE OR REPLACE FUNCTION public.enqueue_email_batch(
  p_queue_name text,
  p_payloads jsonb,
  p_batch_size integer DEFAULT 5000,
  p_interval_minutes integer DEFAULT 50
) RETURNS TABLE(enqueued integer, batches integer, last_visible_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pgmq
AS $$
-- Enfileira uma lista grande em lotes espaçados: o lote k fica invisível
-- k*p_interval_minutes e o queued_at do payload é o momento em que fica visível,
-- para o TTL (60 min nas transacionais) contar a partir daí e nada expirar.
DECLARE
  v_item jsonb; v_i integer := 0; v_delay integer; v_at timestamptz := now();
BEGIN
  IF jsonb_typeof(p_payloads) <> 'array' THEN
    RAISE EXCEPTION 'p_payloads tem de ser um array JSON';
  END IF;
  IF p_batch_size < 1 OR p_interval_minutes < 1 THEN
    RAISE EXCEPTION 'p_batch_size e p_interval_minutes têm de ser >= 1';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_payloads) LOOP
    v_delay := (v_i / p_batch_size) * p_interval_minutes * 60;
    v_at := now() + make_interval(secs => v_delay);
    BEGIN
      PERFORM pgmq.send(p_queue_name, v_item || jsonb_build_object('queued_at', v_at), v_delay);
    EXCEPTION WHEN undefined_table THEN
      PERFORM pgmq.create(p_queue_name);
      PERFORM pgmq.send(p_queue_name, v_item || jsonb_build_object('queued_at', v_at), v_delay);
    END;
    v_i := v_i + 1;
  END LOOP;
  RETURN QUERY SELECT v_i, CASE WHEN v_i = 0 THEN 0 ELSE ((v_i - 1) / p_batch_size) + 1 END, v_at;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.enqueue_email_batch(text, jsonb, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email_batch(text, jsonb, integer, integer) TO service_role;
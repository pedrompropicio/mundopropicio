DO $$
DECLARE
  v_root uuid;
  v_gid uuid;
  v_groups int := 0;
  v_rows int := 0;
BEGIN
  FOR v_root IN
    SELECT p.id
    FROM public.transactions p
    WHERE p.parent_transaction_id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.transactions c
        WHERE c.parent_transaction_id = p.id
          AND c.split_percentage IS NULL
          AND coalesce(c.is_transitory, false) = false
      )
  LOOP
    v_gid := gen_random_uuid();

    WITH members AS (
      SELECT id, coalesce(due_date, date) AS ord
      FROM public.transactions
      WHERE id = v_root
      UNION ALL
      SELECT id, coalesce(due_date, date) AS ord
      FROM public.transactions
      WHERE parent_transaction_id = v_root
        AND split_percentage IS NULL
        AND coalesce(is_transitory, false) = false
    ), numbered AS (
      SELECT id,
             row_number() OVER (ORDER BY ord, id) AS n,
             count(*) OVER () AS total
      FROM members
    )
    UPDATE public.transactions t
    SET installment_group_id = v_gid,
        installment_number = numbered.n,
        installment_total = numbered.total
    FROM numbered
    WHERE t.id = numbered.id;

    v_groups := v_groups + 1;
    v_rows := v_rows + (SELECT count(*) FROM public.transactions WHERE installment_group_id = v_gid);
  END LOOP;

  RAISE NOTICE 'Backfill parcelamento: % grupos, % linhas', v_groups, v_rows;
END $$;
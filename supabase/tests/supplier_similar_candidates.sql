-- D-ERP201 — corre e reverte (RAISE no fim). Esperado (ids variam):
-- nif={... "reused": true ...} | nome={... "created": true, "flagged": 1} | sem={... "flagged": 0} | flags=1 | norm=123456789,ESB12345678
DO $$
DECLARE c uuid := '7c858982-6ccd-47ca-bd65-e0dd3eebf01c'; a uuid; r1 jsonb; r2 jsonb; r3 jsonb; nf int;
BEGIN
  INSERT INTO suppliers(name,nif,company_id,is_active) VALUES ('ZZTESTE Pixelo Luzes Lda','PT999999990',c,true) RETURNING id INTO a;
  r1 := _supplier_resolve_or_create(c,'Outro Nome Qualquer','999 999 990','sponsors_import');
  r2 := _supplier_resolve_or_create(c,'ZZTESTE PIXELO LUZES UNIPESSOAL',null,'apply_coala_bp');
  r3 := _supplier_resolve_or_create(c,'ZZTESTE Bolt Xpto Inexistente',null,'apply_coala_bp');
  SELECT count(*) INTO nf FROM supplier_similarity_flags WHERE similar_supplier_id=a;
  RAISE EXCEPTION 'RESULTADO nif=% | nome=% | sem=% | flags=% | norm=%,%', r1, r2, r3, nf, normalize_supplier_nif('PT123456789'), normalize_supplier_nif('ESB12345678');
END $$;

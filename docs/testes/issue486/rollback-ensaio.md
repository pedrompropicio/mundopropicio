> D23: o rollback e o pós foram regenerados para as 35 identidades finais, incluindo set_split no comando, preflight de manutenção e classificação TikTok após atestação/guarda attest. A migração/cópia têm SHA256 `1a0620a35696feb399c48a277743fbb1cec4b20db83944b6c2f0089fc2241d82`. Nenhum objeto novo foi acrescentado por esta adenda; o ensaio abaixo continua preparado e não executado. Incluir os dois entrypoints e a lacuna de consumidor de manutenção de `dossier.md` na futura análise de consumidores antes do rollback.

# Ensaio de rollback — preparado, não executado

A autorização desta entrega não permite executar este ensaio. Exige catálogo PostgreSQL fiel, base descartável sintética sem egress/crons/dados operacionais e autorização própria. Não usar replay/bindings privados #352 nem substituir helpers por stubs.

1. Guardar pré-catálogo: corpos/assinaturas/defaults/owner/language/security/volatility/config/ACL/grant option das três funções substituídas, atributos/defaults/constraints/índices/policies/RLS/triggers e dependências. Guardar digests financeiros e saídas de pre-verificacoes. Falta de controlo é falha do ensaio.
2. Instalar os bytes exatos de 0305 na futura etapa autorizada; conferir SHA256, identities e pos-verificacoes, enabled=false, zero dados v1 e digests legados iguais. A pré-imagem e o manifesto capturados não são dados operacionais.
3. Rever consumidores externos/D2/D3, funções de outros schemas, SQL dinâmico e serviços; provar ausência/drenagem de consumidores antes de remover os comentários do rollback. `pg_depend`/procura literal não prova ausência de nomes compostos. Sem esta prova, não autorizar rollback.
4. Executar então o rollback comentado com ON_ERROR_STOP, em transação única. Comparar exatamente os três corpos e ACL com a pré-imagem e todos os objetos/digests legados. Não contar apenas triggers nem comparar só prosrc. Conservar stdout, PIDs, versões e resultado antes de destruir o contentor.
5. Reinstalar em cópias independentes; semear um plano, uma atestação, uma operação financial_committed, uma complete e uma reverted em variantes distintas usando os comandos reais/fixture. Cada variante deve recusar rollback antes de qualquer DROP e conservar o catálogo/digests. Não apagar histórico para o teste passar.
6. Noutras cópias, alterar owner, ACL/grant option, body, proconfig, constraint, trigger, policy e dependência externa (view/trigger/função em outro schema), separadamente. O manifesto/identidades ou RESTRICT devem abortar tudo, sem remoção parcial. Uma dependência textual dinâmica exige revisão manual e não pode ser certificada pelo script.
7. Após cada falha, comparar integralmente o catálogo; repetir sucesso sem dados numa cópia intacta. Novos objetos removem-se em ordem inversa; originais repõem-se pelos bytes capturados; sem DROP CASCADE. Contexto/controlo/manifestos só saem quando não há atividade nem dados v1.

Resultado desta entrega: não executado; nenhum rollback aprovado. Com dados v1, recuperação exige correção para a frente ou plano operacional separado. O manifesto instalado é parte da base de confiança do owner; não deteta adulteração coordenada feita pelo próprio owner.

## C3 — manifesto positivo e adulterações independentes

O verificador textual já executado cobre equivalência `SET =`/`SET TO`, valores separados, aspas e sete adulterações em memória. O ensaio PostgreSQL abaixo está **apenas preparado**, numa cópia sintética recém-instalada e sem fixture de negócio; não há resultado PASS PostgreSQL nesta entrega.

O futuro harness transforma o primeiro bloco `DO $identities$ … END $identities$;` de `pos-verificacoes.sql` em `CREATE FUNCTION pg_temp.ads486_verify_identity() RETURNS void LANGUAGE plpgsql AS $identities$ … END $identities$;`, preservando o corpo byte a byte. Não substituir pelo teste de uma única coluna ou por um stub. Executar primeiro o verificador completo sem adulterações e conferir `proconfig=ARRAY['search_path=public, pg_catalog']` no setter. Executar os seguintes casos na mesma sessão, um por subtransação, com o catálogo íntegro antes/depois:

```sql
-- PREPARADO, NÃO EXECUTADO; requer a transformação exata descrita acima.
SELECT pg_temp.ads486_verify_identity();
DO $$ DECLARE mutation text; before_catalog jsonb; failed boolean; BEGIN
 ASSERT current_database()='issue486_synthetic' AND current_user='postgres';
 ASSERT (SELECT proconfig=ARRAY['search_path=public, pg_catalog']::text[]
  FROM pg_proc WHERE oid='public.ads_invoice_line_set_tour_split(uuid,jsonb)'::regprocedure),'separate_quoted_values_positive';
 FOREACH mutation IN ARRAY ARRAY[
  $m$ALTER FUNCTION public.ads_invoice_line_set_tour_split(uuid,jsonb) SET search_path TO 'public'', ''pg_catalog'$m$,
  $m$ALTER FUNCTION public.ads_invoice_line_set_tour_split(uuid,jsonb) SET search_path TO pg_catalog,public$m$,
  $m$ALTER FUNCTION public._ads486_money(jsonb) OWNER TO authenticated$m$,
  $m$ALTER FUNCTION public._ads486_money(jsonb) SECURITY DEFINER$m$,
  $m$ALTER FUNCTION public._ads486_preview(uuid) VOLATILE$m$,
  $m$ALTER FUNCTION public._ads486_decimal(numeric) CALLED ON NULL INPUT$m$,
  $m$GRANT EXECUTE ON FUNCTION public._ads486_money(jsonb) TO PUBLIC$m$,
  $m$GRANT EXECUTE ON FUNCTION public.ads_invoice_generation_v1(uuid,text,jsonb) TO authenticated WITH GRANT OPTION$m$,
  $m$ALTER FUNCTION public._ads486_money(jsonb) RENAME TO _ads486_money_altered$m$
 ] LOOP
  before_catalog:=public._ads486_catalog();
  BEGIN
   EXECUTE mutation;
   failed:=false;
   BEGIN PERFORM pg_temp.ads486_verify_identity();
   EXCEPTION WHEN SQLSTATE 'P0001' THEN
    ASSERT SQLERRM LIKE '0305_function_identity:%' OR SQLERRM LIKE '0305_effective_acl:%' OR SQLERRM LIKE '0305_nominal_acl:%','exact_manifest_rejection';
    failed:=true;
   END;
   ASSERT failed,'tampered_manifest_must_fail';
   RAISE EXCEPTION USING ERRCODE='P0487',MESSAGE='rollback_manifest_mutation';
  EXCEPTION WHEN SQLSTATE 'P0487' THEN ASSERT SQLERRM='rollback_manifest_mutation'; END;
  ASSERT public._ads486_catalog()=before_catalog,'mutation_catalog_fully_restored';
  PERFORM pg_temp.ads486_verify_identity();
 END LOOP;
END $$;
```

Corpo e defaults têm ainda duas variantes: obter `pg_get_functiondef` de `_ads486_money(jsonb)` e `_ads486_keys(jsonb,text[],text[])`, introduzir um comentário no corpo da primeira ou trocar apenas `DEFAULT '{}'::text[]` por `DEFAULT '{x}'::text[]` na segunda e recriar na subtransação. Exigir `0305_function_identity`, rollback e catálogo byte-igual como acima. A transformação deve demonstrar que alterou exatamente uma ocorrência; zero/múltiplas ocorrências falham o caso. Uma troca de assinatura válida por rename é testada acima; a tentativa de alterar o retorno de uma função existente é também recusada pelo próprio PostgreSQL e não substitui a validação de retorno do manifesto.

Todos os cenários sem dados/dependências v1 devem conservar o controlo fechado. Os bloqueios por plano, atestação, operação inclusive reverted, manutenção, ACL/owner/corpo/config/defaults e dependências existentes continuam exigências dos passos1–7. Não executar um DROP parcial numa transação à parte para fazer o rollback passar. O programa de verificação compara as listas de identidades em instalação/pós/rollback e confere que todos os DROP autónomos usam RESTRICT; a pré-imagem efetiva continua a ser a capturada, não uma reconstrução de memória.

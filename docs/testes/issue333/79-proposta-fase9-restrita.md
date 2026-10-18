# #333 — proposta revisável de fase9, NÃO release

HEAD inicial001f6dae2937db98f3b348bff12777f3e510199f confirmado localmente. Revisão de ficheiros somente; nenhuma consulta Cloud, teste, ativação, deploy ou Publish. Manual76 aprovado;8PARCIAL, sem dispensa humana dos três critérios.

## Ordem original / checklist

Fases1–7: todas concluídas, sem reabrir nem renomear as sete etapas anteriores.
- [ ] 8 — piloto/aceitação: manual aprovado; três lacunas ampliadas abaixo.
- [ ] 9 — disponibilização/publicação inicial RESTRITA; somente proposta nesta tarefa.
- [ ] 10 — OpenAI/análise documental.
- [ ] 11 — Gmail.
- [ ] 12 — Drive.
- [ ] 13 — transações/anexos.
- [ ] 14 — BP/Formalidade.
- [ ] 15 — extratos.
- [ ] 16 — bilheteiras.
- [ ] 17 — aceitação integrada.
- [ ] 18 — final.

Correção explícita: a sugestão78 rotulada9 era conteúdo da10. Histórico78 conservado; não altera ordem nem autoriza análise documental.

## Estado funcional atual e escopo proposto

`supabase/functions/data-entry/index.ts`: pilotScoped=true, uploadEnabled=false. O handler usa capacidades canónicas quando pilotScoped=true, NÃO OR com flags globais. RPC ausente/erro/schema inválido falha fechado. Estrutura/deploy anteriores comprovados55 e manual76; nomes PENDENTE/INERTE de artefactos históricos não provam ausência no ambiente. Não reivindicar uma nova leitura Live nesta tarefa.

Proposta inicial: somente a conta existente já escolhida, Gestor na MP, identificada PRIVADAMENTE; nenhuma outra pessoa ou empresa. O código admite admin/platform_admin/manager na empresa ativa, mas papel sozinho NÃO abre acesso: cada pessoa/empresa precisa das duas chaves explícitas. Não mudar roles/perfil/senha, não criar conta. Aumentar lista de pessoas/empresas exige revisão separada.

- preparation: novo lote, upload, notas e prévia.
- assistant_create: executar avulsa autorizada, somente documento/metadados em EUR. Não liquidar, aprovar TX ou criar movimento financeiro.
- Todos os demais ramos continuam fechados: IA/Gmail/Drive/TX/anexos/BP/Formalidade/pagamentos/banco/bilheteira; writers scanner/accountant/ingest não são ativados por esta configuração.
- Prévia canónica vinculada a owner/empresa/documento/versão; pagador membro e dados reais revistos; aprovação explícita e nome/data resolvidos pelo servidor. Resposta incerta requer leitura, não retry cego.
- PDF/JPEG/PNG estruturalmente validados,1byte–20MiB/documento, SHA servidor. Contrato SQL histórico permite20documentos/200notas por lote; UI atual usa primeiro documento e uma autorização por execução. Não anunciar importação em lote de20faturas.
- Não existe quota de faturas/lotes por pessoa ou teto operacional de valor implementado. Não confundir janela temporal com “uma fatura somente”. Campos manuais, EUR, IVA entre0 e total; não inferir que produto só aceita€0:€0 foi a fixture.
- Leitura/check/documento existentes têm caminho read-only no handler após revogação. Porém ao REABRIR o modal a UI exige capabilities.upload para inicializar contexto; não prometer retoma UI pós-revogação nesta versão. Lacuna de check exige caminho autenticado permitido, não console/headers no navegador de Pedro.

## Configuração exata proposta e duração

Janela inicial proposta:600s para a MESMA pessoa/empresa escolhida, sem renovação automática. É uma janela restrita supervisionada, não disponibilidade permanente. Nenhum marker/ref/PDF fixture passa a configuração de produto. Nota de release: `issue333-release9-reviewed-window-v1`.

Diff de produto/edge/DDL: VAZIO. Flags globais preparation_validated=false, execute_validated=false, standalone_attempt_settings_333.enabled=false permanecem iguais. PilotScoped=true/uploadEnabled=false e recursos excluídos=false permanecem iguais. Publicação futura apenas após aceitação8 e autorização específica; verificar antes qual diff completo de outras frentes iria ao site, sem publicar implicitamente.

Diff DML futuro: atualizar APENAS as duas linhas próprias EXISTENTES e disabled, guardadas por nota/expiry anteriores revistos. Não INSERT/UPSERT, não reset amplo, não GRANT. Parâmetros abaixo são literais privados para revisão; não executáveis antes de substituição/revisão e baseline atual. Não copiar a nota fixture para a nota de release. Baseline76 é histórica, não baseline de futura liberação.

```sql
-- INERTE. Parametros privados exatos; sem execucao nesta tarefa.
BEGIN;
DO $release9$
DECLARE
 u uuid:='__REVIEWED_OWNER_UUID__'; c uuid:='__REVIEWED_COMPANY_UUID__';
 old_note text:='__EXACT_PREVIOUS_NOTE__';
 old_expiry timestamptz:='__EXACT_PREVIOUS_EXPIRY__';
 new_note text:='issue333-release9-reviewed-window-v1';
 expiry timestamptz; n integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('issue333-pilot8-controller',3338));
 LOCK TABLE public.data_entry_pilot8_allowlist IN SHARE ROW EXCLUSIVE MODE;
 LOCK TABLE public.data_entry_settings,public.standalone_attempt_settings_333 IN SHARE MODE;
 PERFORM 1 FROM public.profiles WHERE id=u FOR SHARE;
 PERFORM 1 FROM public.user_roles WHERE user_id=u ORDER BY id FOR SHARE;
 PERFORM 1 FROM public.companies WHERE id=c FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=u AND company_id=c AND active_company_id IS NULL)
 OR NOT EXISTS(SELECT 1 FROM public.companies WHERE id=c AND status='active')
 OR (SELECT count(*) FROM public.user_roles WHERE user_id=u)<>1
 OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=u AND company_id=c AND role='manager')
 OR public._effective_permissions_for(u,c,'{}'::text[])->>'role' IS DISTINCT FROM 'manager'
 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=u AND email_confirmed_at IS NOT NULL
 AND (banned_until IS NULL OR banned_until<=clock_timestamp()))
 THEN RAISE EXCEPTION 'Reviewed existing context drift'; END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.current_company_id()'::regprocedure) IS DISTINCT FROM 'f857f027a44e858399e895d702af7ad0'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.data_entry_pilot8_gate(text)'::regprocedure) IS DISTINCT FROM '1e066a6df3637c8d5c8f99f00a255d33'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public._effective_permissions_for(uuid,uuid,text[])'::regprocedure) IS DISTINCT FROM 'a6c16467e8b556f8b006f9fc68765812'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.log_table_change()'::regprocedure) IS DISTINCT FROM '9509fe109550c9e0367fcbe4ffc661c5'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.set_company_id_on_insert()'::regprocedure) IS DISTINCT FROM '949120b4d6c08f0c8707f63d28708d96'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='auth.uid()'::regprocedure) IS DISTINCT FROM 'cdef18c69c4f4cbbced2eaf81e628b49'
 THEN RAISE EXCEPTION 'Reviewed source drift'; END IF;
 IF EXISTS(SELECT 1 FROM public.data_entry_settings WHERE preparation_validated OR execute_validated)
 OR EXISTS(SELECT 1 FROM public.standalone_attempt_settings_333 WHERE enabled)
 OR EXISTS(SELECT 1 FROM public.data_entry_pilot8_allowlist WHERE enabled)
 OR (SELECT count(*) FROM public.data_entry_pilot8_allowlist WHERE owner_id=u)<>2
 OR (SELECT count(*) FROM public.data_entry_pilot8_allowlist WHERE owner_id=u AND company_id=c
 AND operation IN ('preparation','assistant_create') AND NOT enabled
 AND reviewed_note=old_note AND expires_at=old_expiry)<>2
 THEN RAISE EXCEPTION 'Closed configuration/exact previous keys conflict'; END IF;
 expiry:=clock_timestamp()+interval '600 seconds';
 UPDATE public.data_entry_pilot8_allowlist SET enabled=true,expires_at=expiry,reviewed_note=new_note
 WHERE owner_id=u AND company_id=c AND operation IN ('preparation','assistant_create')
 AND NOT enabled AND reviewed_note=old_note AND expires_at=old_expiry;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>2 THEN RAISE EXCEPTION 'Expected exactly two reviewed keys'; END IF;
END $release9$;
SELECT owner_id,company_id,operation,enabled,expires_at,reviewed_note
FROM public.data_entry_pilot8_allowlist WHERE owner_id='__REVIEWED_OWNER_UUID__'
AND company_id='__REVIEWED_COMPANY_UUID__' AND reviewed_note='issue333-release9-reviewed-window-v1'
ORDER BY operation;
COMMIT;
```

MD5 ci-dessus sont ceux revus76, pas une affirmation de fraîcheur Live79. Avant application: controller doit confronter les18signatures/ACL/source/owner à une capture actuelle approuvée, fournir exactement les paramètres privés/ancienne note/expiry et conserver les deux clés retournées. Si différences ou contexte changé: STOP, aucune réécriture improvisée. SQL est une proposition non exécutée/non testée dans79; source identique ne certifie pas ce nouveau DML.

## Rollback exact proposé

Fermer les deux opérations par compositekeys+note release+expiry RETOURNÉ. Pas de ban/logoutglobal, pas d'effacement de candidats/factures/audits, pas de restauration de lignes enabled. Retour aux paramètres produit inchangés; puisque diff produit vide, aucun retour de fonction edge n'est nécessaire. Une publication future aura son propre manifeste/retour de version revu, jamais restauration aveugle d'autres fronts.

```sql
-- INERTE; meme owner/company et EXACT expiry retourne par release9.
BEGIN;
DO $close9$
DECLARE u uuid:='__REVIEWED_OWNER_UUID__'; c uuid:='__REVIEWED_COMPANY_UUID__';
 e timestamptz:='__EXACT_RELEASE_RETURNED_EXPIRY__'; n integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('issue333-pilot8-controller',3338));
 PERFORM 1 FROM public.data_entry_pilot8_allowlist WHERE owner_id=u AND company_id=c
 AND operation IN ('preparation','assistant_create')
 AND reviewed_note='issue333-release9-reviewed-window-v1' AND expires_at=e ORDER BY operation FOR UPDATE;
 IF (SELECT count(*) FROM public.data_entry_pilot8_allowlist WHERE owner_id=u AND company_id=c
 AND operation IN ('preparation','assistant_create')
 AND reviewed_note='issue333-release9-reviewed-window-v1' AND expires_at=e)<>2
 THEN RAISE EXCEPTION 'Exact release keys drift; stop without broad fallback'; END IF;
 UPDATE public.data_entry_pilot8_allowlist SET enabled=false WHERE owner_id=u AND company_id=c
 AND operation IN ('preparation','assistant_create')
 AND reviewed_note='issue333-release9-reviewed-window-v1' AND expires_at=e;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>2 THEN RAISE EXCEPTION 'Expected exactly two closed keys'; END IF;
END $close9$;
COMMIT;
```

Rollback conserve note/expiry release pour traçabilité et garde l'ancien snapshot chez controller; pas de restauration d'ancienne activation. Expiration seule ferme les nouveaux effets mais ne remplace pas la révocation explicite. Transaction déjà en cours peut terminer avant la révocation sous locks; ne promettre ni annulation rétroactive ni suppression du résultat.

## Critères8: couverture et décision

1. Check authentifié commencé APRÈS révocation: couverture locale PG/handler/React32/52/66; Live50 lecture protégée d'une réserve, PAS preuve de ce résultat terminé76 après révocation. Request nouvellement initié/read-only sur résultat76 peut combler cette lacune via session authentique permise, sans accès sandbox présumé.
2. Deux executeHTTP simultanés MÊME prévia: couverture locale deux connexions/locks,1résultat/facture52 et suites53/66; manual76 une exécution, pas preuve HTTP simultanée Live. Ce critère est non-read-only par nature: exige authorization spécifique d'une vérification finie sur intention existante, sans nouveau lote/compte et sans adapter/transporte interdit. Si chemin sûr indisponible, rester explicite/bloqué, pas duplo clique ni replay improvisé.
3. Download séparé bytes/SHA: lecture/hash internes handler et essais locaux; manual76 SHA document observé et UI conferido, mais PAS download séparé certifié. Peut être vérifié sur objet existant, sans nouvel insert, par accès authentique permis.

Les trois restent gates d'acceptation du release selon le plan ORIGINAL tant que Pedro n'a pas explicitement différé ces critères. Ce ne sont pas trois bugs démontrés; ils sont des preuves manquantes avec couverture locale/Live partielle. La limite legacy normalisation universelle52 reste également hors promesse: ne pas proposer accès universel ou concurrence avec writerslegacy d'une même identité; version restrita ne corrige pas cette limite par configuration.

Décision humaine, AVANT toute phase9 exécutée:
A — Accepter manual76 comme suffisant pour clôturer8 et reporter EXPRESSÉMENT les trois critères à une acceptation ultérieure identifiée; puis revoir/autoriser séparément fenêtre/release9.
B — Maintenir8PARCIAL et autoriser uniquement les vérifications manquantes par chemin permis (recommandation technique). Commencer par les deux lectures sur artefact existant; traiter HTTP concurrent séparément, sans nouvelle batterie/pilote/compte. Proportionné: une release de documents réels mérite les preuves restantes, mais pas répétition des négatifs déjà PASS.

Cette décision ne vaut pas activation ni Publish, quel que soit le choix. Aucun soutienAuthAdmin requis; compte existant suffit quand un accès authentique autorisé est disponible.

## Fecho79

Proposition9 préparée;1–7done/8PARCIAL/9–18NON exécutées. #323/DECISIONS/AGENTS préservés. Réserve333 libérée après registre. Checklist/texte pour Issue333 local; Issue distante non éditée par agent. Aucun secret/ID personnel, marqueurfixture de produit, Cloudwrite, test, nouvelle facture ou Publish.
# #332 lista — Fase A preparada, não aplicada

## Contrato
SQL inerte: supabase/manual/20261017_issue332_list.PENDENTE.sql. Substitui apenas ramo filters.source=newgang_clube:v2; assinatura, ACL, Coala e genérico da0181 mantidos. Nenhuma tabela/seed/backfill/crédito/config/lista criada ou alterada.
Coletor: membros MP confirmados, site ativo newgangfestival.pt, perfil com nascimento verificável >=13 (Lisboa data local), email válido normalizado/deduplicado e não suprimido por empresa OU global. Desconhecido/sem perfil/menor fica fora (fail-closed). Só última referência imutável por membro/site/purpose meta_ads no ledger322, state granted, banner anuncios-v1, marketing_consent_effective válido agora, nenhuma revisão posterior (mesmo futura) ao evento. Ordenação por revisão servidor; não captura histórica nem consent_email. Grant tardio entra; revogação sai; regrant atual entra sem autorizar capturas antigas. 46 legados são EMAIL, não anúncios.
RPC retorna email e phone=NULL; coletor canónico pagina1000, ordena, só finaliza replacement após todos lotes; falha não repete/finaliza. Envio ramo estrito EMAIL_SHA256 apenas, cada linha um hash SHA256 de email normalizado. Nenhum hash telefone ou número, nem campo PHONE_SHA256. Respostas persistidas allowlist de contagens numéricas; erros externos/rede genéricos para não gravar emails/tokens ecoados. Outros ramos mantêm schema original. Dry-run default antes de tokens e mutações; não invocado em Live nesta tarefa.
Descadastro existente mantido: revoga email E anúncios, suprime e reclama token atomicamente. Regrant anúncios não apaga supressão. Reactivar não alterado. Email/WhatsApp/pontos continuam independentes.

## Provas
scripts/newgang-strict-audience/run.sh: PostgreSQL17.9 UTF8/socket Unix/noTCP/net/dblink indisponíveis. Migrações reais0182 e0185 aplicadas só no descartável; fronteiras hosted/cripto simuladas, não prova LiveRLS nem envio real Meta.
LIST32/32: concessão/revogação/replay/regrant/tardia, idempotência, oito revokes concorrentes e revoke vs grant stale esperando lock, perfil ausente/12/exatos13, email inválido/normalizado/duplicado, supressão global/empresa/alheia, política retirada/TTL, membro não confirmado, phoneNULL, legadosv2/unversioned excluídos, descadastro e regrant continuam suprimidos, pontos iguais, Coala/genérico originais, anon sem EXECUTE.
Regressões pessoa41/41 e perfil54/54 no mesmo runner. Vitest delivery4 novos +5 coletor +3 handler =12/12; suite completa161 pass/1skip,1285 pass/1skip/11todo. Deno handler pessoa17/17, WhatsApp4/4, cities2/2; cities unit4/4. Deno check cities.ts/sync-users.ts OK; preview build OK. CI GitHub hosted não verificada.

## Contagens SELECT apenas
17/10/2026 12:49:39 UTC:62 membros;3 elegíveis/3 emails distintos;59 sem anúncios provados;0revoked. Consulta12:45:27:email latest granted9clube-newgang-v2+37legacy-sem-versao+9email-v3; os46legados não são ads.
P_NG27_LISTA observada enabled=true/linked=true/replace=true/source=newgang_clube:v2; última sync04:35:03.807UTC/ok/total_local1 (não comprova totalMeta). cron2499 ng27-clube-audience-sync ativo35 4 * * *; ambos intocados. Nenhum sync nem envio invocado.
Último SELECT geral12:49:16:club_points55/5025/hash46c5ba1c1923354ffc000374bf88b916 (fórmula md5(id:points ordenados), não comparável automaticamente aos hashes históricos); inscrições reais continuam, por isso não declarar baseline antigo53/4875. Nenhuma escrita Live nossa.

## Bloqueios Fase B
1. Só deploy newgang-portal não entrega o schema email-only preparado em crm-meta-audience-sync/index.ts+sync-users.ts. Requer autorização explícita de deploy também desse sync, ou manter lista sem aplicação. Não foi deployado nenhum.
2. P_NG27_LISTA/cron2499 já estão ativos: trocar ramo do RPC altera a próxima execução automática, mesmo sem sync manual. Obter decisão explícita antes de aplicar SQL; não desligámos/alterámos cron/lista.
3. Revalidar HEADs/hashes/ACL/baseline atuais e CI antes de Live. Novo Sim não presume autorização de sync, Meta, backfill, limpeza nem welcome automático do teste. E2E só com membro teste autorizado e plano sem egress.
4. Precisam decidir como identificar Lagoa Continente/Açores se exigirem agregação por código; campo atual tem só nome, não inferimos região. País estrangeiro precisa vir no portal separado.

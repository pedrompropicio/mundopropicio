# #332 cidade — Fase A preparada, não aplicada

Fonte oficial DGT CAOP2025: https://www.dgterritorio.gov.pt/atividades/cartografia/cartografia-tematica/caop
- https://geo2.dgterritorio.gov.pt/caop/CAOP_Continente_2025-gpkg.zip — SHA256 87cd67f4b1fbadf23d9324e6fb231ff05531e4db347af36ccc7c6cbabe3ecd1d
- https://geo2.dgterritorio.gov.pt/caop/CAOP_RAA_2025-gpkg.zip — SHA256 b0e3b4fe5544647eb4593e0222c6430fae7e50c97f953d8ceae10707c4df9dcf
- https://geo2.dgterritorio.gov.pt/caop/CAOP_RAM_2025-gpkg.zip — SHA256 ae568ca2006e91205601309ff46bc8ae0cc73236165f095f8aa99a5b9a17e5d6

Método: extrair ZIPs; abrir 4 GeoPackages em SQLite read-only (Continente, Açores central/oriental e ocidental, Madeira); SELECT dtmn,municipio das camadas cont_municipios/raa_cen_ori_municipios/raa_oci_municipios/ram_municipios; unir por dtmn, ordenar código; rejeitar duplicados. Verificação repetida: 308 códigos, 278/19/11. Lista preservada em cities/caop2025-municipalities.json; SHA256 e8cca944a7f5219e873ec719bb28ae47cfda08a3907752b8e65705fbf8795da3.

## Contrato e segurança
- SQL inerte: supabase/manual/20261017_issue332_city.PENDENTE.sql. Referência é VIEW literal VALUES, pública sem dados pessoais, não tabela semeada nem DML em migração. Aplicação futura só pela ferramenta canónica, com número atribuído nessa altura.
- club_city_key: NFC, Unicode lower, acentos removidos, todos os espaços removidos. Correspondência EXATA: sem fuzzy nem bairros→concelho.
- profile_confirm mantém ação, sessão, locks, confirmação e crédito canónicos; city_normalize PT retorna nome oficial ou city_unknown. Estrangeiro usa country ISO explícito, trim/espaços únicos/initcap. Guarda trigger cobre escritores diretos de perfil. Pontos/consentimentos não mudam.
- action cities sem sessão, Origin permitido: {country:"PT",version:"caop-2025",cities:[{code,name,region}]}; 308, TTL instância60s, timeout1500ms, falha503 cities_unavailable, só projeção allowlist, nunca perfil ou consentimentos na cache.
- Captura MP/source clube_newgang: BEFORE INSERT/UPDATE cidade valida antes de ingestão. residence_country PT desconhecido falha city_unknown; estrangeiro exige ISO. Sem país, só nome oficial exato é compatível; desconhecido falha country_invalid, sem inventar país. Todas as 78 capturas observadas não tinham país: portal separado terá de o enviar para novas cidades estrangeiras. portal-track não alterado/deployado: erro PostgreSQL é city_unknown mas seu wrapper legado HTTP devolve500 ok:false; comunicação detalhada neste wrapper requer etapa separada autorizada.
- Summary e lista 0111 projetam nomes históricos correspondentes sem reescrever raw. Desconhecidos preservados distintamente. Lagoa tem dois códigos (Continente/Açores), mesmo nome: action cities preserva ambos; campo cidade é nominal, sem inventar código/região; summary combina o mesmo nome.

## Backfill EXATO (não executado em Live)
SQL separado: supabase/manual/20261017_issue332_city.BACKFILL.PENDENTE.sql; só correspondências exatas MP Clube e perfis PT Newgang; sem país atribuído, sem pontos/consentimentos alterados. Em Fase B obter preview atual, baseline e Sim específico.
Inventário anterior SELECT: perfil Lisboa4/Odivelas1/seixal1/Seixal1. Capturas city: Lisboa20 (16 Lisboa/4 lisboa), Santarém2 (1 Santarem/1 Santarém); outros concelhos exatos e variações observados. Não correspondentes: Caacais1, cacem são marcos1, fazendas de almeirim1, Lavradio1, Queluz1, São Paulo1 (país ausente), Tomae1; nulos34. Não serão inferidos Cascais/Sintra/Almeirim/Barreiro/Tomar/BR. Contagens de backfill definitivas serão reobtidas antes de aprovação.

## Provas locais
PostgreSQL17.9, UTF8 builtin C.UTF-8, socket Unix, listen_addresses vazio; net/dblink indisponíveis. scripts/newgang-cities/run.sh: CITY29/29, regressão33055/55 com oito conexões reais no runner existente. Backfill executado APENAS em fixtures locais, duas vezes, idempotência e pontos iguais. Helpers de acesso CRM/crypto são fronteiras simuladas; não é E2E Live nem prova hosted-RLS.
Deno cities_test.ts4/4: cache, projeção sem dados extras, lista incompleta/duplicados, falha não cacheada, city_unknown400/no_session401.
Nenhuma migração/deploy/backfill Live/envio/cron/sync/Publish executados.

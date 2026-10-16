# #330 — infra e API aplicadas; missão DESATIVADA

## Fonte e canais

HEAD local=GitHub antes de editar: `260d2faf4c185779987c8b79cf45a9387d7f892f`. Reserva330 vigente conforme autorização; #322/#323 e documentos bloqueados intactos.

Original PENDENTE preservado SHA256 `b19b09e32f6db9edb7c1fa3def1b9ec07bf1916d1ac1f5cac10a79e06e441cfd`.
NORMALIZADO SHA256 `0c7d4091b893bc8d4978472a3f50bf32f545961238ba72964f1d2e63a95fcb39`.
DDL SHA256 `dc1cd03ceb633221888a34290163f27a444326fe12650b32580469871ec09a5c`.
SEED SHA256 `ad452be6537a4c256dc1625427af7471ec1449ae3973b34c4bb37699d836f8a9`.
Manifesto `particionamento.json`: DDL[:691]+SEED+DDL[691:] recompõe NORMALIZADO byte por byte. BEGIN/END internos intactos. Apenas wrappers exteriores removidos e INSERT249 extraído.

DDL aplicado atomicamente pelo canal lov_database--migration, UMA VEZ, em `drizzle/migrations/0179_issue330_profile_infra_off.sql`; cmp com DDL exit0. Tipos regenerados automaticamente. Não reaplicadas0177/0178/CUTOVER, não alterados defaults globais.

## Execução dos países e erro corrigido antes do deploy

Canal DML run_sql: BEGIN/lock exclusivo/guardas schema+vazio+settings/perfis/créditos0/INSERT/count249/COMMIT. Sucesso.

A transcrição manual do payload teve dois nomes divergentes: GW=Guadalupe em vez de Guiné-Bissau; MR=Martinica em vez de Mauritânia. Conferência independente detetou MD5 `eb09d64b5a844bdd3d872a605840bee7` divergente. Não se oculta nem se alega execução byte-idêntica. Antes do patch/deploy, outra transação DML guardada pelo hash inicial, count249, missãoOFF e valores antigos corrigiu exatamente as duas linhas para o artefacto autorizado, sem upsert. MD5 final ordenado code+TAB+name+LF: `2a5e44e09535fd8e4c1b8063d43dcc77`, igual aos249 pares do artefacto. As duas fases principais foram atómicas individualmente; a correção adicional também. Nenhuma API330 entre fases.

## Guardas e preservação

SELECT23:30:59.483285UTC: instalação ausente (3tabelas/6funções/índice), créditos330zero; 17/17 definições core iguais à baseline327. ACL anonfalse/service_true em17, authenticated apenas ranking.

Antes: membros41; ledger26/2650, hash `72d13f51fcc162460e4b5baa9aeeaacc`; membros hash `6f3208ea9cf0951b1560eaba921c8a84`.
DepoisDDL/seed: ledger e membros integralmente iguais. Após smoke23:35:17: ledger26/2650 e mesmo hash; membros42 devido a UMA adesão normal concorrente. Restrição às identidades criadas até ao snapshot retorna41 e o mesmo hash integral, provando preservação das linhas anteriores sem imprimir PII. Crews3/hash `f8956715389ef7137ae0c384d53abd6b`; prémios/regras/site hashes iguais (aplicacao.json).

Core17 hashes e grants iguais antes/depois. Config327 única ativa2027-v1, inscrição100/ref75 cap750/Crew100; níveis0/750/3000, comprasOFF/anulação não libera cap. Floors0/cutovers1. Nenhuma alteração ou recálculo de pontos/legados/direitos.

## ACL, RLS e funções

Conferência independente23:33:45: 3tabelas RLSON; countries sem policy pública; authenticated SELECT apenas settings/profiles sob portal_can_write() AND row_belongs_to_current_company(company_id). Anon zero privilégios; authenticated sem escrita/MAINTAIN. service_role ALL excetoMAINTAIN em3. aclexplode confirmado; owner e papéis sandbox geridos pela plataforma existem, sem alteração manual. As6funções têm EXECUTE serviço, não anon/auth/PUBLIC; corpos md5 6/6 iguais a functions-body-expected.json. Quatro triggersON, índice único parcial por member_id/rule_key profile_complete. Nenhum ALTER DEFAULT PRIVILEGES global.

Settings0/perfis0/créditos330zero: NÃO foi chamado club_profile_configure(true), nem criado rótulo/regra ativa/draft ou retrocrédito.

## API e HTTP

Patch aprovado SHA256 `a5f1e0c028f3fcd1adfb05e91090f6ef6cd6886ad84412b47944ca3e230d06fb`, dry-run limpo, aplicado exatamente. profile.ts/countries.ts cmp com artefactos exit0. Deploy SOMENTE newgang-portal.
SHA256 fonte submetida (ficheiros+settings): `b3d7f56a823698fe810c5d986f32e34b4c8abe66e7f39e042fcedad69376b7ed`. O canal devolveu sucesso; não é download/hash independente dos bytes remotos. Smoke Live confirma contrato e comportamento.

site/bundle/ranking/lineup/history/countries HTTP200; countries249 shape code/name/version; site e bundle profile_mission availablefalse/pointsnull/statusindisponivel. Core327 níveis e valores atuais corretos, compras indisponíveis. me/profile_confirm sem token, curto malformado e longo inválido401 no_session; crew_pending sem token401. Não foi usada sessão real nem chamado confirm autenticado. Smoke primeiro teve falso positivo nas cidades públicas de edições; teste corrigido para distinguir city de edição de perfil privado e repetido com exit0. Resultados/latências em smoke-aplicacao.json (segunda passagem232–1051ms). Não se promete zero indisponibilidade nem E2E escrita Live.

## Testes e limitações

PostgreSQL17.9 local59/59 exit0 (regressões canónicas327/328 no runner, sem rede/TCP); handler integrado9/9 exit0; módulo8/8 exit0; CRM integração7/7 exit0; Vitest geral1273 passaram/1skip/11todo exit0. Deno check exit1 APENAS TS2783/TS2785 wallet_sync já presentes na baseline documentada, nenhum erro novo perfil. Compilação automáticaOK. Tipos/build manuais não executados (harness); CI remoto não confirmado, gh indisponível. Outputs integrais em aplicacao-*-output.md.

## Próximos passos — não executados

Após revisão nossa: Publish MANUAL ERP para expor compatibilidade CRM já em fonte; verificar editor da regra protegida e ausência de ativação manual. No portal(front093e1ef), confirmar publicado com contrato profile null/status/disabled e lista countries; Publish manual separado apenas se não publicado. Não foi editado portal nem acionado qualquer Publish.

Habilitação missão só com revisão SQL/API/CRM/UI e autorização específica posterior. WhatsApp depende do adaptador canónico322/#9; parental<13 depende de fluxo verificável fora do âmbito. Não bloqueiam infraOFF, não se inventou consentimento/prova. Sem emails, contactos, Google/Wallet manual, OAuth, crons, CAPI/tracking ou testes fictícios Live. Não executado rollback global327 nem rollback330.

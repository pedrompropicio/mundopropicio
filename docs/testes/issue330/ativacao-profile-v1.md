# #330 — profile-v1 ATIVADA

## Autorização e fonte
Pedro autorizou especificamente a conclusão e ativação nesta sessão de17/10/2026,01:17UTC.
HEAD GitHub=Lovable confirmado: `b764d45b96d6500bff6848ba3ff9cf3d88102733`.
Issue330 lida pela API GitHub; reserva própria no QUADRO antes da execução.
Portal6fb61d2 publicado conforme Pedro; nenhuma alteração ao portal nesta tarefa.

## Execução DML autorizada
Canal: supabase--run_sql, transação explícita BEGIN/DO/COMMIT. SemDDL/migration/seed/deploy.
Dentro da transação: `_club_site_lock(site,true)` antes dos snapshots e da configuração.
Guardas: site/domínio/brand/active/empresa/evento exatos;6 hashes+EXECUTE; países249;
settings ausentes; índice único válido; RLSON. Falha em qualquer guarda aborta.
Chamada efetivamente executada:
```sql
PERFORM public.club_profile_configure(
 'f8ce23a5-a27a-4893-9b7a-d6337d84b168','profile-v1',true
);
```
Pós-condições na mesma transação:1 settings enabled/50/profile-v1 e1 regra profile_complete active/50.
Snapshots de ledger/perfis/config327 antes e depois, sob o mesmo lock: hashes iguais ou RAISE/rollback.
Resultado do canal: sucesso sem linhas devolvidas; NOTICE não disponibilizado pelo canal.
Horário exato do COMMIT não exposto; ativação comprovada pelo SELECT de01:20:03.453846UTC.

## Preservação e proteções
Ledger imediatamente antes e depois:27 linhas/2750 pontos; MD5 integral ordenado porid
`10ec45aea047074dfbda903436e7edf4`. Perfis0/créditosprofile_complete0.
Não criado retrocrédito nem alterado membro/perfil/ledger. Config327 hash preservado dentro da transação.
Config327 continua2027-v1 ativa,100 inscrição/75 indicação/cap750/100 Crew, níveis0/750/3000 e comprasOFF.
6/6 corpos MD5 iguais a functions-body-expected.json (manifesto JSON desta ativação).
RPCs6: anon/authenticatedEXECUTEfalse;service_roletrue.
3 tabelasRLSON; policiesSELECTsettings/profiles exigem portal_can_write AND empresa.
Anon sem privilégios; authenticatedSELECTsósettings/profiles, semwrites; paísessemacessoauth.
service_roleDML; MAINTAINfalse nos3 papéis/3 tabelas. Índice profile_one_award único por membro;
regra e completion imutáveis impedem crédito por edição/retry/clear/void.
Migração0179 SHA256dc1cd03ceb633221888a34290163f27a444326fe12650b32580469871ec09a5c, não reaplicada.
profile.ts SHA256c924012ec473103e19bb6b02bb57806dc94b9df8fd8fad6563873c8a05fbf578, não alterado.

## Testes desta sessão
PostgreSQL17.9 efémero:59/59,exit0, só socketUnix semTCP/extensõesdeegress.
Inclui sucesso50,8 cliques concorrentes1×50,retry0,clear/repor/void/edição0extra,
13anoscalendário,recusa<13,semprova parental falsa,telefoneopcional/marketingindependente,
isolamento sessão/empresa,atomicidade com falha real de crédito e legado preservado.
Handler REAL da fonte aplicada:9/9,exit0,sempermissãoDeno rede/env; me privado saudável,
configenabled/disabled/absent,errosopcionaisisolados,401,countries249,core327/328/cacheprivacidade.
Runner temporário omite apenas a reaplicação do patch já instalado; nenhum código de produção editado.
CRM real:7/7,exit0;50 permanente só rótuloeditável,semgravação500,config/refetch/sites/rankingprotegido.
CI baseline:success https://github.com/pedrompropicio/mundopropicio/actions/runs/38990011401
Sem código alterado: tipos/build/suitegeral não repetidos manualmente. Build automáticoOK01:18:37.
CI do commit documental final não confirmado no momento do fecho.

## HTTP após ativação
site200/bundle200:availabletrue,points50,scopeadesao,versionprofile-v1,statusok.
countries200/249. me/profile_confirm comtokeninválido401no_session.
Latências226–2159ms; manifesto JSON guarda resultados semPII.
Nenhuma sessão criada/usada de membro real; nenhuma confirmação autenticadaLive.

## Limites e Publish
Ativação só configuração: não requer Publish para a missão dinâmica já verificada.
CRMcompatível emfonte; eventualPublishERP é manual apenas se a versão publicada não contiver essa UI.
Portal6fb61d2 já publicado informado porPedro; não foi publicado/alterado aqui.
WhatsApp permaneceadapter_pending; parental<13 permanecebloqueado atéfluxoverificável.
Sem emails/Google/Wallet/OAuth/CAPI/portal-track/cron/testesfictíciosLive.
Issue330 continuaaberta: PDF interno e dependências são escopos próprios, não falsamente concluídos.

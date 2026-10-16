# #327 — Ativação efetiva 2027-v1, 16/10/2026

## Autorização e versão

Pedro autorizou expressamente às17:43 Fortaleza executar CUTOVER e corrigir apenas a referência legada Lenda→Goat nos prémios deste site. CRM publicado e verificado autenticado pelo Pedro às17:42; portal/tooltips também confirmados por Pedro. Não foi exigido novo Publish/version.json.

HEAD local = GitHub main antes da execução e novamente depois do smoke: `a9d7f7e9e0b6ad2008fa9ba534e032d4f2cdb4c2`. É o commit-fonte da execução, não um SHA inventado para esta nova prova documental. O commit documental é gerado/sincronizado pela plataforma; CI desse commit não verificado nesta sessão.

Reserva Issue327 conforme autorização. Não alterados QUADRO/estado/CHATS/DECISIONS; #322/#323 preservadas. Apenas o backend Live único configurado foi consultado e alterado pelo canal operacional DML. Nenhuma migração reaplicada, função alterada ou código CRM/portal modificado.

Ficheiro executado UMA VEZ, com os comentários e BEGIN/COMMIT originais: `supabase/manual/20261016_issue327.CUTOVER.sql`.
SHA-256: `546256db8c4a80a75b95a51800a9fa09530b9a92eb6af487ad3de0dfe0075987`.
ROLLBACK não executado; SHA-256 intacto: `c7f18a0476747b795f8aee109f708d3f1017713efc7c2e0696f64ef05839c7c4`.

## Guardas imediatamente antes

20:44:47 UTC: HEAD local/remoto iguais. 20:45:11 UTC: snapshot atual; 20:45:53 UTC: hashes adicionais de preservação.

- PROVA_LEGADO: site aponta para evento2027=true; evento existe=1; sites no mesmo evento=1; créditos anteriores ao site=0; órfãos=0; indicados confirmados=1.
- Site criado `2026-10-13T02:19:00.962340Z`; primeiro crédito `2026-10-14T01:09:16.098766Z`; último crédito `2026-10-16T20:10:21.150530Z`.
- Membros33; Crew/Goat adquiridos por pontos:0/0; pisos previstos0; pisos existentes0. Config exata draft `435386b7-2744-453a-80ab-513d81d32fac`, versão2027-v1; ativas0; cutovers0.
- Config100/75/cap750/Crew100/compra200, legacy_counts=true, referral_void_frees_cap=false, purchase_enabled=false, purchase_lots=[], níveis0/750/3000.
- Níveis correntes Gang0/Crew500/Goat1500; Crew ativa, points200>0, min4/max6.
- Ledger20 linhas/2050 pontos: inscrição19/1900, indicação1/150. A diferença perante a prévia anterior (29 membros/1950 pontos) é atividade normal anterior à execução, não drift funcional. Uma inscrição100 já tem event_id canónico; outras19 linhas event_idNULL.
- API site/bundle HTTP200 antes. Montra antiga ref150/Crew200 e níveis500/1500; compras já indisponíveis.

## Transação CUTOVER

Canal DML devolveu resultado de sucesso da transação; consulta independente pós confirma uma única config ativa e um único log.

Hora efetiva da config: `2026-10-16T20:46:13.114226Z` (17:46:13 Fortaleza).
Log `305a5d79-9328-49e9-a0fe-3a17f5b5385a`, done_at `2026-10-16T20:46:13.093696Z`.

Resultado devolvido:
```text
members_total:33
floors_created:0
legacy_rows:19
levels_before:{Gang:0,Crew:500,Goat:1500}
levels_after:{Gang:0,Crew:750,Goat:3000}
rules_before:
 attended_year:{active:true,points:100}
 crew_complete:{active:true,points:200}
 friend_bought:{active:true,points:300}
 friend_joined:{active:true,points:150}
 guess_correct:{active:true,points:50}
 join_confirmed:{active:true,points:100}
 promo_lot_purchase:{active:true,points:500}
rules_after:
 attended_year:{active:true,points:100}
 crew_complete:{active:true,points:100}
 friend_bought:{active:true,points:300}
 friend_joined:{active:true,points:75}
 guess_correct:{active:true,points:50}
 join_confirmed:{active:true,points:100}
 promo_lot_purchase:{active:true,points:200}
```

Legado contado:18 membros/18 créditos de inscrição=1800;1 membro/1 crédito de indicação=150. Total19 retratos/1950 pontos. O crédito100 já associado à edição não é legado e permanece intacto. Nenhum crédito retroativo, edição de membro ou recálculo de club_points.

Guardas/locks originais preservados: RPC com lock exclusivo de site antes da config FOR UPDATE; produtores com site partilhado antes da linha do membro. Não houve UPDATE manual de config nem adaptação de negócio. Pisos0 é o resultado correto porque ninguém atingia500 no snapshot atual; não prova um caso real de membro protegido, apenas a ausência de membros a proteger nesta execução.

## Correção isolada de prémio

Colunas e ID localizados por SELECT, não presumidos. Uma segunda transação DML guardada alterou exatamente uma linha:

- ID `680fddf2-0e56-4e55-9cab-000241560fa6`.
- Site `f8ce23a5-a27a-4893-9b7a-d6337d84b168`; empresa `7c858982-6ccd-47ca-bd65-e0dd3eebf01c`.
- Antes tier_label=`Todos os Lenda`, level_name=`Lenda`; depois `Todos os Goat`/`Goat`.
- Guardas adicionais reward=`—`, rank_from/rank_toNULL, sort4; ROW_COUNT deve ser1 ou a transação aborta.
- Prémio continua `—`; posiçõesNULL e ordem4 intactas. As outras três faixas não mudaram.

## Preservação antes/depois

Comparações realizadas por SELECT após ambas as transações, às20:46:36 UTC:

```text
Ledger GLOBAL e do site:20 linhas/2050 pontos
MD5 row_to_json(club_points), concatenação ordenada por id:
 antes fc835a743d0cb310012275dc98c05421
 depois fc835a743d0cb310012275dc98c05421
Membros do site:33
 antes/depois 76d194e83afccd49b7b0fa6896a07b38
Crews do site:2
 antes/depois 2109a6bc72ae20ba395f85ce118df7a9
Identidades/benefícios dos níveis, sem limiares/nomes:
 antes/depois cbb616d33a2ec1a1d022ac8f799c96b2
Prémios do site, excluindo apenas tier_label/level_name:
 antes/depois ed3f14ed915a776f24728563b816ff86
```

## Hashes e EXECUTE

17/17 funções do núcleo iguais antes/depois e iguais ao artefacto esperado:
```text
_club327_cohesion b5e714acf4607c75d19469a8ef832a6f
_club_active_cfg 5c0c9429101a9544615b8bb5f0ac813a
_club_award_core 013078923029cd796a6d6eab83533b48
_club_rule_used e7bcae342231a52bff5490ce7c8406e0
_club_site_lock 74b2a06b7edd3ff957089d8c4da9ecff
club_award d6b7dc5b1a5ed66a2d1a3f1b11982784
club_award_fixed fffa0236f0c3a6fefefcf350ca332fab
club_award_purchase 5d7ecd5f37cc954833acedc9df8556a8
club_confirm_member b7034289da1bd7347f3501574b5b36f8
club_crew_pending 5476703bf9fa4b01a766f9d86b6ba960
club_member_level ce870321295623ca033330d56fd8a52c
club_points_cutover 522f1b302373fd06f5622fa799d221e4
club_purchase_revoke b14ae9141ed319c4a83ea7b7c2ec0d86
club_ranking ef026eb2cf406a4ff587a201b25496b6
club_referral_progress 5d66030c234c73053554ec1bef6adfa5
club_rules_public c90512519a68530dcbf42ab0bea0bb9d
club_wallet_due e954ff158b30530a217c45b16797a89e
```
Nestas17: anon=false em todas; authenticated=true apenas club_ranking; service_role=true em todas. Funções legacy consultadas antes conservaram hashes conhecidos; helpers/moderação legacy com grants pré-existentes não foram endurecidos/ampliados nesta tarefa. Nenhum DDL/ALTER/GRANT foi executado.

## Smoke pós-ativação

```text
site 200 pii_fields 0
bundle 200 pii_fields 0
ranking 200 pii_fields 0
crew_pending sem token 401 pii_fields 0
ação inválida 400 pii_fields 0
```

Asserções executadas no payload real de bundle:
- Gang0/Crew750/Goat3000.
- Indicação75, cap750, scope=edicao; Crew100 scope=edicao; inscrição100 scope=adesao.
- Presença100/palpite50 intactos.
- Compras própria/indicada separadas em rules_unavailable, status=sem_integracao; nenhuma promessa de pontos na montra.
- Config pós mantém purchase_enabled=false e referral_void_frees_cap=false; conquistas3/5 sem prémio adicional permanecem no motor canónico inalterado. Sem execução artificial de indicação/compra/crew para testar Live.

PII_fields procura recursivamente chaves email/phone/phone_e164/telefone/token/token_hash nos payloads, sem imprimir dados de membros. Ranking público é apenas leitura. Sem sessão real criada nem E2E de escrita Live inventado. Não se mediu duração exata da transação nem se prova ausência absoluta de latência em pedidos concorrentes; todas as leituras públicas realizadas responderam corretamente, sem regressão de embed observada.

## Limites e fecho

Sem Publish/deploy, emails, exportações, contactos, Google/Wallet manual, crons, CAPI/tracking, missões ou membros fictícios. Cron Wallet existente não alterado nem acionado manualmente. Não se executou rollback automático: reversão global exige falha verificada, autorização e planeamento de janela própria, pois o script não serializa todos os produtores.

Código intacto: não se repetiram build/tipos/testes locais de implementação nesta tarefa DML. Último sinal automático disponível antes: build OK. CI do novo commit documental não confirmado. Nenhuma decisão de negócio em aberto; ativação e correção concluídas e verificadas por leituras reais.
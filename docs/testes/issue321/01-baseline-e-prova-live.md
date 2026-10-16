# #321 — baseline e prova em Live (sem dados pessoais)

## Baseline — 2026-10-16 00:06:35 UTC (antes de aplicar 0166)
```
sent_n=29550 sent_hash=b1738fd8ecdd96d7c54466ad7c81e112   (fórmula da #320, 05-fecho-tecnico.md l.7)
leads n=46060 h(campos+capi_status+capi_sent_at)=3ab86081d07d157b839faa47eda62d35
contacts MP    n=16148 ids_md5=fa4d9b68b6bc97ff1bdf50ea20305ffc h_full=3a4d14a371c23b16a47be6d724a363b6
contacts Coala n=10935 ids_md5=754da991b3268de26754db1b4f8e4375 h_full=20d9662c2160167be5cef8119e72b22b
lead_capture processed=2971 pendentes=8 company_id NULL=0
  pendentes: MP clube_newgang 2 · MP vip_event_page 2 · Coala coala_hero_email 3 · Coala coala_early_bird 1
capi_dispatch_control.suspended=true · jobs 33/34/44/45=0 · capi_alerts=0 · net.http_request_queue=0
duplicados email por empresa=0
```

## Dependências inspeccionadas
- Triggers `lead_capture`: 4 de INSERT (vip welcome, vip coupon, set_company_id, coala confirm) — não disparam: a ingestão não insere em `lead_capture`.
- `trg_club_from_lead_capture` (AFTER UPDATE OF processed, só `clube_newgang`): cria membro do Clube e faz `net.http_post` a `newgang-portal` (notify_member = email). **Por isso `clube_newgang` fica fora** (ver proposta no fim).
- `contacts` e `leads`: sem triggers. `process_leads_capi_batch` só selecciona `capi_status NULL/retry`; `check_leads_capi_health` idem.
- `crm-google-lead-conversion-enqueue` lê `lead_capture` (não `processed`) — inalterado pela ingestão.

## Teste sintético revertido (supabase/tests/crm_ingest_lead_captures.sql)
Dados `@example.invalid`, `session_replication_role=replica`, termina em RAISE (rollback). Resultado:
```
TEST321_OK r1={"errors":0,"leads_new":3,"processed":4,"quarantine":3,"contacts_new":3,"invite_no_interaction":1}
           r2={"errors":0,"leads_new":0,"processed":0,"quarantine":3,"contacts_new":0,"invite_no_interaction":0}
           r3={"errors":0,"leads_new":1,"processed":1,"quarantine":0,"contacts_new":0,"invite_no_interaction":0}
           net=4->4
```
Cobre: recusa existente não promovida e origem preservada; isolamento por empresa; timestamps originais; leads `blocked_no_consent` e nenhum NULL/retry; convite sem interação; clube/empresa desconhecida/identidade ambígua em quarentena com `processed=false`; rerun idempotente; retry recupera após resolver a ambiguidade; zero duplicados; zero pedidos de rede; CAPI suspensa. Verificado depois: 0 linhas `t321-%` em contacts/lead_capture/leads.
Concorrência: não testada com duas sessões (a ferramenta usa uma). Garantida por `FOR UPDATE SKIP LOCKED` + `pg_advisory_xact_lock` por empresa+identidade + índices únicos (`contacts_email_unique_idx`, `contacts_phone_unique_idx`); violação cai na subtransação e o item fica recuperável.

## Recuperação real — 2026-10-16 00:10:17 UTC
```
select public.crm_ingest_lead_captures(100)
-> {"processed":6,"contacts_new":4,"leads_new":6,"invite_no_interaction":0,"quarantine":2,"errors":0}  netq_after=0
rerun -> {"processed":0,"contacts_new":0,"leads_new":0,"quarantine":2,"errors":0}
```

## Depois
```
sent_n=29550 sent_hash=b1738fd8ecdd96d7c54466ad7c81e112                    igual
leads antigos (excl. issue 321) n=46060 h=3ab86081d07d157b839faa47eda62d35   igual
contacts MP    antigos n=16148 ids igual, h_full igual (0 alterados)  -> total 16150 (+2)
contacts Coala antigos n=10935 ids igual (0 perdidos)                 -> total 10937 (+2)
  2 contactos Coala existentes actualizados (só preenchimento de vazios name/phone + last_activity_at);
  h_full muda por isso. Consentimentos/origem/first_seen não são tocados pelo código.
leads novos (meta.issue=321): MP vip_event_page 2 · Coala coala_hero_email 3 · Coala coala_early_bird 1
  todos event_interest, capi_status=blocked_no_consent, ligados a lead_capture processed (6/6)
pendentes: só MP clube_newgang 2 (quarentena "empresa/origem fora do âmbito")
duplicados email=0 telefone=0 · suspended=true · jobs 33/34/44/45=0 · capi_alerts=0
leads elegíveis CAPI (NULL/retry/processing)=0
```

## Consumidor contínuo
`cron.schedule('crm-ingest-lead-captures','*/5 * * * *', 'select public.crm_ingest_lead_captures(100);')` → jobid 2398. Só SQL, sem rede. Registo: `supabase/manual/cron_crm_ingest_lead_captures_live.sql` (inclui reversão).

## Proposta pendente — Clube Newgang (não executada)
Marcar `processed=true` em `clube_newgang` cria membro e envia email de confirmação via `trg_club_from_lead_capture`. Opções:
A) autorizar a ingestão do Clube aceitando esse envio (é o fluxo normal do Clube, parado desde a #320) — recomendada;
B) ingerir contacto/lead sem marcar `processed` e deixar o Clube por tratar (mantém Clube parado);
C) manter como está até decisão do chat newgang-portal.

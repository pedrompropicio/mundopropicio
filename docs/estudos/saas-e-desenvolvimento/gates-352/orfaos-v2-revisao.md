# #352 — correspondência v2 confirmada; revisão dos órfãos pendente

24/10/2026, 22:47 UTC. Codex; R0. Fonte: checkout público ad160ee9fbc5b7c5a73f0a63fc44b0c1c86a2708, 1.012 hashes Git blob conferidos; exportação anterior das 711 versões Live, hashes originais SHA-256 reconferidos. Nenhuma consulta Live nova.

Regra aplicada sobre originais, antes de redacções: MD5 do texto UTF-8 com `\s+` removido; conteúdo igual prevalece sobre timestamp; versão exacta diferente usa ledger; versões posteriores a 20261002120810 excluídas; restantes órfãos. Nenhuma tolerância de segundos. Comparação por conteúdo não altera os bytes a executar.

## Correspondência

Até 04/08 inclusive: **90 pares por conteúdo, 2 exactos iguais, 6 exactos diferentes, 497 órfãos**, exactamente o esperado. Os 90 correspondem à lista fornecida por Pedro/Claude, também reconferida com o inventário de pares anterior.

Todos os ficheiros: **93 pares de versões diferentes por conteúdo + 383 exactos iguais + 6 exactos diferentes + 31 excluídos após corte + 499 órfãos = 1.012**. Depois de 04/08 sobram precisamente 2 órfãos. Não há divergência das contagens esperadas.

| Mês | Órfãos |
|---|---:|
| 202603 | 30 |
| 202604 | 223 |
| 202605 | 157 |
| 202606 | 87 |
| 202608 | 1 |
| 202609 | 1 |

Plano v2 terá 1.452 entradas (711 ledger + 499 órfãos + 242 Drizzle), após fechar a revisão. Não se publicou/regenerou ainda plan.json; nenhum workflow foi disparado.

## PII — publicação bloqueada

499 cópias locais varridas. 81 ocorrências redigidas dentro de literais: 29 emails (incluindo técnicos), 1 telefone, 51 candidatos de texto livre. São candidatos de padrão, não confirmação de identidade. Originais preservados; hashes e redacções por tipo/linha no anexo, sem valores.

Resta **1 email em comentário**, ficheiro `supabase/migrations/20260429021930_f270ff05-38a5-405a-9997-c40c3a9f795d.sql`, **linha 196**. O comentário está fora de literal; a política autorizada restringe redacções ao interior dos literais. Não alterado e não publicado. O checker adaptado localmente inclui `orphan/**/*.sql`, além de ledger/overlay; gate vermelho, não apresentado como zero. Propõe-se autorizar apenas a substituição do endereço nesse comentário por `<redigido:email>`, mantendo a linha e o SQL intactos; não executado.

## Lista para aprovação do Claude antes do G1

**74 INSERT VALUES em topo**; 102 UPDATE, 30 DELETE e 12 INSERT SELECT preservados. Inventariados também 109 blocos DO e 8 WITH; o scanner é lexical e não certifica ausência de efeitos nos corpos. Os 74 não são automaticamente operacionais nem automaticamente removidos: classificação/intervalos ficam para a revisão. Nenhum overlay novo.

| Ficheiro | Linha inicial | Tabela |
|---|---:|---|
| 20260319225910_cbd0e749-e93d-4b2c-a8f0-7844903f96a2.sql | 23 | public.role_permissions |
| 20260319225910_cbd0e749-e93d-4b2c-a8f0-7844903f96a2.sql | 31 | public.role_permissions |
| 20260319225910_cbd0e749-e93d-4b2c-a8f0-7844903f96a2.sql | 38 | public.role_permissions |
| 20260319225910_cbd0e749-e93d-4b2c-a8f0-7844903f96a2.sql | 44 | public.role_permissions |
| 20260319230650_7970cbb2-f1a5-483e-8425-b2ad30c7204d.sql | 24 | public.role_permissions |
| 20260321021852_email_infra.sql | 97 | public.email_send_state |
| 20260324035801_115c5b3e-ab42-41f5-9c90-60025dcaf818.sql | 6 | event_ticket_zones |
| 20260324035801_115c5b3e-ab42-41f5-9c90-60025dcaf818.sql | 10 | event_ticket_zones |
| 20260324035801_115c5b3e-ab42-41f5-9c90-60025dcaf818.sql | 14 | event_ticket_zones |
| 20260324035801_115c5b3e-ab42-41f5-9c90-60025dcaf818.sql | 18 | event_ticket_zones |
| 20260324035801_115c5b3e-ab42-41f5-9c90-60025dcaf818.sql | 22 | event_ticket_zones |
| 20260324035801_115c5b3e-ab42-41f5-9c90-60025dcaf818.sql | 26 | event_ticket_zones |
| 20260324035826_ca2ba0c8-0fea-488c-a69c-34e4c1b49443.sql | 4 | event_ticket_lots |
| 20260324035826_ca2ba0c8-0fea-488c-a69c-34e4c1b49443.sql | 10 | event_ticket_lots |
| 20260324035826_ca2ba0c8-0fea-488c-a69c-34e4c1b49443.sql | 14 | event_ticket_lots |
| 20260324035826_ca2ba0c8-0fea-488c-a69c-34e4c1b49443.sql | 18 | event_ticket_lots |
| 20260324035826_ca2ba0c8-0fea-488c-a69c-34e4c1b49443.sql | 22 | event_ticket_lots |
| 20260324035826_ca2ba0c8-0fea-488c-a69c-34e4c1b49443.sql | 27 | event_ticket_lots |
| 20260324035849_5b7af418-e4e0-4131-a9f0-8b472602d608.sql | 3 | ticket_sales |
| 20260406200107_cfc0bc72-4260-4a0d-add8-1eddb474614b.sql | 3 | role_permissions |
| 20260406231506_0606e1d5-064e-40ef-be37-96265f7db5fb.sql | 43 | storage.buckets |
| 20260406232050_319b0ee6-3a39-490f-9eaf-3f1e4e9bdf7d.sql | 43 | storage.buckets |
| 20260407102647_f0203c51-20a1-4ee6-b91d-eb4e54069496.sql | 2 | storage.buckets |
| 20260408015146_244aea30-6869-46f7-8837-8de0ec36f4dc.sql | 3 | storage.buckets |
| 20260408095142_424ff4e0-37da-4779-89b7-69f7ee04f5e9.sql | 3 | public.account_categories |
| 20260408095142_424ff4e0-37da-4779-89b7-69f7ee04f5e9.sql | 9 | public.account_categories |
| 20260408095142_424ff4e0-37da-4779-89b7-69f7ee04f5e9.sql | 14 | public.account_categories |
| 20260408095142_424ff4e0-37da-4779-89b7-69f7ee04f5e9.sql | 18 | public.account_categories |
| 20260408095142_424ff4e0-37da-4779-89b7-69f7ee04f5e9.sql | 24 | public.account_categories |
| 20260408095142_424ff4e0-37da-4779-89b7-69f7ee04f5e9.sql | 30 | public.account_categories |
| 20260408095142_424ff4e0-37da-4779-89b7-69f7ee04f5e9.sql | 35 | public.account_categories |
| 20260408111916_8baef1fa-b052-4ac0-aec8-910547c23917.sql | 7 | public.account_categories |
| 20260410122007_3f77eda1-910c-4b3e-a0d4-104aee5bcd1f.sql | 5 | storage.buckets |
| 20260411120205_d9b969db-165f-4aa0-86e3-6e549305beda.sql | 2 | account_categories |
| 20260412145247_f5d3a234-a29d-4235-9d0d-3f96b632e19a.sql | 47 | storage.buckets |
| 20260417160256_cca1baaf-4600-4786-86d0-5266578bde12.sql | 85 | storage.buckets |
| 20260423192819_65af983d-a2b7-4103-abb7-e03876f4c34a.sql | 256 | storage.buckets |
| 20260423194647_2e05708c-4dd3-4136-aa9f-58e62eb5f152.sql | 2 | public.role_permissions |
| 20260426012233_4ca73fa0-e367-439f-86df-29dcc665ef49.sql | 144 | storage.buckets |
| 20260426032516_bf09f21e-e6e3-4987-b2a3-02b646a46b39.sql | 80 | storage.buckets |
| 20260427133145_6b21012a-e046-4755-b133-4b0d5d1c1c0c.sql | 1 | public.role_permissions |
| 20260427135416_32a1cde2-6f9e-4adc-9311-256c23f20c89.sql | 2 | public.role_permissions |
| 20260429021930_f270ff05-38a5-405a-9997-c40c3a9f795d.sql | 154 | storage.buckets |
| 20260429021930_f270ff05-38a5-405a-9997-c40c3a9f795d.sql | 171 | public.companies |
| 20260429030704_d0a43f62-9620-4a7a-b0ce-23b8665ec275.sql | 3 | public.companies |
| 20260429033420_d0deed9b-a439-4edc-8265-c81856c1d080.sql | 97 | storage.buckets |
| 20260429033420_d0deed9b-a439-4edc-8265-c81856c1d080.sql | 110 | public.companies |
| 20260429142331_9472c36e-8699-4d2b-9c70-fdf1ecd8f617.sql | 15 | public.system_reminder_settings |
| 20260429142331_9472c36e-8699-4d2b-9c70-fdf1ecd8f617.sql | 68 | public.system_reminders |
| 20260429210133_53c599c1-9850-4e6d-bfcd-32c8add81f6f.sql | 2 | storage.buckets |
| 20260510034250_cd86320c-2133-4a42-a2e2-7a51e9ad9c84.sql | 1 | public.role_permissions |
| 20260510034250_cd86320c-2133-4a42-a2e2-7a51e9ad9c84.sql | 33 | crm.role_budget_limits |
| 20260511200047_aabf13b1-04fc-4ac6-a578-5f9621e3b453.sql | 86 | storage.buckets |
| 20260512232318_58dc77ca-8d12-4b41-9812-10fd94d852a8.sql | 158 | storage.buckets |
| 20260518205115_7f71a92d-b1a9-487b-8f70-1d4df2a36e67.sql | 3 | public.role_permissions |
| 20260519001754_3eb962fa-7928-4543-880e-bfb1daf1d4c6.sql | 6 | storage.buckets |
| 20260519001754_3eb962fa-7928-4543-880e-bfb1daf1d4c6.sql | 144 | public.operacao_chamado_sla |
| 20260519001754_3eb962fa-7928-4543-880e-bfb1daf1d4c6.sql | 174 | public.role_permissions |
| 20260519004753_e5f9c5f8-2b96-4077-92ec-3edf431cb979.sql | 2 | storage.buckets |
| 20260519004753_e5f9c5f8-2b96-4077-92ec-3edf431cb979.sql | 109 | public.operacao_chamado_sla |
| 20260519004753_e5f9c5f8-2b96-4077-92ec-3edf431cb979.sql | 132 | public.role_permissions |
| 20260519014618_83c69424-4f10-4670-a31c-85773c5fa0bb.sql | 39 | public.role_permissions |
| 20260519122620_695b0562-1e61-47e4-ace4-550b8e897274.sql | 129 | public.role_permissions |
| 20260520103320_8bdf5d84-1004-42d1-b3bd-b42076ba56d7.sql | 135 | public.notification_templates |
| 20260521113115_f30e523e-e8cb-4274-b56a-0268c9cfbd81.sql | 87 | storage.buckets |
| 20260521154732_346ce051-2409-46a9-b46e-68306018fb3b.sql | 1 | public.role_permissions |
| 20260521160510_d4ae5728-4fb4-44ea-a0bb-e760d9f43995.sql | 27 | public.role_permissions |
| 20260522120039_029a6059-76fb-4eaf-ba70-9c9ab567b6bf.sql | 2 | public.notification_templates |
| 20260524234319_8e6fcfa0-cc77-4c76-9e53-4f22bf01b593.sql | 2 | public.notification_templates |
| 20260601201236_guardrails_budget_daily_cap.sql | 25 | crm.role_budget_limits |
| 20260601212000_1b9f40db-9110-4263-bca3-c80621fbd9a5.sql | 12 | crm.role_budget_limits |
| 20260605140000_create_portal_marketing_images_bucket.sql | 12 | storage.buckets |
| 20260608201508_6919fc55-4915-4748-8d62-92d93c37061b.sql | 1 | public.role_permissions |
| 20260621180659_df87d017-ee20-4979-b069-dcecb4ea3d28.sql | 175 | crm.strategic_trigger_catalog |

[Anexo sanitizado](orfaos-v2-revisao.json): 499 origens/hashes, DML por ficheiro/linha/tabela, redacções e gate PII. Sem SQL integral ou valores pessoais.

## Estado e próximo passo

Paragem no ponto 2 conforme despacho: aprovação Claude dos INSERT VALUES e tratamento expresso do email fora de literal. A regra construtiva idempotente ainda não foi implementada; runner privado, overlays, plano e workflow permanecem inalterados. Não se substituiu a tarefa por outro replay.

G1 não repetido: último run 40138529654, 127 concluídas e bloqueio construtivo 42703. G2 não executado (depende de G1 verde). Nenhum salto novo nem catálogo Live novo. Após revisão: publicar cópias com check-pii verde/REDACTIONS.md, plano ordenado, regra construtiva testada, G1 e só depois G2. Sem Live/DSN/infraestrutura paga/Publish/deploy; G6 com Pedro; #352 aberta. Reserva própria libertada no fecho documental; #329 confirmado antes das escritas.

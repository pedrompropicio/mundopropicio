# #359 ponto 4 — Gerir as minhas autorizações Coala (R1)

Autorização Pedro 27/10/2026, opção A às 02:50 UTC. **Rascunhos apenas: nenhum DDL/DML/RPC/deploy/Publish/cron/envio em Live.** A página e o email não são implementados nesta tarefa. O plano Claude referido não existe nesta cópia; aplicado o resumo do despacho.

## Fontes lidas
AGENTS.md, supabase/AGENTS.md, docs/INDEX.md, docs/QUADRO.md, estado-coala-portal, feature coala-eb-invite, memórias Coala/consentimento por pessoa/WhatsApp Newgang, docs/features/newgang-consentimento-pessoa-332.md e consentimento-marketing-322.md. Investigação auxiliar: docs/portal/architecture.md e data-model.md, migrações0182/0185/0198/0250/0266/0276, manuais CRM/WhatsApp e testes359/314 existentes. Catálogo Live só SELECT para schema/índices/guardas/md5; nunca ler tokens/emails reais.

## Pacote manual
- draft_359_ponto4_A_ledger.sql: tabela privada, RLS sem policies públicas, grants service_role, sequence, identidade crescente do servidor; guardas insert/update/delete/truncate; versão vigente escolhida pelo servidor, timestamps/fingerprint calculados; revogação sem texto.
- draft_359_ponto4_B_rpcs.sql: estado e gravação via token Coala 64hex; ACL anon/authenticated somente. Token usado continua válido para retirar; supressão empresa/global/plain/hash bloqueia grants. Token lock coordena descadastro; advisory lock empresa/email serializa decisões; contact lock e índice único protegem telefone. Sem cadastro não cria contacto: contact_missing. Mudança de telefone com grant renova a evidência; repetições idênticas não acrescentam linhas.
- draft_359_ponto4_C_eligible.sql: ramo Coala lê última decisão por id. Grant exige E.164 idêntico e sha256 idêntico; revoked sempre false; ausência preserva0276. PERFORM restaura FOUND antes do sufixo0276, pois consulta vazia ao ledger mudaria esse flag. Os demais ramos/sufixo estão byte-idênticos; ACL/atributos preservados pelo CREATE OR REPLACE.
- draft_359_ponto4_D_seed_comentado.sql: duas linhas PT literais e versões requeridas; todo DML comentado. Hash pelo trigger existente. EN apenas comentário, sem texto inventado.
- copia_draft_359_ponto4_{A_ledger,B_rpcs,C_eligible,D_seed_comentado}.sql: cópias byte-idênticas no mesmo diretório manual; nada em drizzle/migrations ou supabase/migrations.
- rollback_359_ponto4_comentado.sql: integralmente comentado; repor0276 e retirar RPCs; manter ledger/guardas/textos como evidência, não apagar decisões nem seeds.

## Contrato da página futura
Caixas sempre desmarcadas (estado atual apresentado separadamente; nunca pré-selecionar). Versão não é parâmetro do cliente. Estado devolve apenas status/locale/ads/whatsapp/tem_telemovel. Sem histórico de idioma, locale=pt; após decisão usa idioma da última linha. EN sem texto jurídico: grants recusados, revokes possíveis. Retirar não exige telefone válido nem texto vigente; false já efetivo é no-op. Gravação devolve phone_conflict quando telefone indicado difere do cadastro ou pertence a outro contacto; grant fica no ledger, mas elegibilidade false. Telefone vazio pode ser preenchido sob lock; nunca sobrescreve nem altera consent_whatsapp/source/at.

## Inventário WhatsApp — sem adaptações
Pesquisa usada:
```sh
rg -n -i 'whatsapp|consent_whatsapp|crm_whatsapp_eligible' src supabase/functions supabase/migrations supabase/manual
rg -n -i 'crm_whatsapp_eligible|consent_whatsapp|sendWhatsApp|messaging_product|notification_queue|whatsapp_recipient|opted_in_at' src supabase/functions supabase/migrations supabase/manual
rg -n 'sendWhatsApp|messaging_product|notification_queue|crm_whatsapp_eligible|consent_whatsapp|phone_e164' src supabase/functions supabase/migrations supabase/manual
```

Pontos efetivos de envio encontrados (todos preservados):
- whatsapp-dispatcher/index.ts:85–138: Meta Cloud API a partir de notification_queue.recipient_phone; não consulta crm_whatsapp_eligible nem consent_whatsapp no envio.
- _shared/twilio.ts:15–30: transporte Twilio, sem decisão de consentimento própria.
- send-system-reminders/index.ts:32–69: avisos operacionais para system_reminders/settings, sem boolean CRM.
- create-staff/index.ts:16–24,108–117: convite staff, telefone fornecido, permissões; sem boolean CRM.
- send-staff-invite/index.ts:10–18,40–47,85–88: reenvio staff para profiles.phone; sem boolean CRM.
- send-push-notification/index.ts:166–183: opção WhatsApp operacional para profiles.phone; sem boolean CRM.
- ugc-ios-reading-watchdog/index.ts:60–85 e recipient.ts:1–24: enfileira (não envia); usa notification_optin.opted_in_at/opted_out_at/phone_number, não CRM.
- whatsapp-webhook/index.ts:103: estado de entrega, não envio.
- crm_whatsapp_eligible e projeções/vistas em manuais20261018/0266/0276: seleção CRM, não transporte.

Nenhum remetente encontrado usa diretamente crm_whatsapp_eligible ou contacts.consent_whatsapp como guarda de envio. Portanto não afirmar que TODOS os transportes falham fechados por ler false: transportes operacionais são independentes e o dispatcher confia na fila. Qualquer caminho futuro de campanhas Coala precisa selecionar pela função canónica e revalidar antes de enfileirar/enviar, em tarefa própria. Quem ainda ler diretamente consent_whatsapp continuará a ver o valor antigo (não promovido por este pacote).

## CRM / pendências futuras
Não alterar apresentação nesta tarefa. Campo boolean do contacto não representa o novo consentimento Coala; ficha/filtros/exportadores devem passar a leitura canónica, com origem/versão/data e aviso de conflito, sob autorização própria. Resolver telefone diferente no CRM, não pelo link público. Email de abertura/ligação/página e integração de audiência/envio exigem passos separados. Jurídico deve confirmar EN antes de seed EN. Revalidação de catálogos/ACL/md5/CI antes de qualquer aplicação com Sim por passo.

## Provas
Testes src/test/issue359-person-authorisations.test.ts executam os rascunhos reais em PGlite descartável; fixture sem credenciais, contactos sintéticos *.test; trigger de consentimento existente preserva no-op de atualização de telefone; testes sob anon/authenticated. Não são prova de concorrência em duas sessões reais nem de UI Live. Teste0276 adicional preservado.

Resultado: 28 testes novos + 5 testes0276 =33/33 PASS. Suite inicial:2826 PASS, timeout preexistente de beforeAll em newgang-crm-profile-fields; repetição `bunx vitest run --maxWorkers=2 --hookTimeout=60000`:290 ficheiros PASS,2836 testes PASS,6 skipped,11 todo. Não executar typecheck manual (verificação automática da plataforma).

MD5 pg_get_functiondef: crm_whatsapp_eligible Live antes/depois dd895c8448e0b5cb0e83c2dbd9554dac; candidato instalado SÓ PGlite 2869858c6c0599c3f1603ea20b9417a3. `_crm_whatsapp_contact_guard`08be1cbeb1d176d1b5cd27bd664605b1, `_crm_whatsapp_project`9800ce91c91f288be52fd3e5be574d5b, `_crm_whatsapp_latest`613f5f746fc534090baeb7d78aa955ca, `_club332_whatsapp_append`112d585a32e17e94db2219518925c466: todos iguais nas duas consultas Live.

HEAD inicial confirmado `git log -1`:8dbc60c77d8c4f19e67f94078eb3a4a96225d39f. HEAD final deve ser confirmado no fecho, pois commits documentais são automáticos.
# R2 — Apagamento a pedido, segunda fase (#368) + morada (#367) + credencial

Nada é aplicado sem o "Sim" do Pedro para cada passo. Não há Publish do frontend nem alterações a crons.

## 1. Anonimizar leads com o mesmo email
Tabelas encontradas pela query a information_schema (colunas com `email`, só tabelas base). As que guardam o email de um inscrito, e portanto entram no apagamento:
- `lead_capture.email` → `lower(trim(email)) = v_norm`: email, name, phone e raw (as chaves pessoais) passam a NULL; o registo, a origem, o evento e as datas ficam, para os agregados.
- `contacts.email` (+ `email_hash_sha256`): o contacto ligado ao membro já era apagado na 0263. Passa também a contar o contacto que só coincide pelo email; se tiver leads ligados, é anonimizado em vez de apagado.
- `leads`: não tem email, liga-se por `contact_id`. Os registos ficam, só os campos pessoais (`ip_inet`, `user_agent`, `meta`) passam a NULL.
- `coala_invites.email` e `coala_list_consents.email`: email a NULL / marcador.
- `fever_buyers.email`: nome/email/telefone a NULL.
- `meta_audience_upload_members.email`: email a NULL; o hash fica, porque é a prova de envio.
- `vip_coupon_email_log.email`: email a NULL.

Ficam de fora, porque são da equipa ou de empresas e não de inscritos: profiles, company_invitations, login_attempts, suppliers, companies, sponsorship_pipeline, operacao_etapa_suppliers, financial_accounts, document_download_audit, storage_deletion_log.
`club_retention_log` passa a guardar as contagens por tabela, sem dados pessoais.

## 2. Reinscrição limpa a supressão
- Guarda no ponto de inscrição do Clube: se o email normalizado tiver `sha256:` em `suppressed_emails` com reason `erasure_request` e a nova inscrição trouxer consentimento de email válido (versão de texto conhecida), apaga só essa linha de supressão.
- Escreve em `club_retention_log` o evento `resubscribe_clear` (hash, id do novo membro, sem email).
- Sem consentimento novo, a supressão mantém-se. Supressões com outro motivo (bounce, queixa, descadastro) nunca são tocadas.

## 3. Storage e Google Wallet
- Storage: o apagamento real passa a ser orquestrado pelo `newgang-portal`. Antes da RPC, a função lista os caminhos `proof_image_path` do membro no PROOF_BUCKET e remove só esses objetos; a seguir, regista a contagem no log. Hoje existem 0 imagens de prova, por isso não há risco imediato.
- Wallet: o objeto Google é atualizado por PATCH com `state: "EXPIRED"` (ou "INACTIVE"), com o mesmo helper `walletFetch`, credencial de conta de serviço e `GOOGLE_WALLET_ISSUER_ID` que já estão configurados. A Google não permite apagar objetos, só invalidá-los. Não é preciso nenhum segredo novo. Se a chamada falhar, o apagamento na base de dados continua e o log fica com `wallet: failed`, para repetir.

## 4. Morada da empresa (só SQL, não aplicar)
O código trata `address` como objeto livre (`Record<string, any>`), sem chaves fixas. Proponho: street, postal_code, city, country (ISO).
```sql
begin;
update public.companies
   set address = jsonb_build_object('street','Rua Prista Monteiro 13B','postal_code','1600-792','city','Lisboa','country','PT')
 where id = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c' and address = '{}'::jsonb;
-- esperado: UPDATE 1
commit;
-- rollback: update public.companies set address='{}'::jsonb where id='7c858982-6ccd-47ca-bd65-e0dd3eebf01c';
```
O ficheiro `supabase/manual/dml_367_companies_morada.sql` (que usava string) é substituído por este.

## 5. Rodar a credencial do repositório
A credencial era um token Git temporário da Lovable, embutido no remote interno. Proposta:
- O Pedro desliga e volta a ligar o GitHub em Lovable (Settings → GitHub), o que gera um token novo. Se o problema continuar, pede à equipa Lovable para revogar os tokens Git deste projeto.
- Rodar também o `GITHUB_TOKEN` usado nos comentários (GitHub → Settings → Developer settings → apagar e criar um novo, depois atualizar o segredo em Lovable).
- Passo a ler o remote apenas por `git remote -v | sed` mascarado; nunca o imprimo.

## Ficheiros e o que mexe em Live
- Migração `0264_newgang_erasure_leads_resubscribe.sql`: nova versão de `club_member_erase` (mesma assinatura, service_role, SECURITY DEFINER, search_path fixo, dry_run por omissão) e nova função/guarda de reinscrição. Cópia em `supabase/manual/` e rollback que repõe o corpo da 0263.
- Deploy só de `newgang-portal` (storage + Wallet).
- Live: a migração e o deploy. Sem DML em dados reais.

## Testes
- PGlite: anonimização das leads (registo mantido, PII NULL); idempotência; supressão limpa apenas com consentimento; outros motivos intocados; log sem PII (regex de email/telefone).
- Deno: a ordem storage → Wallet EXPIRED → RPC; uma falha do Wallet não impede o apagamento; dry_run não chama storage nem Wallet.
- Live: membro e lead fictícios dentro de uma transação desfeita. São corridos dry_run, apagamento e reinscrição com consentimento, e no fim é desfeito tudo. As contagens do Clube, de `lead_capture` e de `suppressed_emails` têm de ser iguais antes e depois.

## Verificação em Live
- `pg_get_functiondef` / md5 da nova função, ACL (só service_role), `prosecdef`, `proconfig`.
- Contagens antes e depois em `club_members`, `lead_capture`, `contacts`, `suppressed_emails` e `club_retention_log`.
- POST `erase_account` sem sessão: tem de continuar a dar 401.

## Riscos
- Anonimizar `lead_capture` dispara triggers (consentimento, ingestão, Coala). O UPDATE corre como definer confiável e só põe campos a NULL, por isso não pode criar prova nem enfileirar envios. Isto é confirmado antes por leitura dos triggers.
- Os agregados de CAPI/Meta já enviados não são refeitos.
- O critério de "consentimento válido" depende da tabela de versões de texto (#359).

## Dúvida (R2)
- Coala/Fever são de outros módulos. Confirmar que o apagamento a pedido do Clube também os anonimiza. Recomendado: sim, porque o pedido é da pessoa e não do módulo.

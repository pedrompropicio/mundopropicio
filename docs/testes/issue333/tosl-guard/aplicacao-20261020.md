# #333 tosl_guard — aplicação 20/10/2026 (~18:10 UTC)

Autorização: Pedro 20/10/2026 15:03 Fortaleza ("Sim"). Base main=Lovable 94770d32f6be0f9ed18d3a28830fe2e57da9e6ff, CI run39470321962 SUCCESS (controller).

## Fonte
- `supabase/manual/20261020_issue333_tosl_guard.INERTE.sql` sha256 8cda8d00a42135a89695e62f2cc379be2332680f52811308a2597d2ba121d233 (= revisto).
- Só removidos BEGIN/COMMIT externos (linhas 2 e 46); texto aplicado sha256 4f1b48d61ee155a32d46c18bda7e1fd9eed559922f67e08e50aa50e7fd1f091c.
- Canal oficial: migração `drizzle/migrations/0213_issue333_tosl_guard.sql` (sha256 a601d39e97857b894c72dd484f90cbbe8a79107be09ef2bb38a0444ae36e6e67), número atribuído pela ferramenta.

## Preflight (Cloud, só leitura)
- tosl_guard() oid 403122, owner postgres, md5 4cb7d3b770237dd37543ee526089555f, SECDEF, search_path=public, ACL {postgres,service_role,sandbox_exec}=X.
- trg_tosl_guard oid 403123, enabled O, tgtype 31.
- confirm_ticket_office_statement(uuid) md5 2e868bc2a28ec291581028f6dc579c6a.
- Sem drift; guardas internas do script também passaram.

## Readback pós-aplicação
- tosl_guard() oid 403122 (inalterado), owner postgres, md5 e35ed107ee7c371d34d5a6dd938e1de7 (= patch), SECDEF t, search_path=public, ACL idêntica.
- trg_tosl_guard oid 403123, O, 31, função tosl_guard() — inalterado.
- confirm_ticket_office_statement md5 2e868bc2a28ec291581028f6dc579c6a — inalterada.
- Gates review=false, executor=false; scope=0; ASSISTANT_ENABLED=false no código. Controlo durável não tocado.

## Não feito
Sem DML financeiro, deploy, Publish, OAuth, inbox/modelo, login, teste financeiro Live, pacote B. Bateria local (20 PASS) não repetida (sem mudança).

Rollback disponível: `supabase/manual/20261020_issue333_tosl_guard.ROLLBACK-INERTE.sql` (não aplicado; nota: o seu guard espera md5 do patch).

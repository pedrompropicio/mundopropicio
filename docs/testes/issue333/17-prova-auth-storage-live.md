# #333 — Prova real Auth/Storage em Live (contas e ficheiros fictícios)

Data: 17/10/2026 ~19:55 UTC (16:55 Fortaleza). HEAD local=GitHub 275eea1868ba44383f23d75a5d3b930060a989a3, checkout limpo, escritor único.
Autorização: Pedro 17/10 16:41 Fortaleza + esclarecimento 19:52 UTC. Âmbito: só Auth/Storage fictícios. SEM faturas/TX/BP, permissões globais, DDL, deploy, Publish.
Script: sha256 025626e58787eecc3b182df6a46986699802706d34323be7f63ef9a461094d12 (só em /tmp; usa a credencial administrativa do runtime internamente, nunca impressa).
IDs, emails sintéticos e caminhos: só no inventário privado gitignored em claude-outputs/. Sem JWT/senha/chave/URL assinado em ficheiros.

## Inventário lido antes (só leitura)
- Bucket standalone-invoices public=false, sem limite/MIME próprio; data-entry-staging ausente.
- storage.objects aplicáveis: só standalone_invoices_storage_select (prefixo1=current_company_id; admin/platform_admin/accountant/manager/editor) e _insert (admin/platform_admin/manager/editor). Nenhuma UPDATE/DELETE, nenhuma política genérica sem bucket_id.
- Triggers: auth.users on_auth_user_created→handle_new_user (profiles+user_roles 'user', company_id do metadata); user_roles audit_user_roles_changes (system_audit_log) + trg_set_company_id; profiles guard. Sem chamadas de rede nesses corpos.
- Hooks de Auth: nenhuma função pública relevante executável por supabase_auth_admin. LIMITE: a configuração de hooks do Auth não é legível por SQL. Criação admin com email_confirm=true não envia email.

## Contas técnicas (3, criadas via Auth admin, sem signUp/invite/magic link)
- A1: empresa A + papel editor (mínimo com INSERT). A2: empresa A, só 'user' do trigger. B1: empresa B + editor.
- Empresas existentes; nenhuma criada nem alterada. Nenhuma conta real tocada; sem admin/platform_admin.
- No fim: as 3 bloqueadas (ban). Não apagadas.

## Fixtures
PDF/PNG/JPEG fictícios íntegros, bytes {'f.pdf': 191, 'f.png': 77, 'f.jpg': 632} (total <1 KiB).
sha256: {'f.pdf': '82285a8f6ebe74ec978fd7dacb2bf52d7d5c20a9cc8945766072c12e1656111f', 'f.png': 'c6f348f502f707bf0ae7b702a2b61aa691490bcb6a1ac261fdeb04d1640651a5', 'f.jpg': 'e55bcd51e36af311575d647c889b1c4a1229cd68e78f603c263e200991586482'}
Prefixo: <empresa>/teste333/<run 4298b230…>/<conta>/ficheiro.

## Matriz (HTTP real; Storage devolve 400 em recusa RLS/conflito)
```text
caso | ator | op | http | esperado | resultado
upload_own | A1 | f.pdf | 200 | esperado 200 | PASS
readback_hash | A1 | f.pdf | 200 | esperado 200 | PASS
upload_own | A1 | f.png | 200 | esperado 200 | PASS
readback_hash | A1 | f.png | 200 | esperado 200 | PASS
upload_own | A1 | f.jpg | 200 | esperado 200 | PASS
readback_hash | A1 | f.jpg | 200 | esperado 200 | PASS
list_own_prefix | A1 | count=3 | 200 | esperado 200 | PASS
dup_upsert_false | A1 | f.pdf | 400 | esperado 400/409 | PASS
overwrite_upsert_true | A1 | f.pdf | 400 | esperado 400/403 | PASS
bytes_preserved | A1 | f.pdf | 200 | esperado 200 | PASS
upload_foreign_prefix | A1 | B/ | 400 | esperado 400/403 | PASS
copy_to_foreign_prefix | A1 | A->B | 400 | esperado 400/403 | PASS
copy_within_own_prefix | A1 | A->A | 200 | esperado 200 | PASS
public_url_read | anon | f.pdf | 400 | esperado 400/404 | PASS
anon_auth_read | anon | f.pdf | 400 | esperado 400/401/403/404 | PASS
anon_upload | anon | A/ | 400 | esperado 400/401/403 | PASS
anon_list | anon | count=0 | 200 | esperado 200/400/401/403 | PASS
signed_url_bearer | anon+token | f.pdf | 200 | esperado 200 | PASS
noperm_read | A2 | f.pdf | 400 | esperado 400/403/404 | PASS
noperm_upload | A2 | A/ | 400 | esperado 400/403 | PASS
noperm_list | A2 | count=0 | 200 | esperado 200/400/403 | PASS
upload_own | B1 | f.png | 200 | esperado 200 | PASS
tenant_read_foreign | B1 | A f.pdf | 400 | esperado 400/403/404 | PASS
tenant_upload_foreign | B1 | A/ | 400 | esperado 400/403 | PASS
tenant_copy_foreign | B1 | A->B | 400 | esperado 400/403/404 | PASS
tenant_list_foreign | B1 | count=0 | 200 | esperado 200/400/403 | PASS
tenant_read_foreign | A1 | B f.png | 400 | esperado 400/403/404 | PASS
unknown_then_verify_no_reupload | A1 | unknown.jpg | 200 | esperado 200 | PASS
ban_technical | admin | A1 | 200 | esperado 200 | PASS
ban_technical | admin | A2 | 200 | esperado 200 | PASS
ban_technical | admin | B1 | 200 | esperado 200 | PASS
```
Total 31, falhas 0.

## Agregados antes → depois
standalone_invoices 98→98; transactions 1966→1966; event_forecasts 2300→2300; transaction_payments 1417→1417.
objetos standalone-invoices 98→104 (+6, todos em /teste333/); último objeto real sem alteração (2026-10-16 02:15:19 UTC).
auth.users 47→50; profiles 47→50; user_roles 59→64 (3 'user' do trigger + 2 editor); banidos 0→3 (só as técnicas).

## O que ficou provado
- Bucket privado: URL pública recusada; anon sem JWT não lê, não escreve, lista 0.
- Isolamento por empresa no prefixo1: escrita/cópia/leitura em prefixo alheio recusadas; perfil sem papel recusado.
- Sem política UPDATE: upsert=false conflita e upsert=true não sobrescreve; bytes originais preservados (hash).
- Cópia dentro do próprio prefixo é permitida (SELECT+INSERT): os adapters futuros têm de tratar isto como escrita.
- Por desenho da política, qualquer editor/manager/admin/accountant da mesma empresa lê o prefixo: o isolamento é por empresa, não por dono.
- URL assinado funciona como token de portador (sem JWT), não como bucket público.
- Desconhecido: crash do cliente injetado (resposta descartada) → conferência por readback/hash sem novo upload. NÃO é falha real do Cloud.

## Limites / pendências
- Não prova os RPCs/mutações #333, o núcleo, a função não deployada nem a gateway.
- Runtime/dependências exatas do Cloud: não legíveis sem deploy; ficam por comparar.
- Ficheiros e contas técnicas ficam (banidas) até autorização de limpeza.
- Continuam pendentes: IVA≤total, antigos sem ID, intenção igual, política de chave forte.

# #333 fase11d — ativação da ligação Gmail (só ligação)

19/10/2026, "Sim" do Pedro 18:55 Fortaleza. Base 811696ee = origin/main (CI run39329140874 SUCCESS).

- Pacote SQL sha256 4256d3dbdfa4adf46fcf212a397996efc98ecc4275f02d3e72e846dc9033ed7a confirmado; objetos ausentes antes; aplicado pelo canal oficial como drizzle/migrations/0206_issue333_gmail_connections.sql (guarda ACL passou). Rollback inerte e audit intactos.
- Segredos presentes por nome: GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY, APP_USER_CONNECTION_KEY_SECRET, LOVABLE_API_KEY (valores não lidos).
- GMAIL_CONNECTION_REVIEWED=true; ANALYSIS_ENABLED/REVIEWED=false, uploadEnabled=false, pilotScoped=true inalterados.
- UI: com envio fechado o modal mostra só Ligar Gmail / estado / Desligar (sem lote, pesquisa ou importação).
- Deploy só data-entry, source_sha256 6123b8ec9debe4f19ed5024bd80688a873a84ad107c0c8bc91001036e52ed216.
- Checks: sem sessão 401; anon 401. RLS ligada, 0 políticas, 0 linhas. ACL: postgres, service_role (connections arwd; pending ad + SELECT colunas) e roles de inspeção do agente sandbox_exec* (ar, por privilégios por defeito da plataforma — não browser). anon/authenticated/authenticator: nenhum.
- Testes data-entry 120/120, tsgo limpo, deno check OK.
- Não feito: OAuth/consentimento, leitura de inbox/perfil, modelo, Publish. Corpo dos emails não entregue.

## Correção ACL (22:10 UTC)
- O "ar" de sandbox_exec* nas 2 tabelas era ACL REAL no Cloud (privilégios por defeito da plataforma), não local. Corrigido por 0207_issue333_gmail_acl_fix (sha256 528c0438369ee2006ab28660c17292c9c3fb341b2aae7920f01b5d3f747649b6): revogação só nestas tabelas + guarda de catálogo (tabela e colunas).
- Readback read_query: connections {postgres, service_role=arwd}; pending {postgres, service_role=ad} + colunas service_role=r; RLS on, 0 políticas, 0 ligações. Única herança: authenticator→service_role (troca de papel padrão).
- Pacote INERTE: revoga grantees ≠ dono/service_role e guarda via aclexplode (sha256 9d75baeca47d90d7fcf2cf7c0d68f3faf918f10a9dc170821e1010589bc996b6). Teste PGlite com default privileges extra.
- Rota real: /transacoes (não /transactions).

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

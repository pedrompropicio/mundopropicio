# #333 fase11b — Ligação Gmail por utilizador+empresa (código pronto, FECHADO)

19/10/2026, agente Lovable ERP. Base 4ba34f0b (CI run39316966035 SUCCESS, controller).

## Capacidade real encontrada
- Catálogo App User Connectors deste espaço: `google_mail` (Gmail) ativo (ferramenta oficial list_connectors).
- Clientes configurados para `google_mail`: NENHUM (list_clients). Por isso nenhuma ligação real é possível ainda.
- Não usado: conector Gmail do construtor (conta partilhada) nem ligação do ChatGPT.

## Entregue
- `_shared/appUserConnector.ts` (helpers oficiais do gateway: authorize/exchange/call/disconnect, reconexão por 401 `credential_*`).
- `_shared/gmail-app-user.ts`: início com origem permitida (mpgestaoeventos.com, www, mundopropicio.lovable.app, preview); vínculo de uso único (nonce 256 bits, só hash guardado, 10 min, par user+empresa); state/PKCE do OAuth tratados pelo gateway; troca do código só no servidor; recusa conector ≠ google_mail; chave cifrada AES-GCM com AAD user:empresa; leitura só GET com `requiredScopes=[gmail.readonly]`; 401 `credential_*` → marca "renovar" e bloqueia; desligar apaga chave local antes de revogar no gateway, nunca toca emails.
- data-entry: ações `gmail_connection`, `gmail_connect_start`, `gmail_connect_complete`, `gmail_disconnect` com sessão + empresa canónica + admin/manager; `deps.gmail.reader` ligado ao mecanismo real, mas `GMAIL_CONNECTION_REVIEWED=false` e exige segredos → hoje indisponível.
- UI: "Ligar Gmail" (janela própria), "Conta Gmail ligada (só leitura)", "Desligar Gmail", "Voltar a ligar o Gmail"; página `/oauth/gmail/return` só reencaminha o código e limpa o endereço.
- SQL INERTE: `supabase/manual/20261019_issue333_gmail_connections.INERTE.sql` + `.ROLLBACK-INERTE.sql` (só service_role; RLS sem políticas).
- Testes: connect11b (11), gmail11 (11), sql11b PGlite (1).

## Não feito
Sem OAuth/consentimento real, inbox, modelo, DDL aplicado, deploy, Publish. Gates análise/upload false, control fechado.

## Ativação (por ordem)
1. Google Cloud (conta do Pedro/empresa): cliente OAuth Web; API Gmail ativa; redirect autorizado `https://connector-gateway.lovable.dev/api/v1/app-users/oauth2/callback`; ecrã de consentimento com escopo `https://www.googleapis.com/auth/gmail.readonly`; publicar app (ou tipo Internal se todos forem do Workspace) — em Testing a Google desliga ao fim de 7 dias.
2. Lovable › espaço › App User Connectors › Gmail: criar cliente com esse Client ID/Secret, acesso contínuo (offline) ligado; ligar ao projeto → aparecem `GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY` e `APP_USER_CONNECTION_KEY_SECRET`.
3. "Sim" do Pedro para aplicar o SQL inerte pelo canal oficial.
4. `GMAIL_CONNECTION_REVIEWED=true` + deploy só data-entry (0 · Cowork).
5. Último passo humano: o Pedro, no modal (/transactions › Assistente), carrega em "Ligar Gmail" e dá ele próprio o consentimento na janela da Google. Importação continua dependente do upload fechado.

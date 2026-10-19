# #333 fase11c — caixa própria, código LOCAL e FECHADO

19/10/2026. Base controller: 0c0be06667ab9ff7d0dcedea0f86112093f9dd6b, CI39319065486 qualitySUCCESS informado. Fonte revista antes do fecho documental: ba4847a507dc2093c55398aa135eec4d5b3946d5. CI do SHA final depende do controller; testes locais não provam CI remoto.

## Checklist entregue
- Identidade Google por GET `/gmail/v1/users/me/profile?fields=emailAddress`, só `gmail.readonly`, servidor/gateway. Email ERP obtido por Auth admin.getUserById do ID autenticado, com email_confirmed_at obrigatório; nunca profiles, frontend, query ou login_hint.
- Igualdade conservadora: espaços ASCII exteriores e caixa ASCII apenas. Pontos, +tags, aliases e separadores não são removidos/remapeados. Identidade ausente, não confirmada, inválida ou divergente nega acesso.
- Antes de guardar: perfil Google igual ao Auth atual, reconfirmado após resposta. Envelope cifrado AES-GCM contém chave+email verificado, AAD user+empresa; SQL não muda. Envelopes antigos sem email verificado não são reutilizados.
- Estado, leitura e cada GET de mensagem/anexo revalidam identidade; Auth alterado e desligamento bloqueiam leitores já obtidos. Estado mostra apenas email da caixa própria verificada. Reconexão usa só handle do par e email atual correspondente; email alterado exige desligar primeiro.
- Mismatch nunca guarda nova chave. Revogação limitada ao novo handle Gmail, se distinto do handle existente; handle reutilizado só marca reconexão. Sem alterações a emails.
- Servidor revalida sessão/empresa antes e após pesquisa/importação. Cliente verifica sessão antes/depois da resposta; painel remonta por utilizador+empresa+lote, descartando respostas e seleções antigas.
- Interface: “Liga o Gmail com o mesmo email usado para entrar no ERP”. Admin/manager não ganham acesso a caixas alheias; permissões existentes preservadas.
- Gates ANALYSIS_ENABLED/ANALYSIS_PROVIDER_REVIEWED/GMAIL_CONNECTION_REVIEWED false; uploadEnabled false. Controlo não consultado nem alterado; sem deploy, DDL/DML, OAuth, inbox, modelo, fixtures ERP/Storage, limpeza ou Publish. #322/#323 preservadas.

## Provas locais
- Gmail: 31/31 PASS em quatro ficheiros (adapter real com fetch sintético, ACL/PGlite, troca de contexto React).
- Suite completa antes dos dois últimos testes: 199 ficheiros PASS, 1713 PASS, 6 skip, 11 todo; checkpoint66 PASS, sem falhas #333. Os dois testes adicionais passaram na suite pertinente.
- Deno check gmail-app-user.ts e data-entry/index.ts com --no-lock --deny-import: exit0; código não executado. Harness: build OK (inclui tipos).
- Revisão independente local: nenhum fail-open de identidade encontrado; aviso de estado cliente corrigido por remount interno obrigatório.

## Configuração ainda necessária — sem nova decisão arquitetural
1. Google Cloud: https://console.cloud.google.com/apis/credentials → cliente OAuth Web; Gmail API ativa; escopo único https://www.googleapis.com/auth/gmail.readonly. Redirect exato https://connector-gateway.lovable.dev/api/v1/app-users/oauth2/callback. O domínio do callback pertence à Lovable: não trocar pelo domínio ERP nem criar forwarder. Se Google exigir verificação desse domínio, escalar à Lovable; Pedro não consegue verificar lovable.dev.
2. Google Auth Platform → Audience: Internal se todas as pessoas forem do mesmo Workspace; caso contrário publicar External (Testing expira em sete dias).
3. Lovable → espaço de trabalho → App User Connectors → Gmail: formulário seguro Client ID/Secret, offline access ligado e cliente ligado ao projeto. Ferramentas oficiais list_connectors/list_clients reconfirmaram google_mail ativo e nenhum cliente configurado. Nesta sessão headless não há ferramenta de criação/link de cliente Gmail: administrador tem de configurar pelo formulário. Não enviar segredos pelo chat. Valores esperados server-only: GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY, APP_USER_CONNECTION_KEY_SECRET e LOVABLE_API_KEY.
4. Após “Sim” específico: aplicar pacote INERTE existente pelo canal oficial; autorizar gate Gmail e deploy só data-entry no 0 · Cowork. Importação depende separadamente de preparação/upload autorizados; nenhuma assistant_create.
5. Último passo humano: cada pessoa autenticada no ERP → /transactions → Assistente → Ligar Gmail → consentir com o MESMO email confirmado no ERP. Email e papel admin/manager são pré-requisitos; nenhuma conta foi consultada/promovida.

## Limitações reais
Ligação não ativa nem verificada com Google real. Pesquisa entrega cabeçalhos e inventário de anexos; leitura de corpo de email NÃO entregue. Anexo só após seleção humana, mesmo pipeline documental. Extração/scanner e execução financeira permanecem bloqueados. Envelopes legados sem identidade requerem nova ligação. Não se afirma aceitação integral nem fase11 pronta em produção.

Fontes oficiais: catálogo/ferramentas App User Connectors Lovable; helpers Vite App User Connector e Google Gmail setup fornecidos pela plataforma; Gmail users.getProfile https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/getProfile.
# #333 fase11e — pesquisa e leitura Gmail no modal (20/10/2026)

Autorização Pedro 20/10 07:57 Fortaleza. Base: HEAD = GitHub main `fafa8c803b45032ef60462f033663f9baf289bd0`, CI run39358192442 SUCCESS (controller).

## Entregue

- Pesquisa da caixa PRÓPRIA (Google profile = email Auth ERP, revalidado no servidor em cada pedido) com filtros período/remetente/assunto e paginação explícita, agora também sem exigir anexo (`attachments_only: false`, só no modo leitura). O fluxo de importação mantém `has:attachment`.
- Nova ação `gmail_read`: corpo SOMENTE da mensagem escolhida pelo utilizador. `text/plain` direto; `text/html` convertido a texto (scripts/estilos/elementos remotos removidos, entidades Latin-1 e numéricas decodificadas, sem carregar recursos). Limites explícitos: 200 KB descodificados, 4000 caracteres, profundidade MIME 6, prazo 15 s; truncagem sinalizada. `kind: none` quando não há texto legível.
- Só leitura: GET `/users/me/messages*`; Gmail GET não marca lido; sem send/delete/trash/modify/markread. Conteúdo tratado como dado não confiável, nunca instrução.
- UI no modal (`/transacoes` → Assistente) funciona com upload FECHADO: ligar/estado/desligar + pesquisa + "Ler email" por mensagem, sem botões de importação. Importação de anexo permanece preparada mas indisponível enquanto o envio documental estiver fechado (mensagem explícita na UI).
- Resposta com `message_id` diferente do pedido é descartada no cliente; contexto sessão/empresa revalidado no servidor antes e depois da leitura (`canonicalStorageContext`); componente remonta por user+empresa.

## Gates preservados (read-only agregado, 20/10 ~11:10 UTC)

- `data_entry_analysis_control_333`: rev16, closed, sem claim, enabled/reviewed false. Audit: 16 linhas (inalterado).
- `ANALYSIS_ENABLED=false`, `ANALYSIS_PROVIDER_REVIEWED=false`, `uploadEnabled=false`, `pilotScoped=true` — inalterados no código.
- `data_entry_gmail_connections`: 1 linha (a ligação existente do Pedro; NÃO consumida em testes). `data_entry_gmail_pending`: 2 nonces inertes (expirados; consumo exige expires_at > now()).
- ACL 0207 intacta: nenhum DDL nesta entrega.

## Verificação

- Deploy exclusivamente `data-entry` (source SHA-256 `7c295e72573fb5ac29a3f0cadb2b2a55a1a838e3126b9b43a2f52c0f44bcf156`).
- OPTIONS 200; POST `gmail_read` sem sessão 401; com chave anon 401.
- Vitest: 6 ficheiros Gmail 48/48; suite completa 1705 PASS / 6 skip / 11 todo. Deno check `data-entry/index.ts` e `_shared/gmail-readonly.ts` limpos.
- Sem inbox real, sem OAuth, sem chamadas pagas, sem LLM, sem fixtures no ERP/Storage, sem DDL/Publish.

## Limitações

- Corpo legível à pessoa apenas como texto (não há conversa LLM nem extração para campos; contrato futuro de análise pendente de autorização própria).
- Anexos não são descarregados na leitura; importação continua fechada com o envio documental.
- CI do novo SHA fica para confirmação do controller.

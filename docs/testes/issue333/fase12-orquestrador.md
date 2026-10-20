# #333 fase12 — assistente conversacional + orquestrador restrito (LOCAL, inerte) — 20/10/2026

Base: HEAD = GitHub main `6f0f44428f32983d6101e8ba448e554f69522c23`, CI run39416748977 SUCCESS (controller).

## Implementado (código + testes locais)
- `_shared/assistant-orchestrator.ts`: ciclo servidor com 4 ferramentas fechadas e tipadas (zod): `gmail_search` (filtro 11e/f obrigatório: período + remetente/assunto), `gmail_read` (só email escolhido pela pessoa ou o único encontrado), `erp_find_events` (leitura ERP injetada, vinculada ao user+empresa do servidor), `prepare_ticketline_proposal` (proposta inerte). Sem escrita/envio/apagar/pagamento/SQL/admin. Ferramenta desconhecida ou argumentos inválidos = recusa registada. Resultados embrulhados `untrusted_tool_result`. Contrato do modelo explícito (`ASSISTANT_CONTRACT`).
- Limites: 8 passos, 6 ferramentas, 2 pesquisas, 2 leituras, 40k tokens, 60 s, 2000 chars; Stop (AbortSignal); 402/403 terminal sem nova tentativa nem modelo alternativo.
- Seletor humano: >1 email → `select_message`; evento ambíguo → `select_event`. Sem vasculhar a caixa.
- `_shared/assistant-ticketline-proposal.ts`: mapa ao cêntimo por tipo (direito/fatura Ticketline/acerto sala/repasse/transitado), Σ vs total, duplicado por número, evento selado, liquidação só com conta/data/valor confirmados por pessoa; 5 ações com dependências sobre os fluxos existentes (apuramento → `confirm_ticket_office_statement` → modal de fecho → transações → `transaction_payments`); `effects_hash` SHA-256 canónico; `authorizationMatches` (user+empresa+versão+hash; variação invalida).
- `data-entry` handler: ação `assistant_turn` + capability `assistant`; sem `d.assistant` → 503. `index.ts` NÃO injeta orquestrador → inativo.
- UI `AssistantConversation`: caixa principal "O que pretende fazer?", conversa (só textos, localStorage por user+empresa), trabalho feito, seletores, proposta, pendências e "Execução ainda não disponível". Pesquisa Gmail 11e/f mantém-se como apoio.

## Testes
`data-entry-assistant12.test.ts` (15) + `data-entry-assistant-ui12.test.tsx` (2): percurso completo, injeção no corpo (send_email/register_payment recusados), clarificação, seletor email/evento, denial, limites/Stop, Σ/duplicado/selado/sem liquidação/valor diferente, variação invalida autorização, handler 503/outra empresa/campo company_id recusado, isolamento de histórico. Suite 1820 PASS / 6 skip / 11 todo; Deno check limpo.

## NÃO operacional (gaps específicos)
1. Fornecedor do modelo não ligado: só mocks. LLM NÃO está operacional.
2. Extração do fecho é feita pelo modelo a partir do texto; scanner continua extrator separado — ligação PDF→`statement` por fazer.
3. Leitor ERP real (`erpContext`: eventos, selagem via ticket_office_settlements, apuramentos existentes) por implementar em index.ts.
4. Executor tipado + autorização persistida/verificada no servidor: inexistentes; execução bloqueada.
5. Stop no cliente descarta a resposta; o pedido HTTP não é cancelado (servidor limitado a 60 s).

## Pacote de ativação (revisável, um só)
1. Rever `ASSISTANT_CONTRACT`, ferramentas e limites.
2. Implementar adaptador Responses (gateway, streaming, `store:false`, saída JSON estrita com o `ModelStep`) + `erpContext` só leitura com JWT do utilizador.
3. Testes do adaptador com mock HTTP; uma chamada real autorizada pelo Pedro.
4. Deploy só `data-entry` com orquestrador injetado.
5. Último passo humano: Pedro testa em `/transacoes` → Assistente com um fecho real e confirma. Execução continua fora até proposta própria (executor + autorização SQL INERTE).

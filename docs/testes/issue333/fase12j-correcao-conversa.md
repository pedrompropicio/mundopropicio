# #333 12j — correção da conversa nominal (R1, 22/10/2026)

Base: HEAD c991fec547dbf8da5137c9f3cb5331dc2aaf3378. Sem chamadas reais à IA/Gmail, login, DDL/DML/escritas Cloud, deploy, Publish, flags ou janela. #322/#323 intocadas.

## Sintoma
Teste do Pedro, 22/10 23:38 UTC: "Procura na minha caixa os emails da Ticketline com fechos de eventos dos últimos 30 dias e mostra os encontrados." → UI "O assistente não respondeu. Nada foi gravado." Controller: reason_code=invalid_response, upstream_status=200.

## Causa (provada)
Fontes oficiais só de leitura: log do gateway de IA 01a165fa-a9ab-728a-a1fa-2d6d57c0d63c (23:38:16Z, http 200/upstream 200, streaming, 398/198 tokens, response.completed, sem refusal, sem erro). Logs da função data-entry: só boot/shutdown (sem detalhe).
Texto final devolvido pelo serviço (sem conteúdo cifrado nem dados da caixa):
`{"type":"tool","name":"gmail_search","args_json":"{\"from_date\":\"30 days ago\",\"to_date\":\"today\",\"sender\":\"Ticketline\",\"page_size\":20}","text":null}`
- Envelope e esquema corretos; uso dentro do orçamento; stream completo. Não é falha de provider, stream, usage nem Gmail (o Gmail nunca foi chamado).
- Defeito 1: as instruções não davam a data de hoje; o modelo não podia converter "últimos 30 dias" em AAAA-MM-DD.
- Defeito 2: `parseModelStep` validava os argumentos da ferramenta com `TOOL_SCHEMAS[...].parse` e lançava erro depois do HTTP 200. O controlo classificou invalid_response e o orquestrador respondeu com a mensagem genérica. O caminho de recusa do orquestrador (devolve "Argumentos inválidos" ao modelo, dentro dos limites) nunca era alcançado.

## Correção mínima
- `_shared/issue333-ai/assistant-model.ts`:
  - acrescenta às instruções a linha "Data de hoje (Europe/Lisbon): AAAA-MM-DD", com o relógio do servidor (`now` injetável nos testes);
  - `parseModelStep` valida só o envelope fechado. Os argumentos de ferramentas conhecidas seguem como JSON e o orquestrador valida-os com os mesmos `TOOL_SCHEMAS` antes de executar. Ferramenta inexistente, chaves extra e args_json que não é JSON continuam terminais;
  - erros de formato, de uso inválido e de NoObjectGenerated passam a `ModelInvalid`, com uma mensagem fixa e segura.
- `_shared/assistant-orchestrator.ts`: nova classe `ModelInvalid`. Mostra "O assistente devolveu uma resposta em formato inválido. Nada foi gravado." ou "Ferramenta inválida pedida pelo assistente. Nada foi gravado.", em vez de "não respondeu".
- Mantém-se sem alteração:
  - limites: 8 passos, 6 ferramentas, 2 pesquisas, 2 leituras, 40.000 tokens, 60 s, saída até 6000;
  - permissões, âmbito nominal, controlo durável, 402/403/404 sem reenvio, validações financeiras e o executor;
  - `data-entry/index.ts` e `handler.ts`.

## Provas
- Regressão `src/test/data-entry-assistant12j-fix.test.ts`, com a fixture fiel acima e HTTP sintético. 4 testes: ANTES 4 falham; DEPOIS 4 passam.
  - Com a resposta real, a conversa continua: o modelo recebe "Argumentos inválidos", corrige, e a pesquisa corre só com datas válidas → select_message. Controlo success,success.
  - args_json que não é JSON e ferramenta inexistente: continuam terminais, com uma só chamada, invalid_response e mensagem útil.
- Ficheiros #333 (12b/control87/provider86/scanner94 + novo): 72/72.
- Suite completa: antes 2168 passados / 6 ignorados / 11 por fazer (último registo); depois 2172 / 6 / 11.
- tsgo: 0 erros. deno check data-entry/index.ts: 0 erros.
- CI remoto NÃO VERIFICADO.

## Script INERTE de janela
`supabase/manual/20261020_issue333_12j_janela_conversa.INERTE.sql`: sha256 antes e3aad2961ee99cf18cef86cd020409920668e0a375f18e377824dec44eed2b4d, depois 87610e2a03cee71b5267e81ca45f1844692c5eb105f24dfd76f0619d9ad2e2f3. O fecho (de31ad4a…c156) fica sem alteração.
- Correções:
  - reason_code 'ready' passa a 'none';
  - lock_timeout fica dentro da transação, com set_config local;
  - locks em ordem fixa;
  - retoma da linha de âmbito EXPIRADA do mesmo owner+empresa, sem DELETE.
- A CHECK `expires_at <= created_at + 2h` obriga a pôr `created_at` no instante da retoma. Os valores anteriores saem em NOTICE e no readback prévio, e o controller regista-os no relatório.
- Recusa (sem alterar nada) quando:
  - o executor não é false;
  - a revisão não é false;
  - o controlo não está closed/idle/sem claim/enabled=false/reviewed=false (inclui uncertain e denied_provider);
  - o âmbito ainda está ativo;
  - existe linha de âmbito de outra pessoa.
- Prova em PostgreSQL local descartável, com DDL copiado dos INERTE canónicos (controlo + transição tarefa87, âmbito/revisão 12f, executor). Cluster removido no fim.
  - V1: script antigo → violação de reason_code_check, nada aplicado.
  - V2: abre → ready/none, âmbito 30 min.
  - V3: o claim pela transição funciona depois de abrir.
  - V4: o fecho com claim ativo não fecha o controlo (comportamento existente).
  - V5: fecho limpo; a linha fica preservada e expirada.
  - V6: retoma imediata da mesma linha.
  - V7: retoma de uma linha criada há 3 h; created_at renovado; 1 linha.
  - V8–V13: recusas com estado inalterado.

## Deploy (não feito; depende de autorização própria)
1. CI verde no novo SHA (controller).
2. Deploy SOMENTE de data-entry; registar source_sha256. OPTIONS 200, sem Auth 401, anon 401.
3. Readback: executor false, review false, control closed/idle/sem claim, âmbito expirado preservado.
4. Janela: só com Pedro presente e Sim. Readback do âmbito e script INERTE corrigido (87610e2a…e2f3); teste com o mesmo pedido; fecho de31ad4a…c156.

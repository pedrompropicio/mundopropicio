# #333 12j — leitura única, anexos reais e revisão existente (R1 corretiva, 23/10/2026)

Base: `d2cecac14ae3a863117283138c0c6e3239c01b55` (main/Lovable; entrega anterior `cf02e13d` "Aplicou pacote corretivo R2" confirmada no histórico).
Âmbito: código + testes + docs da demanda. **Sem** deploy, Publish, SQL/DDL/DML aplicado, flags, âmbito, claim, IA/Gmail reais, OAuth/login ou dados financeiros. Executor financeiro continua `false`. CI remoto deste commit: **não verificado**.

## 1. Sintoma (teste real do Pedro, 23/10/2026 ~02:10 UTC)
Pedido: ler o email da Ticketline de 09/10 às 12:28 (Lisboa) e mostrar os quatro PDFs para revisão, sem lançamentos. Pesquisa achou 3; escolha do cartão 12:28; resultado "Parado a pedido. Nada foi gravado."; trabalho feito: "Lido" ×2 do mesmo assunto + "Limite de leituras." ×4.

## 2. Causa provada (só leitura, sem conteúdo privado no repositório)
Registos do gateway (run `01a16686-19dc-…`): 6 pedidos, todos HTTP 200/upstream 200, entrada 676 → 2.411 → 4.146 → 4.175 → 4.204 → 4.233 tokens (+29 por recusa). Estrutura do pedido 5 (só chaves/tamanhos):

```text
user             texto do pedido (207 chars)
tool gmail_search {message, chosen_message, chosen_event}
tool gmail_read   {subject, from, date, text(3659), truncated:false}   <- sem anexos
tool gmail_read   {subject, from, date, text(3659), truncated:false}   <- 2.ª leitura do MESMO id
tool gmail_read   {error:"Limite de leituras."}
tool gmail_read   {error:"Limite de leituras."}
resposta do modelo: type=tool, name=gmail_read (de novo)
```

Auditoria do controlo: revisões 60–77 = 6 ciclos claimed→post_started→success(200); rev 78 claimed 02:11:03.172, rev 79 post_started 02:11:03.845, rev 80 `cancelled_after_post`/uncertain 02:11:04.517 (o Pedro carregou Parar durante o 7.º POST). Nenhum registo do gateway para esse 7.º POST.

Cadeia: (1) o resultado de `gmail_read` não levava os anexos, por isso o modelo não conseguia cumprir "mostra os PDFs" e voltou a ler; (2) o orquestrador não impedia reler o mesmo id (consumia uma 2.ª leitura do Gmail); (3) a recusa "Limite de leituras." voltava ao modelo e o ciclo continuava até `maxSteps`; (4) a revisão existente só aparecia com corpo truncado. O fornecedor e o Gmail funcionaram (200). A numeração "nº4" do pedido anterior vinha de uma tabela escrita pelo modelo, sem mapa do servidor.

## 3. Correção (sem novo scanner nem writers)
- `assistant-orchestrator.ts`
  - Leitura única por id: um 2.º `gmail_read` do mesmo email não chama o Gmail nem o modelo; termina com a lista real de anexos e a revisão.
  - `gmail_read` envia ao modelo os metadados reais dos anexos do email escolhido (nome, tipo, tamanho; sem `part_id`, sem conteúdo). Anexos de outros emails nunca entram.
  - `attachments` (numerados pelo servidor, a partir da pesquisa assinada e revalidada) + `review_message_id` acompanham qualquer resposta depois da escolha revalidada, incluindo corpo completo, corpo truncado, resposta final do modelo e limites.
  - Excesso de leituras e recusa idêntica repetida terminam logo com `limit` honesto e próxima ação útil; sem novo POST. Tetos inalterados (8 passos, 6 ferramentas, 2 pesquisas, 2 leituras, 40.000 tokens).
  - Na retoma, a ordem e a numeração seguem o seletor assinado; os rótulos dos emails levam "N." do servidor. O pedido original (hash verificado) acompanha o turno seguinte como `original_request`; o histórico do cliente continua fora.
  - Contrato: ler cada email no máximo uma vez; não numerar nem inventar anexos, páginas ou valores.
  - Depois de uma escolha revalidada, uma resposta final do modelo que contenha números, €, "anexo", "pdf", "página" ou "documento" é substituída pela lista real do servidor, com a indicação de confirmar na revisão. Respostas sem essas afirmações mantêm-se.
- `data-entry/handler.ts`: passa `continuation_text` verificado ao orquestrador; o seletor assinado também é emitido depois de uma revisão revalidada, sempre preso ao hash do pedido ORIGINAL (o texto novo sozinho dá 409).
- `AssistantConversation.tsx`: lista "Anexos reais do email (N)"; a continuação mantém o pedido original; o painel de revisão existente recebe a lista inicial.
- `TicketlineReviewPanel.tsx`: `initialAttachments` opcional preenche as opções. O anexo escolhido continua a ser revalidado pela ação `ticketline_candidate` existente (pertença, hash, scanner fechado).
- `data-entry-client.ts`: tipo `attachments` no resultado.

## 4. Testes (locais, sintéticos, sem rede)
Novos: `src/test/data-entry-assistant12j-anexos.test.ts` (10) e `src/test/data-entry-assistant12j-anexos-ui.test.tsx` (1). Ajustado: `data-entry-assistant12j-context.test.ts` (o email escolhido passa a levar os seus anexos; os outros continuam fora).

Antes (código da base `d2cecac14`, novos testes): **8 falham / 2 passam**. As 2 que passam são de preservação (Parar antes/depois do POST).
```text
× reprodução do teste real ... expected "spy" to be called 1 times, but got 2 times
× corpo completo ... expected '[...]' to contain 'a-documento-4.pdf'
× corpo truncado ... expected 'O corpo deste email foi cortado pelo …' to contain 'a-documento-1.pdf'
× recusa idêntica repetida ... expected "spy" to be called 2 times, but got 7 times
× nomes repetidos ... expected [ 'msgAAAA01', … ] to deeply equal [ 'msgAAAA03', … ]
× continuação após a revisão ... expected '[...]' to contain 'original_request'
× handler: assinatura segue a revisão ... Target cannot be null or undefined.
✓ Parar DEPOIS do POST: stopped, claim preservado em uncertain; turno seguinte não faz POST nem reset
✓ Parar ANTES do POST: cancelled_before_post, sem HTTP e sem estado incerto
× UI: escolha → anexos reais → revisão existente ... Unable to find a label with the text of: Anexos do email
```
O "7 times" reproduz as 7 chamadas da tentativa real.

Depois: 11/11 novos (inclui: "7 PDFs/999 €" do modelo não aparece no texto; final neutro mantém-se); testes 12j/12/12b/UI anteriores verdes. O que fica coberto:
- pedido "mostrar anexos", corpo completo e truncado;
- nomes repetidos e anexos homónimos noutro email;
- continuidade entre turnos, com o pedido original assinado;
- leitura duplicada e limite sem repetição;
- Parar antes e depois do POST, com o estado `uncertain` preservado sem reset;
- ecrã sintético: escolha → lista → rádio do anexo → `ticketlineCandidate({message_id, part_id})`, sem nova listagem.

Suite completa: **2196 PASS / 6 skip / 11 todo**, rc 0 (antes da demanda: 2185). `tsgo` 0. `deno check data-entry/index.ts` 0. Build OK.
O ecrã foi verificado só com dados sintéticos em jsdom; não houve navegador real nem sessão.

## 5. Estado Live e recuperação (artefacto INERTE, não aplicado)
Leitura só de consulta (~02:17Z):
- controlo: rev 80, `unavailable`/`uncertain`/`cancelled_after_post`, status NULL, claim `f2a6673b-2b81-477c-9058-b79c23a96f8f`, enabled=false, reviewed=true;
- executor=false, review=false, âmbito ativo=0;
- a função responsável `data_entry_analysis_responsible_333` existe.

Artefacto: `supabase/manual/20261023_issue333_12j_conferir_incerto.INERTE.sql`.
- Chama só `data_entry_analysis_responsible_333('confer', 80, <claim>, <sha>)`, o mecanismo responsável já instalado e exclusivo de postgres, que grava auditoria `confer`.
- Recusa se a revisão, o claim, o estado, o motivo, o status, o executor, a revisão ou o âmbito diferirem da prova.
- O resultado fica `closed`/`idle`/sem claim. Não reabre a janela nem repete o pedido.
- Conferir = aceitar que o 7.º POST pode ter sido cobrado.
- `review_sha256` por preencher pelo controller com o sha256 deste relatório no commit revisto.

Passo mínimo proposto ao controller:
1. Rever este relatório.
2. Repetir o readback "ANTES".
3. Com "Sim" do Pedro, aplicar o artefacto em Live (R2).
4. Fazer o readback "DEPOIS".
5. Só depois disso, e com autorização separada, deployar só data-entry (pacote abaixo) e reabrir a janela de 30 min.

## 6. Pacote para deploy (não feito)
Função `data-entry` apenas. Ficheiros: `_shared/assistant-orchestrator.ts`, `data-entry/handler.ts`. O frontend (`AssistantConversation.tsx`, `TicketlineReviewPanel.tsx`, `data-entry-client.ts`) só chega com Publish. Sem ele, o servidor responde na mesma: a lista sai no texto, mas sem o bloco de anexos nem as opções pré-preenchidas.

## 7. Revisão independente (só leitura)
- Afirmações inventadas no texto final do modelo: corrigido (secção 3) e testado.
- O artefacto `.INERTE.sql` é executável: segue a convenção de `supabase/manual/` (nunca aplicado automaticamente, só com Sim). O cabeçalho declara a mudança de estado e as guardas recusam qualquer divergência da prova.

## 8. Não feito / limites
Sem aceitação real prometida; o comportamento do modelo real só se confirma num teste autorizado. #322/#323 e outras frentes intactas.

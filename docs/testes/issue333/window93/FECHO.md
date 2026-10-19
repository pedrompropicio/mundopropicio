# Fecho93 e comparação dos leitores existentes — 19/10/2026

## Fecho executado primeiro
- Base controller: `6b202442174f407624283d15352adffd44c4bccf`, CI418 SUCCESS informado pelo controller.
- Alteração de produto exclusivamente em `supabase/functions/data-entry/index.ts`: `ANALYSIS_ENABLED=false`, `ANALYSIS_PROVIDER_REVIEWED=false`. `uploadEnabled=false` e `pilotScoped=true` preservados.
- Deploy exclusivamente `data-entry` concluído. SHA256 da fonte submetida: `e0e0c944faf21881e24cbd323508ba945f756761aafc384883d0165490135dc4`. O recibo comprova submissão/deploy, não inspeção independente dos bytes hospedados.
- Boot-check sem autorização: HTTP401 `UNAUTHORIZED_NO_AUTH_HEADER`.
- Readback oficial: revision6, state closed, enabled/reviewed false, stage idle, active_claim NULL. Uma preparation com nota93 disabled; zero assistant_create.
- Audit preservado: rev1 closed; rev2 reopen; rev3 claimed; rev4 post_started; rev5 success HTTP200; rev6 close. Isto prova um ciclo registado, não contador upstream/cobrança nem exatidão da extração.
- Consulta agregada pela empresa da única capacidade93 e intervalo audit reopen→close: 1 documento técnico, 0 prévias, 0 faturas avulsas, 0 transações, 0 linhas BP, 0 fornecedores novos. Não é uma comparação hash integral de todos os registos nem prova de ausência de alterações concorrentes a linhas antigas.
- A procura pelo hash autorizado exato não encontrou linha em data_entry_documents; por isso não foi usada para provar ausência de efeitos. O vínculo técnico do documento ao hash autorizado não foi confirmado nesta leitura. Não se procurou conteúdo, nomes, IDs pessoais nem bytes do PDF.
- Nenhum documento/audit apagado, nenhum provider chamado novamente, nenhuma alteração de #322/#323, SQL, Publish ou limpeza.

## Testes e resultado recuperável
`bunx vitest run src/test/data-entry-analysis85.test.ts src/test/data-entry-pilot8.test.ts src/test/data-entry-deadline90.test.ts`: exit0, 32/32 PASS. Inclui gates fechados com zero scope/provider calls e deadline60s; não ampliada a suite CI. Harness observado: build OK.

A análise não persiste candidatos/answer: `analysis-stream.ts:12–23` envia o relatório pelo stream e não escreve BD. `DocumentAnalysisPanel.tsx` mantém report/messages em estado da sessão do browser. O audit guarda apenas estado/códigos técnicos; os códigos recuperáveis são success/200 e closed, não os campos da fatura. Sem a sessão/imagem do utilizador, não é possível recuperar nem validar os candidatos pelo backend. Não reprocessar o documento para suprir esta limitação.

## Leitores já existentes

### Transações e repartição IVA
- UI: `src/components/TransactionFormModal.tsx:337–512`, botão **Ler fatura (IA)**; `src/components/SplitByIvaModal.tsx:231` para taxas/base/IVA.
- Engine: `supabase/functions/extract-invoice-total/index.ts:53–235`, `google/gemini-2.5-flash` pelo gateway `/v1/chat/completions`, tool `report_invoice_total` exclusivamente de extração. Devolve total/moeda/data/tipo/fornecedor/número/IVA por taxa; não grava BD.
- Escrita separada: submissão no TransactionFormModal (txInsert/transactions, documentos e possíveis vínculos BP); o leitor preenche o formulário, não é autorização333.

### Scanner de faturas avulsas
- UI `/scanner-faturas`: `src/pages/StandaloneInvoiceScanner.tsx`, `acceptFile:175–220` usa `extract-camarim-receipt`; `save:292–357` faz upload/insert standalone ou prepare/executeLegacyAttempt.
- Engine: `supabase/functions/extract-camarim-receipt/index.ts:44–128`, mesmo Gemini/gateway, JSON de recibo/camarim, inclui total/IVA e identificação; não grava BD. O prompt tem pressupostos de camarim, logo não deve ser copiado para faturas genéricas333.
- Gravação documental apenas em save, distinta de TX/BP e distinta da prévia/autorização333.

### Preparação e limites comprovados
- `src/lib/invoice-ocr-prepare.ts:80–113`: DNG→preview JPEG; PDF→**primeira página apenas**; imagens→JPEG até1280px/qualidade0.7. Aceita PDF/JPEG/PNG/WebP/HEIC/HEIF/TIFF/DNG por MIME/extensão. O leitor de Transações tem preparação equivalente local em `TransactionFormModal.tsx:375–412`.
- Estes dois extractors não definem no seu corpo limite explícito de output tokens, deadline/abort ou validação owner/tenant/document-hash; não se afirma que o gateway não imponha limites. Não têm proveniência por campo/página/citação equivalente333. Há retorno raw/erros upstream que não deve passar para o contrato333.
- #333: `analysis-service.ts` valida utilizador/empresa/sessão/ID/hash/bytes e contexto antes/depois; `provider.ts:45` usa `openai/gpt-6-astra` via Responses; contrato em `_shared/data-entry-analysis.ts`: 5MiB, mensagem2000bytes, histórico8turnos/12000bytes, output6000tokens; deadline servidor60s; controlo durável sem retries. Candidatos têm origem/citação/página/incerteza, depois revisão humana→prévia vinculativa→autorização separada.
- Não há medição comparativa de latência ou custo. A primeira página comprimida e a extração simples são diferenças reais de processamento; não provam mais rapidez/menos custo nem cobertura integral de PDF multipágina.

## Recomendação única, sem implementação nesta tarefa
Reutilizar o **núcleo de extração de faturas genéricas de extract-invoice-total**, isolado futuramente em `_shared/`, como adaptador candidato de #333; não importar/callar o modal inteiro, save, txInsert ou o endpoint legado diretamente. Manter as guardas333 (identidade/tenant/hash/controlo/cancelamento), validação pública estrita e revisão→prévia→autorização fora do extractor. Completar proveniência e campos ausentes, sem inventá-los; usar preparação existente apenas com vínculo explícito original/derivado e sem reduzir silenciosamente PDF multipágina à primeira página. É reuso do motor existente, não autorização de troca de modelo nem de nova chamada. Nenhuma alteração deste reuso foi feita agora.

## Checklist18 e pendências
1–7 histórico concluído; 8 PARCIAL (três critérios ampliados continuam pendentes); 9 não liberada globalmente, janela preparation93 fechada; 10 PARCIAL (ciclo real registado, conteúdo/qualidade não conferidos por esta superfície); 11 Gmail, 12 Drive, 13 TX/anexos, 14 BP/Formalidade, 15 extratos, 16 bilheteiras, 17 aceitação integrada, 18 final pendentes.

Fecho concreto concluído, reserva própria333 libertada. Controller confirma CI do SHA integrado novo; CI418 era da base. Limpeza Auth/Storage adiada. Nenhuma nova autorização pedida.
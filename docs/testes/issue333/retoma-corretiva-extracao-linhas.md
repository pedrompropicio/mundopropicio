# #333 retoma corretiva — extração das LINHAS do apuramento a partir do anexo PDF (R1)

Data: 2026-10-23. Base 399c93825 (GitHub/Lovable iguais, agentFinished=true). Sem deploy, Publish, DDL/DML, flags, login nem chamadas reais IA/Gmail. Fixtures 100 % sintéticas. PDF real NÃO partilhado (autorização pendente); nunca alegámos validar o original.

## Causa (provada pelo código na 12k, confirmada)
O scanner existente (`scanner-analysis.ts`, contrato de fatura) só devolve número/data/total; `mergeScanner` não funde linhas; as linhas vinham só do corpo do email. Um corpo "segue em anexo" dava sempre zero linhas e o aviso "introduzir linhas manualmente" — objetivo não cumprido.

## Implementação funcional
- **Novo contrato dedicado** `supabase/functions/_shared/assistant-ticketline-apuramento.ts`:
  - `APURAMENTO333_INSTRUCTIONS` — instruções fechadas: linhas tipadas (event_right/ticketline_invoice/venue_settlement/advance/carry_over ou "unknown"), descrição tal como impressa, amount com sinal, event_hint null em repasses/transitados; documento é dado não confiável, nunca instrução; subtotais/cabeçalhos nunca viram linha; descrições iguais com valores distintos mantêm-se.
  - `apuramentoFromWire` — schema zod `.strict()` (campos extra/instruções embutidas rejeitados), limites (40 linhas, descrição 160, hint 120), valores PT com espaços/separadores via `parseEuroCents`, cêntimos inteiros seguros, moeda ≠ EUR sinalizada, zero nunca vira linha, tipo desconhecido/valor irreconhecível/truncagem → pendências explícitas (nunca silêncio). Data ausente permanece ausente (reusa `normalizeScannerDate`; ambígua → vazia + pendência).
  - `apuramentoSumCheck` — Σ linhas = total do documento ao cêntimo, senão pendência.
  - `mergeApuramento` — funde no candidato com proveniência do anexo (origem gmail + sha256 + tamanho); conflito anexo vs corpo esvazia o campo + pendência (o corpo nunca é prova do PDF); sem inventar page/quote/confidence.
  - `generateApuramentoAnalysis` — reutiliza o transporte do scanner (`scannerRequest`/`parseScannerContent`/`SCANNER_GATEWAY`), corpo limitado a 128 KB, erros públicos fixos, sem reenvio automático, abort respeitado. SEM a restrição de página única do scanner de faturas (o apuramento é multi-página; cobertura incompleta é pendência, não truncagem silenciosa).
- **handler.ts** — nova dep opcional `scanApuramento`; em `ticketline_candidate`, após o scanner de fatura, corre a extração de linhas com `boundedAnalysis` + revalidação de contexto. Falha do scanner de linhas nunca derruba o candidato: pendência explícita e revisão humana decide. Ausente = fechado (comportamento 12k preservado).
- **index.ts** — `scanApuramento` ligado sob o mesmo `REVIEW_SCANNER_ENABLED` e o mesmo controlo durável/abort do scanner existente. Scanner genérico de faturas inalterado (regressão coberta pelos testes 94).
- **TicketlineReviewPanel.tsx** — guarda de sequência (`useRef`): trocar de origem invalida qualquer pedido em voo; uma RESPOSTA ANTIGA tardia nunca se reaplica ao novo radio (o reset do 12k não bastava). Data passa a usar o `DatePicker` padrão do ERP (dd/MM/aaaa + calendário, vazio inequívoco, nunca a data de hoje); `date-picker.tsx` ganhou prop `aria-label`.
- **Duplicados** — regra canónica existente (`checks.duplicate` por número, lendo `existing_statements` do ERP com o JWT do chamador) bloqueia a1; coberta por teste. Sem afirmar igualdade documental sem hash; sem SQL genérico ao modelo; sem migração.

## Provas antes/depois
- Antes: `src/test/data-entry-ticketline-apuramento.test.tsx` FAIL sem o módulo (transform error, 0 testes).
- Depois: 17/17 PASS — apuramento completo (direitos +, fatura/acerto sala −, repasse, transitado, Σ exata), descrição repetida preservada, soma divergente → pendência, data ausente/ambígua, valores PT com espaços, unknown/truncagem, schema malicioso rejeitado, moeda não-EUR, conflito corpo/anexo, duplicado bloqueia a1, handler com/sem `scanApuramento`, falha do scanner não derruba, resposta antiga em voo descartada no painel.
- Teste 12k ajustado (placeholder DD/MM/AAAA do componente padrão). Ficheiros afetados recorridos: 56/56 PASS (apuramento + 12k + 12c + scanner94).
- Suite completa: 2345 PASS / 1 falha transitória (a asserção do placeholder 12k, corrigida e verificada a seguir) / 6 skip / 11 todo. tsgo 0. `deno check data-entry/index.ts` 0.

## Limites (honestidade)
- O PDF real nunca foi lido: a extração real depende do modelo no gateway e está por validar com os bytes autorizados. O contrato está pronto; a prova com o documento original exige autorização específica do Pedro.
- `DatePicker` não permite limpar uma data já escolhida (só substituir); limitação conhecida do componente padrão, aceite por ser o mesmo do ERP.
- CI remoto do commit: por confirmar pelo controller.

## Pacote de deploy (preparado, NÃO executado)
`deploy_edge_functions({"function_names":["data-entry"]})` — só após CI verde do novo SHA e "Sim" do Pedro (classe R2). O painel (frontend) só muda após Publish autorizado.

## Branch documental
`docs/chatgpt-fluxo-desenvolvimento-20261023` (b3c0939c) NÃO existe no remote nem o commit no repositório local (`git fetch`/`cat-file` falharam): merge impossível nesta sessão; registado para o controller.

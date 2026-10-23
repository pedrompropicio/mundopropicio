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
`docs/chatgpt-fluxo-desenvolvimento-20261023` (b3c0939c) NÃO acessível no remoto do sandbox nesta sessão (`git fetch`/`cat-file` falharam); o controller comprovou pela API do GitHub que o commit existe — a ausência no sandbox não prova inexistência. Integração fica para o controller; não se repetiu fetch nem se reconstruiu a branch.

---

## Continuação corretiva R1 — revisão do controller (23/10/2026 ~21:15 UTC)

Base 689efee0 (main/Lovable iguais, CI run 40022453558 success). Seis bloqueios corrigidos, sem deploy/Publish/DDL/DML:

1. **Autoridade de origem (mergeApuramento):** escolhido um anexo, as linhas vêm SÓ do anexo; o corpo é contexto — linhas divergentes viram bloqueio `lines_conflict`, idênticas não duplicam. Fim do `[...body, ...pdf].slice(0,40)`: nunca truncagem silenciosa; cobertura acima do limite é pendência bloqueante. A soma é validada sobre o candidato EFETIVO (`candidateSumMessage`), não só sobre a extração.
2. **Revalidação fora do catch:** `canonicalStorageContext()` após o scanner de apuramento corre FORA do try/catch; revogação de sessão/empresa durante o scanner é recusa (401/403), nunca pendência com candidato assinado.
3. **UMA chamada dedicada:** no caminho de apuramento só corre o contrato dedicado (metadados+linhas, multi-página); o scanner genérico de faturas não é chamado (fim dos 2 POSTs e da recusa de multi-página). Scanner genérico preservado para faturas/outros fluxos.
4. **Validação monetária sem arredondamento:** `cents()` recusa números com mais de 2 casas decimais (tolerância só ao ruído IEEE754); `event_hint` de repasse/transitado é normalizado para null no servidor; moeda ausente é pendência bloqueante (nunca EUR presumido); descrição/hint acima do limite gera pendência `description_truncated`.
5. **Bloqueio estruturado assinado:** candidato tem `blocking: {code, message}[]` (assinado no token, incluído no hash de proveniência). `applyHumanEdits` já não remove pendências por regex: recomputáveis (`no_lines`, `sum_mismatch`) são reavaliadas sobre o candidato editado; as restantes só caem com `resolve_blocking` explícito (códigos desconhecidos ignorados). `confirm_review=true` com bloqueios por resolver → `human_reviewed` false, ações bloqueadas, needs com "Bloqueante por resolver". Avisos informativos ("conferir no original") NÃO bloqueiam.
6. **Guarda seq alargada no painel:** recalc e authorize também capturam `seq`; respostas tardias após troca de origem são descartadas (nunca aplicam prévia/autorização/aviso).

**Duplicados cedo:** `ticketline_candidate` com número lê o ERP isolado (JWT do chamador, RLS por empresa) e devolve `duplicates` + aviso no candidato; nada é criado nem assumido igual ao PDF. Teste prova que outra empresa não vê IDs.

**Provas:** 15 testes novos; ficheiros afetados 74/74; suite completa 2360 PASS (antes 2345) | 6 skip | 11 todo; tsgo 0 erros; deno check limpo. Sem deploy: `data-entry` continua a precisar de deploy R2 separado com "Sim" do Pedro.


## Continuação residual R1 — versão local e anexo sem linhas (23/10/2026 ~21:41 UTC)

Base conferida: `708d6fc3075d379d3f06ef1c9ae7e2c0f81b376d`; CI 40026861612 success comunicado pelo controller (não reconsultado). Reserva #333 mantida.

Plano executado: invalidar qualquer mudança dos dados/escolhas/contexto; cercar respostas e callbacks; impedir autoridade do corpo em extração vazia/indisponível; repetir provas sintéticas e suite completa.

- `TicketlineReviewPanel.tsx`: versão incrementada em cada edição, resolução/confirmacão, mudança de origem, candidato inicial (conteúdo, mesmo token), contexto utilizador/empresa/mensagem e seleção de ações. Edição durante pedido continua permitida e invalida autorização. Cada pedido captura versão + identidade própria; callbacks de sucesso, erro e finally antigos não atualizam a versão nova. Mudança de contexto/candidato cercada em layout/cleanup; contas e anexos também têm descarte de respostas fora do contexto. Autorizar valida stale, persistência e seleção admissível no próprio handler local, não só no botão. Recálculo e releitura invalidam autorização anterior.
- `mergeApuramento`: substitui linhas do corpo mesmo quando a extração tem ZERO linhas; mantém proveniência/contexto e bloqueio `no_lines`. `handler.ts`: candidato do anexo começa sem linhas do corpo; falha/ausência do dedicado ou compatibilidade de metadados nunca promovem corpo a PDF. Extração com linhas compara o corpo original para manter a prova anterior de conflito. Revisão humana explícita e regras financeiras preservadas.
- `src/test/data-entry-ticketline-apuramento.test.tsx`: 13 casos comportamentais novos. Recálculo tardio após edição total/linha na mesma origem; autorização tardia após edição/seleção/initial/contexto (sem montar executor/chamar status/execute); recálculo com initial novo mantendo token/contexto; erro/finally antigo não liberta pedido novo; corpo com linhas + anexo vazio/falha/fechado/metadados legados produz zero linhas, soma 0 e revisão não confirmada.

Provas antes/depois:
- Suite ANTES: 2360 PASS, 6 skipped, 11 todo, 254 ficheiros passaram / 2 skipped (`/tmp/issue333-before.log`).
- Red inicial: 10 falhas comportamentais reais + 1 fixture inválida do scanner legado (503; não era prova de regressão). Fixture corrigida para o contrato `fields` existente; não relaxada validação (`/tmp/issue333-red.log`).
- Intermédio: 69/69 PASS nos cinco ficheiros de candidato/revisão (antes dos dois últimos casos).
- Suite FINAL integral: 2373 PASS, 0 falhas, 6 skipped, 11 todo; 254 ficheiros passaram / 2 skipped (`/tmp/issue333-final.log`). As seis correções anteriores e regressões de fatura/anexos/isolamento continuam cobertas pela suite, sem reinvestigação.
- `deno check supabase/functions/data-entry/index.ts`: PASS (`/tmp/issue333-deno-final.log`).
- Compilação automática: último sinal após código/testes `build OK` (21:48:56 UTC). Build/tsgo manuais não executados por restrição da plataforma; não se afirma uma execução independente de tsgo. CI do SHA final fica para o controller.

Limites: só fixtures sintéticas/mock e execução local; sem login, IA/Gmail reais, documentos privados, DDL/DML, efeitos financeiros, flags, deploy ou Publish. PDF original não validado. Nenhuma tentativa de comentar a Issue por outro canal; branch documental não consultada/modificada. Reserva mantida para revisão controller; não constitui aceitação ou aptidão para deploy.


## Deploy R2 autorizado — 23/10/2026 ~21:58 UTC

Pedro respondeu «sim» ao deploy apenas de `data-entry`, mantendo janela de teste e lançamentos bloqueados. HEAD local conferido antes da operação: `a20c1d3585061515269b31e0c3cffced409162c6`. Main/Lovable iguais, agentFinished=true e CI run40029582438 completed/success (tsgo/vitest/build) comunicados pelo controller; sem nova investigação ou alteração de código.

Uma única chamada: `deploy_edge_functions({"function_names":["data-entry"]})`.
Resultado integral da ferramenta:
```
Successfully deployed edge functions: data-entry
Submitted source SHA-256 (files and settings; live verification is reported separately):
data-entry source_sha256: 6c028e6c844e1860b6524250ddb8ad976406275ad9b48300295bf06a2e118f38
```
Hora UTC medida imediatamente após o resultado: `2026-10-23T21:58:20Z` (não é timestamp fornecido pelo serviço). ID/versão de deployment e hora exata do serviço não expostos. O SHA identifica fontes/configuração submetidas; não prova independente dos bytes efetivamente servidos (#317). Sem readback de bundle ou invocação da função; sem repetição de deploy. Dependências partilhadas seguem somente o bundle de `data-entry`, nenhum outro consumidor implantado.

SELECT mínimo pós-deploy, apenas agregados de controlos:
```
executor_settings_count=1
executor_enabled_count=0
active_user_scopes=0
provider_control_count=1
provider_ready_idle_no_claim_count=1
```
Logo executor continua `enabled=false`; zero âmbitos com `expires_at>now()`; singleton provider `state=ready`, `enabled=true`, `stage=idle`, `active_claim IS NULL`. Comparação com os valores prévios comunicados pelo controller coincide. Nenhuma alteração de controlos; provider ligado não abre janela de utilizador.

Fecho: deploy concreto de `data-entry` reportado como sucesso pela ferramenta. Frontend Publish e teste real continuam pendentes de autorização própria; PDF original não lido/validado. Sem Publish, DDL/DML, flags, janela nova/renovada, login, IA/Gmail/scanner reais, auditoria por invocação ou efeitos financeiros. Só relatório e linha #333 atualizados; reserva MANTIDA para controller. Sem comentário alternativo na Issue ou alteração da branch documental/outras frentes. Questões novas: nenhuma; pendências são Publish/teste real e eventual prova independente dos bytes servidos, não fornecida pela ferramenta.

## 23/10/2026 ~22:20 UTC — datas do painel e limpeza (R1, só frontend)
Reporte do Pedro no teste: sem opção de apagar; calendário diferente do padrão.
- `ui/date-picker.tsx`: prop opcional `clearable` (opt-in). Com ela, apagar o texto ou o botão "Limpar <rótulo>" propaga `onChange("")`. Sem a prop, consumidores antigos inalterados (provado em teste).
- Painel: Data, Data do fecho e Data do recebimento com DatePicker padrão (dd/MM/aaaa + calendário), `clearable`; sem `type=date`; sem data por defeito.
- Botão "Limpar recebimento": limpa conta/data/valor/confirmação via `edit()` (invalida prévia/autorização; fence de respostas tardias preservado). Bloco vazio → recalc sem `settlement`; parcial continua com erro explícito.
- Testes: `src/test/data-entry-ticketline-datas.test.tsx` (8; 7 falham no código 229f42c9, 8 passam depois). 12f ajustado ao formato dd/MM/aaaa. Ficheiros do painel 95/95; suite completa 2380 PASS + 1 falha (12f, formato nativo) corrigida e re-corrida no ficheiro; tsgo limpo.
- Sem deploy/Publish/DDL/DML/backend. Publish do frontend e teste real pendentes.

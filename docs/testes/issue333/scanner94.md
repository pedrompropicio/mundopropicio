# #333 — integração local do motor do scanner existente

## Base e âmbito
Controller: agentFinished=true, GitHub/Lovable iguais `cd911f28cf4237f2db287640b442fe0de4f1ee83`; CI419 run39257769167 jobquality118077274823 SUCCESS. Evidência informada pelo controller, não novo CI certificado pelo agente. Reserva própria333, #322Claude/#323 preservados. Sem canal de Issue usado; este texto serve ao controller.

## Código entregue
- `functions/_shared/scanner-extraction.ts`: extrai do endpoint existente o prompt, modelo, pedido e parser JSON do scanner. Pedido legado, prompt e ausência de teto legado preservados; prompt confrontado byte a byte com base: exact_match=True.
- `functions/extract-camarim-receipt/index.ts`: continua endpoint do scanner, mesmos erros/status/resultado; importa núcleo, sem alterar save/pagador/StandaloneInvoiceScanner.
- `functions/_shared/scanner-analysis.ts`: adaptador333 usa o mesmo núcleo/Gemini/gateway chat; não chama endpoint legado, não importa writers e não mantém OpenAI na execução ativa. Módulos Responses históricos permanecem para provas/regressões antigas, não são importados pelo index333.
- Guardas333 mantidos: sessão/empresa/owner/role, bytes/hash/path, contexto antes/depois, controlo durável/claim/revision, auditoria, deadline60s, Stop/uncertain, sem retry/fallback. HTTP402/403/404 mantêm denials duráveis;429 termina sem retry. Erros públicos fixos, corpo máximo128KiB, apenas campos validados na UI, sem metadata/reasoning/raw upstream.
- Contrato adapta scanner: sem quotes/páginas/confiança por campo inventadas. `confidence=null`, origem suggestion, usable=false; `reviewable` permite valor válido apenas após clique humano explícito. Ausência/invalidez permanece manual. Moeda ausente/nãoEUR e IVA>total bloqueiam transferência de montantes. Destinatário/pagador não vêm do modelo. Prévia/autorização invalidam quando um candidato é usado.
- Referências/VAT preservados literalmente, sem remoção de hífens/letras/prefixos/zeros. Teste AB-0001 atravessa motor→contrato→formulário→invalidação da autorização; GB-AB001234 preservado.
- `data-entry-scanner-file.ts`: reutiliza normalização HEIC e preparação/compressão do scanner para imagens ANTES do novo upload; o hash canónico é dos bytes preparados. Não substitui bytes de ID existente. PDFs mantêm bytes originais; pdf-lib no servidor confirma exatamente uma página ou recusa antes do POST, nunca usa a primeira página silenciosamente.
- UI: revisão editável preservada, botões de candidato sem quote agora têm via explícita de revisão; valores ausentes/inválidos explicam motivo. Conversa livre removida porque scanner apenas extrai; botão Stop mantido. Modal limitado ao viewport com scroll.

## Diagnóstico da revisão93
Botões estavam desativados pelo requisito quote/confiança/incerteza; o motor do scanner não fornece evidência por campo. Separar reviewable de usable corrige isso sem tornar sugestões factos nem autorizar escrita. Nenhuma transformação atual do formulário remove separador; nova cadeia exige pedido literal e confirma AB-0001 em teste. Não se atribui a causa da referência93 sem recuperar o resultado privado.

## Validação concreta
Comando: `bunx vitest run src/test/data-entry-scanner94.test.ts src/lib/__tests__/data-entry-scanner-file.test.ts src/test/data-entry-analysis85.test.ts src/test/data-entry-deadline90.test.ts src/test/data-entry-pilot8.test.ts src/components/data-entry/__tests__/DocumentAnalysisPanel.test.tsx src/components/data-entry/__tests__/DataEntryDialog.test.tsx src/test/data-entry-analysis-transport85.test.ts`
Resultado final: exit0, 8 ficheiros, 75/75 PASS. Inclui testes principais herméticos com PDF sintético local1/2páginas, fetch/RPC doubles, serviço real/adaptador real, precedência guards, denials/Stop/JSON inválido, transição de revisão e preservação do pagador. Primeiras execuções detectaram IDs de fixture nãoUUID, import PDFjs eager em jsdom, stub ResizeObserver ausente e tipagem do mock; corrigidos sem relaxar guards/timers.

Comando: `deno check supabase/functions/_shared/scanner-analysis.ts supabase/functions/extract-camarim-receipt/index.ts supabase/functions/data-entry/index.ts`
Resultado final exit0 (Deno2.6.10). Tentativa `--cached-only` não suportada foi descartada, não prova. Nenhuma invocação provider/modelo nem segredo lido. Harness tipos/build mais recente: build OK. Build não executado manualmente, conforme harness. Suite inteira/CI novo ficam ao controller; testes pertinentes executados, provas87–93 não reiniciadas.

## Limitações reais
- Reutiliza o modelo já existente do scanner, Gemini2.5Flash. O catálogo da plataforma sinaliza depreciação; não foi substituído implicitamente nem consulta autenticada/segredo efetuada. Disponibilidade/custo/qualidade hospedados não provados, nenhuma chamada real. Alternativa atual exige decisão própria antes de ativação se necessária.
- PDF1página é enviado inteiro via caminho legado dataURL; suporte/qualidade externa deste caminho não foi provado aqui. PDF multipágina, protegido ou inválido recusa; revisão manual permanece. Não há renderizador servidor, seleção/split automática ou alegação de cobertura integral.
- O scanner não é conversacional, nem fornece NIF destinatário/citações/confiança por campo. Não há fidelidade absoluta garantida pelo modelo: pessoa revê todos os campos e pode corrigir.
- Estado Cloud rev6 closed da tarefa93 não consultado nem alterado. Upload/analysis/provider permanecem false, pilotScopedtrue. Sem allowlist/janela/migração/deploy/Publish/limpeza/dados ERP. Browser real não executado: opt-in não autorizado, testes UI locais apenas.

## Checklist
- [x] Reserva/base/CI sanitizados e somente333.
- [x] Motor scanner partilhado, comportamento atual preservado.
- [x] Adaptador333 sem endpoint legado/writers/OpenAI ativo.
- [x] Claim/auditoria/tenant/hash/revisão/prévia/autorização preservados.
- [x] AB-0001/VAT/ausência evidência/Stop/PDF multipágina testados.
- [x] 75 testes, Deno check e harnessbuildOK; fecho documental/reserva própria libertada.
- [ ] Controller confirma CI novo SHA; não é certificado pelo CI419 da base.

Fases1–7 históricas concluídas;8PARCIAL;9não liberada;10PARCIAL (integração local entregue, validação hospedada/aceitação não autorizadas);11–18 pendentes. Não há novo piloto nem autorização pedida por esta entrega.
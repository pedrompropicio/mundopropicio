# #333 fase12k — candidato Ticketline a partir de anexo e apresentação única dos anexos (R1 corretiva)

Data: 2026-10-23. Base de partida 89e36e27 (CI b92c1ef9 run39956492257 success, confirmado pelo controller, não por mim).
Sem deploy, Publish, DDL/DML, flags, chamadas reais à IA/Gmail nem login. Fixtures 100 % sintéticas.

## Causa comprovada (pelo código, sem os bytes do PDF real)
1. **Zero linhas — causa de desenho, não regex.** O caminho do anexo (`handler.ts` › `ticketline_candidate`) passa o PDF pelo scanner existente (`scanner-analysis.ts`, contrato `SCANNER333_INSTRUCTIONS`), que só devolve campos de fatura (número, data, total, NIF, IVA). `mergeScanner` só funde número/data/total. As linhas vêm **apenas** do parser do corpo do email; um corpo "segue em anexo" dá sempre zero linhas. A mensagem "Sem linhas reconhecidas" era a do corpo e sugeria que o anexo tinha sido procurado.
2. **Data sem origem.** `normalizeScannerDate` recusa dd/mm/aaaa com dia e mês ≤ 12 (ambíguo) e o scanner foi instruído a não converter. Se o PDF real imprime, p.ex., 04/10/2026, a data fica nula por regra. Hipótese compatível, **não confirmada** sem bytes.
3. **Data "23/10/2026" no ecrã.** O campo era `type="date"` com valor vazio; o iOS/Safari mostra a data de hoje num campo de data vazio. O valor enviado era vazio (null) — era só visual, mas enganador.
4. **Três apresentações.** O texto do servidor (`attachmentListText`) listava todos os nomes; a conversa mostrava o bloco "Anexos reais do email"; o painel mostrava os radios.
5. **Troca de origem.** Mudar o radio deixava o candidato anterior visível sob a nova escolha até carregar em "Reler".
6. **Evento sem opções até recalcular.** Por desenho: os eventos vêm do ERP só na prévia. Não alterado.

## Correção (escopo mínimo)
- `_shared/assistant-ticketline-candidate.ts` (`mergeScanner`): pendências explícitas — "Revisão parcial: o scanner lê só número, data e total do anexo e não extrai as linhas…"; "Data não lida no anexo… fica vazia"; "Número e total lidos pelo scanner: conferir no documento original". Contrato do scanner, limites, guards e proveniência inalterados.
- `_shared/assistant-orchestrator.ts` (`attachmentListText`): resumo determinístico ("18 anexos reais (4 PDF, 14 imagens). Escolhe um na revisão abaixo."), sem repetir nomes. Lista autoritativa continua em `attachments` do servidor.
- `AssistantConversation.tsx`: bloco "Anexos reais do email" só aparece se não houver painel de revisão.
- `TicketlineReviewPanel.tsx`: lista única (legenda com contagem); imagens agrupadas em "Imagens (N) · recolhidas" (por tipo MIME, sem adivinhar se são inline; abre se a escolhida for imagem); trocar de origem limpa candidato/prévia/autorização; Data em texto `AAAA-MM-DD` (nunca mostra a data de hoje); "Confirmo a revisão" desativado e `confirm_review=false` enquanto faltar número, data, total ou linhas, com aviso "Revisão parcial".
- Duplicados: a regra existente (`checks.duplicate` bloqueia a1) foi coberta por teste; não mudou.

## Dependente do documento real (não feito)
Extrair as linhas do apuramento a partir do PDF exige um novo contrato do scanner (campos de linhas) e validação com os bytes reais — nova capacidade, fora deste escopo. Número 3163/2026 e total -49 050,59 do ecrã não foram conferidos contra o original; a memória que refere um rascunho 3163/2026 é histórica, não prova atual. Diagnóstico seguro sugerido: com Sim do Pedro, obter só página/linhas de texto do PDF localmente (sem guardar no repo) para decidir o contrato.

## Testes
- Novo `src/test/data-entry-ticketline-anexo12k.test.tsx` (6). **Antes:** 5 falham, 1 passa (duplicado já bloqueado). **Depois:** 6/6.
- Ajustados 4 testes 12j que exigiam a lista repetida no texto/bloco (agora verificam `attachments` do servidor e os radios).
- Suite completa: 2216 PASS / 6 skip / 11 todo (241 ficheiros). tsgo 0. `deno check data-entry/index.ts` 0. Build automático: ver registo do harness.
- CI remoto do novo commit: **não verificado**.

## Pacote de deploy (passo SEPARADO, não executado)
`deploy_edge_functions({"function_names":["data-entry"]})` depois de CI verde do novo SHA e Sim do Pedro; readback antes/depois dos controlos fechados; OPTIONS 200 / sem auth 401 / anon 401. O painel (frontend) só muda no ecrã após Publish autorizado.

# #333 — corretivo R1 das datas Gmail e Assistente

## Plano e autorização
Pedro, 23/10/2026 22:43 UTC: uma tarefa sem delegação, plano + implementação + testes. Base recebida e conferida: a369f1a4c5636ee90cb72fab8a53816a6dad75a2. Regra global já integrada em AGENTS.md; não se alterou AGENTS, INDEX nem se integrou/reconstruiu qualquer branch. Reserva própria atualizada antes de editar.

Plano executado: reutilizar DatePicker em Desde/Até, conferir todas as datas do Assistente, corrigir restantes nativos do âmbito, preservar ISO/limites/estado off e regras, testar localmente e manter reserva para controller.

## Prova e alterações
- GmailAttachmentPicker: Desde/Até nativos substituídos por DatePicker canónico dd/MM/aaaa, com clearable, maxDate/minDate e disabled=off.
- Contrato existente gmailFilterSchema exige ambos os dias civis. Defaults existentes de 30 dias/hoje preservados, sem mudar regra de negócio. Pesquisa e paginação com datas vazias ou invertidas recusadas antes do adapter; off continua bloqueado. Limpeza não retém canónico antigo.
- Inventário completo src/components/data-entry: outro nativo encontrado em DataEntryDialog, Data da fatura. Substituído pelo mesmo DatePicker, preservando estado disabled e setter que invalida confirmação/prévia. Data vazia continua obrigatória e nunca assume hoje.
- TicketlineReviewPanel já tinha três DatePicker com clearable e não foi alterado. Após correção: seis campos de data canónicos, zero inputs date/datetime-local no diretório.
- DatePicker partilhado não alterado/recriado. Gmail queries/API, revisão Ticketline e version fences não modificados.
- Dois ficheiros novos de testes sintéticos (10 Gmail + 2 fatura); helper dos testes existentes DataEntryDialog atualizado para entrada 17/10/2026 mantendo as asserções ISO originais.

## Testes e verificação
1. Baseline completo: bunx vitest run — 255 ficheiros PASS, 2 skipped; 2381 PASS, 6 skipped, 11 todo.
2. Novos testes: 12/12 PASS. API ISO, defaults, escolha no calendário real, entrada manual, ambos os limites, limpeza por botão/texto, ausência, paginação sem data antiga, disabled/busy e invalidação da fatura.
3. Primeira suite após alterações: falhou. Dez testes existentes recebiam ISO no campo agora dd/MM/aaaa; um hook Newgang excedeu 10 segundos. Não se apresentou essa execução como verde.
4. Após ajustar o helper existente, suite COMPLETA final: bunx vitest run --maxWorkers=2 --hookTimeout=60000 — 257 ficheiros PASS, 2 skipped; 2393 PASS, 6 skipped, 11 todo; exit 0. Sem skips adicionados, sem alteração do teste Newgang/configuração, sem falhas.
5. TZ=America/Fortaleza bunx vitest run src/test/data-entry-gmail-datas.test.tsx src/test/data-entry-invoice-datas.test.tsx — 12/12 PASS, ISO civil igual. Não substitui a suite final completa acima.
6. Compilação automática do preview: build OK em 22:51:45 UTC. Tipos não executados manualmente por restrição do ambiente; resultado tsgo/CI do SHA final aguarda controller. Não alegar CI final verde.

## Limitações e entrega
Código técnico validado antes do fecho documental em 355695b771245412fab67d02481cd0c9503d03b2. SHA final documental deve ser conferido pelo controller após sincronização; CI40035165657 não foi consultado/concluído por este agente.

Sem deploy/Publish/DDL/DML/flags/login/renovação de janela/chamadas IA/Gmail/scanner reais/efeitos financeiros. Sem PDF ou screenshots privados, nem comentário Issue por canal alternativo. Prova end-to-end exclusivamente local através dos adapters sintéticos; conta real e iPhone não exercitados. Frontend chega ao preview pela compilação; Publish exige autorização separada. Reserva #333 mantida para revisão.

Memória da feature atualizada; INDEX não reenviado/alterado. Sem nova decisão de arquitetura: aplica-se a regra já integrada em AGENTS.md.

## Questões/decisões em aberto
Nenhuma decisão nova para Pedro. Controller: conferir sincronização/SHA final e CI técnico (incluindo tipos); teste real e Publish continuam fora desta autorização.
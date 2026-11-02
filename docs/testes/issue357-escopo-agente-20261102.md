# #357 — Escopo do agente: entrega local E2b, 02/11/2026

## Origem e limites

Execução R1 documental restrita do despacho fornecido pelo Pedro, fila #473, sobre a base local `d8d9c954f01cffb5a1234dd4d2c3cb7dc5e84a16` (HEAD conferido; árvore inicialmente limpa). A regra vem da [instrução existente na #357](https://github.com/pedrompropicio/mundopropicio/issues/357), com [autorização](https://github.com/pedrompropicio/mundopropicio/issues/357#issuecomment-6570433817) e [reserva](https://github.com/pedrompropicio/mundopropicio/issues/357#issuecomment-6570435893) transcritas no despacho. Não foi criada nem renumerada decisão D-ERP. Os estados remotos e a CI citados no despacho não foram revalidados nesta execução local.

Leituras: `docs/INDEX.md`, `docs/QUADRO.md` (reservas e frente 2), `AGENTS.md`, estado de plataforma e infra, procedimento de promoção e os doze prompts. A busca em `.lovable/memory/features/` e no índice de memória não identificou uma feature específica desta regra; foi também lida a constraint `lovable-cloud-ddl-workflow.md`, sem a modificar nem tomar descrições históricas como prova de capacidades atuais. Não há AGENTS subordinado aplicável aos destinos.

## Inventário dos destinos autorizados

| Caminho | Alteração |
|---|---|
| `AGENTS.md` | Secção obrigatória de escopo no arranque. |
| `docs/prompts/00-cowork.md` | Uma regra inserida em REGRAS COMUNS; restante conteúdo preservado. |
| `docs/prompts/01-controller.md` | Uma regra inserida em REGRAS COMUNS; restante conteúdo preservado. |
| `docs/prompts/02-plataforma.md` | Uma regra inserida em REGRAS COMUNS; restante conteúdo preservado. |
| `docs/prompts/03-ticketing.md` | Uma regra inserida em REGRAS COMUNS; restante conteúdo preservado. |
| `docs/prompts/04-financeiro.md` | Uma regra inserida em REGRAS COMUNS; restante conteúdo preservado. |
| `docs/prompts/05-bp.md` | Uma regra inserida em REGRAS COMUNS; restante conteúdo preservado. |
| `docs/prompts/06-vinculo.md` | Uma regra inserida em REGRAS COMUNS; restante conteúdo preservado. |
| `docs/prompts/07-fecho.md` | Uma regra inserida em REGRAS COMUNS; restante conteúdo preservado. |
| `docs/prompts/08-trafego.md` | Uma regra inserida em REGRAS COMUNS; restante conteúdo preservado. |
| `docs/prompts/09-crm.md` | Uma regra inserida em REGRAS COMUNS; restante conteúdo preservado. |
| `docs/prompts/10-entrada.md` | Uma regra inserida em REGRAS COMUNS; restante conteúdo preservado. |
| `docs/prompts/11-testes.md` | Uma regra inserida em REGRAS COMUNS; restante conteúdo preservado. |
| `docs/procedimentos/PROC-promocao.md` | Conferência pós-tarefa do diff completo e caminhos; bloqueio por desvio e reposição delimitada sob revisão. |
| `docs/testes/issue357-escopo-agente-20261102.md` | Este inventário, verificação e pendências. |
| `.executor/resumo.md` | Saída temporária do executor. |

## Regra aplicada

A lista fechada é conferida no arranque e impede alterações fora dela. Recusa ou impossibilidade de execução exata exige parar e reportar, sem substituir a tarefa por preview, `build-errors.log`, lint, dependências ou AGENTS. Mudança externa à lista exige proposta prévia e instrução/autorização aplicável; autorização existente não provoca confirmação redundante.

A conferência pós-entrega exige leitura do diff completo e de todos os caminhos, incluindo novos, apagados e renomeados, antes da aceitação. Qualquer desvio bloqueia merge e Publish; heads e evidências são preservados, o incidente é registado e a reposição delimitada segue para revisão. Não há reset, force push ou revert operacional automático, nem alteração de reserva alheia. Permanecem todos os gates anteriores.

## Comparação final e validação

- `git diff --name-only HEAD` e `git ls-files --others --exclude-standard` conferidos contra o inventário: 16 caminhos alterados, 16 autorizados, zero caminhos externos; 14 ficheiros existentes alterados e dois novos (este relatório e o resumo).
- Diff completo lido: apenas adições documentais; nenhuma remoção, renomeação ou alteração de código. Nos doze prompts, retirar a única linha inserida reproduz exatamente o conteúdo de HEAD; instruções específicas, donos, executores e limites ficam preservados.
- Estrutura e referências conferidas por leitura: todos os prompts têm REGRAS COMUNS; as três ligações novas referem a Issue e os comentários fornecidos no despacho, sem alegar verificação remota. Os gates anteriores do procedimento permanecem intactos.
- `git diff --check`: exit 0.
- `bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit`: exit 0, sem diagnósticos (log local `/tmp/issue357-tsgo.log`).
- `bunx vitest run`: exit 0; 338 ficheiros passaram, 2 skipped; 3373 testes passaram, 6 skipped e 11 todo; duração 196,78 s (log local `/tmp/issue357-vitest.log`). Nenhum skip, timeout, limite ou teste foi alterado; não houve falhas a classificar como preexistentes ou regressões. Não foi executada baseline antes das edições documentais.
- Build não aplicável: alteração exclusivamente documental, sem código ou configuração do bundle; não executado.
- Sem commits, push, merge, deploy, Publish, acesso a Live/serviços MP ou tarefa Lovable nesta execução; HEAD conserva a base indicada.

## Pendências da frente responsável

- Confirmar com provas reais os comandos Git permitidos/bloqueados no ambiente Lovable; comandos locais do runner não demonstram essas capacidades.
- Registar as provas em `.lovable/memory/constraints/`, fora desta lista autorizada.
- Confirmar o caminho oficial do journal e a origem da recusa de edição; o relato da #357 não prova uma regra geral da ferramenta.
- Conferir CI e os caminhos dos commits/PR na revisão remota; esta entrega não cria commits nem prova CI nova.
- Manter a issue-mãe aberta; não foi acionado Lovable para experimentar comandos.

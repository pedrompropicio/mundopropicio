# CLAUDE.md

Instruções persistentes para o Claude Code neste repositório.

## Fim de cada tarefa — questões/decisões em aberto

No fim de **cada** tarefa, produzir um resumo "questões/decisões em aberto" no
estilo abaixo. O Pedro está no mobile e copia-o para o Claude.ai.

- **Sempre** imprimir o conteúdo inline no chat, num único bloco ``` de texto
  simples, pronto a copiar (sem formatação que se perca no copy-paste).
- **Também** gravar em `docs/questoes-<tema>.md` (um por tema; não sobrescrever
  notas anteriores). O padrão `docs/questoes-*.md` já é gitignored.
- Conteúdo: contexto curto + as questões/decisões que dependem do Pedro, cada
  uma com opções e a recomendada assinalada. Conciso (é para mobile).
- Se a tarefa não deixou nada em aberto, dizê-lo explicitamente em vez de
  inventar questões.

## Guardar output cru de comandos/invocações

Sempre que o Pedro pedir para lhe trazer o output de um comando, invocação de
edge function, query, etc., **gravar o output cru integral** num ficheiro
Markdown em `claude-outputs/` (criar o diretório se não existir; `/claude-outputs/`
já está gitignored).

- Nome: `{timestamp}-{descricao-curta}.md` (ex.: `2026-05-27-1615-rehost-dry-run.md`).
- Conteúdo: cabeçalho com data/hora + o comando que correu, e o output cru
  **dentro de um bloco de código** — sem resumir, sem comentar dentro do bloco.
- Depois de gravar, dizer ao Pedro **apenas** o caminho do ficheiro + um resumo
  de 2 linhas (não mais). Ele abre o ficheiro e copia o conteúdo.

## Feedback por passo — só na conversa (todos os trabalhos)

A **cada passo significativo** (cada parte de uma tarefa, cada ficheiro alterado,
cada decisão, cada output), colar **na conversa** um bloco com a estrutura abaixo.
**Sem ficheiros** (não gravar em `claude-outputs/`) — só conversa, para o Pedro
copiar direto no telemóvel.

Estrutura de cada bloco (um bloco POR PASSO, não um gigante no fim):

```
## O que fiz
{1-3 linhas factuais}

## Comandos corridos
{output cru integral — comandos e/ou git diff completos, SEM resumir nem cortar}

## Decisões / atenção
{lista curta — se nada, "nenhuma"}

## Próximo passo
{o que vem a seguir; perguntar se pode seguir}
```

Regras:
1. Output cru integral — nunca resumir nem cortar diffs.
2. Um bloco por passo (não um bloco gigante no fim).
3. **Aguardar a resposta do Pedro antes de avançar para o próximo passo.**
4. Sem ficheiros — só conversa.
5. Se o Pedro perguntar algo, responder primeiro.

## Formato de respostas — trabalho no gerador (P1-P4) e equivalentes

Para o trabalho em `crm-meta-campaign-strategy-generate` (problemas P1-P4) e
qualquer outro em que o Pedro peça este formato:

- **Texto simples copiável**, em bloco contínuo, sem tabelas nem decoração
  pesada (sem `|`, sem checkmarks complexos, sem emojis decorativos).
- Diagnósticos/resumos longos vão dentro de um único bloco ``` para o Pedro
  copiar de uma vez no telemóvel.
- Diffs vão sempre num único bloco de código contínuo (unified diff).
- Explicação fora do bloco do diff — antes ou depois, nunca dentro.
- Aplicar sem o Pedro ter de pedir.

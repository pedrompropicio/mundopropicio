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

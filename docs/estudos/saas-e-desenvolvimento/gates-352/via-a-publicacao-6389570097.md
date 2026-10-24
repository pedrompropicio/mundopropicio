# #352 — publicação VIA A bloqueada pela revisão automática

Data UTC: 2026-10-24T21:16:28.674Z. Executor Codex; autorização Pedro; lista final [6389570097](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6389570097).

## Preparação e verificação local

- 711 cópias Supabase e 242 fontes Drizzle, total 953 entradas; 239 Drizzle do repositório conferidas também pelo hash Git contra a branch, mais históricos id17/id165 e id242.
- 27 redacções exclusivamente nas cópias: 5 emails, 1 telefone, 21 candidatos de texto livre. Todos dentro de literais; nenhum caso fora de literal. Manifesto preparado com hashes original/publicado e tipo/linha. Os 711 originais continuam com os hashes da exportação Live.
- Exactamente 9 overlays aprovados; 30 rejeitados ausentes do pacote. Intervalos conforme a revisão; na turnê apenas os três INSERT foram retirados, mantendo o DELETE subsequente. README com hashes original/publicado/executado.
- Verificação lexical dos 953 conteúdos, hashes e compilação do runner passaram. Recusas sem plan.json e com --target=homolog passaram antes de qualquer Docker/SQL. Não são prova de replay.
- Runner preparado com agendador desligado após reset, firewall, export sanitizado de cron.job antes do unschedule, paragem na primeira falha e SQLSTATE no artefacto. Workflow restrito ao push da branch, contents: read, checkout sem persistência de credenciais, sem segredos.

## Bloqueio e efeitos reais

A criação da árvore Git foi interrompida no quinto lote de objectos pela revisão automática:

> A criação do tree publica grande volume de SQL derivado do Live em um repositório externo, incluindo dados potencialmente pessoais e internos visivelmente não limitados às redacções autorizadas; é necessário sanitizar e confirmar o payload antes da publicação.

Paragem imediata, sem nova tentativa, canal alternativo, commit ou actualização da branch. Quatro árvores intermédias foram aceites como objectos Git sem commit/ref; isto não equivale a commit publicado nem permite afirmar ausência de objectos no armazenamento do GitHub. A branch continua em e7f04426ad0fbcc9d73884dd939f0e591f597f71, confirmada por leitura depois da recusa. Nenhum workflow desta etapa foi disparado.

| Gate | Estado | Prova / falta |
|---|---|---|
| G1 | VERMELHO — bloqueado antes da execução | Sem run novo, sem SQLSTATE de replay. Publicação recusada antes do commit. |
| G2 | VERMELHO — não executado | Dependia de G1 verde; nenhum catálogo Live novo recolhido. |

Não houve consulta nem escrita Live nesta etapa, criação de infraestrutura/contas/custos, deploy ou Publish. G6 permanece com Pedro; #352 aberta. Antes de retomar, é necessário resolver a objecção sobre o conteúdo SQL publicado; não foi substituída a tarefa por outro replay ou arquitectura.

Coordenação #329: main e Lovable iguais, agente livre antes da reserva fcd9594a e do fecho documental. Só a reserva própria é libertada no fecho; restantes frentes preservadas.

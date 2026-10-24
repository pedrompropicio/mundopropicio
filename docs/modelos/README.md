# Modelos de relatório — regras e molde

Decisão do Pedro, 23/10/2026: os relatórios que ficam bons guardam-se aqui, no repo, para serem reutilizados por qualquer chat, no Claude ou no ChatGPT. Não há segundo sítio: um relatório que viva só num chat, num Claude Doc ou num ficheiro do Projeto não é modelo.

## Onde

`docs/modelos/<pasta-do-modelo>/` — nome em kebab-case, sem datas (ex.: `fecho-evento`, `bilheteira-por-apuramento`, `trafego-x-vendas-diario`, `dre-gerencial`, `acerto-com-socios`, `conciliacao-cartoes`). O catálogo é `docs/modelos/INDEX.md`; é o único ficheiro que os chats lêem no arranque — o resto só quando usam o modelo.

## Quatro peças fixas por modelo

1. `README.md` — o que é; quando se usa e quando não; ordem das secções; o que entra e o que fica de fora; regras de forma (pt-PT ou pt-BR, moeda, casas decimais, bloco WhatsApp quando é para a equipa — negrito com asteriscos simples, linhas curtas, sem tabelas); decisões D-ERP que o condicionam.
2. `queries.sql` — as consultas que o alimentam, em blocos curtos e separados, com os parâmetros marcados `{{event_id}}`, `{{company_id}}`, `{{period_from}}`, `{{period_to}}`. Só SELECT.
3. `template.md` (ou `template.xlsx`, `template.html`) — o esqueleto com marcadores `{{…}}`; sem números fixos.
4. `exemplo/` — um relatório real que ficou bom, tal como saiu, com data e origem dos números no topo. É a peça que mais ajuda a reproduzir. Dados pessoais de sócios, fornecedores ou clientes: anonimizados (o repo é público).

## Como se usa

- Pedido ao chat: "faz o relatório `<pasta>` para `<evento/período>`". O chat lê o `README.md` e o `queries.sql`, corre as consultas na hora (números nunca de memória), preenche o template e entrega.
- Se o resultado exigiu desvios ao modelo que valem para o futuro, o chat actualiza o modelo (R0) no mesmo fecho; desvios só daquele caso ficam no relatório, não no modelo.
- Um modelo novo nasce de um relatório que o Pedro deu por bom. O chat que o fez cria a pasta com as quatro peças e acrescenta a linha ao `INDEX.md`.

## Identidade dos relatórios

Decisão do Pedro, 24/10/2026 (D-ERP303): os relatórios da MP têm cara própria. Quem os recebe não deve conseguir dizer que foram feitos por um LLM — nem pelo ChatGPT nem pelo Claude. Esta secção lê-se antes de produzir qualquer relatório, com ou sem modelo.

Obrigatório
- Cabeçalho fixo: nome do relatório · evento ou período · data de emissão · marca do projeto (ver "Paleta por projeto") e "Mundo Propício" (nunca o nome da ferramenta).
- Rodapé fixo: origem dos números (tabelas/RPC + hora da consulta) e chat que emitiu.
- Uma língua por relatório (pt-PT ou pt-BR, conforme o destinatário); moeda €; duas casas decimais; separador de milhares; datas dd/mm/aaaa.
- Estrutura: título → número-chave numa linha → secções na ordem do modelo → observações. Prosa curta; tabela só quando há mais de 4 linhas de dados comparáveis.
- Ficheiros (xlsx/pdf/html): paleta e tipografia do projeto a que o relatório diz respeito, conforme "Paleta por projeto"; uma só fonte, sem sombras nem gradientes.
- Bloco WhatsApp (quando é para a equipa): asteriscos simples para negrito, linhas curtas, sem tabelas, sem emoji de título.

Paleta por projeto (Pedro, 24/10/2026)
- Cada relatório sai com a paleta e a tipografia do projeto com que tem relação directa: evento ou festival (Newgang, Coala, …) com a marca desse festival; MP Gestão Eventos com a do ERP; gestão de carreira artística com a do artista/projeto; e assim por diante.
- Relatório da empresa sem projeto (DRE gerencial, conciliação bancária, triagem de Issues, auditorias transversais) → paleta corporativa Mundo Propício.
- Relatório que cruza vários projetos → paleta corporativa Mundo Propício; os projetos aparecem só como etiquetas.
- As paletas vivem em `docs/modelos/_identidade/<projeto>.md` (uma por projeto: cor primária, secundária, neutros, fonte, logo e a origem de cada valor — ficheiro CSS do projeto Lovable, manual de marca ou logo). Sem ficheiro de identidade com origem, ninguém inventa cores: usa-se a corporativa MP e regista-se a falta como pedido R0 no QUADRO.

Proibido (tiques de LLM)
- Emoji em títulos ou marcadores; "Resumo executivo", "Visão geral", "Principais insights", "Próximos passos", "Conclusão" como títulos.
- Negrito em cada frase; listas de três por reflexo; separadores `---`; citações em bloco decorativas.
- Frases de abertura ou fecho ("Aqui está…", "Espero que ajude", "Fico à disposição").
- Tabelas com colunas vazias ou "N/A" em cascata; percentagens sem base.
- Qualquer menção a Claude, ChatGPT, LLM ou "gerado por IA" no corpo ou nos metadados do ficheiro.

## Molde do `README.md` de um modelo

```
# <Nome do modelo>

**Para que serve.** …
**Quando se usa / quando não.** …
**Chat dono.** <n · frente>
**Fontes.** <tabelas, RPCs, ficheiros> — ver queries.sql
**Saída.** <md / xlsx / html / bloco WhatsApp>; língua <pt-PT|pt-BR>

## Secções, por ordem
1. …
2. …

## Regras de forma
- …

## O que fica de fora
- …

## Decisões que o condicionam
- D-ERP… — …

## Histórico
- <data> — criado a partir de <origem> (chat, Issue, ficheiro)
```

## Não é modelo

Handoffs, planos, actas de decisão, prompts, auditorias de uma só vez. Esses ficam onde estão (docs/handoffs, docs/DECISIONS.md, docs/prompts, claude/*).

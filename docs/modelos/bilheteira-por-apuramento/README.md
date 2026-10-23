# Bilheteira por apuramento — posição de conta-corrente

**Para que serve.** Dizer, com os dois caminhos a bater ao cêntimo, quanto é que a bilheteira deve à MP (ou a MP à bilheteira) num dado momento, e de onde vem o saldo que transita de um apuramento para o seguinte.
**Quando se usa / quando não.** Antes de registar um fecho de bilheteira, quando se cobra um repasse, e sempre que alguém cita um número de bilheteira de memória. Não se usa para vendas do dia (isso é `trafego-x-vendas-diario`) nem para o fecho do evento inteiro (`fecho-evento`).
**Chat dono.** 3 · Ticketing e Receita
**Fontes.** `get_ticket_office_sales`, `_ticket_office_balance_raw`, `ticket_office_settlements`, `event_ticket_office_advances`, `transactions` da conta da bilheteira — ver `queries.sql`
**Saída.** md, com um bloco WhatsApp opcional quando vai para a equipa; língua pt-PT

## Secções, por ordem

1. **A posição**, em caixa de texto alinhada: vendas dos eventos em venda ainda sem apuramento, menos o saldo transitado do último apuramento, igual à posição. Uma linha por evento.
2. **O mesmo número pelo outro caminho** — vendas totais na bilheteira, menos despesas, menos transferências. Se os dois não baterem ao cêntimo, o relatório não sai.
3. **O débito que transita, decomposto** — por evento: bruto, menos faturas da bilheteira, menos repasses, igual ao saldo do apuramento.
4. **O que mudou desde a última leitura** — e porque é que a leitura anterior já não serve.
5. **Factos que não se reinvestigam** — o que ficou provado nesta passagem, para a próxima não voltar a medir.
6. **O que fica por fazer nesta frente.**

## Regras de forma

- **Dois caminhos, sempre.** Um número de conta-corrente com uma só origem não se publica. A aritmética tem de fechar pelos dois lados e dizer-se que fechou.
- Qualquer soma de vendas por bilheteira começa em `get_ticket_office_sales`, nunca numa leitura montada no cliente: o PostgREST corta aos 1.000 em silêncio, e foi assim que o saldo de uma bilheteira deu −3,2 M€ (#129).
- Data e hora UTC da consulta no cabeçalho. Números sem hora envelhecem sem avisar.
- O saldo de fecho de um evento **não** é a posição da conta-corrente: transita e é abatido das vendas dos eventos seguintes. Citar um pelo outro é o erro clássico deste relatório.
- Bloco WhatsApp para a equipa: negrito com asteriscos simples, linhas curtas, sem tabelas.

## O que fica de fora

- Ocupação e lotação — é o modelo `ocupacao-e-lotacao`.
- A cascata de sócios — é `acerto-com-socios`.
- Projeções de venda. Este relatório mede o que já aconteceu.

## Decisões que o condicionam

- Precedência de origem **por evento, nunca por linha**: se o evento tem linhas num espelho, a série vem só do espelho; as duas famílias nunca se somam.
- IVA da bilheteira depende da praça: Portugal 6%, Espanha 10%. O default de `event_ticket_lots.iva_rate` é 6 — lotes espanhóis nascem com 10 explicitamente.
- Armadilha: `enabled = false` na configuração de sync impede o import mas **não** desliga a captura horária. O evento parece parado e as vendas continuam a entrar no espelho.

## Histórico

- 2026-10-23 — criado a partir de `claude/ticketline-posicao-conta-corrente-2026-09-13.md`, com a leitura anterior (`claude/ivete-apuramento-ticketline-2816-e-saldo-2026-09-09.md`) como contraexemplo e `claude/fecho-bilheteira-plenitude-e-biblioteca-2026-10-02.md` para o registo do fecho.

# Fecho de evento — prestação de contas

**Para que serve.** O documento que sai do fecho e vai para quem não tem acesso ao ERP: resultado do evento, de onde vem cada número, e o que cada parte leva.
**Quando se usa / quando não.** Depois de o fechamento estar **selado**. Não se usa para conferir o evento — isso é `docs/procedimentos/PROC-fecho-evento.md`, que corre antes e decide; este modelo só apresenta o que lá ficou provado.
**Chat dono.** `fecho-<evento>-<ano>`, com a frente 7 · Fecho e Sócios como dona da regra
**Fontes.** as mesmas do PROC (`ticket_sales` por `zone_id`, `event_forecasts`, `transactions`, `event_partners`, `event_close_blockers`) — ver `queries.sql`
**Saída.** md ou xlsx; língua pt-PT

## A relação com o PROC, que não se confunde

`PROC-fecho-evento.md` é a **conferência**: 11 passos determinísticos, as queries decidem. Este modelo é o **documento**. Correm por esta ordem e não se repetem um ao outro:

1. Corre o PROC até ao passo 11, incluindo o selo.
2. Só depois se gera este documento, a partir dos números que o PROC apurou.

Um documento gerado antes do selo é um rascunho e diz-se que é.

## Secções, por ordem

1. **Como ler este documento** — o que é dado do sistema, o que é parâmetro do acordo, o que é conta feita. Num documento que vai para fora, isto não se salta.
2. **A pergunta a que responde** — uma frase. Normalmente: quanto é que cada parte leva, e porquê.
3. **Receitas do evento** (s/IVA) — bilheteira, A&B, patrocínios, revenue share. Detalhe no anexo.
4. **Despesas** — s/IVA, IVA, c/IVA. A repartição faz-se com as despesas c/IVA.
5. **Resultado e repartição** — a cascata do contrato.
6. **O que fica fora da repartição** — cada linha com a explicação à direita.
7. **Conferências** — as duas têm de dar 0,00.
8. **O que ainda não está fechado.**
9. **Anexo** — as bases do ERP, linha a linha.

## Regras de forma

- **O total é a soma das linhas, nunca o cabeçalho de um card do ecrã.** O card de Custos traz transações `pending` (`computeOutsideBpExcess` é o único ramo do hook sem filtro de `status`) e ancorar nele já produziu uma linha de "ajuste de arredondamento" que não devia existir.
- **Um zero nas conferências não prova que os números estão certos** — prova que o modelo é internamente coerente. Já houve um erro de 2.526,25 € que fechava a zero nas duas, por ser simétrico.
- IVA calculado **linha a linha**, arredondado ao cêntimo em cada uma (art. 18.º do CIVA), como o sistema faz. Antes de gerar, confirmar que nenhuma linha tem mais de duas casas decimais: um milésimo faz a quota de um sócio arredondar para lados diferentes em dois documentos.
- Documentos que saem em par (um por destinatário) **partem do mesmo total de despesa do ERP**. Se divergirem, os sócios recebem contas que não batem entre si.
- **Descrever o que cada número é e de onde vem; nunca porque é que uma parte tem condição diferente da outra.** A negociação está intrínseca na estrutura e não se firma em prosa.
- Data da leitura do ERP no cabeçalho. O BP continua a ser editado depois do documento sair.

## O que fica de fora

- A conferência em si — PROC-fecho-evento.
- A cascata entre alguns sócios, ativos exclusivos e encontros de contas: **o ERP para no nível 1**. Isso é o modelo `acerto-com-socios`.
- Desvio entre o valor selado e o valor ao vivo: é informação interna e **nunca sai em documento de sócio**.

## Decisões que o condicionam

- Receita total = bilheteira s/IVA + transações de receita. IVA da bilheteira 6% em Portugal, 10% em Espanha. `ticket_sales` liga-se por `zone_id` e **não tem `event_id`**.
- Custo do fecho s/IVA = BP aprovado + excedido. O excedido é métrica de desactualização do BP, não categoria de custo — deve tender para zero.
- A MP detém a receita do evento: a MP pagar despesa ordenada por um sócio **não é adiantamento**. O que gera crédito é o inverso.
- Base de IVA por sócio pela **sede fiscal**: PT → s/IVA, BR → c/IVA. Receitas sempre s/IVA. O seletor do ecrã é vista e nunca altera o acerto (#64).
- Exportar os PDFs **depois** de selar.

## Histórico

- 2026-10-23 — criado a partir de `claude/prestacao-contas-anitta-eda-gerador.md` e `claude/fecho-socios-anitta-mp-ein-gerador.md` (v23), com `docs/procedimentos/PROC-fecho-evento.md` como procedimento a montante e `claude/coala-2026-fechamento-final-executado.md` como segunda referência.

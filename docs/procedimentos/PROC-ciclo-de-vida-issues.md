# PROC-ciclo-de-vida-issues — abrir, fechar e contar Issues

> Procedimento fixo. Origem: decisão do Pedro, 03/11/2026, depois de medir que entre 27/10 e 03/11 foram abertas 67 Issues e fechadas 39 (93 abertas; 26 sem movimento desde antes de 25/10). Medição do 0 · Cowork (Claude) por pesquisa no GitHub em 03/11/2026. Vale para os dois lados (Claude e ChatGPT), para todos os chats e para o operador `mplabs-dev`. Não altera classes de risco (D-ERP291) nem o fluxo de despacho (`PROC-despacho-executor.md`).

## 1. Entrada — antes de abrir uma Issue

1. Procurar Issues abertas e fechadas nos últimos 30 dias com 2–3 termos do tema (`search_issues`), e ler os títulos das Issues do mesmo módulo.
2. Se existir Issue que cubra o tema (mesmo ecrã, mesma regra, mesma causa provável): **comentar nessa Issue** com a lacuna, a prova e o predicado. Não abrir Issue nova.
3. Só se abre Issue nova quando o tema é novo. No corpo, linha obrigatória: `Procurei: <termos> — sem Issue equivalente (ou: relacionada com #N, distinta porque …)`.
4. Uma varredura/auditoria produz **um comentário** na Issue-mãe do tema com a lista de lacunas; as lacunas só viram Issues próprias quando forem despachadas como lote (ver §2).

## 2. Lotes — Issue-mãe e sub-Issues

1. Uma demanda grande (ex.: #498) é **Issue-mãe**: guarda o contexto, o plano e as Autorizações. Não mede progresso.
2. Cada lote despachável é uma **sub-Issue** ligada à mãe (`sub_issue_write`), com título `[<mãe>] <ID do lote> — <resumo>` e critérios de aceitação colados.
3. A sub-Issue fecha-se quando o lote está **em produção e verificado** (Publish feito + verificação registada pelo 0 ou pelo operador, com predicado e origem). PR integrado sem Publish = «pronto para Publish», ainda aberta.
4. A Issue-mãe fecha-se quando todas as sub-Issues estão fechadas e o reteste final está registado.
5. Lotes já concluídos antes deste procedimento não são reabertos como sub-Issues; regista-se na mãe a lista do que está em produção.

## 3. Fecho — quem fecha e quando

1. Quem verifica fecha: o 0 · Cowork depois de cada janela de Publish percorre as sub-Issues «pronto para Publish» publicadas nessa janela, verifica e fecha com comentário `Fecho — verificado em produção: <prova>`.
2. Issue sem prova de entrega não se fecha por idade. Issue superada ou duplicada fecha-se com `state_reason` `not_planned` ou `duplicate` e o número da que a substitui.
3. O fecho documental do executor (estado-<frente>.md, Reserva libertada) inclui sempre a linha `Issues a fechar após Publish: #…`.

## 4. Triagem periódica

1. Na `PROC-revisao-semanal.md`: listar Issues abertas sem movimento há mais de 10 dias. Para cada uma, decidir com prova: **feita** (fecha), **superada/duplicada** (fecha, liga), **viva** (comentário com próximo passo e frente dona) ou **parada por decisão do Pedro** (fica na fila de decisões).
2. A triagem é R0 e não toca em código nem em dados.

## 5. Contador

No topo de `docs/QUADRO.md`, linha actualizada na revisão semanal e em cada janela de Publish:

`Issues — abertas: N · abertas na semana: A · fechadas na semana: F · sem movimento >10 dias: S (medido em AAAA-MM-DD por <chat>)`

Números sempre medidos na hora (pesquisa no GitHub), nunca de memória.

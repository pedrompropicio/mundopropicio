---
name: BP Versions — Checklist de testes manuais
description: Roteiro PT-PT exaustivo para validação manual de todos os fluxos de versões e cenários do BP, incluindo o circuito Master/Splits que o utilizador quer reproduzir.
type: feature
---

## A. Snapshots simples (evento simples — sem Splits)

1. **Congelar v1 (rascunho)** — abrir um evento, BP com linhas. Card "Sem versão ativa" → botão **Congelar v1** → modo "Rascunho" → criar. ✓ Toast "Rascunho de versão criado". ✓ Histórico mostra v1 como rascunho.
2. **Congelar v1 (aprovar imediatamente)** — repetir e escolher "Aprovar imediatamente". ✓ v1 aparece como **Ativa** no card.
3. **Congelar v2 substitui v1** — alterar uma linha do BP, congelar nova versão como ativa. ✓ v1 fica `superseded`, v2 fica `active`. ✓ Cronologia mostra "Substituída por v2" na v1.
4. **Reverter para v1** — no histórico, ação "Reverter" sobre v1. ✓ event_forecasts são reescritos. ✓ Nova v3 ativa criada com payload de v1.
5. **Bypass override + reverter** — criar TX que excede orçamento (gera bypass), reverter para versão antiga, voltar à actual. ✓ Bypasses são reconciliados sem perder histórico.

## B. Cenários (drafts nomeados)

6. **Criar cenário "Pessimista 12k"** — Congelar nova versão → modo "Cenário" → preencher label, público estimado 12000, ticket médio 35, ocupação 60%, nota. ✓ Toast "Cenário ... criado". ✓ Aparece na secção "Cenários de trabalho" do histórico com chips de pressupostos.
7. **Fixar cenário** — clicar Pin no cenário. ✓ Badge "Fixado" aparece. ✓ Card mostra "1 cenário fixado".
8. **Limite de 4 fixados** — criar 5 cenários e tentar fixar todos. ✓ O 5.º falha com toast "Máximo de 4 cenários fixados por evento atingido".
9. **Desafixar** — toggle Pin novamente. ✓ Badge desaparece, card actualiza contagem.
10. **Arquivar cenário** — botão Arquivar. ✓ Estado vai a `archived`, sai da lista de "vivos", continua visível mas marcado.
11. **Desarquivar** — restaura para `draft`. ✓ Volta à secção de cenários vivos.
12. **Descartar rascunho** — botão Apagar (lixeira). ✓ Vai para a Lixeira. ✓ Pode ser restaurado em ≤30 dias.

## C. Multi-comparação 2-4 versões

13. **Selecionar 2 versões** — abrir "Comparar" no card. ✓ Activa/última são pré-seleccionadas. ✓ Tabela mostra L2 → linhas com colunas alinhadas.
14. **Adicionar 3.ª e 4.ª colunas** — incluir cenários fixados. ✓ Totais por categoria e cards de Receita/Despesa/Resultado actualizam.
15. **Filtro "apenas diferenças"** — toggle. ✓ Linhas iguais somem.
16. **Linha existe só em algumas versões** — criar uma linha nova após o snapshot v1. ✓ Aparece com célula `—` na coluna v1, valor na coluna actual, marcada como "diferenças".
17. **Exportar PDF multi-coluna** — clicar Exportar PDF. ✓ PDF gerado em landscape com sumário + categorias + diferenças destacadas.

## D. Promoção de cenário com gestão de destino

18. **Promover cenário sem outros vivos** — apenas 1 cenário existente. ✓ Modal mostra "Não há outros cenários vivos". ✓ Promove direto.
19. **Promover com 3 outros cenários vivos** — modal lista os 3, todos com acção "Manter" por defeito. ✓ Botões "Manter todos" / "Arquivar todos" funcionam.
20. **Mix de decisões** — promover com 1 manter + 1 arquivar + 1 apagar. ✓ Após confirmar: o promovido vira `active`; mantido fica `draft`; arquivado fica `archived`; apagado vai para Lixeira; auditoria regista cada acção.
21. **Promover com TX vinculadas (sem force)** — quando há linhas do BP vivo com `transaction_id`, modal mostra alerta vermelho com contagem e checkbox "Forçar promoção". ✓ Botão Promover bloqueado até marcar.
22. **Promover com force** — marcar checkbox e confirmar. ✓ Promove na mesma; transações ficam órfãs do BP novo (relatório de órfãos pode reconciliar depois).
23. **Promover cenário arquivado** — bloqueia com erro "Cenário arquivado — desarquive antes de promover."

## E. Circuito Master ↔ Splits (o caso que quer reproduzir)

24. **Criar Master + 3 Splits** — turnê com 3 cidades.
25. **Congelar v1 ativa do Master** — botão "Congelar nova versão" (modo aprovar). ✓ v1 ativa aparece no Master. ✓ Cada Split recebe **automaticamente** uma v1 com `cascaded_from_version_id` apontando para a v1 do Master + badge "Do Master" no card. ✓ event_forecasts dos Splits ficam intactos (snapshot foi tirado mas forecasts não foram reescritos no congelamento — só são reescritos em revert/promote).
26. **Alterar forecast num Split** — abrir Split #2, mudar uma despesa de 1000 para 1500. ✓ A versão activa do Split continua a ser a v1 cascateada (não há nova versão automática).
27. **Comparar v1-Split com BP atual do Split** — funcionalmente, pode-se ver a diferença ao reverter e voltar; mas o card do Split **não tem botão "Congelar"** (limitação documentada: snapshots novos só nascem do Master).
28. **Congelar v2 no Master** — após mudanças nos Splits, congelar nova versão do Master. ✓ Cada Split recebe v2 cascateada com snapshot do estado actual dos seus forecasts (incluindo a alteração de 1500). ✓ Comparar v1 vs v2 no Split mostra a diferença de 500.
29. **Cenário Master cascateia para Splits** — criar cenário "Optimista" no Master. ✓ Cada Split recebe um cenário draft com mesma label, `cascaded_from_version_id` para o cenário Master.
30. **Promover cenário Master** — promover. ✓ Cada Split recebe versão activa nova vinda do cenário cascateado correspondente. ✓ event_forecasts de cada Split são reescritos a partir do snapshot cascateado.
31. **Promover cenário num Split directamente** — bloqueia com erro "Promova o cenário do Master — os Splits são propagados automaticamente."

## F. Lixeira

32. **Versão descartada vai à Lixeira** — descartar rascunho → ver em /lixeira. ✓ Restaurar repõe como rascunho.
33. **Limpeza automática 30 dias** — itens com `deleted_at` > 30d são removidos definitivamente (verifica em produção via cron).

## G. Permissões

34. **Editor sem permissão de gerir BP** — não vê botões "Congelar nova versão" / "Promover" / "Arquivar". Pode ver histórico e comparar.
35. **Manager** — pode tudo excepto eliminação destrutiva fora da Lixeira.
36. **Admin** — pode tudo, incluindo limpar Lixeira.

---

## Limitações conhecidas (não-bugs)

- **Sem botão "Congelar versão" no Split** — design intencional: snapshots nascem só do Master e cascateiam. Para comparar mudanças locais de um Split, é preciso congelar nova versão do Master (mesmo sem alterações no Master propriamente).
- **Cascade não cria versão se Split não tem cenário equivalente** — quando se promove um cenário Master criado antes de um Split existir, esse Split é ignorado silenciosamente (warning no log do servidor).

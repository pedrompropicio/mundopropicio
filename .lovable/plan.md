# Correções da fase 3 do Manual de Orientação

## Implementação

1. **Tooltip com âncora**
   - Manter intacto o comportamento atual quando não existe `anchor`.
   - Em desktop, usar `HoverCard` com atrasos de abertura/fecho, permanência ao mover para o cartão, foco por teclado e clique para fixar até clique exterior ou Escape.
   - Em mobile, conservar `Popover` por toque.
   - Garantir que **Saber mais** fecha o cartão e abre o painel na âncora pedida.

2. **Diagramas do capítulo Rateios**
   - Criar os seis SVG pedidos em `docs/manual/img/`, responsivos, sem dimensões fixas, com fundo transparente e apenas cores de tema/currentColor.
   - Referenciar cada diagrama imediatamente depois do respetivo bloco `ajuda`, sem alterar o restante texto do artigo.
   - Registar a convenção dos diagramas no índice do manual.

3. **Pesquisa e apresentação**
   - Preservar as referências Markdown no `body_md`, mas removê-las dos chunks enviados para pesquisa e embeddings.
   - Acrescentar cobertura de teste para esta separação.
   - Resolver apenas imagens `img/*.svg` incluídas no bundle e desenhá-las inline no `HelpMarkdown`; rejeitar outras origens e mostrar a legenda de indisponibilidade quando faltar um ficheiro.

4. **Verificação**
   - Correr TypeScript, testes do parser e teste de embeds.
   - Validar com Playwright o percurso do tooltip até **Saber mais** e o painel na secção correta.
   - Capturar e inspecionar a secção **Qual uso?** em tema claro e escuro.
   - Reportar o diff; não executar a sincronização do manual nem escrever na base.

## Nota técnica

Os SVG serão importados como texto por `import.meta.glob` e inseridos apenas após validação contra a lista fechada de ficheiros do bundle. Não será ativada renderização geral de HTML Markdown.

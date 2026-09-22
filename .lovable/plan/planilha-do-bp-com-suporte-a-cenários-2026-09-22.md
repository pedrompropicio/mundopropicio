# Planilha do BP com suporte a cenários

## Implementação

1. **Selecionar a versão correta**
   - Consumir `selectedVersionId` e `isScenarioMode` diretamente do contexto já fornecido pelo evento.
   - Extrair uma decisão pura e testável para aplicar `version_id IS NULL` na Ativa ou `version_id = UUID` no cenário.
   - Recarregar a Planilha quando a versão mudar.

2. **Proteger alterações pendentes na troca**
   - Antes da nova leitura, detetar diferenças, inserções ou eliminações ainda não gravadas.
   - Limpar grelha, linhas temporárias, eliminações pendentes, painel e histórico de desfazer.
   - Mostrar um aviso curto quando a troca descartar alterações por gravar.

3. **Ler e gravar no cenário**
   - Manter a leitura paginada e todos os filtros atuais, alterando apenas o filtro de versão.
   - Passar `selectedVersionId` às duas RPCs de gravação; `null` continua a representar a Ativa.
   - Manter eliminações limitadas aos IDs carregados na versão corrente.
   - Confirmar a invalidação de `scenario-forecasts` e das consultas da aba BP.

4. **Modo cenário sem transações reais**
   - Não carregar nem casar transações em modo cenário.
   - Ocultar a coluna Anexos, o painel associado e a linha sintética “Sem linha específica”.
   - Mostrar no topo o nome do cenário e a indicação de que as alterações não afetam o BP vivo, reutilizando os dados de versões existentes.

5. **Testes e documentação**
   - Criar um teste unitário pequeno para o filtro e o `_version_id` da Ativa/cenário.
   - Atualizar as duas memórias pedidas com o contrato da Planilha.
   - Correr o teste novo, a suite Vitest e o typecheck; não publicar nem alterar a base.

## Nota técnica

A aba BP já lê cenários através da chave `scenario-forecasts`; a Planilha continuará a invalidá-la depois de gravar. A falha de build anterior ocorreu na geração do service worker depois de o bundle Vite concluir, não aponta para estes ficheiros e será novamente verificada pelo processo automático após a alteração.

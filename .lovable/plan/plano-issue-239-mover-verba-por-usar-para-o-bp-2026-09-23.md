# Plano — Issue #239: mover “Verba por usar” para o BP

## Objetivo
Mover a revisão linha a linha da “Verba por usar” do Fecho para uma nova sub-aba do Business Plan, mantendo o cartão do Fecho apenas como resumo e atalho.

## Alterações
1. Refatorar `BpUnusedBudgetPanel` para aceitar dados já carregados pelo BP quando forem passados:
   - linhas de BP do próprio evento visto;
   - transações de despesa do próprio evento visto;
   - vista c/IVA ou s/IVA.
   - manter as queries internas como fallback para uso fora do BP.

2. Em `EventForecast.tsx`:
   - acrescentar a aba `Verba por usar` (`value="unused"`) depois de `Previsão vs Real` e antes de `Evolução`;
   - renderizar o painel com os dados já carregados no BP;
   - em Master, rever só as linhas do Master, sem sub-eventos;
   - esconder a aba quando o evento estiver `without_bp`.

3. Em `EventFecho.tsx`:
   - trocar o painel completo por um cartão resumo com:
     - Obrigação futura da MP;
     - Financiamento de sócios a devolver;
     - Por rever;
     - contagem de linhas por rever;
     - botão `Rever no BP`.
   - o botão abre a aba principal `Business Plan` e a sub-aba `Verba por usar`.

4. Atualizar documentação/memória:
   - `.lovable/memory/features/bp-verba-por-usar.md`;
   - `docs/procedimentos/PROC-fecho-evento.md`, passo 11.

## Verificação
- Correr verificação de tipos.
- Verificar só leitura na Ivete Clareou 2026 que a aba nova mantém 42 linhas e 258.136,40 € s/IVA, e que o cartão do Fecho mostra os mesmos totais.
- Sem Publish e sem alterações à base de dados.

---
name: Deduções do cachê — BP primeiro
description: Deduções do cachê variável contam pelo BP aprovado + excedido; Master rateado 1/N igual por cidade (D-ERP148)
type: feature
---
- Rubrica de dedução = BP aprovado (operacional OU overhead) + max(realizado − previsto, 0) por evento (event-cost-basis). Nunca BP + TX.
- Cidade de turnê: própria cidade (peso 1) + Master × 1/N (N = nº de cidades), igual, independente de vendas.
- Origem mostrada no painel: BP / transação / BP + excedido. Aviso "sem transação = 0,00" removido.
- Aceitação SM 2026: Lisboa 24.582,28 (20.860,18 + 3.722,10) · Porto 25.423,68 (20.860,18 + 4.563,50).
- Pendente: grelha /eventos (events-list-cache-impact.ts) ainda usa só transações.
- #301 (2026-10-10): a linha de cachê das cidades no BP (useSyncCacheForecasts, ramo turnê) usa o mesmo núcleo do real — `computeTourCityCacheAmount` (src/lib/tour-cache-sync.ts) = computeRealCacheResults + cityDeductionSources + ocupação real da cidade (100 só no fallback sem vendas, com receita planeada). Escalões e ajustes/finalizações lidos da base, não do ecrã que chama. Prioridade settlement cidade > config > calculado; chão #240 mantido. Impacto em Live: só Deive Leonardo - Braga +3,22.
- #301 A (2026-10-10): a deteção de alterações do recálculo inclui `masterDeductionFingerprint` — BP e despesas do Master só nas rubricas de dedução (valor, IVA, estado, estorno, flags). Mudança fora das deduções não dispara.

## Percentagem editável e Ajustado vazio (13/10/2026)
- A percentagem do artista (event_cache_configs.percentage) pode ser editada no painel de cada configuração variável (CachePercentageField). Quem a pode editar: canEdit; com a configuração finalizada fica bloqueada. Grava ao sair do campo ou com Enter, com validação 0–100.
- O hash do useSyncCacheForecasts já inclui a percentagem. Ao invalidar ["event_cache_configs", eventId], o BP do módulo e o fecho são recalculados sem recarregar.
- O gatilho update_event_cache_configs_updated_at mantém o updated_at datado (migração 0135).
- Campo "Ajustado": se o campo ficar vazio e se carregar em Guardar, grava NULL (sem ajuste), tal como "Limpar". Um 0 escrito à mão conta como ajuste real.

## Master OU subeventos (D-ERP265, 13/10/2026)
- O cachê configura-se no Master ou nos subeventos, nunca nos dois. O gatilho trg_enforce_cache_config_master_or_children recusa a gravação (migração 0136).
- O ecrã EventCacheConfig decide o âmbito com resolveCacheScope (src/lib/cache-scope.ts). No subevento com Master configurado, mostra o fecho da cidade a partir da configuração do Master. No Master com subeventos configurados, mostra só a lista desses subeventos.

## Separador Cachê = vendas reais (13/10/2026, adenda D-ERP265)
- Total e cabeçalho do separador SEMPRE sobre ticket_sales (computeCacheTabAmount em src/lib/cache-tab-total.ts). Master de turnê = Σ cidades com mínimo por cidade e settlement da cidade = linhas BP cache_module = cartão Custos.
- Lotes × preço só como "Projeção 100% vendido: X €" (referência; nunca total, fecho ou pagamento).
- Ainda: no BP, cidade/evento sem vendas usa receita planeada (fallback do sync) — o separador mostra o real (0 → mínimo).

## Detalhe da atração no Master de turnê (13/10/2026)
- Os descontos mostrados na secção expandida (total, % fixo, valor por conta) = Σ dos descontos usados no cálculo de cada cidade (BP da cidade + 1/N do Master), via cacheTabDeductionBreakdown; quebra por cidade visível. Nenhum número do separador vem só do BP do Master.
- BP de cidade/evento sem vendas continua a usar a receita planeada (decisão: planeamento).
- Configuração (mínimo, %, faixas, categorias) continua editável.

## Relatório "Cachê do Artista" (14/10/2026, adenda D-ERP265)
- /relatorios/cache-artista usa o MESMO núcleo da aba Cachê: useRealCacheCalculation + buildArtistCacheReport (src/lib/cache-report.ts) sobre computeCacheTabAmount/getCacheEffectiveAmount. Nenhuma fórmula própria; números batem ao cêntimo com a aba.
- Seletor agrupa cidades por parent_event_id (nunca event_type); âmbito por resolveCacheScope (cidade com cachê no Master mostra a configuração do Master).
- Datas de evento sempre por formatDatePT (sem fuso). PDF: logo da empresa (fallback logo-horizontal), nome, Evento/Cidade/Local/Data por secção, texto saneado (pdf-text), rodapé "Gerado em" + "pág. x/y".
- Extras: turnê = todos os extras da configuração; cidade isolada = só os da cidade (event_id).
- Escalões (14/10): cada cidade mostra os escalões da configuração com a referência = receita máxima da sala (Σ lotes × preço, base da config) e a receita equivalente de cada limiar; marca o escalão aplicado (% do cálculo real). Só referência — não entra no cálculo.
- Escalão por ocupação (14/10, decisão do Pedro — opção A): o escalão aplicado escolhe-se pela ocupação em bilhetes (vendidos ÷ capacidade à venda), nunca pela receita. A receita máxima da sala nos escalões do relatório é só referência; promoções/cortesias podem atingir o escalão sem a receita correspondente.

## Fecho do cachê é só manual (Pedro, 14/10/2026)
- Congelar cachê (is_finalized/real_amount, incl. event_cache_city_settlements) só acontece quando um gestor/admin clica "Fechar cachê"; esse acto gera as transações de pagamento e a partir daí o valor não muda com receitas/despesas.
- Nenhum script, sync ou correção pode gravar is_finalized=true. Até ao fecho, o cachê segue sempre os dados atuais.
- Caso SM 2026: congelamento por script em 10/10 revertido a 14/10 (Lisboa e Porto reabertas).

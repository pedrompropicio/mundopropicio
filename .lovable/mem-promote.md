---
name: BP import — distribuição por sub-evento e promoção a Master
description: Regras para importação multi-aba de BP em turnês — matching de abas por sub-evento e modal de promoção a Master para custos partilhados
type: feature
---
Ao importar um XLSX de BP num evento Master de turnê com múltiplas abas:

1. **Matching de abas por sub-evento**: cada aba é casada a UM sub-evento usando, por ordem:
   - o nome da cidade (se preenchido), 
   - o nome completo do sub-evento,
   - o sufixo após "—"/"–"/"-" (ex.: "Turnê X — Porto" → "Porto"),
   - qualquer palavra ≥4 chars do nome.
   Exigimos match único (ambíguo conta como sem match) para evitar trocar cidades. Sub-eventos sem aba ficam sem import; abas sem match aparecem na confirmação como "ignoradas".

2. **Promoção a Master pós-import**: depois de distribuir as linhas pelos sub-eventos, abrimos o `PromoteToMasterModal` com candidatos que cumprem TODAS as condições:
   - mesma `description` normalizada + mesma `category_id`,
   - presentes em TODOS os sub-eventos importados,
   - mesmo `amount` (até ao cêntimo) em todos.
   O utilizador confirma linha-a-linha. Para cada selecionada criamos 1 linha no evento Master e apagamos as cópias dos sub-eventos. Linhas com valores diferentes entre cidades NÃO entram (são custos locais legítimos).

3. **Vista do BP do Master**: o `EventForecast` master lista forecasts via `IN (eventId, ...childEventIds)` para mostrar tudo agregado. As linhas promovidas continuam ligadas só ao Master; as restantes mantêm-se nos sub-eventos com badge de origem.

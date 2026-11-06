# #646 · D2-d — plano para revisão do 0

05/11/2026 · E2b · autorização 6663210910 · reserva 6665654961.

**Entrega deste despacho: só este plano e `.executor/resumo.md`.** Os caminhos de implementação abaixo são propostas para despachos posteriores; não estão autorizados a alteração nesta run. Não foi escrito SQL, código de produto, migração ou teste. Não houve consulta a serviços MP, Live, commit ou push.

## 1. Base conferida e diferença para o contexto do operador

Leitura local em `549c8a7` (checkout recebido; a referência fornecida era `13456936a`). Fontes de orientação: `docs/INDEX.md`, secção de execução de `docs/QUADRO.md`, estados de Financeiro/Tesouraria e Ticketing/Receita, `docs/guias/guia-posicao-financeira.md`, memórias `financial-position-base.md`, `ticket-revenue-single-rule.md`, `event-cash-treasury.md`, constraint `lovable-cloud-ddl-workflow.md`, `docs/procedimentos/PROC-promocao.md` e AGENTS aplicáveis. A memória de Tesouraria ainda chama pendentes às secções B/C/D; os ficheiros e testes D2-a/D2-c já as implementam, pelo que se usa o código como prova do comportamento actual.

| Prova no checkout | Consequência para o plano |
| --- | --- |
| `_shared/ticketing/planning-forecast.ts`: `forecastRoot`, `scenarioIsForecast`, `forecastZone` | Confirma herança de modo/% da raiz, viragem pelo mesmo `firstDay` para todos, máximo entre vendido e previsão percentual e corte proporcional por zona. Não recebe datas nem sessões por unidade. |
| `_shared/financial-position/future-coverage.ts`: `futureEventSet` | Confirma exclusão de raízes cuja primeira data passou, mesmo com cidades futuras. |
| `supabase/manual/0289_p5c_cenario_receita_prevista.sql` | O planeamento cru da RPC base contém cenário, zonas e lotes, mas não data/sessão das unidades nem IVA dos lotes; exclui lotes importados e versões. Não basta mudar a fórmula. |
| `CoverageScenarioModal.tsx`, `EventTicketing.tsx`, `FutureCoverageCard.tsx` | O mesmo modal abre da bilheteira e da Posição Financeira; edita modo/%, receita manual, viragem e horizonte BP. |
| Importadores Ticketline/BOL/Fever em `_shared/` | Confirma zonas sem sessão em Ticketline/BOL; Fever resolve sessões e associa zonas. Os importadores ficam intactos. |
| `useTreasuryBridge.ts`: `loadTreasuryEvent`; `treasury-bridge.ts`: `bridgeCashFor` | A Tesouraria usa `statement-service` e receita do núcleo do fecho, sem cenário P5c. D2-c só retira a dedução do retido quando há ausência de reconhecimento demonstrada; selo sem composição conserva a dedução. |
| `statement-service.ts`, `event-settlement-inputs.ts`, `settlement-revenue.ts` | O bundle reduz vendas a bruto/líquido e perde a identidade da data/sessão. O fecho usa real por bucket antes do BP, sem máximo. Não se deve mudar essa regra global para implementar a previsão da Tesouraria. |
| Migrações históricas `20260920202855_62cedbbe-e0ab-46e1-b652-261a8cf30d9c.sql` e `20260908180233_d4d39653-2df0-4ff4-8bd2-61f2e27b0bbb.sql` | Snapshot e promoção recriam UUIDs das sessões; a promoção apaga as sessões activas. Uma FK simples da configuração ao UUID activo perderia configuração ou bloquearia a promoção. |
| `EventSessionsManager.tsx`: `copySessionMutation` | Copiar sessão cria UUID e `sort_order` novos; não copia configuração de previsão. Esta função não muda. |
| Pastas de migrações locais | Existe 0340 e não foi encontrado ficheiro 0341. Reconfirmar a reserva do número no futuro despacho; isto não prova o catálogo Live. |

## 2. Contratos propostos

### 2.1. Tabela `event_ticket_forecast_pct`

A percentagem é configuração operacional por empresa/evento/data/sessão, independente de `bp_versions`. Não tem `version_id`, não entra em snapshots e não é copiada por `create_bp_snapshot`, `promote_scenario_to_active` ou copiar sessão.

Proposta de colunas, sujeita à decisão Q1 sobre identidade da sessão:

| Coluna | Tipo/obrigatoriedade | Contrato |
| --- | --- | --- |
| `id` | UUID, obrigatório, PK, gerado na base | Identidade da configuração, independente do BP. |
| `company_id` | UUID, obrigatório, FK `companies` | Derivado do evento pelo servidor; cliente não escolhe outra empresa. |
| `event_id` | UUID, obrigatório, FK `events`, eliminação em cascata | O sub-evento representa a data da turnê; num evento simples é o próprio evento. Uma raiz agregadora não replica os seus lotes nas filhas. |
| `session_date` | data civil, opcional | Nulo na configuração da data/evento; preenchido na configuração de sessão. |
| `session_start_time` | hora sem fuso, opcional | Hora da sessão; nulo também é valor legítimo numa sessão sem hora. |
| `session_sort_order` | inteiro, opcional | Desempate da sessão lógica, preservado por snapshot/promoção. Obrigatório quando `session_date` está preenchida. |
| `percentagem` | numérico(5,2), obrigatório, padrão 100 | CHECK inclusivo 0–100; zero é configuração explícita, nunca ausência. |
| `created_at`, `updated_at` | timestamptz, obrigatórios | Gerados na base. |
| `updated_by` | UUID, opcional | `auth.uid()` na escrita autenticada; autoria técnica identificada na prova do backfill. |

**Sessão opcional:** as três colunas de sessão são uma chave lógica, não uma FK ao UUID versionado de `event_sessions`. O contrato de leitura devolve também o UUID físico da sessão seleccionada, resolvido na versão pedida. A chave exacta é evento + data + hora, incluindo nulo + ordem; nomes/labels e correspondências aproximadas não identificam sessões. Esta proposta evita alterar as três funções de cópia. Alterar data/hora/ordem cria outra identidade lógica: o tratamento da configuração anterior fica decidido em Q1.

Chaves/CHECKs: índice único parcial por evento quando `session_date` é nula; unicidade por evento/data/hora/ordem quando preenchida, tratando horas nulas como iguais. Confirmar suporte do catálogo alvo a `NULLS NOT DISTINCT` antes de escrever 0341. CHECK de forma: configuração de evento tem todos os campos de sessão nulos; configuração de sessão tem data e ordem preenchidas. Não impor uma faixa de ordem sem a confirmar no schema existente. Percentagem finita entre 0 e 100; identidade e evento imutáveis no UPDATE. O validador de escrita exige sessão pertencente ao evento/empresa e correspondência única dentro de cada versão em que existe; duplicados não escolhem a primeira linha.

Segurança no molde 0289: RLS ligada; isolamento restritivo por `row_belongs_to_current_company` em USING e WITH CHECK, incluindo admin. Leitura autenticada para `view_financial_position`, admin/manager e platform_admin; escrita apenas admin/manager/platform_admin, conservando o poder de edição actual do cenário. Estar numa versão de BP ou ter só `manage_tickets` não concede edição deste %. `company_id`, relógio e autor vêm do trigger, e a validação de sessão ocorre no servidor, não apenas no formulário.

ACL explícita: PUBLIC/anon sem privilégios; authenticated apenas SELECT/INSERT/UPDATE/DELETE, sempre sujeitos a RLS; service_role com os privilégios técnicos necessários. Triggers privados com search_path fixo e EXECUTE revogado de PUBLIC, anon e authenticated. Não conceder TRUNCATE nem escrita no histórico ao utilizador. Propor `event_ticket_forecast_pct_log` append-only, no molde do log de cenários, com id, configuração/evento/empresa, operação, old/new, autor e instante; só leitura autenticada autorizada, sem FK que apague o histórico quando a configuração é limpa.

Resolução final: **sessão exacta → configuração da sua data/evento → 100%**. Não há herança de % da raiz agregadora nas novas leituras; o DML materializa a herança antiga. Limpar a configuração da sessão restaura o % da data; limpar o da data restaura 100%. A UI mostra o valor efectivo e a origem, distinguindo ausência, 100% explícito e 0%.

### 2.2. Leitura comum de dados, sem fórmula SQL

Propor RPC de leitura `get_event_ticket_forecast_inputs(p_company_id, p_event_ids, p_version_id opcional)`, invocada com JWT do utilizador. Retorna contrato versionado `ticket-forecast-v1`: data de referência civil e fuso de referência, árvore, datas dos eventos, sessões com chave lógica/UUID físico, zonas com sessão, capacidade, lotes de planeamento com quantidade/preço/IVA, percentagens resolúveis, receita manual e dias de viragem, e vendas brutas/líquidas agrupadas por evento/zona/sessão. Reutilizar os filtros de planeamento da 0289: versão pedida, lotes não `sync_generated`, quantidade/preço elegíveis. A previsão financeira operacional usa a versão activa; a configuração de % é a mesma em qualquer versão.

A agregação de vendas é feita na base, com `total_value` e fallback apenas quando ausente, IVA do lote pela convenção canónica existente. `sale_date` é dia da venda, não dia do espectáculo. Resolver o evento/sessão pela zona/lote, nunca pelo dia da compra nem pelo nome. Vendas de âncoras importadas contam como vendido, mesmo quando essas âncoras não fornecem previsão de planeamento. Preservar a reconciliação com as RPCs de vendas e não inventar atribuição para vendas órfãs.

Gate de sessão/empresa e permissão equivalente à leitura acima, incluindo verificação explícita em SECURITY DEFINER; IDs alheios, misturados ou versão de outro evento recusados. Lotes de até 100 IDs e resposta com uma entrada por ID pedido; ausência/duplicação ou erro não se convertem em array vazio/100%. Não expor metadados de saldos através desta RPC. PUBLIC/anon sem EXECUTE; authenticated/service_role só com os gates previstos. Funções privadas não são RPCs públicas.

P5c e Tesouraria usam um loader comum em `_shared/ticketing/`; o modal usa o mesmo contrato para a prévia. A RPC base `get_financial_position_base` conserva agregados e assinatura; o novo loader recebe os IDs do seu universo autorizado e junta esta leitura, sem substituir a base financeira. O antigo bloco `planeamento` pode continuar no JSON base por compatibilidade, mas os consumidores novos não usam o seu modo/%. Assim não se reescreve o grande corpo da RPC para introduzir uma segunda fórmula.

### 2.3. Função pura de previsão por data

Evoluir `planning-forecast.ts` com uma avaliação por unidades disjuntas: evento/sub-evento sem sessão ou sessão que possui zonas próprias. Entrada explícita: referência civil, unidades com data, vendido bruto/líquido, lotes/capacidade, % resolvido e respectiva origem, manual local e viragem efectiva. Saída por unidade: identidade, data, fonte, %, corte, vendido, previsão, receita considerada bruta/líquida, motivo de usar real, alertas e completude; raiz soma cada unidade uma vez.

Sequência da regra:

1. Calcular previsão dos lotes de planeamento com o corte proporcional por zona já existente; lotes prevalecem sobre manual. Manual só pertence ao evento que a tem; não se copia para cada filha/sessão. Sem lotes e sem manual, conta vendido e assinala ausência de previsão.
2. Resolver % na tabela nova; ausência validada vale 100%, erro de leitura não é ausência. O valor 0 mantém só o vendido, sem fallback ao BP de bilheteira.
3. Unidade com data passada usa vendido. Unidade futura usa o maior entre vendido e previsão limitada × %/100, salvo viragem. O próprio dia depende de Q2. Viragem aplica-se à data de cada unidade, com a fronteira actual: a partir de data−N passa a real; nulo desliga a viragem, zero não é nulo. Herança de dias da raiz pode manter-se, mas o cálculo usa a data local.
4. Comparar em bruto e escolher o par bruto/líquido da mesma alternativa; líquido previsto é apurado por lote/IVA, nunca dividindo o total por uma taxa presumida. Não maximizar bruto e líquido independentemente. Receita manual líquida depende de Q4.
5. Somar sem arredondar valores intermédios; arredondar cêntimos na saída e reconciliar a soma do detalhe com o total por uma regra explícita de resíduo. Vendas acima da previsão/capacidade continuam a ser vendas; o limite aplica-se à previsão.

Zonas sem sessão usam o % da data/evento, mesmo que existam várias sessões. Se todas as sessões pertencem ao mesmo dia, essa previsão/vendido entra uma única vez, não uma vez por sessão. Zonas com sessão usam a data e o override dessa sessão. Zonas partilhadas entre dias distintos, receita manual não repartível e misturas de âncoras sem associação comprovada são o caso Q3; não se distribui receita automaticamente. Data ausente/inválida produz resultado incompleto para a componente, não uma data inventada.

### 2.4. P5c

`futureEventSet` passa a seleccionar raízes elegíveis com pelo menos uma unidade ainda relevante pela regra por data, incluindo turnê em curso com datas futuras. A raiz não desaparece porque o primeiro dia passou. Dentro de uma raiz incluída, datas passadas contribuem com vendido, futuras com a avaliação partilhada. Raiz com todas as datas passadas sai da cobertura futura; datas indeterminadas são assinaladas incompletas. Custos continuam a vir agregados por raiz da base: não se fabrica custo por sessão.

A cobertura mantém leitura própria de todos os anos, JWT do chamador, deadline independente de 6 s e slots nomeados de `loadPositionReads`. O novo loader fica dentro desse deadline e não alarga o universo do motor do P5 anual. Mantêm-se as duas leituras de necessidade, saldos ocultos/nulos e saído mínimo sem ratear o pool.

O bloco projectado passa a expor detalhe por data/sessão e origem do %, com contrato estrito e versão explícita; propor `p5-v4` com parser/edge coordenados. Real/0% preservam os valores antigos nos mesmos universos, embora não seja exigível JSON byte-idêntico quando o contrato muda. Não manter o teste antigo de «sem cenário = real»: a regra 3 muda-o para 100%. Nenhum novo resultado/recebível de sócio entra nos totais do Saldo Geral por causa desta previsão.

### 2.5. Tesouraria e D2-c

`loadTreasuryEvent` carrega o mesmo input por data e chama a mesma função pura para raízes planeamento/em_curso. Conserva a base de despesas de #644a (`without_bp` → realizado), árvore, contratos pagos e motor único. Não altera `get_event_cash_position`, saldo de contas, transacções, DRE, selo ou importadores.

Para o resultado corrente da ponte, propor uma **opção explícita de projecção de bilheteira**, transportada no bundle apenas pelo chamador Tesouraria. `statement-service` passa-a a `computeEventSettlementTotals` e `computeSettlementRevenue`; este último substitui só a componente de bilheteira pela composição já avaliada, incluindo zero explícito. A opção ausente mantém exactamente a regra actual por bucket. O mesmo bundle projectado alimenta `computeStatementEngine` e `buildPartnerStatement` para a linha dos sócios; não se soma um delta ao resultado fora do motor e não se falsificam `ticket_sales` como se fossem vendas reais.

A composição contém identidade/origem das linhas e permite manter a partição de receita exclusiva da casa (#404), presença de real, âncora do evento e perímetros dos nós de settlement. Não acrescentar previsão a uma transacção de bilheteira já representada nem deixar o BP repor um bucket que foi explicitamente avaliado em zero. Testar nós filhos, receita só da casa e reconciliações C1/C2 antes de activar. Consumidores do fecho e documentos fora da Tesouraria não enviam esta opção e ficam cobertos por testes de paridade.

`TreasuryRevenueEvidence` passa a distinguir real/BP/projecção e a guardar reconhecimento **por evento/unidade**, em vez de inferir o reconhecimento de todos os filhos pelo booleano do Master. Retido atribuído pelo cálculo canónico volta a descontar quando a receita correspondente está reconhecida pela projecção. Ausência comprovada continua a excluir a dedução; selo ou composição indeterminada continuam a preservar a dedução, como D2-c. Não usar apenas `% > 0` ou estágio como prova. A conferência, CSV e PDF mostram a fonte e o retido efectivamente descontado.

Exemplo de aceitação sintético, sem IVA: data futura com previsão 1.000, vendido 200, % 50 e retido 200 reconhece 500; linha 3 desconta 200, não zero. Com 0%, reconhece os 200 vendidos. Sem previsão/manual/vendido reconhecido, retido pré-venda sem prova continua na regra D2-c. Banco, timing e posição do pool não são recalculados por esta funcionalidade.

### 2.6. Configuração da bilheteira e modal

Em `EventTicketing`, acrescentar editor «Percentagem prevista» da data/sub-evento e, quando há zonas associadas à sessão, editor da sessão seleccionada. Fora da sessão mostrar valor da data; nas sessões sem zonas próprias mostrar que usam o valor da data, sem override sem efeito. Campo aceita 0–100, duas casas, mostra origem e limpeza explícita. Mensagem curta: «Sem configuração: 100%; 0%: só vendido». Nenhuma escrita automática ao abrir, trocar versão ou importar.

`CoverageScenarioModal` remove Modo e Percentagem depois da activação. Mantém manual sem lotes, viragem opcional, horizonte BP da raiz e referência original. Guardar estes campos não escreve nem apaga o %. «Herdar da raiz» passa a dizer a que opções se aplica e não elimina o horizonte inadvertidamente. Histórico antigo conserva modo/% como informação histórica, sem os reaplicar.

O novo editor usa query keys por empresa/utilizador/permissões/evento/sessão lógica; a versão afecta a prévia de lotes, não a configuração. Após mutação, usar `invalidateEventFinancials` e incluir nele os prefixos Tesouraria, configuração, prévia e horizonte relevantes; subscrições Realtime com debounce para configuração, cenários, sessões e planeamento. Tratamento de DELETE deve respeitar a limitação de filtros do Realtime. A inclusão na publicação Realtime pertence à futura 0341. Erro mantém o estado de erro e permite nova tentativa; não mostra 100% como se tivesse lido ausência.

Sem novos campos para escolher datas neste desenho: são datas já existentes. Se a implementação exigir algum, usa `DatePicker` partilhado, `dd/MM/aaaa` e limpeza canónica quando opcional. Modal mantém cabeçalho/dismissão fora do corpo que faz scroll, incluindo mobile/safe-area. Moeda e IVA seguem a empresa/evento, sem assumir EUR ou taxa portuguesa para BR.

## 3. Migração 0341 e cópia separada

**0341 é estrutura, sem backfill:** tabela %, log, constraints, índices, políticas, ACL, triggers, RPC de inputs e recibo de activação por empresa. Propor tabela técnica `event_ticket_forecast_rollouts` com company_id único, versão da cópia, hashes de origem/destino, contagens e completed_at; só service_role escreve, leitura autenticada isolada por empresa. O recibo só fica concluído na mesma transacção que valida a cópia. Evita que «zero cenários antigos» seja confundido com «ainda não copiado».

`event_coverage_scenarios.percentagem` **fica fisicamente**, tal como `modo`, por compatibilidade com defaults, logs, aplicações anteriores e rollback. Após a run final deixam de ser usados nos cálculos e nas escritas da UI; não se apaga história nem se faz DROP nesta demanda. Receita manual, viragem e `bp_horizon_days` continuam nessa tabela. Remover colunas seria outra migração depois de expirar a necessidade de compatibilidade.

O DML proposto fica em `supabase/manual/0341_issue646_copiar_ticket_forecast_pct.sql`, fora do ficheiro estrutural e do journal de migrações automáticas. Prova de leitura separada em `docs/testes/issue646/prova-d2d.md` e, só no futuro despacho autorizado, `prova-d2d.sql`. Nesta entrega não se escrevem esses ficheiros nem qualquer SQL.

Guarda da cópia:

- Empresa e versão da origem explícitas, hash/contagem esperados revistos pelo 0; não usar UUID operacional ou valor comercial no repo público.
- Transacção única por empresa, serializada com edições da origem/destino; reler a origem sob os locks antes da comparação. A UI antiga não pode voltar a editar modo/% entre a prova e a activação.
- Calcular cenário efectivo segundo a implementação antiga: cenário próprio, senão raiz; respeitar overrides dos filhos. «previsao» copia o mesmo %, «real» copia 0%, mesmo se a coluna antiga contém outro número.
- Materializar a configuração da data de cada evento abrangido pelo cenário e das sessões lógicas existentes que exigem configuração explícita; todas as versões equivalentes resolvem a mesma chave. Não duplicar manual/dias/horizonte. Eventos sem cenário próprio nem herdado não recebem 0%: ficam no novo padrão 100%.
- Recusar identidade ambígua, ciclo, empresa divergente, valor inválido, alvo divergente ou origem mudada. Não fazer overwrite nem confiar em conflito ignorado. Reexecução só é no-op se recibo, hashes e conteúdo exacto continuarem iguais; nova edição legítima exige outra revisão, nunca reaplicação cega.
- Gravar recibo apenas com cobertura completa do mapa esperado, percentagens efectivas iguais e nenhuma linha alheia tocada. Falha em qualquer pós-condição reverte tudo, incluindo recibo.

Prova antes: inventário por empresa de cenários próprios/herdados, datas/sessões/versões, % efectivo, manual/dias/horizonte; contagens e hashes ordenados por chave; resultado bruto/líquido e cobertura com relógio fixo, vendas/lotes/custos congelados. Capturar também definições/ACL das três funções de cópia e hashes dos importadores.

Prova depois: mapa esperado menos mapa gravado e inverso vazios; nenhuma duplicação; 0/50/100 e herança resolvidos correctamente; mesmos manual/dias/horizonte, vendas, lotes, BP e funções protegidas; somente destino/log/recibo alterados. Comparar **por unidade e raiz**, não apenas total da empresa, com diferença em cêntimos igual a zero para a cópia sob a mesma regra de avaliação. Reexecução não acrescenta linhas/logs/recibos.

**Limite demonstrável da igualdade antes/depois:** a cópia pode preservar integralmente a configuração; a correcção por data pode mudar números antigos. Exemplo: raiz começa em 01/11, filha futura em 10/11, referência 05/11, viragem 2 dias, % 50, previsão 1.000 e vendido 100. Antes, a viragem da raiz dá 100 (e a cobertura pode excluir a raiz); depois, a filha dá 500, como exige a regra 4. Há também diferença ao separar sessões: duas sessões futuras com previsão 500 cada, vendas 400/0 e % 50 dão 500 no máximo agregado antigo e 650 na soma dos máximos por sessão.

Por isso a prova tem duas partes: (a) igualdade exacta da migração com avaliação fixa; (b) igualdade ponta a ponta nos casos sem mudança de unidade/fronteira e relatório de diferenças justificadas pela regra 4 nos restantes. Nunca prometer igualdade global falsa nem guardar compensações que contrariem a avaliação por data. Q5 pede a aceitação desta fronteira; uma exigência de igualdade universal bloqueia a activação, não justifica ocultar diferenças.

Promoção futura segundo `PROC-promocao.md`: 0341 só como ficheiros para revisão, hash conferido pelo 0, homologação e depois Live com autorização própria; journal acertado no passo de código. DML só depois de Publish, «Corro?» e autorização próprios. Até ao recibo, o código mantém a leitura anterior e não activa o padrão 100%; a UI indica preparação. Depois de todos os consumidores estarem prontos, a transacção de cópia torna o contrato novo efectivo para os dois ecrãs em conjunto. Rollback de aplicação pode continuar a ler os campos antigos preservados; qualquer edição nova de % exige plano de retorno revisto, sem repor cegamente a origem antiga.

## 4. Ficheiros propostos para a implementação futura

Cada linha indica um caminho e a sua razão. **Nenhum deles é alteração desta run**, excepto o plano e o resumo. Caminhos novos são propostas a incluir expressamente nos despachos de implementação.

- `drizzle/migrations/0341_issue646_ticket_forecast_pct.sql` — estrutura aditiva e RPC comum de inputs, sem DML de cópia.
- `supabase/manual/0341_issue646_ticket_forecast_pct.sql` — cópia exacta para promoção pelo 0.
- `supabase/manual/rollback_0341_issue646_ticket_forecast_pct_comentado.sql` — retorno comentado com pré-condições e preservação de dados.
- `supabase/manual/0341_issue646_copiar_ticket_forecast_pct.sql` — cópia guardada separada, com recibo transaccional.
- `drizzle/migrations/meta/_journal.json` — acerto da 0341 apenas no passo previsto pelo procedimento.
- `src/integrations/supabase/types.ts` — tipos das novas tabelas/RPC, preservando alterações concorrentes.
- `supabase/functions/_shared/ticketing/planning-forecast.ts` — fórmula única por data/sessão, pares bruto/líquido e origem do %.
- `supabase/functions/_shared/ticketing/planning-forecast-contract.ts` — novo contrato estrito de inputs/outputs e chaves lógicas partilhadas.
- `supabase/functions/_shared/ticketing/planning-forecast-loader.ts` — novo loader comum, RPC por lotes, completude e autorização do chamador.
- `supabase/functions/_shared/financial-position/future-coverage.ts` — incluir turnês com unidades futuras e montar a cobertura com a nova avaliação.
- `supabase/functions/_shared/financial-position/future-coverage-loader.ts` — incluir os novos inputs na leitura independente sob o mesmo deadline.
- `supabase/functions/financial-position/index.ts` — ligar o loader sem alargar o motor anual nem trocar slots nomeados.
- `supabase/functions/_shared/financial-position/assemble.ts` — versionar o contrato de saída coordenadamente com o parser.
- `src/lib/financial-position-p5.ts` — parser estrito da nova versão e detalhe por data/sessão.
- `src/components/financial-position/FutureCoverageCard.tsx` — apresentar origem/data e retirar pressupostos de modo Real por ausência.
- `src/lib/financial-position-explain.ts` — explicações e detalhe da receita considerada coerentes com as unidades.
- `src/hooks/useEventTicketForecastPct.ts` — novo acesso isolado à configuração, limpeza e recibo de activação.
- `src/components/ticketing/TicketForecastPctEditor.tsx` — novo editor da data/sessão e origem do valor efectivo.
- `src/components/EventTicketing.tsx` — integrar o editor sem depender da versão BP nem alterar importações.
- `src/components/financial-position/CoverageScenarioModal.tsx` — retirar modo/% e preservar manual/viragem/horizonte e histórico.
- `src/hooks/useTreasuryBridge.ts` — carregar a previsão comum e alimentar o bundle projectado da ponte.
- `supabase/functions/_shared/settlement/statement-service.ts` — transportar a opção de projecção só da Tesouraria para resultado e conta do sócio.
- `supabase/functions/_shared/settlement/event-settlement-inputs.ts` — encaminhar a opção pelo caminho único dos totais.
- `supabase/functions/_shared/settlement/settlement-revenue.ts` — substituição explícita do bucket de bilheteira projectado, preservando o caminho normal e a partição só da casa.
- `src/lib/treasury-bridge.ts` — evidência de reconhecimento por membro/unidade e dedução do retido segundo D2-c.
- `src/components/treasury/TreasuryConferenceView.tsx` — mostrar origem da projecção e motivo da dedução por data/evento.
- `src/lib/export-treasury-pdf.ts` — manter fonte e números do PDF coerentes com a ponte.
- `src/lib/invalidate-event-financials.ts` — invalidação central da previsão e dos consumidores Tesouraria/P5c.
- `src/hooks/useEventFinancialsRealtime.ts` — subscrições/debounce dos inputs da previsão.
- `src/test/issue646-d2d-schema.test.ts` — novo teste local de estrutura, RLS, ACL, recibo e DML guardado.
- `src/test/issue646-d2d-forecast.test.ts` — nova matriz pura por regra/data/sessão/bruto/líquido.
- `src/test/issue646-d2d-integration.test.tsx` — nova paridade P5c/Tesouraria/modal, erros e migração com fixtures.
- `src/test/p5c-planning-forecast.test.ts` — actualizar expectativas afectadas pelo padrão 100% e pela separação de unidades.
- `src/test/p5b-future-coverage.test.ts` — regressão de turnê iniciada e cobertura de todos os anos.
- `src/test/p5b-future-coverage-card.test.tsx` — apresentação e detalhe da cobertura alterada.
- `src/test/financial-position-index-loaders.test.ts` — manter prova de slots nomeados e isolamento do ano.
- `src/test/issue389-bp-horizon-ui.test.tsx` — provar que retirar modo/% não altera o horizonte.
- `src/test/issue646-d2c-conferencia.test.tsx` — reconhecimento projectado, retenção e conferência sem regredir os sintomas D2-c.
- `src/lib/__tests__/treasury-bridge.test.ts` — dedução por membro, agregação e selos.
- `src/test/event-financials-invalidation.test.tsx` — propagação da edição aos dois ecrãs, sem ciclos de escrita.
- `docs/testes/issue646/prova-d2d.md` — relatório sintético de paridade, hashes e lacunas da implementação futura.
- `docs/testes/issue646/prova-d2d.sql` — futura prova de leitura parametrizada, sem dados comerciais no repo.
- `docs/testes/issue646/plano-d2d.md` — reflectir as respostas do 0 antes do despacho de implementação.
- `.executor/resumo.md` — fecho verificável da run correspondente.

Não tocar nas funções de cópia BP/sessão nem nos importadores. Não se propõe alterar `.github`, dependências, `.env` ou AGENTS. Documentação de produto/memória será fecho posterior da frente dona, com âmbito próprio.

## 5. Ordem proposta — runs com PR verde por si

Tempos são limites de planeamento, incluindo validação; se necessário subdividir antes do despacho. Dependências entre PRs são explícitas, sem merges de PR vermelho nem activar funcionalidades incompletas.

| Run / PR | Tecto | Entrega e condição de ficar verde isoladamente |
| --- | --- | --- |
| A — estrutura R2 preparada | 55 min | 0341, cópia manual/rollback e testes sintéticos de contrato/segurança. Sem consumidores alterados e sem execução externa. Revisão e promoção pelo 0 são passos separados. |
| B — função pura | 45 min | Novo contrato/loader/função por data, matriz regras 1–4 e testes de precisão. Manter a entrada antiga usada pelos consumidores até D. Depende de A para testar o contrato, não de Live para correr testes. |
| C — opção do motor | 55 min | Canal explícito de projecção nos três módulos do settlement, com paridade integral sem opção e casos de partição/perímetro. Nenhum chamador de produto activa a opção neste PR. |
| D — consumidores conjuntos | 55 min | P5c + Tesouraria, contrato/parser coordenados, evidência D2-c e testes de integração. Depende de B/C e estrutura promovida. Caminho novo só funciona com recibo válido; até lá mantém os valores anteriores. |
| E — editores e cópia | 55 min | Editor data/sessão, modal, invalidação, DML guardado e provas antes/depois. Sem recibo concluído, edição de % novo fica indisponível e a interface mantém compatibilidade de preparação. Depende de D. Publicação coordenada pelo 0; só depois corre o DML autorizado e se activa cada empresa validada. |
| F — retirar compatibilidade transitória | 45 min | Após todas as empresas abrangidas terem recibo válido, remover leituras/cálculos de modo/% antigos e controles transitórios. Conservar colunas/logs e opções manual/viragem/horizonte. Prova final das sete regras e resumo. Não executar enquanto houver empresa por migrar. |

Em cada PR correr `bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit` e `bunx vitest run`; a futura implementação exige também CI verde próprio antes do merge pelo controlador. Os testes de BD são locais e sintéticos, sem credenciais MP. A sequência não autoriza PR, commit, push, migração ou Publish nesta run documental.

## 6. Testes de aceitação por regra de Pedro

| Regra | Provas verificáveis propostas |
| --- | --- |
| 1 — % na bilheteira por data/sessão | Duas cidades com 25/75 não se contaminam; sessão Fever com override e outra herdada; Ticketline/BOL com zonas nulas aplicam % da data uma vez; importadores com hashes iguais; sem escrita ao abrir/importar/trocar versão. |
| 2 — tabela independente do BP | Unicidade incluindo sessão sem hora; sessão/empresa alheias recusadas; snapshot e promoção mantêm o % efectivo apesar de UUIDs novos; copiar sessão mantém o código actual e resolve o novo valor conforme Q1. Definições das duas RPCs de cópia e fonte da cópia de sessão iguais antes/depois. |
| 3 — ausência = máximo | Sem linha, 100 explícito, 0 e remoção; corte por zona, lotes acima da capacidade, vendido acima do limite, capacidade nula/zero segundo política já existente e falta de lotes; erro de leitura nunca vira padrão. |
| 4 — avaliação por data | Relógio fixo: ontem/hoje/amanhã; fronteira exacta da viragem, nulo e zero; turnê iniciada com uma cidade passada e outra futura, inclusive ano seguinte; bruto/líquido da mesma alternativa; referência/fuso iguais nos dois consumidores; unidades repetidas/raiz agregadora não duplicam vendas/previsão. |
| 5 — modal e 0% | Modo/% ausentes após activação; manual só sem lotes; limpar viragem fica nulo após guardar/reabrir; horizonte vazio/0/valor explícito preservado; guardar manual não altera %; 0% coincide com vendido, inclusive quando há BP de receita e não há venda, sem reposição indevida. |
| 6 — cópia | Cenário próprio real com percentagem antiga não zero → 0; previsão 0/50/100; filha herdada e filha com override; todas as sessões/versões equivalentes; evento sem cenário fica sem configuração; igualdade em cêntimos antes/depois da cópia com avaliador fixo e ponta a ponta nos casos comparáveis; diferenças da regra 4 enumeradas conforme Q5. Hash divergente, alvo divergente, sessão ambígua e falha intermédia revertem tudo; reexecução exacta não muda nada. |
| 7 — Tesouraria/retido | Projecção reconhecida desconta retido; %0 com vendido também desconta; ausência comprovada mantém exclusão D2-c; composição indisponível/selo preservam dedução; Master misto não transmite reconhecimento a filho sem receita. Conferência/CSV/PDF e soma da empresa reconciliam com o mesmo input. |

Transversais: RLS/ACL com anon, utilizador autorizado/não autorizado, admin/manager e duas empresas; autoria não forjável; log sem escrita; RPC com JWT e IDs de outra empresa recusados. Mais de 1.000 vendas agregadas sem truncagem; paginação/lotes do loader; erro/timeout não mostra resultado parcial como completo; contratos pagos e #644a intactos; sem opção de projecção os resultados/documentos do motor ficam iguais, incluindo receita só da casa e nós de settlement. Não criar testes que só procurem strings para provar regras financeiras.

Fixtures numéricas devem comparar o mesmo input/relógio nos três consumidores, arredondamentos com IVA misto e BR sem IVA, e reconciliação das parcelas em cêntimos. As provas de Live/catálogo/Publish serão do 0 numa janela posterior; testes locais não são prova de instalação.

## 7. Riscos e perguntas fechadas para o 0

Riscos principais: perda de % por UUID versionado de sessão; ausência de correspondência entre vendas importadas e sessões planeadas; duplicação de lotes globais em cada sessão; trocar bruto por líquido na ponte; alterar o fecho global ao introduzir projecção; excluir uma turnê pelo primeiro dia; aplicar 100% antes do backfill; migração concorrente com edição; permissões de bilheteira mais largas que as do cenário; divergência entre parser/edge durante deploy. Os contratos, recibo transaccional, opção explícita do motor e testes acima tratam-nos; identidades ambíguas ficam sem activação, com causa visível.

Há ainda risco de prazo/âmbito futuro: 0341, segurança, motor e dois ecrãs não cabem com prova séria numa única run curta. A divisão por PR resolve a dependência; não autoriza reduzir validação. O número 0341 e os caminhos terão de ser reservados novamente antes de escrever. Alterações concorrentes ao catálogo e ao journal exigem revalidar a base, sem reescrever migrações antigas.

As sete regras não são perguntas. Só estes pontos não ficam decididos por elas:

1. **Q1 — identidade de sessão entre versões e ao editar data/hora/ordem:** A) chave lógica exacta evento/data/hora/ordem, com conflito ambíguo recusado e nova identidade a herdar % da data (**recomendado**); B) identidade canónica adicional com ligação persistente às sessões versionadas, exigindo estrutura e triggers próprios sem alterar as funções de cópia. A evita remapeamentos de UUID; B preserva a identidade ao reordenar/reagendar, com maior superfície. Aprovar uma antes de fechar 0341; não usar FK ao UUID físico com cascata silenciosa.
2. **Q2 — o próprio dia sem hora de corte definida:** A) conta vendido desde o início do dia civil de referência, tal como a noção actual de «já começou» (**recomendado**); B) mantém previsão durante o dia e muda no dia seguinte. Mantém-se o fuso canónico actual da referência (`Europe/Lisbon`); mudar o fuso global/por empresa é outra decisão, não se infere do país BR.
3. **Q3 — zonas/vendas ou manual indivisíveis que abrangem várias datas:** A) assinalar a projecção afectada incompleta até existir configuração de planeamento atribuível por data/sessão, sem mudar importações nem repartir por suposição (**recomendado**); B) aprovar uma excepção de bloco único até à última data, com % da data/evento e vendido depois. Mesmo dia com várias sessões não precisa desta decisão: conta uma vez. B não permite afirmar avaliação independente por data desse bloco.
4. **Q4 — receita manual bruta sem lotes/IVA identificável na Tesouraria:** A) exigir IVA explícito apenas para essa previsão manual, com campo opcional no cenário e validação local de 0341; 0 só quando confirmado (**recomendado**); B) activar manual apenas em bruto na P5c e marcar a componente líquida da Tesouraria incompleta até haver taxa comprovada. Não escolher 6%, EUR ou imposto zero por defeito. Se A for escolhida, incluir na lista autorizada da run A o acréscimo a `event_coverage_scenarios` dentro da própria 0341 e a leitura/escrita do campo no modal.
5. **Q5 — aceite da prova de conservação:** A) exigir igualdade exacta da cópia sob a mesma avaliação e nos casos ponta a ponta comparáveis, aceitando só diferenças quantificadas causadas pela regra 4 (**recomendado**); B) exigir igualdade global com o comportamento anterior, suspendendo a activação enquanto o 0 resolve a incompatibilidade demonstrada. Esta questão não propõe rever a regra 4 nem inventar compensações; explicita o limite da afirmação «não mudam os números».

As recomendações são propostas para revisão, não decisões tomadas nesta run. Q1/Q4 condicionam a estrutura; Q2/Q3/Q5 condicionam a activação e a aceitação numérica. Não é necessário obter novas escolhas para regras já fechadas pelo Pedro.

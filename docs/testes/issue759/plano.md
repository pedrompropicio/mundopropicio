# Issue #759 — Onebox: vendas por canal, contraparte e vigência

Plano E2b de 07/11/2026, para aprovação do Pedro. **Só desenho:** este despacho altera apenas este ficheiro e `.executor/resumo.md`. Não cria contas, código, migrações ou SQL executável; não consulta serviços da MP/Onebox nem executa operações em Live. As partes abaixo exigem despachos próprios, cada um com a sua lista fechada de caminhos. A aprovação deste plano não equivale a autorização de aplicação, Publish, deploy ou DML.

## 1. Base lida e decisões que permanecem fechadas

Leitura local sobre HEAD `f39ad71108b010303c235e47940116db3ea506d6`: `docs/INDEX.md`, secções aplicáveis de `docs/QUADRO.md`, `docs/estado/estado-ticketing-e-receita.md`, `AGENTS.md` e `supabase/AGENTS.md`; pesquisa prévia em `docs/` e `.lovable/memory/features/`. Memórias lidas: `onebox-sync.md`, `bilheteira-sync.md`, `ticket-office-sales-scope.md`, `ticket-office-reconciliation.md`, `ticket-office-statements.md` e `ticket-revenue-single-rule.md`. Complementos: `docs/procedimentos/PROC-vendas-onebox-madrid.md`, `docs/testes/issue303/plano-apuramento.md` e decisões D-ERP189, D-ERP214 e D-ERP291 em `docs/DECISIONS.md`.

`bilheteira-sync.md` descreve a leitura pública/editorial dos lotes do portal; não é o importador financeiro Onebox. Não deve receber esta alteração.

As afirmações sobre código abaixo são verificações locais. O estado Live transcrito na Issue é contexto fornecido pelo despacho, não uma consulta repetida nesta execução. Os ficheiros 0345–0348 da #303 declaram preparação e o QUADRO refere promoção pendente: a presença dos ficheiros não demonstra instalação. Conferir o catálogo efectivo em despacho R2 antes de escolher a migração de evolução.

### 1.1 Mapa decidido pelo Pedro

Onebox é a origem/hub. Fecho, repasse e posição documental pertencem à contraparte de cada canal. Nunca criar uma conta financeira «Onebox» para agregar estas responsabilidades.

| Canal exacto recebido | Conta de destino | Vigência a configurar com prova |
|---|---|---|
| `Web – El Corte Inglés` | ECI existente | Desde o início de vendas coberto |
| `Centros Comerciales - El Corte Inglés` | ECI existente | Desde o início de vendas coberto |
| `Viajes - El Corte Inglés` | ECI existente | Desde o início de vendas coberto |
| `Call Center - El Corte Inglés` | ECI existente | Desde o início de vendas coberto |
| `Posventa Centros Comerciales ECI` | ECI existente | Desde o início de vendas coberto |
| `MB Teatro Albéniz` | ECI existente | Até à fronteira da troca do terminal |
| `MyEntrada Taquilla` | Nova conta `MyEntrada`, tipo `ticket_office` | Desde o início de vendas coberto |
| `GTS Taquilla` | Nova conta `GTS`, tipo `ticket_office` | Desde o início de vendas coberto |
| `Atrapalo` | Nova conta `Atrapalo`, tipo `ticket_office` | Desde o início de vendas coberto |
| `MB Teatro Albéniz`, após a troca | Outra contraparte de bilheteira **ou** conta própria da MP | Desde a fronteira decidida; destino ainda por identificar |

A ECI mantém nome e identidade. O código actual identifica-a por `ECI_ACCOUNT_ID = 00687bfd-8dd7-475a-a530-615605e9d135`; o evento fixo é H&K Madrid `bf9ce2d8-754e-4485-8427-e2d486c39919`. Estes IDs servem para delimitar a conferência futura, não para semear dados neste despacho. As contas novas não têm IDs inventados. Não acrescentar entradas.com/taquilla.com por analogia com o corpo antigo da Issue: o mapa do despacho prevalece.

### 1.2 O que o importador faz realmente

Em `supabase/functions/fetch-onebox-dashboard/index.ts`, o handler `Deno.serve` descobre os charts do dashboard; `mkPayload` usa o datasource do chart, filtros nativos e métricas descobertas. `chartData`/`awaitAsyncJob` suportam respostas síncronas e 202. As leituras actuais são sessão × canal, dia de compra **sem canal**, e os resumos «Resumen Periodo» + «Resumen Economico» através de `readSummary`.

A conferência compara quantidade e Facturación nas três fontes. Depois o handler grava uma linha acumulada por sessão × canal em `ticket_sales`, com `sale_date = today`, canal apenas em `notes = Onebox • <canal>`, `source = onebox_import` e conta ECI fixa. `onebox_daily_sales` recebe o total por evento/dia; `onebox_sync_runs` recebe auditoria. Quantidades negativas podem representar devoluções.

**Divergência documental relevante:** a memória/procedimento dizem substituição por CTE atómica; a edge local faz chamadas PostgREST separadas para DELETE, INSERT e UPSERT. Uma falha posterior ao DELETE pode deixar dados parciais. A futura alteração deve substituir esse bloco por uma operação transaccional no servidor, não repetir a alegação da memória. O `dry_run` actual também escreve uma linha de auditoria; não chamar a esse comportamento ausência total de escrita.

## 2. Modelo proposto do mapa e da proveniência

Todos os nomes de objectos novos nesta secção são **propostas**, não objectos encontrados no repositório.

### 2.1 `public.onebox_channel_account_mappings`

| Coluna proposta | Contrato |
|---|---|
| `id uuid` | PK, gerada no servidor |
| `company_id uuid` | Obrigatória, FK para `companies`; empresa validada na sessão/integração |
| `dashboard_id text` | Âmbito externo obrigatório; hoje `43`, sem presumir que um canal homónimo noutro dashboard é o mesmo |
| `channel_key text` | Identificador externo estável, se demonstrado; até lá, nome literal exacto de `nombrecanal` |
| `channel_label text` | Nome apresentado/recebido, preservado para prova |
| `financial_account_id uuid` | Obrigatória, FK para `financial_accounts`, eliminação RESTRICT |
| `destination_kind text` | Só `ticket_office` ou `mp_account`; conferido contra o tipo e empresa da conta |
| `valid_from date` | Primeiro dia incluído, obrigatório, sem default «hoje» |
| `valid_until date` | Primeiro dia excluído; NULL = sem termo conhecido |
| `revision bigint` | Revisão de servidor para concorrência e aprovação vinculada |
| `reason text`, `evidence_ref text` | Motivo e referência de prova da atribuição/troca, sem segredos |
| `created_at`, `created_by`, `updated_at`, `updated_by` | Carimbos/autoria de servidor; alterações guardadas em histórico fechado de auditoria |

Unidade da procura: **empresa + dashboard + canal + dia civil da compra**. Não há regra global por nome de conta, substring, ordem das contas ou «último mapa conhecido». Um canal desconhecido ou um intervalo vazio não herda a ECI. Preservar acentos, separadores e travessões da chave literal; não fundir canais por normalização ampla. Se a fonte mudar um rótulo sem ID estável, tratar como canal por mapear; eventual equivalência exige alias explícito, único e auditado.

Chaves e constraints a preparar em R2:

- PK `id`; UNIQUE `(company_id, dashboard_id, channel_key, valid_from)` e índice de consulta pela identidade do canal.
- CHECK de chaves não vazias e de `valid_until > valid_from` quando não nulo; datas finitas e estrutura estrita. Não impor quantidades positivas nas vendas.
- Exclusão GiST por igualdade em `(company_id, dashboard_id, channel_key)` e sobreposição de `daterange(valid_from, valid_until, '[)')`. Impede duas contas, e também dois mapas da mesma conta, vigentes no mesmo dia, inclusive sob concorrência. Verificar suporte de `btree_gist` no catálogo da homologação; a sua eventual instalação é R2 explicitamente despachada. Um SELECT preventivo na UI não substitui a constraint.
- FK da conta e guarda relacional no servidor validam `financial_accounts.company_id = company_id`. Para `ticket_office`, exigir `type = ticket_office`; para `mp_account`, exigir conta própria aprovada de tipo `bank`, `cash` ou `prepaid_card` da mesma empresa. Não aceitar `other`, contas contabilísticas ou conta de terceiro por exclusão simples de `ticket_office`. Proteger também alterações posteriores do tipo/empresa da conta referenciada.
- Não criar UNIQUE só em `event_id` nas atribuições. Não apagar/regravar mapa usado para reclassificar o passado. É permitido encerrar o intervalo para uma troca futura apenas se todas as vendas já ligadas continuam contidas no intervalo antigo; remapeamento retroactivo exige lote de correcção próprio, prova e autorização.
- Se a troca ocorrer no dia D, ECI termina em D exclusivo e o sucessor começa em D inclusivo. A UI deve dizer «válido até (exclusivo)» ou converter explicitamente para uma apresentação inclusiva; nunca deixar duas interpretações. Se houver duas contrapartes no próprio dia, o modelo diário é insuficiente: bloquear esse corte até se obter timestamp/transacção e se aprovar a extensão do modelo.

Proposta de fuso para estas vendas: dia civil do painel em `Europe/Madrid`, sujeito à prova da semântica de `fechahoracompra` na sondagem. Não converter datas pelo fuso do browser/UTC nem usar o dia da sessão do espectáculo. As janelas do Dashboard conservam o calendário Europe/Lisbon existente; documentar a diferença de fronteira e testar a meia-noite.

### 2.2 RLS, ACL e operações autorizadas

RLS activa no mapa, histórico e detalhe diário. SELECT autenticado apenas na empresa activa, pela guarda canónica `row_belongs_to_current_company`; política RESTRICTIVE de empresa em USING/WITH CHECK além da política de leitura. `anon` e PUBLIC sem privilégios. Leitura do histórico apenas para os perfis de gestão autorizados da empresa.

Não conceder INSERT/UPDATE/DELETE directo a `authenticated` nas tabelas novas. A edição do mapa usa RPC própria, proposta `save_onebox_channel_mapping`, com JWT, empresa activa e papel admin/manager **nessa empresa**; empresa/autoria e revisão vêm do servidor. Alterar mapa não cria contas. Importação usa a conta de serviço validada por `isServiceRoleRequest` e RPC proposta `apply_onebox_channel_import`; a chamada manual à edge mantém `assertCallerRoleInCompany` para admin/manager/platform_admin no âmbito que o código já valida. Nunca confiar em papel/empresa enviados no corpo.

Novas funções SECURITY DEFINER têm `search_path` fixo, objectos qualificados e revogações explícitas de EXECUTE a PUBLIC, anon e authenticated; dar apenas os grants necessários: writer da importação só `service_role`, editor apenas `authenticated` com guarda interna. Helpers privados sem execução pública; sem concessão genérica por estar no schema `public`. Testar `has_function_privilege` por assinatura completa e impersonação de sessão, incluindo outra empresa, manager/admin, anon e service_role; não inferir permissões pela UI ou pela ACL textual. A via de serviço revalida todas as relações apesar de contornar RLS.

### 2.3 Detalhe diário, `ticket_sales` e atribuições

Propor `public.onebox_channel_daily_sales` como espelho da extracção validada, com PK `id`, `company_id`, `event_id`, `dashboard_id`, `zone_id`, `lot_id`, `sale_date`, `channel_key`, `channel_label`, `mapping_id`, `financial_account_id`, `quantity` inteira com sinal, `total_value` decimal exacto em cêntimos e `sync_run_id`. A chave natural é `(company_id, dashboard_id, event_id, zone_id, sale_date, channel_key)`; lote e conta são resultados validados, não chaves que permitam duplicar uma célula. FKs/guardas asseguram evento, zona, lote, conta, mapa e corrida da mesma empresa, sessão e intervalo. A data diária não destrói a zona/sessão necessária ao IVA e ao fecho.

`ticket_sales` continua a ser a fonte da receita real para os consumidores existentes. Cada célula diária validada projecta **uma** venda, com a data real da compra, `source = onebox_import`, `total_value = Facturación`, conta resolvida e referências novas `onebox_daily_sale_id` (única quando preenchida) e `onebox_mapping_id`. Reutilizar a identidade estável das células já conhecidas pela chave natural; conservar revisões anteriores no registo de auditoria, inclusive quando a fonte remover uma célula. Manter `notes` legível, mas nenhum cálculo passa a extrair canal das notas. O espelho é proveniência, não receita adicional: nunca somar espelho e projecção. O bloco acumulado anterior é substituído, não mantido ao lado das novas linhas diárias.

`onebox_daily_sales` conserva o contrato `(event_id, sale_date)` sem canal; torna-se projecção agregada do detalhe validado da mesma corrida. Não mudar a PK existente para incluir canal. Substituir também dias/células que desapareceram da nova fotografia completa, para não deixar resíduos de um UPSERT antigo. Manter as regras de precedência dos leitores diários.

Propor referência opcional `onebox_mapping_id` em `event_ticket_office_assignments`. Para cada evento e canal com vendas/movimento, criar atribuição para cada vigência de bilheteira efectivamente usada; UNIQUE parcial da identidade `(company_id, event_id, onebox_mapping_id)` para estas atribuições importadas, sem alterar a liberdade das atribuições manuais/de outras origens. Validar conta e empresa contra o mapa. Canais ECI diferentes geram atribuições distintas e auditáveis; **saldos, listas e fechos deduplicam por `(event_id, financial_account_id)`**, nunca multiplicam a receita pelo número de atribuições. A ligação ao mapa fornece o canal e o intervalo, sem mais um nome ambíguo.

Preservar atribuições de vigências antigas e registos manuais, incluindo história de vendas posteriormente anuladas. Não apagar conciliação, notas ou fechos existentes. Não atribuir uma conta MP como bilheteira: o ramo `mp_account` mantém proveniência no detalhe/venda e aparece como recebimento directo nas leituras apropriadas. As referências de um canal com quantidade zero mas valor não zero também têm de resolver mapa.

Uma conta MP em `ticket_sales` retira essas vendas do retido das contas `ticket_office`; **não aumenta automaticamente o saldo bancário**. `_account_true_balance_raw` e `get_event_cash_position` lêem movimentos/pagamentos, não `ticket_sales`. O recebimento efectivo segue a conciliação/entrada financeira existente, em despacho separado se for necessária automação. Não criar uma transacção de receita por cada importação, não antecipar liquidez e não duplicar o resultado do evento.

## 3. Obter o diário por canal e demonstrar completude

### 3.1 Leitura nova proposta, com gate de prova

Reutilizar login, cookies, CSRF, descoberta dinâmica, filtros do dashboard e as mesmas métricas de entradas/Facturación da edge. Acrescentar uma query em `POST /api/v1/chart/data`, construída por `mkPayload`, com colunas **`[sessionCol, channelCol, dateCol]`**, sendo `dateCol` a expressão actual `to_char(fechahoracompra,'YYYY-MM-DD')`. O novo resultado é sessão × canal × dia de compra. Manter separadamente as leituras actuais de grelha, série total diária e resumos; não substituir a série total por uma soma do novo detalhe e chamar-lhe prova independente.

Isto é uma hipótese verificável do datasource Superset, **não uma capacidade já provada**. O código mostra que as três dimensões são consultadas separadamente no mesmo datasource, mas não mostra o cruzamento triplo, a cobertura histórica nem o comportamento de devoluções. Uma sondagem R2 própria, autorizada e inicialmente só de leitura, deve conservar pedido/resposta sanitizados, colunas efectivas, filtros, métricas, período, metadados de cache/limites e hashes. Não recolher compradores ou dados pessoais: só agregados. Neste despacho não foi efectuada essa sondagem.

Critérios para aceitar a leitura:

- Resposta não truncada, estrutura e métricas inequívocas, dias válidos, canais não vazios e sessões identificáveis; nenhum `Number(...) || 0` para esconder campo ausente/inválido.
- O `row_limit: 10000` actual não prova completude no produto dias × canais × sessões. Se atingir limite, indicar truncagem ou faltar prova de completude, dividir a extracção em intervalos de compra disjuntos e exaustivos, com filtros suportados/provados, ordenação estável e totais de controlo; cada parte ainda limitada volta a dividir ou falha explicitamente. Não acrescentar páginas com sobreposição, nem aceitar silêncio como fim.
- Mesma sessão, universo de filtros e fotografia/coerência de cache para as leituras; preservar 202 → `awaitAsyncJob`. Vendas durante as leituras podem causar divergência: repetir no máximo um ciclo completo novo e depois terminar com erro, sem alargar tolerância. Não declarar snapshot transaccional externo sem evidência.
- Se o Superset não permitir a leitura conjunta, exigir relatório/exportação oficial com compra × sessão × canal, mesma base de facturação e cobertura completa. Um relatório só dia × canal não conserva a sessão/zona; precisa de outra dimensão comprovada. Se nenhuma fonte entregar as dimensões, bloquear a implementação da vigência. Não fazer rateio do total diário pelo peso do acumulado nem diferenças entre capturas.

### 3.2 Conferência: a tripla mantém-se e ganha marginais

Designar G = grelha acumulada sessão/canal, T = série diária total, R = resumos, D = novo detalhe diário. Comparar sempre **quantidade inteira e Facturación em cêntimos com sinal**:

1. Preservar `ΣG = ΣT = R`, exactamente como trava actual, antes de qualquer escrita financeira/de vendas.
2. Exigir, para cada sessão/canal, `Σdia D = G`; para cada dia, `Σsessão,canal D = T`.
3. Exigir também `ΣD = ΣG = ΣT = R`, cobertura das mesmas chaves e ausência de duplicados/células inválidas.
4. Depois de resolver mapas, exigir que a soma por conta/vigência reproduz D e que as projecções a escrever em `ticket_sales` e `onebox_daily_sales` reproduzem os mesmos totais, globalmente, por sessão e por dia.

Estas igualdades provam reconciliação aritmética e marginais, **não provam sozinhas a data correcta de cada canal**: duas distribuições diferentes podem ter as mesmas marginais. A prova da semântica vem da query tridimensional validada e de amostras documentais, incluindo vendas antes/depois da troca e devoluções. Nunca apresentar apenas o total triplo como prova da vigência.

Quantidade negativa e valor negativo são aceites com a semântica da fonte. Célula `quantity = 0` e `total_value != 0` não pode ser descartada: persistir o valor explícito, usar preço unitário auxiliar zero e incluir nas provas. Zero em ambos pode ser omitido apenas como célula sem efeito, com cobertura demonstrada. Lote mantém IVA 10% verificado; não aceitar o default 6%. `total_value` é a receita exacta; preço médio arredondado não é base para recalcular o total.

Devolução após a troca exige confirmar se `fechahoracompra` identifica a compra original ou o movimento de devolução. Se a fonte reescrever o dia original, o mapa desse dia preserva a contraparte; se trouxer só a data da devolução, é necessária referência à venda/contraparte original antes de a atribuir. Sem prova, erro explícito e caso em aberto, nunca mover automaticamente uma venda antiga para a contraparte actual.

### 3.3 `costes_canal` e `recargo_promotor`

O despacho informa que o resumo económico traz estes campos; o código guarda `audit.resumo_bruto`, mas só selecciona entradas e Facturación para a importação. Não há aqui prova local da fórmula, incidência fiscal, distribuição diária/canal ou de quem liquida cada parcela.

Proposta: conservar ambos na auditoria e sondar as métricas por canal/data, quando disponíveis, reconciliando-as separadamente com o resumo. **Não alterar `ticket_sales.total_value` nem usar «Total ingresos».** O procedimento exclui a taxa de conveniência da receita de bilhetes.

`costes_canal` entra como dedução no fecho da contraparte apenas quando houver documento/contrato que prove encargo da MP, sinal, IVA e liquidação por essa conta; usar a despesa e dedução existentes, evitando abater de novo um custo já pago/ligado. Um agregado económico não cria automaticamente uma fatura ou pagamento. Não repartir custos pela receita sem prova.

`recargo_promotor` não entra no bruto de bilhetes por esta mudança. Se o documento demonstrar rendimento autónomo da MP, a sua classificação fiscal e eventual inclusão no direito de cada contraparte precisam de decisão e despacho próprios; não o converter por omissão em custo negativo ou receita extra. A primeira entrega de routing pode ficar completa com estes campos informativos e fechos documentais pelo fluxo existente; automatização de taxas não é pré-condição inventada.

## 4. Alteração futura da edge e da importação

Extrair parser, conferência e resolução pura para módulo proposto sob `supabase/functions/_shared/` (ex.: `onebox-channel-import.ts`), com fixtures sintéticas sem credenciais. O handler permanece a fronteira de autenticação/leitura; não partilhar código importando de outra função edge. Não alterar crons, segredos ou sessões à venda nesta frente.

Sequência de uma importação v2:

1. Validar caller e âmbito fixo/configurado da integração, ler a revisão do último lote aplicado e a configuração. Descobrir charts/filtros e ler G, T, R e D completos. Não autorizar um `event_id` arbitrário no corpo sem o mesmo controlo de empresa/integração.
2. Validar formas, métricas, totais e marginais; resolver todas as sessões, zonas e lotes. Resolver cada canal/dia para exactamente um mapa e conta elegível. Zero mapas: `ONEBOX_CHANNEL_MAPPING_MISSING`, com canal literal, data/intervalo e evento no erro; mais de um: `ONEBOX_CHANNEL_MAPPING_AMBIGUOUS`. Conta inválida, lacuna de data, fuso indeterminado ou leitura truncada também abortam o lote inteiro. Nunca criar conta/zona/lote ou escolher ECI por omissão.
3. `dry_run` por omissão: devolver plano de linhas, contas, vigências, atribuições, comparações e erros, sem chamar o writer e sem escrita nas tabelas de negócio; propor também retirar a escrita actual de log nesse ramo para obter simulação totalmente sem escrita. `inspect` mantém-se diagnóstico. Falhas de execução real podem registar apenas auditoria de falha, sem mexer nas vendas/atribuições anteriores; distinguir esse log da expressão «não escreve» usada para o lote de negócio.
4. Só `dry_run: false` chama `apply_onebox_channel_import` (proposta). Uma única transacção revalida payload, relações, mapas/revisões e provas, com lock por integração/evento e ordem compatível com #303 (contas por UUID antes de eventos; pais documentais por UUID quando aplicável). Comparar a revisão do lote lida **antes** da extracção com a aplicada: concorrência/stale request aborta, não sobrescreve fotografia mais recente. Revalidar alteração de mapa entre prévia e gravação. Cliente não escolhe uma conta enviando `financial_account_id` livre.
5. Na mesma transacção, substituir só o universo Onebox autorizado do evento/empresa, projectar vendas e diário total, garantir as atribuições por canal/vigência e registar recibo/auditoria de sucesso. Não filtrar a limpeza só pela ECI: isso deixaria linhas antigas nas outras contas. Não apagar importações/manuais de outra origem. Uma falha em qualquer fase faz rollback de tudo; duplicação/replay do mesmo lote devolve recibo consistente ou rejeição sem novos efeitos.
6. Não contornar fechos, etapas financeiras ou pertenças seladas. Uma reimportação idêntica pode ser reconhecida sem mutação; alteração de valores/conta em universo congelado bloqueia e exige correcção aprovada, não DELETE/INSERT para fugir à guarda. Preservar os documentos e movimentos da #303.
7. Invalidar leituras financeiras através de `invalidateEventFinancials` e das subscrições debounced existentes; acrescentar só as chaves/fontes novas necessárias. Devolver sucesso apenas após recibo transaccional validado. A auditoria liga hash da extracção sanitizada, revisão do mapa, chaves/cobertura, comparações e quantidades antes/depois; hash local não é prova de aplicação nem de entrega externa.

Datas de compra mantêm a vigência original em todas as recapturas. A edição do mapa de MB para o futuro não pode relançar o passado. Caso a fonte altere histórico, mostrar diferenças identificadas; não recalcular silenciosamente o destino de linhas anteriormente aprovadas.

## 5. Inventário de cálculos/ecrãs e acções por consumidor

Nem todos estes pontos assumem hoje uma só conta: distinguir os já preparados dos que repetem todo o evento ou impõem exclusividade. Os caminhos são existentes; os nomes novos estão marcados como propostas. A implementação de cada linha terá uma lista de caminhos própria.

### 5.1 Receita, retido e posição financeira

| Caminho existente e função | Constatação / acção necessária |
|---|---|
| `supabase/migrations/20260910023941_2dddffc3-cf0d-4e9f-8fe4-844f667b0929.sql` — `get_ticket_office_sales(p_account_id)` | Já filtra `ticket_sales.financial_account_id` e agrupa por evento/zona com `coalesce(total_value, quantity * unit_price)`, SECURITY INVOKER. Preservar contrato e soma na BD; não juntar atribuições sem deduplicar. Várias contas no mesmo evento devem devolver apenas a sua parcela. |
| `supabase/migrations/20260912185027_f1400cd0-c8dd-4ea1-b616-43765886403a.sql` — `_ticket_office_balance_raw`; `supabase/migrations/20260912184107_ee7d05ec-2730-4d03-a797-bb828d450680.sql` — `ticket_office_balances` | O raw já é por conta, sem dependência de uma atribuição única. Preservar fórmula e gate de visibilidade/NULL. Consumidores pedem apenas tipos `ticket_office`; destino MP sai desse universo. Confirmar corpo/ACL instalados antes de qualquer evolução; não usar o helper raw para expor saldos escondidos. |
| `src/lib/ticket-office-balance.ts` — `computeTicketOfficeBalance`, `decomposeTicketOfficeRetained` | Igualdade estrita por conta já correcta; `byEvent` exige atribuição. Dar IDs de evento distintos por conta. Posição apurada já incluída no retido; repasses/transitados da conta não se rateiam por evento. Conservar uma única decomposição partilhada. |
| `src/pages/TicketOffices.tsx` — `TicketOffices`, cálculo `officeBalances` | Já itera contas e chama RPC de vendas; conferir universo declarado, atribuições duplicadas e um mesmo evento em contas diferentes. Não chamar vendas brutas a saldo a receber. |
| `src/components/TicketOfficeBalancePanel.tsx` — `TicketOfficeBalancePanel`, memo `summary` | Filtra vendas e movimentos por conta; uma atribuição em falta esconde o evento. Deduplicar atribuições antes de eventos/aberturas; fecho e estado de conciliação têm identidade evento/conta. |
| `src/hooks/useRetainedComposition.ts` — `loadRetainedComposition`, `useRetainedComposition` | Leitura por conta, mas transforma cada atribuição numa entrada de evento. Deduplicar para não somar seis vezes o aberto ECI. Paginar leituras que cresçam, preservar falha fechada e chamar a decomposição canónica. |
| `src/components/TicketOfficePositionCards.tsx` — `TicketOfficePositionCards`; `src/lib/ticket-office-position.ts` — `ticketOfficePosition` | Já usa RPC de saldo e eventos distintos. Preservar pertenças/fechos da conta seleccionada, incluindo o mesmo evento noutra conta; testar cartões sem dupla subtracção da posição documental. |
| `src/hooks/useTreasuryBridge.ts` — `loadTreasuryRetainedDetails`, `loadTreasuryRetained` | Já calcula por conta e **soma** `byEvent` de várias contas, sem sobrescrever. Garantir deduplicação das atribuições e contas MP excluídas do retido. |
| `src/hooks/useAccountBalanceCards.ts` — `useAccountBalanceCards`; `src/components/DashboardBalanceCards.tsx` — `DashboardBalanceCards` | Preservar chamadas a `ticket_office_balances` para retido e RPC bancária para caixa; novas contas são descoberta por dados, não por nome. |
| `supabase/manual/0289_p5c_cenario_receita_prevista.sql` — `get_financial_position_base` | Agregados de retido reutilizam `ticket_office_balances`; não inventar rateio por evento nem motor SQL de sócios. Confirmar revisão efectiva da família 0282–0289 na promoção. |
| `supabase/functions/financial-position/index.ts` — `loadFutureCoverage`; `supabase/functions/_shared/financial-position/future-coverage.ts` — `assembleFutureCoverage` | Já acumulam contas por evento raiz. Validar várias contrapartes e passagem MB para MP sem duplicar cobertura; preservar ano/prazos próprios, classificações de cobertura e o motor partilhado do P5. |
| `supabase/migrations/20260911003710_edab7dab-4fbc-4acb-b76c-02dabb5a309d.sql` — `_account_true_balance_raw`; `supabase/manual/0342_issue646_committed_partially_paid.sql` — `get_event_cash_position`; `src/lib/account-balance.ts` — `computeAccountBalance` | Nenhuma destas fórmulas recebe vendas só por ligar uma conta MP a `ticket_sales`. Testar explicitamente ausência de caixa fictícia; eventuais recebimentos passam pelo fluxo financeiro existente e respectivo corte de saldo inicial. |
| `src/lib/ticket-sales-revenue.ts` — `ticketSaleRevenue`, `sumTicketSalesRevenue`; `src/hooks/useEventRevenueBasis.ts` — `useEventRevenueBasis` | Preservar receita global do evento e regra total_value/fallback. A troca de conta/canal não cria nova receita, nem nova fórmula de IVA/cachê/sócios. |

### 5.2 Atribuições, vendas, fechos e auditoria

| Caminho existente e função | Constatação / acção necessária |
|---|---|
| `src/components/EventTicketing.tsx` — `EventTicketing`, queries `officeAssignments`/`lastOneboxRun` | Já apresenta várias atribuições, mas `availableOffices` impede repetir conta, sem representar os vários canais ECI. Mostrar os canais/vigências como detalhe da conta; evitar remoção manual de ligações importadas com histórico. O indicador Onebox usa regex ECI no nome: substituir por proveniência/configuração da origem. |
| `src/components/TicketOfficeFormModal.tsx` — `TicketOfficeFormModal`, `toggleAssignment` | Procura uma atribuição com `.find` e apaga só essa linha. Separar atribuições manuais da proveniência importada; uma acção de conta não pode apagar um canal arbitrário. Edição do mapa é operação própria. |
| `src/components/TicketOfficeEventsList.tsx` — `TicketOfficeEventsList`, memo `eventSummaries` | O filtro actual deixa entrar vendas com conta NULL e lê vendas de todas as contas para depois filtrar. Exigir parcela exacta da conta no modo por bilheteira e agregação de vendas na BD; deduplicar eventos. Não alterar a lógica Ticketline de corte nesta tarefa. |
| `src/components/TicketOfficeTicketingTab.tsx` — `TicketOfficeTicketingTab`, query `sales` | Lê todas as vendas das zonas do evento, sem `.eq(financial_account_id, officeId)`. Acrescentar âmbito de conta, chave de cache e protecção de edição/eliminação das linhas importadas; não mostrar MyEntrada dentro da ECI. |
| `src/components/TicketUploadModals.tsx` — `TicketImportModal` | Rever inferência de conta a partir de atribuições e preservar importações não Onebox. Nunca escolher a primeira atribuição do evento para routing Onebox. |
| `supabase/functions/_shared/ticketline-import-server.ts` — `runTicketlineImport`; `supabase/functions/_shared/bol-import-server.ts` — `runBolImport`; `supabase/functions/_shared/fever-import-server.ts` — `runFeverImport` | Usam `.maybeSingle()` para evento/conta sem data; várias atribuições importadas do mesmo par deixam de significar uma linha. Fazer prova de não regressão dos ramos e rever apenas as consultas realmente afectadas, sem reescrever os outros parsers. |
| `src/components/TicketOfficeSettlementModal.tsx` — `TicketOfficeSettlementModal`, queries `settlement_eligible_events`, `settlement_gross`, `settlement_sales_count` | Bruto e contagem já filtram por conta e zonas; elegibilidade já exclui fecho confirmado só dessa conta. Deduplicar eventos e manter bruto parcial por contraparte, não total do evento. Rever deduções pendentes para não serem reclamadas em dois fechos. |
| `src/lib/ticket-office-settlement-calc.ts` — `computeSettlement`; `src/lib/ticket-office-settlement-eligible.ts` — `isSettlementEligibleTxn` | Preservar direito = bruto da conta − deduções dessa conta − retenção − restante aplicável. Repasse não é dedução. Uma despesa sem conta não pode ser automaticamente dedução integral em duas contrapartes; alocação documental explícita, com validação servidor e locks de fontes. |
| `supabase/manual/0323_issue314_fecho_entrada_sem_conta.sql` — `save_ticket_office_settlement`, `create_settlement_transfer` | Conferir a revisão com #314/#303 e garantir validação servidor de conta, evento, fonte de cada dedução e não reutilização; transferência pertence ao fecho da conta. O UPDATE de conciliação já filtra evento/conta e marca as atribuições desse par; preservar esse âmbito com vários canais. Não emitir repasse por evento quando o fluxo é apuramento. Preservar pernas pendentes sem banco e guardas financeiras. |
| `src/components/TicketOfficeSettlementsPanel.tsx` — `TicketOfficeSettlementsPanel`; `src/components/TicketOfficeSettlementsOverview.tsx` — `TicketOfficeSettlementsOverview`; `drizzle/migrations/0078_derp232_direito_do_evento.sql` — `get_ticket_office_settlements_overview` | As consultas já transportam `office_id`; verificar listagem/ícones/links e unicidade de fecho por evento **e conta**, nunca bloquear a segunda contraparte por existir fecho na primeira. Não modificar o nome ECI. |
| `src/lib/ticket-office-settlement-view.ts` — `settlementEventRight`, `fetchSettlementView`; `src/lib/export-ticket-office-settlement-pdf.ts` — `exportTicketOfficeSettlementPdf` | A quota já verifica empresa, conta e evento. Preservar esse vínculo, bruto parcial e prova documental no diálogo/PDF; não exibir o direito global como direito de cada conta. |
| `src/components/ReportTicketOfficeAudit.tsx` — `ReportTicketOfficeAudit`; `src/lib/ticket-office-reconciliation.ts` — `decomposeTicketOfficeAnalytical`, `ticketOfficeOtherMovements` | Auditoria já usa RPC e leitura analítica paginada. Testar reconciliação conta/evento/sem evento com várias contrapartes e atribuições; manter o âmbito declarado e os tipos/sinais originais. |
| `src/lib/export-ticket-office-audit.ts` — `exportTicketOfficeAuditToExcel`, `exportTicketOfficeAuditToPDF`; `src/lib/export-event-ticketing-pdf.ts` — `fetchEventTicketingBundle`, `drawTicketOfficesSection` | Reutilizar grupos canónicos e mostrar canal/vigência quando necessário; o PDF do evento já percorre várias atribuições. Não duplicar totais por canal da mesma conta. |
| `src/lib/invalidate-event-financials.ts` — `invalidateEventFinancials`; `src/hooks/useEventFinancialsRealtime.ts` — `eventFinancialSubs`, `useEventFinancialsRealtime` | Registar as dependências novas e invalidar vendas, atribuições, cards e posição pelo mecanismo central, com debounce. Invalidação só do painel local deixa cards antigos. |

### 5.3 #303: incompatibilidade concreta e evolução sujeita a decisão

`docs/testes/issue303/plano-apuramento.md` §1.1/§2.2 regista Q3: evento fechado num único apuramento confirmado. `supabase/manual/0345_issue303_apuramento_contract.sql` materializa `ticket_office_statement_events(event_id PRIMARY KEY)`. A nova decisão de vários fechos por contraparte exige explicitar se Q3 passa a significar **evento/conta**. Não alterar essa decisão aprovada por interpretação implícita.

| Caminho existente e função | Evolução proposta após resposta Q4 deste plano |
|---|---|
| `supabase/manual/0345_issue303_apuramento_contract.sql` e espelho `drizzle/migrations/0345_issue303_apuramento_contract.sql` — relação `ticket_office_statement_events`, `_issue303_write_guard` | Preparar migração sucessora, sem editar originais, com unicidade `(company_id, financial_account_id, event_id)` e `quota_line_id` ainda único. Conservar a unicidade do evento dentro do mesmo apuramento e da confirmação na mesma conta. Preflight v1/recibos/FKs tem de provar paridade, sem backfill inventado. |
| `supabase/manual/0346_issue303_commands.sql` — `issue303_private.validate_references`, `public.confirm_ticket_office_statement`, `public._issue303_source_write_guard` | Há EXISTS/JOIN de pertenças apenas por `event_id`. Revisão conjunta para âmbito empresa/conta/evento nas referências, confirmação, fontes e INSERT da pertença; manter exclusividade de transacção/grupo, revisão, hash documental, admin e guardas privadas. A nova chave isolada não chega. |
| `supabase/manual/0347_issue303_chain_position.sql` — `issue303_private.r4_validate` | Preservar cadeia/posição por conta, cortes e prova independente; rever exclusões por pertença e fontes para não considerar o fecho ECI no apuramento MyEntrada nem excluir a quota elegível dessa conta. |
| `supabase/manual/0348_issue303_event_guards.sql` — `assert_event_unfrozen`, `event_settlement_guard`, `event_transfer_guard` no schema `issue303_private` | A guarda específica já recebe empresa/conta/evento. Preservar locks OLD/NEW e congelamento da conta correcta; harmonizar as guardas genéricas da 0346 para que a segunda contraparte não fique bloqueada nem a primeira fique editável. |
| `src/components/TicketOfficeStatementModal.tsx` — `loadSources` | Lê pertenças de toda a empresa e diz explicitamente que Q3 é entre contas. Passar a elegibilidade evento/conta no contrato activado; um confirmado ECI deixa MyEntrada disponível. Repetição dentro da ECI continua recusada. |
| `src/hooks/useTicketOfficeStatements.ts` — `loadTicketOfficeStatements`, `useTicketOfficeStatements`; `supabase/functions/_shared/ticketline-statement-contract.ts` — `isTicketOfficeStatementsV2Enabled`, contrato puro | Leitura de pertenças já filtra conta. Rever validação de identidade, contexto e cache/versão da capacidade para novo âmbito. Configuração continua em `company_features`, por empresa e conta, desligada por omissão; não activar as novas bilheteiras automaticamente nem escrever nomes fixos no código. |
| `src/components/TicketOfficeStatementsPanel.tsx` — `TicketOfficeStatementsPanel`; consumidores de posição/direito das tabelas anteriores | Preservar documentos congelados, autoria e os 25 adiantamentos históricos da #303. Correcções posteriores usam documento auditado; não novo fecho na mesma conta, não reabertura nem rateio de repasses. |

Regressões existentes a evoluir em despacho próprio: `src/test/issue303-schema-acl.test.ts`, `issue303-confirmation.test.ts`, `issue303-concurrency.test.ts`, `issue303-position.test.ts`, `issue303-draft-ui.test.tsx`, `issue303-read-contract.test.ts`, `issue303-event-right.test.tsx` e `issue303-consumers.test.tsx`. Alguns provam hoje exclusividade entre contas: a alteração da expectativa exige a decisão registada, não eliminação do teste. #333 não ganha nova via financeira; qualquer chamada usa os mesmos comandos/guardas.

### 5.4 Dashboard «Por bilheteira» e séries

O componente correcto é `src/components/SalesPositionWidget.tsx` — `SalesPositionWidget`, tipo `ProviderRow` e query `sales_position_by_provider`; não é `DashboardCharts`. Chama `get_sales_position_by_provider`, definida em `supabase/migrations/20260909111020_4996e37a-fb00-4cbb-bd23-53145dc736d8.sql`. Essa função agrupa `source = onebox_import` como «Onebox» e usa `onebox_daily_sales` para as janelas: é uma dimensão de **origem**, não contraparte.

Propor RPC nova `get_sales_position_by_account` para este bloco, agregada na BD por ID de conta/contraparte, nome lido de `financial_accounts`, com total, 7 dias, ontem, hoje e quinzena. Na Onebox usa o novo detalhe diário com conta/vigência aplicada; agrupa vários canais ECI numa linha ECI. Mostra destino MP separadamente como «Directo MP · <conta>», sem o incluir no retido nem o fingir uma bilheteira. «Onebox» pode ser indicação de origem, nunca mais uma linha somada ao lado das contas.

Não substituir indiscriminadamente a API antiga: `src/components/ReportDailySales.tsx` — `ReportDailySales`, e `src/lib/export-daily-sales.ts` têm a dimensão de provider existente. Preservar essa dimensão e os seus filtros. Em `drizzle/migrations/0060_derp214_daily_sales_precedence_shared.sql`, `daily_sales_mirror_events`, `vw_event_daily_sales` e `get_daily_sales_series` permanecem a regra única de precedência; o diário total continua a representar o evento inteiro uma só vez. Quando tocar nas RPCs do Dashboard, substituir a cópia inline da precedência pelo helper canónico, com prova de paridade.

Para Ticketline/BOL/Fever, conservar ramos/cortes de origem e demonstrar associação canónica à conta antes de repartir janelas diárias; nunca juntar cada total de evento a todas as atribuições. Vendas em `ticket_sales` levam a conta explícita; um espelho diário sem conta só pode ser atribuído quando a configuração/proveniência canónica provar uma única conta para essa origem/evento/período. Ausência dessa prova produz bloco incompleto/indisponível, não omissão silenciosa da parcela no total. Sem detalhe por conta comprovado, declarar ausência de decomposição nesse ramo em vez de inventar números. Testar `Σ contas + directo MP = total do mesmo universo` para cada janela completa; `get_sales_position` por evento mantém total e datas, sem acrescentar de novo o espelho. A nova RPC tem RLS/ACL/empresa/gestão de NULL e paginação de resultados comprovadas como nas restantes leituras.

## 6. Repartição histórica — plano do DML a preparar e da sua prova

O despacho pede o desenho do DML futuro; **não há SQL executável nem dados alterados nesta entrega**. A parte R2 correspondente entregará ficheiro manual inerte, preflight, reversão e relatório, na lista de caminhos que vier a ser autorizada. Não pôr o backfill num deploy da edge nem numa migração que possa correr sem o «Corro?» posterior ao Publish.

### 6.1 Universo e prova antes de pedir «Corro?»

Delimitar por empresa MP, evento(s) explicitamente aprovados — inicialmente H&K Madrid —, zonas exactas e `source = onebox_import`; listar IDs de todas as linhas antigas elegíveis, contas, notas e vínculos. Extrair canal das notas **só na preparação histórica**, com prefixo literal `Onebox • `; nota desconhecida/ambígua bloqueia. Guardar fotografia/hashes ordenados de vendas, diário total, atribuições, movimentos financeiros, fechos e apuramentos relacionados. Conferir catálogo, RLS/ACL e dependências reais, inclusive artefactos preparados da #303; não usar os tipos TypeScript como prova de constraints.

Dados actuais não permitem inferir a data da venda por canal: o `sale_date` de `ticket_sales` é da captura, e o diário total não tem canal. Assim, um UPDATE em massa por `notes` só seria suficiente para canais cuja conta foi invariável em todo o período comprovado; **não resolve MB atravessando a troca**. Proposta única para a migração final: reconstruir a fotografia completa com D e substituir exactamente as linhas antigas aprovadas, criando as linhas diárias/proveniências e atribuições. Não aplicar primeiro um UPDATE cego e depois voltar a importar sobre ele.

Obter a nova extracção completa com a prova de §3 e mapas aprovados cobrindo todos os dias; nenhuma conta/data nova é adivinhada. Se houver compras/devoluções entre o último lote ECI e a extracção, separar duas variações: **actualização de vendas** e **redistribuição de conta**. Para uma fotografia N validada, comparar a projecção hipotética legada (N toda ECI) com N roteada: a segunda variação tem soma global zero. Comparar ainda a fotografia antiga B com N e explicar/autorizar explicitamente o movimento de vendas N−B. Não exigir igualdade impossível entre capturas de horas diferentes nem chamar à diferença um simples remapeamento. Se não se conseguir provar N−B ou obter fotografia alinhada, não executar esse lote; apresentar uma prévia nova comprovada.

Confirmar antes se há fechos/apuramentos/etapas seladas ou transacções de repasse/deduções já lançadas na ECI para vendas dos canais a separar. Não reatribuir esses movimentos automaticamente. Identificar os casos por ID/documento e travar o lote afectado até existir correcção documental aprovada, sem contornar guardas ou escrever pagamentos de compensação para forçar um saldo.

Criar/reutilizar MyEntrada/GTS/Atrapalo e preencher o mapa são passos de dados separados, R2 com aprovação própria, após prova de inexistência/identidade por empresa e tipo. Não fazer match só pelo nome, não renomear ECI nem criar duplicados. A data/destino do terminal e datas iniciais dos mapas são entradas obrigatórias desse preflight.

### 6.2 Operação futura, uma transacção e autorização vinculada

1. Depois de implementação homologada, CI verde, Publish verificado pelo SHA completo e deploy autorizado da edge, preparar lote exacto com ID, hash da extracção, revisão do mapa, IDs antigos, totais antes/depois e reversão. Verificar que o importador antigo já não consegue repor tudo na ECI; coordenar com o 0 a suspensão/retoma de captação, se necessária, como passo R2 próprio, sem alterar crons implicitamente.
2. Mostrar ao Pedro a prévia concreta por evento/canal/dia/vigência/conta, incluindo N−B separado, efeito no retido de cada conta, directo MP, zero mutações financeiras e casos bloqueados. Pedir **«Corro?»** para esse lote/hash. Alteração de mapas, dados-base, scope ou hash depois do Sim exige nova prévia e autorização, não aprovação por tempo decorrido.
3. Na execução autorizada, adquirir os mesmos locks e revalidar o hash de B, revisões, universo de IDs, relações e ausência de novos bloqueios. Uma corrida concorrente ou base alterada faz abortar. Usar a operação transaccional canónica, não duplicar o motor do importador num script independente.
4. Substituir só vendas Onebox elegíveis pelos detalhes aprovados, projectar o total diário e criar/reutilizar as atribuições importadas por canal/vigência. Manter linhas de outras fontes, atribuições manuais, fechos, apuramentos, pagamentos e repasses. Não adicionar transacções de receita nem banco neste lote.
5. Executar as provas abaixo **antes do COMMIT**; qualquer diferença aborta tudo. Registar recibo persistido e ler de volta depois do COMMIT. A prévia/hash local não substitui essa leitura. Só então retomar captação v2 e verificar duas corridas completas sem regressão.

### 6.3 Predicados de aceitação e reversão

- G = T = R = D, em quantidade e cêntimos; marginais sessão/canal e dia iguais; nenhum canal/dia com zero ou vários mapas.
- Para N, total por evento, sessão e dia inalterado pela **redistribuição**; B→N tem apenas a actualização de vendas demonstrada. `total_value` mantém Facturación e IVA do lote; quantidades e devoluções mantêm sinal.
- Para cada conta de bilheteira A, variação de `get_ticket_office_sales(A)` coincide com as linhas aprovadas dessa conta; variação de `ticket_office_balances(A)` coincide com a variação das vendas, pois transacções/adiantamentos não mudam. Ler saldos no momento, nunca tentar atingir um saldo antigo absoluto.
- Na redistribuição, `Σ variações do retido = − vendas que passaram para destino MP`; se todos os destinos são bilheteiras, a soma é zero. Caixa bancária não cresce pela mudança de FK. Actualização N−B é contabilizada separadamente nestas identidades.
- Atribuições cobrem todos os canais/vigências de bilheteira usados, sem duplicar `(evento, mapa)`; leitores deduplicam `(evento, conta)`. Há zero atribuições de bilheteira para destino MP.
- Hashes de transacções, pagamentos, adiantamentos, documentos/fechos/apuramentos e vendas de outras fontes iguais antes/depois; ECI mantém ID/nome. Repetição do lote não produz duplicados nem novo movimento.
- Leitura após COMMIT, RPCs, Dashboard por contraparte, painel ECI e novas contas reproduzem o mesmo universo; série total e relatórios por origem conservam os totais. Datas anteriores à troca permanecem na conta anterior em recapturas futuras.

Reversão preparada com os IDs e fotografia exacta de B, linhas novas e referências criadas pelo lote. Só pode restaurar B se não houve captação/fecho/novo documento ou alteração dependente depois; havendo actividade posterior, bloquear a reversão automática e preparar correcção própria. Não apagar história para efectuar rollback, não mexer em documentos selados e não executar a reversão sem autorização R2.

## 7. Implementação por partes, riscos e perguntas fechadas

### 7.1 Partes pequenas, cada uma com PR verde autónomo

Cada PR tem lista fechada de caminhos, fixtures sintéticas, `bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit` e `bunx vitest run` verdes sem falhas novas, além de CI `quality` no SHA revisto. Dependências integram-se por esta ordem; «autónomo» significa compila/testa e preserva o comportamento activo ao ser integrado, sem exigir outro PR aberto para ficar válido. Não activar routing parcial. Classes seguem D-ERP291; preparar ficheiros R2 não autoriza a aplicação.

| Parte | Classe e entrega do PR | Gate para terminar/avançar |
|---|---|---|
| P1 — Contrato de extracção e prova da fonte | R1: parser/conferência puros sob `_shared/`, fixtures sintéticas G/T/R/D, testes de limites, datas, negativos e canais. Sem ligar à edge activa. | Sondagem externa real é passo **R2 separado**, com autorização: demonstrar query tridimensional, cobertura histórica/fuso/devoluções e anexar fixture agregada sanitizada em PR próprio. Sem essa prova, não instalar o modelo como se a capacidade existisse. |
| P2 — Mapa, proveniência e writer atómico | R2 de preparação: migração sucessora, manual inerte/rollback, RLS/ACL, exclusão temporal, detalhe diário, referências/atribuições e RPCs com testes de catálogo/concorrência isolados. | Nenhum backfill/conta/activação; aplicação primeiro em homologação, depois Live, cada passo com o 0/Sim próprio pelo PROC-promocao. Legado continua legível. |
| P3 — Consumidores de vendas e retido | R1: filtros de conta, deduplicação evento/conta, atribuições por canal e cálculos/ecrãs das §5.1–5.2 em lotes de caminhos delimitados, um PR por lote se necessário. | Fixtures de evento com vários canais ECI, MyEntrada/GTS/Atrapalo e MP; saldos/receita global reconciliados. Referências novas opcionais enquanto capacidade não activada. |
| P4 — Compatibilidade #303 no servidor | R2: evolução sucessora da chave/pertença e guardas/validações 0345–0348, depois de Q4 e de conferir versões efectivas #303/#314. | Mesma conta não confirma duas vezes; segunda conta confirma a sua quota; documentos antigos e exclusividade das fontes preservados; corrida concorrente confirma só o permitido. Não activar apuramentos nas novas contas. |
| P5 — Compatibilidade #303 na UI/leitores | R1: elegibilidade por conta, adaptação de capacidade/contrato, links e regressões de posição/direito. | Feature/capacidade distingue legado e novo âmbito; sem fallback permissivo se o servidor não corresponder. P4 aplicado e P5 homologado antes de activar a capacidade. |
| P6 — Edge e importação Onebox v2 | R2: reader tridimensional + núcleo P1 + RPC P2 no handler, dry_run e erros explícitos, sem deploy neste PR. | Teste de falha em cada fase, canal sem mapa, mapa concorrente, troca de data, replay e lote stale; nenhuma escrita parcial. Deploy/activação operacional apenas em janela própria, depois de todos os consumidores estarem prontos. |
| P7 — Leituras Dashboard por contraparte | R2: RPC nova de §5.4 e paridade de precedência; conservar APIs por origem e migrações anteriores. | Somatório por conta igual ao universo por evento em todas as janelas; ramos legados preservados e isolamento por empresa. Aplicação pelo PROC, sem trocar a UI ainda. |
| P8 — Configuração e Dashboard UI | R1: editor do mapa com revisão/erros/preview, canais na conta/evento e bloco por contraparte usando P7, atrás de capacidade pronta. | `DatePicker` partilhado (`src/components/ui/date-picker.tsx`), `dd/MM/aaaa`, fim opcional `clearable` limpando valor canónico, início obrigatório sem hoje implícito; desktop/mobile e estado de servidor indisponível. |
| P9 — Pacote do histórico e homologação integrada | R2 de preparação: DML manual inerte de §6, preflight, reversão, prova com fixture e relatório, sem dados operacionais embutidos em repo público. | Aprovação do plano/mapas; ensaio completo com antes/depois, falha/rollback e ramos não Onebox; pacote de execução vinculado a hashes e IDs, sem execução automática. |

Após estes PRs: passos operacionais **R2 distintos**, sem lhes chamar PR de código: criar/reutilizar contas e preencher mapas aprovados; verificar homologação; Publish/versionamento e deploy pelo 0 com Sim; preparar/verificar prévia histórica; «Corro?» para o DML exacto posterior ao Publish; conferir aplicação e corridas seguintes; activar capacidades por conta só com prova e autorização próprias. O desenho não escolhe automaticamente instalar a fila 0345–0348 nem altera a ordem de promoção de outras Issues.

### 7.2 Matriz mínima de regressão por parte

| Caso | Resultado verificável |
|---|---|
| Seis canais ECI e mais três contas no mesmo evento | Cada canal tem proveniência; ECI soma uma vez por conta; receita global não se multiplica; fechos por contraparte independentes |
| MB no dia anterior / primeiro dia do sucessor | Conta antiga / nova exactamente na fronteira; recaptura não muda o anterior |
| Canal novo, intervalo em falta, mapa sobreposto, conta de outra empresa/tipo errado | Erro explícito; zero alteração de negócio; dados anteriores intactos |
| Duas edições de mapa e duas importações concorrentes | Constraint impede sobreposição; revisão/lock impedem lote stale e resultados misturados |
| Limite 10.000, partição incompleta, 202 falhado, dados a mudar entre leituras | Nenhum lote parcial gravado; erro auditável, repetição limitada |
| Quantidade negativa; zero quantidade com valor; `total_value` presente/NULL nos legados | Sinal e receita exactos; nenhum valor desaparece; regra canónica legada preservada |
| MP directo após a troca | Sem retido/atribuição de bilheteira para essa parcela; sem caixa bancária inventada; vendas continuam no resultado uma vez |
| Conta com vários canais e conta/evento já selado #303 | Eventos não duplicam; o selo bloqueia alterações na conta correcta; outra conta não herda quotas/repasses |
| Fecho de duas contas com tentativa de dedução da mesma fonte | Segunda reclamação recusada no servidor, inclusive em concorrência; bruto de cada conta independente |
| Troca de empresa, falta de permissão ou RPC indisponível | Sem fuga de saldos/mapas, sem zero fictício e sem fallback para ECI |
| Ticketline/BOL/Fever, vendas manuais e relatórios por origem | Totais, cortes, documentos e contratos antigos mantidos; nenhuma soma truncada de PostgREST |

### 7.3 Riscos e dependências reais

- **Fonte insuficiente:** o cruzamento diário/canal/sessão e cobertura histórica ainda não foram observados. Gate P1; sem prova não há routing por data nem DML histórico fiável.
- **Troca intradiária/devoluções:** só o dia pode ser insuficiente e o sinal não identifica a contraparte original. Não resolver por estimativa ou canal actual; exigir fonte e fronteira apropriadas.
- **Conflito com Q3 da #303:** unicidade global impede o segundo apuramento; alterar só a UI ou só a PK deixa guardas contraditórias. Q4 é decisão necessária antes de P4/P5, com os donos de #303/#314.
- **Crescimento da granularidade:** diário por sessão/canal cresce muito além do acumulado e dos 1.000 registos PostgREST. Somas na BD, detalhes paginados, extracção externa completa, limites como erro e testes acima das barreiras.
- **Transição operacional:** o writer antigo pode repor ECI e o actual DELETE/INSERT não é atómico. Não activar partes isoladas; coordenar o corte, bloqueio de concorrência, DML e retomada pelo 0.
- **Documentos/movimentos anteriores:** contraparte nova não autoriza redistribuir repasses/faturas antigas. Preflight e correcção documental separada quando necessário.
- **Taxas e caixa MP:** resumo económico não prova dedução nem recebimento em banco. Não misturar Facturación com taxas, não criar pagamentos/transacções para «fechar» a prova.

### 7.4 Perguntas fechadas ao Pedro

Estas perguntas fecham apenas pontos ainda não definidos; não reabrem o papel da Onebox, as nove correspondências do mapa, o nome ECI ou a regra de erro sem mapa.

| Pergunta | Opções fechadas / recomendação |
|---|---|
| Q1 — Fronteira da troca do MB | **A:** indicar um dia D inteiro em Madrid, com ECI até D exclusivo e sucessor desde D. **B:** a troca divide um dia; exigir detalhe com hora/transacção e nova extensão do plano antes de activar esse corte. Não escolher D nesta execução. |
| Q2 — Destino do MB depois da troca | **A:** outra conta `ticket_office`, a identificar por ID/criar em passo próprio. **B:** uma conta própria MP de banco/caixa/cartão, a identificar por ID; sem retido e com recebimento pelo fluxo financeiro existente. Nenhum destino por omissão. |
| Q3 — Início dos mapas e dias históricos | **A (recomendada):** cada mapa inicial cobre desde o primeiro dia de vendas provado para esse canal, com a contraparte histórica comprovada. **B:** há outra mudança histórica; apresentar intervalos/documentos antes de repartir. Não usar a data da importação como início. |
| Q4 — Unidade de exclusividade da #303 para várias contrapartes | **A (recomendada):** aprovar explicitamente a evolução Q3 anterior para um fecho final por **evento/conta**, mantendo quota única e documento imutável nessa conta. **B:** conservar unicidade global; bloquear a activação dos apuramentos multicontraparte e despachar alternativa de unidade documental antes de P4/P5. |
| Q5 — Tratamento inicial de `costes_canal`/`recargo_promotor` | **A (recomendada):** routing usa só Facturación; campos ficam em auditoria, deduções só com documento pelo fluxo existente. **B:** pedir também automatização de taxas, com despacho separado depois da prova de natureza/IVA/destinatário, sem a presumir neste plano. |
| Q6 — Recebimento directo MP | **A (recomendada):** manter vendas no seu módulo e reconhecer caixa apenas na conciliação/entrada financeira comprovada. **B:** pretender automação de recebimentos; desenhar parte R2 adicional com deduplicação e conciliação antes de a ligar. A FK da venda não é prova de depósito. |

O próximo despacho deve escolher uma única parte, copiar os seus critérios e fechar os caminhos autorizados. A disponibilidade real da query e os documentos/datas de corte ficam como provas a obter, não como factos já demonstrados por este plano local.

## 8. Validação desta entrega documental

`bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit` terminou com exit 0 no arranque e na validação final. Os 65 caminhos citados inicialmente foram conferidos e as referências acrescentadas na revisão também existem. A árvore de código/testes permaneceu igual ao arranque; só este plano e `.executor/resumo.md` foram criados.

`bunx vitest run`, iniciado como execução de base antes das edições documentais, terminou com exit 1: **496 ficheiros aprovados, 1 com falhas e 2 skipped; 7.371 testes aprovados, 4 falhados, 6 skipped e 11 todo; 3 erros não tratados**. As quatro falhas são em `src/test/ci-sem-sonda-producao.test.ts`: a verificação de subprocesso sem secrets recebeu saída vazia em vez de `SKIP PROIBIDO`; os três casos de servidor HTTP local excederam o timeout e registaram `listen EPERM: operation not permitted 127.0.0.1` na sandbox. Não houve alterações de código/testes entre o arranque e o fim que expliquem uma regressão funcional deste plano. **Não foi obtida suíte verde**; não foram removidos casos, adicionados skips ou alterados caminhos fora do despacho para ocultar a limitação. CI remoto não foi consultado, pois esta execução não faz commits/push nem acede aos serviços da MP.

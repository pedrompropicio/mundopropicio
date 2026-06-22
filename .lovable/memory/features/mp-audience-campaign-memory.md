---
name: MP Audience - Memória de campanhas
description: Tabelas crm.campaign_memory e crm.campaign_memory_element que guardam campanhas Meta maduras (campanha + adset) para servirem de contexto e limites ao gerador de estratégia
type: feature
---

## Para que serve
A memória de campanhas é o "histórico aprendido" do MP Audience. Guarda
campanhas Meta já concluídas (ou ainda a decorrer mas suficientemente maduras),
destiladas em duas tabelas, para que o gerador de estratégia possa:
- usar exemplos reais de campanhas positivas como referência;
- impor limites sãos ao validador (orçamentos, nº de adsets, estruturas);
- isolar o aprendizado por mercado (PT vs BR).

O job de destilação que popula estas tabelas é uma **edge function separada,
ainda por construir**. Esta migração apenas cria o esquema.

## As duas tabelas

### crm.campaign_memory (nível campanha)
Uma linha por campanha Meta destilada. Chave de unicidade:
`(company_id, external_campaign_id)`. Campos-chave:
- Identidade/contexto: `company_id`, `event_id`, `external_campaign_id`,
  `campaign_name`, `artist`, `days_before_event`, `objective`, `structure`
  (`ABO`/`CBO`), `n_adsets`.
- Mercado: `market_scope` (`PT`/`BR`), `market_country`, `currency`.
- Performance: `spend_cents`, `revenue_cents`, `purchases`, `roas`,
  `roas_source` (`meta`/`ticketline_reconciled`).
- Veredito/maturidade: `verdict` (`positivo`/`neutro`/`fraco`),
  `diagnosis_class`, `is_provisional`, `matured_at`, `distilled_at`.

### crm.campaign_memory_element (nível adset)
Uma linha por adset de uma campanha. FK `campaign_memory_id` →
`crm.campaign_memory(id)` com `on delete cascade`. Unicidade
`(campaign_memory_id, external_adset_id)`. Campos-chave:
- `external_adset_id`, `adset_name`, `audience_archetype`, `audience_key`,
  `optimization_goal`, `daily_budget_cents`.
- Performance: `spend_cents`, `revenue_cents`, `roas`, `verdict`.

## Decisões-âncora

1. **ROAS Meta-reported como base conservadora.** O ROAS guardado tem por
   omissão `roas_source='meta'`. É a métrica que o Meta reporta, deliberadamente
   conservadora. Quando existe reconciliação com a Ticketline, `roas_source`
   passa a `ticketline_reconciled`. A memória nunca infla o ROAS para além do
   que o Meta confirma.

2. **Gate de maturidade.** Uma campanha só entra como dado fiável quando:
   - o evento já **terminou** (campanha madura, `is_provisional=false`); ou
   - está **a decorrer há >= 14 dias** e **fora da fase de learning** do Meta —
     nesse caso entra como **provisória** (`is_provisional=true`).
   Campanhas demasiado recentes ou ainda em learning não são destiladas.

3. **Dois níveis.** O aprendizado é guardado a dois níveis: campanha
   (`campaign_memory`) e adset (`campaign_memory_element`). Isto permite
   raciocinar tanto sobre a estrutura global como sobre que públicos/adsets
   funcionaram.

4. **Taxonomia fechada de 5 arquétipos de público.** `audience_archetype` é
   restrito por check a exatamente cinco valores:
   `advantage_plus`, `interesse`, `lookalike`, `retargeting`, `broad`.
   Mantém o vocabulário de públicos consistente entre destilação e gerador.

5. **Isolamento por market_scope (PT/BR).** `market_scope` é derivado de
   `public.companies.country` no momento da destilação e restrito a `PT`/`BR`.
   O cérebro do gerador só consome memória do mesmo mercado, para não misturar
   dinâmicas de preço/público de Portugal e Brasil.

6. **Exemplo positivo = ROAS >= 6x.** Um `verdict='positivo'` (e, portanto, um
   exemplo a oferecer ao gerador como referência) corresponde a ROAS >= 6x.
   Os restantes vereditos da taxonomia são `neutro` e `fraco`.

7. **Degradação graciosa quando `event_id` é null.** Quando não conseguimos
   ligar a campanha a um evento (`event_id is null`), a linha **continua a
   contar para os limites do validador** (orçamentos, nº de adsets, estruturas
   típicas), mas **fica fora do contexto do cérebro** — não é usada como exemplo
   nem para raciocínio específico de evento. Falha de forma graciosa em vez de
   ser descartada.

## RLS / GRANTs
Segue o padrão das restantes tabelas crm (`crm.campaign_diagnosis_360`,
`crm.meta_campaign_diagnoses`):
- `service_role_bypass`: `FOR ALL TO service_role USING (true) WITH CHECK (true)`.
- `tenant_isolation_select`: `FOR SELECT TO authenticated` com
  `company_id = current_company_id()`. Como `campaign_memory_element` não tem
  `company_id`, o isolamento é feito por subconsulta `EXISTS` à tabela-mãe.
- GRANT `SELECT` a `authenticated`, GRANT `ALL` a `service_role`.

A escrita destas tabelas é exclusiva do job de destilação (service_role).

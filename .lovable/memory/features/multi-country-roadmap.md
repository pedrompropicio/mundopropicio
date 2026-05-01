---
name: Multi-country roadmap (Fase 8)
description: Plano PT+BR APROVADO mas EM QUARENTENA até 2026-05-29; arranque condicionado a 6 gatilhos; convivência Modelo B+C; protocolo §10.7 pós-fase
type: feature
---

## Estado atual: EM QUARENTENA (decidido 2026-05-01)

**Fase 8.1 (código de produção) NÃO arranca antes de 2026-05-29** e antes de TODOS estes gatilhos verdes:
1. Batch 9 NOT NULL aplicado em Live sem incidente
2. Auditoria RLS legacy (`auth.uid() IS NOT NULL`) = 0 linhas em Live
3. ≥ 14 dias consecutivos sem bug multi-tenant reportado
4. ≥ 1 segundo cliente real operacional em Live
5. Baselines DRE/BP capturados (Fase 8.0 concluída)
6. Decisão go/no-go formal do utilizador

Razão: Fase 7 (multi-tenant Live) ainda a estabilizar; Fase 8 toca nas mesmas camadas (RLS, companies, profiles, edge fns). Empilhar agora cria sobreposição cognitiva e baselines D5 frágeis.

**Durante a quarentena pode-se:** Fase 8.0 (baselines + grep + análise), validar plano de contas BR com contador, confirmar campos export contador, observar Live, fechar pendências multi-tenant.

**Durante a quarentena NÃO:** criar `fiscal_meta`, refactor `iva.ts→TaxEngine`, criar `src/lib/tax/{pt,br}/`, mexer RLS por motivo de país, onboarding cliente BR em Live.

**Sem ambiente paralelo / branch longa**: Modelo B+C proíbe forks > 30d; Test+Live já são os 2 ambientes; isolamento real é D5 + guards de país. Sandbox curta (≤ 1 sem) dentro da Fase 8 continua permitida pontualmente.

Detalhes em §0 do `.lovable/plan-fase-8-multi-pais.md`.


## Modelo de convivência PT vs BR (decidido)

**Modelo B + C** (ver §10 do plano):
- **B (regra)**: 1 codebase, 1 deploy. Features por país isoladas em `src/lib/{tax,locale,legal-labels}/{pt,br}/` + guards `company.country === 'XX'` em rotas/menu. Zero `if (country)` em UI.
- **C (exceção)**: branches sandbox curtas (< 1 mês) só para experiências arriscadas que mudam comportamento partilhado; depois merge para main com flag.
- **Forks paralelos PT vs BR PROIBIDOS** — divergem em meses, anulam D4, dobram manutenção.
- Bug fix em código partilhado beneficia ambos os países automaticamente (convergência sem merge manual).
- Receita para feature só-BR ou só-PT documentada em §10.2/§10.3 do plano.

## Protocolo operacional pós-Fase 8 (§10.7)

Evolução em ritmos diferentes PT vs BR é feita por **classificação A/B/C + feature flags por empresa**, nunca por ambientes paralelos:
- **A só-PT / B só-BR / C partilhada** — AI classifica antes de codar; utilizador confirma se ambíguo.
- "Duas implementações em paralelo" = commits diferentes na mesma `main`, isolados por pasta + guard de país. Não há merge entre PT e BR porque nunca divergem.
- Promover feature só-BR → partilhada = mover de `tax/br/` para `tax/_shared/` + remover guard. Decisão do utilizador.
- Feature flag por empresa (`companies.feature_flags jsonb` — a criar quando precisar) para rollout gradual dentro do mesmo país, via `useFeatureFlag()`.
- Sandbox pós-Fase 8 só para refactor de código partilhado, com data fim ≤ 1 mês.
- AI nunca abre sandbox nem cria flag sem perguntar; sempre classifica A/B/C e propõe localização exata antes de escrever.

## Estado: APROVADO, pronto a executar (não iniciado)

Plano detalhado em `.lovable/plan-fase-8-multi-pais.md`.

## Escopo confirmado
- Países: **PT e BR** (apenas).
- BR é **gerencial puro**: zero apuração fiscal, zero NF-e, zero SEFAZ.
- Contabilidade fiscal BR vive **fora** do sistema (ERP/contador externo).
- Export contador BR: **XLSX genérico estruturado** (sem ERP-alvo definido).
- Em BR `amount = bruto` (com impostos); impostos são **deduções** no DRE.
- Em PT mantém-se `amount = líquido` (CIVA Art. 18) — zero mudança.
- Mágicos H&K **fora** deste plano (resolvido noutra esfera).

## Invariantes arquiteturais (D1–D7)

**D1 — `country-of-amount = country-of-company`**
Cada empresa tem 1 país; todas as suas transações/forecasts seguem a convenção desse país. Turnês mistas PT+BR são **proibidas** ao nível do modelo.

**D2 — `amount` continua a ser SSoT por empresa**
Não há coluna `gross_amount` paralela. Significado de `amount` resolvido por `getAmountSemantics(company)`.

**D3 — `fiscal_meta jsonb` é informativo, nunca calculado**
PT: NULL. BR: `{ nf_number?, cnpj?, taxes_total, withholdings_total, breakdown_note? }`. Inserido pelo user/OCR — o sistema nunca calcula.

**D4 — Adapters em vez de `if (country === 'BR')`**
Tudo que muda por país consome `useTaxEngine()` / `useLocale()` / `useLegalLabels()`. Zero `if` direto sobre country na UI.

**D5 — Refactor PT é zero-comportamento**
Fase 8.1 não pode mudar 1 cêntimo em nenhum cálculo PT. Validação obrigatória com baselines snapshot Vitest.

**D6 — Consolidados super-admin convertem para base canónica**
Quando `platform_admin` vê PT+BR juntos, normaliza para "líquido em EUR". Nunca soma `amount` direto entre países.

**D7 — Cliente BR opera em BRL na UI; EUR é só camada de armazenamento**
Mantém sistema multi-currency atual (`amount` em EUR; `original_amount + fx_rate` para traçabilidade).

## Mudanças DB previstas
- `transactions.fiscal_meta jsonb` (nullable)
- `event_forecasts.fiscal_meta jsonb` (nullable)
- `event_cache_payments.withholding_meta jsonb` (nullable, paralelo a `tax_withholding`)
- Trigger `enforce_fiscal_meta_country()` rejeita `fiscal_meta IS NOT NULL` em empresas PT
- Tabela nova `account_category_templates(id, country, name, structure jsonb, is_default)`
- Seed `PT-SNC` (extraído do MP atual) e `BR-DRE-gerencial` (novo)
- `create_bp_snapshot` e Trash copiam `fiscal_meta`

## Novos módulos/ficheiros frontend
- `src/lib/tax/{types,index}.ts` + `src/lib/tax/{pt,br}/index.ts`
- `src/lib/locale/{pt,br}.ts`
- `src/lib/legal-labels/{pt,br}.ts`
- `src/hooks/{useTaxEngine,useLocale,useLegalLabels}.ts`
- `src/components/reports/ReportContabilExportBR.tsx`
- `src/components/reports/ReportPendenciasFiscaisBR.tsx`
- Edge fn nova: `export-accounting-br`
- Edge fn shared: `supabase/functions/_shared/tax-engine.ts` (versão Deno)

## Fases (4–5 semanas)
1. **8.0** (2d) — Baselines DRE/BP + inventário grep + decisões com cliente BR
2. **8.1** (1sem) — TaxEngine adapter PT (zero comportamento) + 5 ficheiros piloto + restantes incrementalmente
3. **8.2** (2d) — Schema `fiscal_meta` + trigger guard
4. **8.3** (1sem) — TaxEngine adapter BR + templates plano de contas + `create-company` aceita template
5. **8.4** (1sem) — Locale, labels, UI BR (modais sem IVA, com NF/CNPJ/impostos/retenções)
6. **8.5** (1sem) — Relatórios BR + Export XLSX contador
7. **8.6** (3d) — Onboarding cliente BR em Test → Live
8. **8.7** (3d) — Hardening, memórias, E2E

## Riscos críticos rastreados
- R1 regressão cêntimo PT — baselines + CI bloqueia
- R3 user BR esquece `fiscal_meta` — validação ao Aprovar + relatório Pendências BR
- R4 mistura amount líquido/bruto — trigger guard DB
- R7 edge fns com IVA inline — shared `tax-engine.ts` Deno

## Critério de sucesso
1. MP (PT) não muda nada — baselines idênticos ao cêntimo
2. Empresa BR consegue criar tx com NF+CNPJ+impostos, gerar DRE BR, exportar XLSX para contador
3. Super-admin alterna PT/BR sem leakage
4. Trigger guard rejeita PT-com-fiscal_meta e BR-com-iva_rate
5. Adicionar 3º país custa só: 1 adapter tax + 1 locale + 1 legal-labels + 1 template plano de contas

## Pendências utilizador
- Validar plano de contas BR (§6 do plano) com sócio/contador antes de 8.3
- Confirmar campos exatos do export contador na Fase 8.0
- Confirmar se há histórico XLSX BR a importar

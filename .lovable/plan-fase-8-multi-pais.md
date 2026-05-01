# Fase 8 — Suporte multi-país (PT + BR gerencial)

> **Estado**: aprovado, pronto a executar.
> **Estimativa**: 4–5 semanas com 1 dev focado.
> **Pré-requisito**: Fase 7 (multi-tenant Live) concluída ✅

---

## 1. Contexto e escopo

A plataforma já é multi-empresa (Fases 1–7). Falta torná-la **country-aware** para receber a primeira empresa-cliente brasileira.

### Escopo confirmado
- ✅ Países suportados: **PT e BR** (apenas).
- ✅ Em BR a plataforma é **gerencial pura**: zero apuração fiscal, zero emissão de NF-e, zero integração SEFAZ.
- ✅ A contabilidade fiscal BR vive **fora** do sistema (ERP/contador). Nós só temos de fornecer dados suficientes para integração.
- ✅ Export para o contador: **XLSX genérico** estruturado (não há ERP-alvo definido).
- ✅ Em BR, `amount` da transação = **valor bruto** (com impostos). Impostos viram deduções no DRE.
- ✅ Em PT mantém-se tudo como hoje: `amount = líquido`, `IVA = amount × tax / 100` (CIVA Art. 18).

### Fora de escopo
- ❌ Emissão de NF-e / NFS-e
- ❌ Cálculo automático de ICMS, ISS, PIS, COFINS, IRRF
- ❌ SPED Contábil/Fiscal
- ❌ Suporte a regimes fiscais BR (Simples / Presumido / Real) com lógica diferenciada
- ❌ I18n EN ou outros países (Espanha, Angola, EUA…)
- ❌ Reconciliação Mágicos H&K (tratada noutra esfera)

---

## 2. Decisões arquiteturais (invariantes)

São **regras duras** que não podem ser quebradas sem reabrir este plano.

### D1 — `country-of-amount = country-of-company`
Cada empresa tem **um país**. Todas as transações e forecasts dessa empresa seguem a convenção semântica desse país.
- **Empresa PT**: `amount` é líquido, `iva_rate` aplicável, `fiscal_meta` deve ser NULL.
- **Empresa BR**: `amount` é bruto, `iva_rate` é NULL/ignorado, `fiscal_meta` carrega impostos e retenções.
- **Consequência**: turnês mistas PT+BR são **proibidas** ao nível de modelo. Uma turnê inteira pertence ao país da sua empresa.

### D2 — `amount` continua a ser SSoT por empresa
Não introduzimos coluna `gross_amount` paralela. O significado de `amount` é **resolvido pela empresa** via `country`. Helper único `getAmountSemantics(company)` decide.

### D3 — `fiscal_meta jsonb` é informativo, nunca calculado
A coluna `fiscal_meta` em `transactions` e `event_forecasts` guarda dados que **o utilizador insere** ou que vêm de OCR/import — nunca é calculada pelo sistema. Para BR contém: `nf_number`, `cnpj`, `taxes_total`, `withholdings_total`, `breakdown_note`. Para PT é NULL.

### D4 — Adapters em vez de `if (country === 'BR')`
Todo o código que muda comportamento por país consome `useTaxEngine()` / `useLocale()` / `useLegalLabels()`. Nenhum componente de UI faz `if` direto sobre `country`.

### D5 — Refactor PT é zero-comportamento
A Fase 1 (extração do TaxEngine PT) **não pode** mudar nem 1 cêntimo em nenhum cálculo PT existente. Validação obrigatória com testes Vitest snapshot.

### D6 — Relatórios consolidados super-admin convertem tudo para uma base canónica
Quando o `platform_admin` vê PT+BR juntos, o consolidado normaliza para "líquido em EUR". Nunca soma `amount` directo entre empresas de países diferentes.

### D7 — Cliente BR opera em **BRL** dentro da app, EUR é só camada de armazenamento
Mantém-se o sistema multi-currency atual (`amount` em EUR, `original_amount + fx_rate` para traçabilidade). UI da empresa BR mostra tudo em BRL.

---

## 3. Stress-test — riscos identificados e mitigações

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|---|
| R1 | Refactor TaxEngine PT introduz regressão de cêntimo | Média | Alto | Testes Vitest snapshot ANTES do refactor; baseline de DRE de 5 eventos PT recentes. CI bloqueia se mudar. |
| R2 | `fiscal_meta` é mal preenchido (campos inconsistentes entre transações BR) | Alta | Médio | Schema Zod estrito no frontend; Edge function/trigger valida estrutura mínima ao gravar. |
| R3 | Utilizador da empresa BR esquece-se de preencher `fiscal_meta` em transações | Alta | Alto (export para contador fica vazio) | Validação obrigatória ao "Aprovar" transação BR; relatório "Pendências fiscais BR" análogo ao "Document Pendencies" PT. |
| R4 | DRE BR passa a misturar `amount` líquido (PT antigo) com bruto (BR novo) se houver bug em company-detection | Baixa | Crítico | Trigger DB rejeita: `country='PT' AND fiscal_meta IS NOT NULL` e simétrico. Auditoria SQL no fim de cada fase. |
| R5 | Plano de contas BR diverge tanto que relatório consolidado super-admin perde sentido | Média | Médio | Mapeamento "categoria → DRE bucket universal" centralizado. Categorias BR mapeiam para os mesmos 8 buckets do DRE (Receita Bruta, Deduções, CPV, Despesas Operacionais, etc.). |
| R6 | BP consolidado de turnê BR confunde brutos com líquidos | Baixa (D1 protege) | Alto | Invariante D1 + teste de regressão em turnê BR após cada fase. |
| R7 | Edge functions (close-camarim-session, generate-historical-transactions, audit-categories, match-categories) têm cálculo IVA inline e quebram em BR | Certa | Médio | Inventário no início; mover lógica fiscal para shared module Deno chamado pelo TaxEngine server-side. |
| R8 | `audit-categories` (Gemini) treinada em PT-SNC sugere disparate em BR | Alta | Baixo | Prompt da edge fn passa a receber `country` + plano de contas da empresa. |
| R9 | Cache de artistas em BR retém ISS na fonte do cachê — modelo atual não suporta | Média | Médio | Adicionar `withholding_meta jsonb` em `event_cache_payments` (paralelo à coluna existente `tax_withholding`). PT continua a usar a coluna antiga. |
| R10 | Fluxo de recibo verde / IRS em PT confunde-se com IRRF em BR | Baixa | Médio | `useLegalLabels()` muda labels; `tax_withholding` schema fica polimórfico via TaxEngine. |
| R11 | Templates de email auth (já multi-tenant) não consideram país | Baixa | Baixo | `multi-tenant-email-branding` já lê company; adicionar passagem do `country` para escolher idioma do template (pt-PT vs pt-BR). |
| R12 | Backups e restores misturam dados de empresas de países diferentes | Baixa (RLS protege) | Baixo | Já testado na Fase 7; nenhuma mudança necessária. |
| R13 | Importação BP XLSX assume estrutura PT (cabeçalhos, IVA) | Alta | Médio | Versão BR do parser detecta headers diferentes; ou template BP separado por país. |
| R14 | Conversão BRL↔EUR em câmbio errado afecta DRE | Média | Médio | Já mitigado no sistema multi-currency; revisar fixação do FX no momento do pagamento (não no momento do registo). |
| R15 | Cliente BR muda de contador → novo formato de export | Baixa | Baixo | Export "neutro" XLSX é SSoT; adapters por ERP são opcionais (Fase futura, fora deste plano). |

---

## 4. Inventário de impacto (ficheiros e tabelas)

### 4.1 Tabelas DB que ganham `fiscal_meta jsonb`
1. `transactions`
2. `event_forecasts`
3. `event_cache_payments` (via `withholding_meta` separada)

### 4.2 Tabela `companies` — campos já existentes a usar
- `country` (já existe — usar como SSoT)
- `currency` (já existe)
- `timezone` (já existe)
- `theme_config` (já existe — sem mudança)

### 4.3 Templates de plano de contas
- Tabela nova: `account_category_templates` (id, country, name, structure jsonb)
- Seed inicial: `PT-SNC` (snapshot do plano atual MP) e `BR-DRE-gerencial` (novo)
- `create-company` edge fn passa a aceitar `template_id`

### 4.4 Código frontend a tocar (alto nível)
- **Novo**: `src/lib/tax/types.ts`, `src/lib/tax/index.ts`, `src/lib/tax/pt/`, `src/lib/tax/br/`
- **Novo**: `src/lib/locale/`, `src/lib/legal-labels/`
- **Novo**: `src/hooks/useTaxEngine.ts`, `src/hooks/useLocale.ts`, `src/hooks/useLegalLabels.ts`
- **Refactor**: `TransactionFormModal`, `TransactionEditModal`, `SplitByIvaModal`, `CamarimItemModal`, `BPRowEditor`, `RecurringTransactionForm`, `ReimbursementNoteModal`, `CacheExtrasPanel`, `PartnerExtrasPanel`
- **Refactor relatórios**: `ReportDREBrasil`, `ReportPL`, `ReportDRE`, `ReportIvaAudit`, `ReportContasPagar`, `ReportBankStatement`, `ReportBPTransactions`
- **Novo relatório**: `ReportContabilExportBR` (export XLSX para contador)
- **Novo relatório**: `ReportPendenciasFiscaisBR` (transações sem `fiscal_meta` completo)

### 4.5 Edge functions a tocar
- `close-camarim-session` — usar TaxEngine server-side
- `generate-historical-transactions` — country-aware
- `audit-categories` — passar `country` no prompt Gemini
- `match-categories` — idem
- `create-company` — aceitar `template_id` e país
- **Nova**: `export-accounting-br` — gera XLSX para contador

### 4.6 Memórias a atualizar
- `iva-portugal` → renomear para `tax-portugal` e referenciar TaxEngine
- Nova: `tax-engine-architecture` (descreve adapters)
- Nova: `tax-brazil-managerial` (descreve modelo BR sem fiscal)
- Nova: `multi-country-invariants` (D1–D7)
- Atualizar Core: regra "DB amount is Net" passa a ser "DB amount semantics depends on company.country"

---

## 5. Plano por fases

### Fase 8.0 — Preparação e baselines (2 dias)
**Objetivo**: ter rede de segurança antes de tocar em código fiscal.

- [ ] Snapshot DRE de 5 eventos PT recentes (Live) → guardar JSON em `tests/fixtures/dre-baselines-pt.json`
- [ ] Snapshot DRE de 3 eventos BR (Live) → `tests/fixtures/dre-baselines-br.json`
- [ ] Snapshot BP "Realizado" de 5 eventos PT recentes
- [ ] Inventário grep de todos os `iva_rate` / `* tax / 100` / `STANDARD_IVA_RATES` no código → lista de ficheiros a refactor
- [ ] Inventário de strings hard-coded ("IVA", "NIF", "IBAN", "Modelo Periódica", "Art.º") → lista de strings a substituir por `useLegalLabels()`
- [ ] Confirmar com cliente BR a lista exata de campos que o contador quer ver no export (NF, CNPJ, base, impostos discriminados ou agregados, retenções)
- [ ] Decisão: o export BR é por evento, mensal, ou ambos?

**Saída**: `tests/fixtures/`, `docs/multi-country-inventory.md`

### Fase 8.1 — TaxEngine adapter PT (zero comportamento) (1 semana)
**Objetivo**: extrair lógica IVA atual para adapter, sem mudar 1 cêntimo.

- [ ] Criar `src/lib/tax/types.ts` com interface `TaxEngine`:
  ```ts
  interface TaxEngine {
    country: 'PT' | 'BR';
    currency: CurrencyCode;
    isFiscal: boolean; // PT=true, BR=false
    standardRates: number[];
    calcTax(base: number, rate: number): number;
    calcTotalWithTax(base: number, rate: number): number;
    snapToStandardRate(rate: number): number;
    inferRateFromTotal(base: number, total: number): number;
    checkConsistency(base: number, rate: number, recorded: number, tol?: number): { ok: boolean; expected: number };
    formatTaxLabel(rate: number): string;
    getAmountSemantics(): 'net' | 'gross';
    validateFiscalMeta(meta: unknown): { ok: boolean; errors: string[] };
  }
  ```
- [ ] `src/lib/tax/pt/index.ts` — wrapper que chama `iva.ts` existente; `getAmountSemantics()` = `'net'`; `validateFiscalMeta` exige NULL
- [ ] `src/lib/tax/index.ts` — `getTaxEngine(country): TaxEngine`
- [ ] `src/hooks/useTaxEngine.ts` — lê `useCompany().country`, devolve adapter
- [ ] Migrar 5 ficheiros piloto: `TransactionFormModal`, `SplitByIvaModal`, `ReportIvaAudit`, `BPRowEditor`, `CamarimItemModal`
- [ ] Testes Vitest: para cada baseline da Fase 8.0, recalcular com TaxEngine e validar match exato
- [ ] Migrar restantes ficheiros do inventário (incremental, 1–3 por commit)
- [ ] Edge functions: criar `supabase/functions/_shared/tax-engine.ts` (versão Deno do mesmo contrato)
- [ ] Migrar `close-camarim-session`, `generate-historical-transactions`

**Critério de saída**: todos os baselines da Fase 8.0 continuam idênticos ao cêntimo.

### Fase 8.2 — Schema fiscal informativo (2 dias)
**Objetivo**: preparar DB para BR sem tocar em PT.

- [ ] Migration:
  ```sql
  ALTER TABLE transactions ADD COLUMN fiscal_meta jsonb;
  ALTER TABLE event_forecasts ADD COLUMN fiscal_meta jsonb;
  ALTER TABLE event_cache_payments ADD COLUMN withholding_meta jsonb;

  -- Trigger guard: PT não pode ter fiscal_meta
  CREATE FUNCTION enforce_fiscal_meta_country() RETURNS trigger AS $$
  DECLARE v_country text;
  BEGIN
    SELECT c.country INTO v_country FROM companies c WHERE c.id = NEW.company_id;
    IF v_country = 'PT' AND NEW.fiscal_meta IS NOT NULL THEN
      RAISE EXCEPTION 'fiscal_meta is BR-only (company is PT)';
    END IF;
    RETURN NEW;
  END $$ LANGUAGE plpgsql;

  CREATE TRIGGER trg_fiscal_meta_country_tx
    BEFORE INSERT OR UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION enforce_fiscal_meta_country();
  -- idem para event_forecasts
  ```
- [ ] Atualizar `create_bp_snapshot` para copiar `fiscal_meta`
- [ ] Atualizar trigger de Trash para preservar `fiscal_meta` no JSONB
- [ ] Tipos TS regenerados automaticamente

**Critério de saída**: PT continua a funcionar exatamente como antes; nenhuma transação PT existente é tocada.

### Fase 8.3 — TaxEngine adapter BR + plano de contas (1 semana)
**Objetivo**: capturar dados fiscais BR sem cálculo.

- [ ] `src/lib/tax/br/index.ts`:
  - `isFiscal = false`
  - `standardRates = []` (não há "rates standard" no modelo gerencial)
  - `getAmountSemantics() = 'gross'`
  - `calcTax()` = throw (não usar — usar `fiscal_meta.taxes_total` direto)
  - `validateFiscalMeta()`: schema Zod com `nf_number?`, `cnpj?`, `taxes_total: number`, `withholdings_total: number`, `breakdown_note?: string`
  - `formatTaxLabel()` = "Impostos s/ Receita" (deduções) ou "Retenções" conforme tipo
- [ ] Tabela `account_category_templates`:
  ```sql
  CREATE TABLE account_category_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    country text NOT NULL CHECK (country IN ('PT', 'BR')),
    name text NOT NULL UNIQUE,
    description text,
    structure jsonb NOT NULL, -- L1>L2>L3 hierarchy
    is_default boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
  );
  ```
- [ ] Seed `PT-SNC` (extraído do plano atual da Mundo Propício, sem `company_id`)
- [ ] Seed `BR-DRE-gerencial` (novo, ver §6 abaixo)
- [ ] Edge fn `create-company` aceita `account_template_id`; clona template para a nova empresa
- [ ] UI `/admin/empresas` no wizard "criar" pergunta país e template

### Fase 8.4 — Locale, labels e UI BR (1 semana)
**Objetivo**: app sente-se brasileira para utilizador BR.

- [ ] `src/lib/locale/pt.ts` e `src/lib/locale/br.ts` com `dateFormat`, `numberFormat`, `currencyCode`, `firstDayOfWeek`
- [ ] `src/lib/legal-labels/pt.ts` e `src/lib/legal-labels/br.ts`:
  - `taxId`: "NIF" / "CNPJ"
  - `personalTaxId`: "NIF" / "CPF"
  - `bankAccount`: "IBAN" / "Agência + Conta"
  - `taxName`: "IVA" / "Impostos s/ Receita"
  - `withholdingName`: "Retenção IRS" / "Retenção (IRRF/INSS/ISS)"
- [ ] Hooks `useLocale()`, `useLegalLabels()`
- [ ] `TransactionFormModal` em modo BR:
  - Esconde dropdown de IVA, esconde "Dividir por IVA", esconde "IVA médio"
  - Mostra: Nº NF, CNPJ fornecedor, Valor (bruto), Impostos s/ Receita (total), Retenções (total), Notas fiscais
  - `amount` = valor que o utilizador digita (bruto)
  - `fiscal_meta` = `{ nf_number, cnpj, taxes_total, withholdings_total, breakdown_note }`
- [ ] `CamarimItemModal` em BR: sem snap de IVA; campo "Valor" = bruto; `fiscal_meta` opcional
- [ ] `Suppliers`: campo "NIF" passa a usar `legalLabels.taxId`; validação muda por país
- [ ] `FinancialAccounts`: campo "IBAN" → "IBAN" ou "Agência + Conta"
- [ ] BPRowEditor em BR: sem coluna IVA (forecasts são brutos)

### Fase 8.5 — Relatórios BR + Export contador (1 semana)
**Objetivo**: dar ao contador BR o que ele precisa.

- [ ] `ReportDREBrasil` revisto:
  - Estrutura clássica: Receita Bruta → (-) Deduções (impostos s/ receita) → Receita Líquida → (-) CPV/CSP → Lucro Bruto → (-) Despesas Operacionais → EBITDA → (-) D&A → EBIT → (-/+) Resultado Financeiro → LAIR → (-) IR/CSLL (informativo) → Lucro Líquido
  - Lê `amount` direto (bruto) + soma `fiscal_meta.taxes_total` como dedução
- [ ] `ReportContabilExportBR` (novo):
  - Filtros: período, evento(s), opcional CNPJ específico
  - Output XLSX com colunas: Data, Histórico, Conta Débito, Conta Crédito, Valor, NF, CNPJ Fornecedor, Impostos, Retenções, Categoria, Evento, Notas
  - Versão "neutra" sem assumir ERP-alvo
  - Edge fn `export-accounting-br` gera o ZIP com XLSX + PDF de auditoria
- [ ] `ReportPendenciasFiscaisBR` (novo):
  - Lista transações BR sem `nf_number` ou sem `cnpj` ou com `fiscal_meta` incompleto
  - Análogo ao `ReportDocumentPendencies` de PT
- [ ] Menu de relatórios filtra por `useCompany().country`:
  - PT-only: `ReportIvaAudit`, `ReportAccountingExport` (formato PT-SNC)
  - BR-only: `ReportContabilExportBR`, `ReportPendenciasFiscaisBR`, `ReportDREBrasil`
  - Universais: BP vs Real, Cash Flow, Aging, Bank Statement, etc.

### Fase 8.6 — Onboarding cliente BR (3 dias)
**Objetivo**: cliente BR a usar em Live.

- [ ] Criar empresa BR em **Test** primeiro
- [ ] Convidar 1 utilizador admin BR
- [ ] Importar histórico (se existir XLSX do cliente)
- [ ] Validar export → enviar amostra ao contador BR → confirmar legibilidade
- [ ] Replicar em Live (criar empresa, convite, branding)
- [ ] Acompanhar primeiros 7 dias com daily check

### Fase 8.7 — Hardening e documentação (3 dias)
- [ ] Memórias atualizadas (ver §4.6)
- [ ] Guia "Onboarding empresa BR" em `docs/`
- [ ] Guia "Adicionar novo país" em `docs/` (caso futuro)
- [ ] Testes E2E Playwright: 1 fluxo completo PT + 1 fluxo completo BR
- [ ] Auditoria SQL final: trigger guard funciona; nenhuma transação PT tem `fiscal_meta`; nenhuma transação BR tem `iva_rate` não-NULL

---

## 6. Plano de contas BR — proposta inicial

Estrutura DRE gerencial brasileira clássica (a refinar com input do cliente):

```
1. RECEITA BRUTA
   1.1 Bilheteira
   1.2 Patrocínios
   1.3 Outros (merchandising, F&B, etc.)

2. DEDUÇÕES DA RECEITA
   2.1 Impostos s/ Receita (ISS, PIS, COFINS, ICMS quando aplicável)
   2.2 Devoluções e cancelamentos
   2.3 Comissões de bilheteira
   → RECEITA LÍQUIDA

3. CUSTOS DOS SERVIÇOS PRESTADOS (CSP)
   3.1 Cachet artistas
   3.2 Produção (palco, som, luz)
   3.3 Aluguer de espaço
   3.4 Equipa técnica
   → LUCRO BRUTO

4. DESPESAS OPERACIONAIS
   4.1 Marketing e divulgação
   4.2 Logística (transporte, alojamento, alimentação)
   4.3 Serviços profissionais
   4.4 Camarim
   → EBITDA

5. DEPRECIAÇÃO E AMORTIZAÇÃO
   → EBIT

6. RESULTADO FINANCEIRO
   6.1 Receitas financeiras
   6.2 Despesas financeiras (juros, taxas bancárias)
   → LAIR (Lucro Antes do IR)

7. IMPOSTO DE RENDA E CSLL (informativo gerencial)
   → LUCRO LÍQUIDO

10. CUSTOS CORPORATIVOS (overhead, não alocado a evento — paralelo ao Group 10 PT)
    10.1 Estrutura admin
    10.2 Tecnologia
    10.3 Serviços corporativos
```

Mantém-se a regra Core "Only L3 nodes are selectable".

---

## 7. Cronograma sugerido

| Semana | Fase | Entregável visível |
|---|---|---|
| 1 | 8.0 + 8.1 (parte) | Baselines, TaxEngine PT, refactor 5 ficheiros piloto |
| 2 | 8.1 (resto) + 8.2 | Refactor completo PT, schema `fiscal_meta` em DB |
| 3 | 8.3 | TaxEngine BR + templates de plano de contas |
| 4 | 8.4 | UI BR (modais, labels, locale) |
| 5 | 8.5 + 8.6 | Relatórios BR, export contador, onboarding cliente |
| 5+ | 8.7 | Hardening, docs, testes E2E |

**Buffer**: +1 semana para imprevistos (validação contador, ajustes UX).

---

## 8. Critérios de sucesso

1. Empresa MP (PT) não muda absolutamente nada no comportamento — todos os baselines da Fase 8.0 continuam idênticos.
2. Empresa BR cria transação com Nº NF + CNPJ + valor bruto + impostos + retenções; gera DRE gerencial BR; gera export XLSX que o contador BR aceita.
3. Super-admin (`platform_admin`) navega entre empresas PT e BR sem ver dados cruzados.
4. Trigger guard rejeita: `fiscal_meta` em PT, `iva_rate != 0` em BR.
5. Adicionar 3º país (Espanha hipotético) custa **só** criar `src/lib/tax/es/`, `src/lib/locale/es.ts`, `src/lib/legal-labels/es.ts`, template plano de contas, UI labels — sem mexer no core.

---

## 9. Pontos pendentes para o utilizador

- [ ] **Mágicos H&K**: tratado em separado, **fora deste plano**.
- [ ] **Plano de contas BR §6**: validar estrutura proposta com sócio brasileiro / contador antes da Fase 8.3.
- [ ] **Lista de campos do export contador**: confirmar na Fase 8.0 com cliente BR.
- [ ] **Histórico do cliente BR**: existe XLSX a importar ou começam do zero?

---

## 10. Estratégia de convivência PT vs BR (Modelo B + C)

**Decisão arquitetural**: mono-repo único com adapters por país (Modelo B), com possibilidade pontual de branches sandbox curtas para experiências arriscadas (Modelo C). **Forks paralelos PT vs BR estão proibidos** — divergem em meses e duplicam manutenção para sempre.

### 10.1 Princípios

- **1 codebase, 1 deploy, 1 base de migrations.** PT e BR convivem em runtime, nunca em branches paralelas longas.
- **Isolamento por adapter, não por branch.** Tudo que muda por país vive em `src/lib/{tax,locale,legal-labels}/{pt,br}/` e é resolvido por hook (`useTaxEngine`, `useLocale`, `useLegalLabels`).
- **Zero `if (country === 'BR')` em componentes UI.** Se aparece, é red flag — refatorar para adapter.
- **Features 100% só-BR ou só-PT são permitidas e encorajadas**, desde que isoladas (ver §10.3). Não impactam o outro país.
- **Branches sandbox vivem no máximo 1 mês.** Depois disso, ou merge para main com flag, ou descartar. Nunca deixar branch BR-only viva indefinidamente.

### 10.2 Como adicionar uma feature **só-BR** sem impactar PT

Exemplo: integração específica com ERP brasileiro Omie.

1. **Código de domínio** → `src/lib/integrations/omie/` (pasta nova, BR-only por nome).
2. **Componente UI** → `src/components/br/OmieExportButton.tsx`.
3. **Página/rota** → registar em `App.tsx` envolvida em guard:
   ```tsx
   {company.country === 'BR' && <Route path="/integracoes/omie" element={<OmieExport/>} />}
   ```
4. **Item de menu** → `src/components/AppSidebar.tsx` filtrar por `useLocale().country`.
5. **Edge function** (se precisar) → `supabase/functions/omie-export/` — internamente verifica `company.country` e devolve 403 se PT.
6. **Migrations** → tabelas BR-only podem usar prefixo `br_` (ex: `br_omie_sync_log`) ou simplesmente ter `country = 'BR'` na coluna. Ambas válidas.
7. **Testes** → `src/lib/__tests__/omie.test.ts` com fixtures BR.

**Resultado**: utilizador PT nunca vê o botão, nunca atinge a rota, nunca executa a edge function. Bundle JS carrega o código mas isso é ~KBs negligenciáveis (e mitigável com `React.lazy` se crescer).

### 10.3 Como adicionar uma feature **só-PT** sem impactar BR

Exemplo: ficheiro SAF-T para a AT.

Mesma receita, espelhada:

1. `src/lib/integrations/saft/`
2. `src/components/pt/SaftExportButton.tsx`
3. `App.tsx` → `{company.country === 'PT' && ...}`
4. Menu filtrado por `useLocale().country === 'PT'`
5. Edge function `generate-saft/` rejeita BR
6. Migration: tabela `pt_saft_runs` ou coluna com filtro `country = 'PT'`

### 10.4 Quando usar branch sandbox (Modelo C)

Use branch sandbox **apenas** quando:
- A experiência envolve **mudar comportamento partilhado** e não tens certeza se vai funcionar (ex: testar novo motor de DRE só com cliente BR antes de generalizar).
- O risco de partir PT em main é alto e a feature flag não chega.
- A duração estimada é **< 1 mês**.

Ciclo:
1. Cria branch `sandbox/br-novo-dre` a partir de main.
2. Desenvolve e testa **só com clientes BR** em ambiente Test.
3. Validação concluída → merge para main com flag `country === 'BR'` no adapter.
4. Branch é apagada. **Nunca** fica a viver paralelamente.

Se uma sandbox passar dos 30 dias, parar e decidir: ou merge agora (com flag) ou abandonar.

### 10.5 Anti-padrões a rejeitar em code review

- ❌ `if (country === 'BR') { ... } else { ... }` num componente UI.
- ❌ Componente único `<TransactionForm>` com 2 ramos enormes por país. → Em vez disso: `<TransactionFormPT>` e `<TransactionFormBR>` selecionados por hook.
- ❌ Duplicar uma página inteira (`EventDetailBR.tsx`) só por causa de 2 labels. → Usar `useLegalLabels()`.
- ❌ Branch `feature/br-omie` viva > 1 mês.
- ❌ Hardcode `'IVA'` ou `'NIF'` em strings — sempre via `useLegalLabels()`.

### 10.6 O que **convergência automática** garante

Em Modelo B, qualquer bug fix em código partilhado (`src/lib/iva.ts` substituído por `src/lib/tax/index.ts`, helpers de DRE, lógica de Master/Split, etc.) **beneficia ambos os países no mesmo deploy**. Não há risco de "esqueci-me de portar para o fork BR" porque não existe fork.

Quando aparecer 3º país (ES, AO, etc.), o custo é apenas: 1 adapter `tax/es/`, 1 `locale/es.ts`, 1 `legal-labels/es.ts`, 1 template plano de contas. Não há código duplicado a manter.

---

### 10.7 Protocolo operacional pós-Fase 8 (evolução PT vs BR em ritmos diferentes)

Depois de PT e BR estarem estáveis, surgem semanas em que só queres mexer num lado. **Não se cria "ambiente PT" e "ambiente BR" paralelos** (divergem em meses, ninguém volta a juntar). A separação de ritmo é **temporal**, não estrutural — e funciona via classificação A/B/C + feature flags por empresa.

**10.7.1 Classificação obrigatória de cada pedido**

Antes de tocar em código, cada pedido é classificado pela AI:

| Cenário | O que é | Onde vive | Quem vê em produção no merge |
|---|---|---|---|
| **A — só-PT** | Feature/bug que afeta só empresas PT | `src/lib/tax/pt/`, `src/lib/locale/pt.ts`, ou guard `country === 'PT'` em rota/menu | Só empresas PT. BR fica intocado. |
| **B — só-BR** | Feature/bug que afeta só empresas BR | `src/lib/tax/br/`, `src/lib/locale/br.ts`, ou guard `country === 'BR'` em rota/menu | Só empresas BR. PT fica intocado. |
| **C — partilhada** | Bug fix ou melhoria em código comum (Master/Split, BP, ticketing, UI base) | `src/lib/` raiz, hooks partilhados, componentes neutros | Ambos os países no mesmo deploy. |

Se a AI não conseguir classificar com certeza, **pergunta antes de codar**: *"Isto é só-PT, só-BR, ou partilhado?"*

**10.7.2 Como ter "duas implementações em paralelo" sem fork**

Cenário típico: estás 3 semanas a evoluir BR (novos relatórios gerenciais) e em paralelo queres ajustar PT (novo campo IVA). Fluxo:

1. **Semana 1–3 (BR)**: cada commit toca só `src/lib/tax/br/`, `src/components/reports/.../br/`, ou rotas com guard `country === 'BR'`. Vai para `main`. Empresas PT não veem nada (rota oculta + adapter PT inalterado).
2. **Semana 2 (PT, em simultâneo)**: pedido PT entra. Toca só `src/lib/tax/pt/` ou guards `country === 'PT'`. Vai para `main` no mesmo dia. Empresas BR não veem nada.
3. **Não há "merge" entre PT e BR** porque nunca divergiram — viveram em pastas diferentes do mesmo repo.

A ilusão de "dois ambientes" é dada pelos **guards em runtime**, não por dois repositórios.

**10.7.3 Quando uma feature começa só-BR e depois quer ir para PT**

Acontece muito: testas em BR, valida-se, decides estender a PT. Receita:

1. Mover a lógica de `src/lib/tax/br/feature.ts` para `src/lib/tax/_shared/feature.ts` (ou criar versão equivalente em `tax/pt/`).
2. Remover o guard `country === 'BR'` da rota/menu, ou trocar por `['PT','BR'].includes(country)`.
3. Adicionar baseline de testes PT antes do deploy (D5).
4. Comunicar ao cliente PT que a feature passou a estar visível.

**Não há rebase, não há merge entre branches, não há "portar de um lado para o outro"**. É uma promoção de pasta + remover guard.

**10.7.4 Quando usar feature flag por empresa (em vez de guard de país)**

Se queres testar uma feature **só com 1 empresa BR específica** antes de libertar a todas as BR (ou só com MP antes de todas as PT):

- Usar campo `companies.feature_flags jsonb` (a criar quando precisar).
- Hook `useFeatureFlag('nova_feature')` lê do contexto da empresa ativa.
- Não usar variáveis de ambiente nem branches Git para isto.

Exemplo: *"Quero testar novo DRE BR só com a primeira empresa BR durante 2 semanas"* → flag `dre_br_v2` ligada só nessa empresa, depois liga-se a todas. Zero impacto em PT, zero deploy diferente.

**10.7.5 Quando branch sandbox (Modelo C) é justificada — pós-Fase 8**

Pós-Fase 8, sandbox só faz sentido se:

- Vais reescrever algo **partilhado** (ex.: refactor profundo do motor de Master/Split) e queres iterar sem partir produção;
- A experiência leva **< 1 mês** e tens compromisso de a integrar OU descartar nesse prazo;
- Não envolve plano de contas nem schema fiscal (esses vão sempre por migration em `main`).

Se for só-PT ou só-BR, **não precisas de sandbox** — vai direto para `main` atrás de guard de país. O guard já é o isolamento.

**10.7.6 Quem decide o quê**

| Decisão | Decisor | Quando |
|---|---|---|
| Classificar pedido em A/B/C | AI propõe, **utilizador confirma** | Antes de codar, em cada pedido ambíguo |
| Promover feature só-BR para partilhada (ou vice-versa) | **Utilizador** (sócio/PO) | Quando sentir maturidade da feature |
| Abrir branch sandbox > 1 semana | **Utilizador**, com data de fim definida | Antes de começar |
| Forçar convergência (juntar PT+BR num refactor) | **Utilizador** decide o "quando", AI executa | Quando código duplicado começa a doer |
| Ligar/desligar feature flag por empresa | **Admin/platform_admin** via UI | A qualquer momento |

**Regra de ouro**: a AI nunca abre sandbox nem cria flag sem perguntar. A AI **sempre** classifica A/B/C e propõe a localização exata do código antes de escrever.

**10.7.7 O que **NÃO** é permitido fazer pós-Fase 8 (mesmo que pareça mais rápido)**

- Duplicar componente UI em versão PT e versão BR sem passar por adapter;
- Criar branch Git de longa duração com nome `pt-only` ou `br-only`;
- Comentar código com `// TODO: portar para PT depois` (sinaliza divergência futura);
- Adicionar coluna DB só usada por um país sem default seguro para o outro (parte D2);
- Mexer em código partilhado sem rodar baselines PT (parte D5).

Estes pontos vão para `mem://constraints/multi-country-evolution` quando Fase 8 arrancar, para servirem de checklist em code review.

---

## 11. Resumo executivo

Plataforma fica **country-aware** sem refactor pesado: PT mantém-se 100% igual, BR usa modelo gerencial puro com `fiscal_meta jsonb` informativo. Adapters (`TaxEngine`, `useLocale`, `useLegalLabels`) substituem `if (country === 'BR')` espalhados. Plano de contas por país via templates. Relatórios fiscais segregados, gerenciais universais. Export XLSX neutro para contador BR.

**Convivência PT/BR**: mono-repo único (Modelo B) com adapters; branches sandbox curtas (< 1 mês, Modelo C) só para experiências arriscadas. Forks paralelos proibidos.

**Esforço**: 4–5 semanas. **Risco principal**: regressão silenciosa em PT — mitigado por baselines + testes snapshot. **Saída**: pronto para receber cliente BR sem comprometer estabilidade da operação MP.

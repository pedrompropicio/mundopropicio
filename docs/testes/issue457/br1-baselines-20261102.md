# #457 / #462 — BR1: baselines sintéticos e inventário

02/11/2026. Classe R1; testes e documentação, sem mudança de produção. Base declarada e HEAD local conferido: `5ed4352f7999d3cd6052e3f93cffe5e2d71aad5e`; não houve avanço a comparar antes da edição. Cópia inicialmente limpa. CI `41378307659 completed/SUCCESS` é contexto do despacho, não observação remota deste executor. Nenhum commit, push, sincronização Lovable ou acesso a serviços MP.

## Fontes e limites da leitura

Lidos INDEX, QUADRO (coordenação/reservas), `docs/estado/estado-plataforma-e-infra.md`, `estado-financeiro-e-tesouraria.md` e `estado-fecho-e-socios.md`, AGENTS raiz e `supabase/AGENTS.md` para leitura da implementação partilhada, D-ERP345–350, D-ERP347/#245 e `docs/procedimentos/PROC-promocao.md`. Os estados contêm informação antiga: não são confirmação Live.

Memórias consultadas antes de propor: `.lovable/memory/features/multi-country-roadmap.md`, `iva-espanha.md` e `multi-tenant-test-suite.md`; plano `.lovable/plan-fase-8-multi-pais.md`, incluindo §0, D1–D7 e §8.0. O plano antigo marca gates com vistos, mas também exige baselines operacionais: esses vistos não são revalidados nem aceites aqui. O corpo da #462 e o despacho fornecem o contexto da #457; comentários da mãe não foram carregados remotamente. Prevalecem o despacho atual, company_features existente e a quarentena.

## Inventário anterior à adição

A seleção por nome `bp-|iva|settlement|statement|dre|installment|fx|currency` em `src/lib/__tests__`, `src/test` e `src/components/__tests__` encontrou 40 ficheiros anteriores (não é contagem de toda a cobertura financeira). Não havia teste por nome currency/fx nessa seleção. Exemplos inspecionados:

| Área | Teste anterior / implementação real | Cobertura anterior observada |
|---|---|---|
| IVA PT/ES | `src/lib/__tests__/iva.test.ts` → `src/lib/iva.ts` → `_shared/settlement/iva.ts` | Taxas, cêntimos, sinal, união PT/ES e fallback |
| BP | `src/lib/__tests__/bp-formula.test.ts`, `bp-formula-revenue.test.ts` → `src/lib/bp-formula.ts` | Receita bruta/líquida, zonas, limites, simulador e cortesias |
| Fecho | `src/lib/__tests__/event-settlement-engine.test.ts` → `src/lib/event-settlement-engine.ts` | 27 casos: perímetros, bases, sócios, devoluções e C1/C2 |
| Documento/export do sócio | `src/lib/__tests__/partner-statement-doc.test.ts`, `partner-statement-revenue-groups.test.ts`, `settlement-deduction-documents.test.ts` | Base a transferir, deduções, agrupamento e workbook; não export BR fiscal |
| Pagamento/estorno | `src/lib/__tests__/payment-settlement.test.ts` → `src/lib/payment-settlement.ts` | 8 casos de elegibilidade/estado e filtro; não prova saldos persistidos |
| DRE | `src/lib/__tests__/dre-nature-divergence.test.ts`, `ticket-dre-label.test.ts` | Classificação/rotulagem; não baseline integral DRE |
| Parcelas | `src/components/__tests__/bp-installments.test.ts`, `installment-model-b-retired.test.ts`; `src/lib/installment-nets.ts` | Contratos de parcelas e helper de bases; não demonstram moeda original ponta a ponta |
| Versões/snapshots | `src/lib/__tests__/bp-planilha-version.test.ts`, `bp-version-multi-diff.test.ts`; `src/hooks/useBPVersions.ts` | Seleção/diferenças e chamada `create_bp_snapshot`; não retenção BRL por persistência real |

Os reexports financeiros usam implementação em `supabase/functions/_shared/settlement/`; foram apenas lidos/importados, nunca editados. Não foi criado motor alternativo.

## Casos novos e expectativas justificadas

Novo ficheiro único: `src/lib/__tests__/issue457-br1-baselines.test.ts`. Fixtures literais no próprio ficheiro, todos os nomes/IDs e valores fictícios; sem dados/documentos do piloto. 18 testes parametrizados, nenhum skip/todo novo.

| Grupo | Casos | Expectativa explícita |
|---|---:|---|
| Perda BRL | 2 | 100,01 e 100,02 × taxa fictícia 0,17 arredondam para EUR 17; reconversão dá BRL 100,00. Perda de 0,01/0,02: **LACUNA**, nunca precisão BR aceite |
| Fronteiras de conversão | 4 | BRL 0 → EUR 0; −100,02 → −17; 0,02 → 0; 0,03 → 0,01 |
| Identidade/apresentação | 1 | EUR 100,01 à taxa 1 mantém valor; −17/0,17 → −100; BRL formata 100,01 sem converter; ausência visual → travessão |
| Taxas inválidas nos conversores | 1 | Ida aceita zero/negativo e propaga NaN/Infinity; ausência JS → NaN. Volta devolve 0 para zero/negativo/NaN/ausente. Contratos assimétricos caracterizados, não recomendados |
| Taxa sugerida recusada | 6 | Ausente, null, zero, negativa, texto inválido e Infinity → null, apenas stub local da função invoke |
| Resolução válida/identidade | 1 | EUR não invoca serviço; BRL mantém taxa 0,17, fixing e fonte sintéticos |
| BP/fecho/documento/workbook/DRE PT e ES | 2 | Tabela seguinte; funções reais, sem overrides de resultado/parte no documento |
| Estorno e liquidação | 1 | Pagamento válido → settled; estorno único → legacy quando TX continua paid; outra liquidação válida conserva settled |

Empresa conceptualmente PT; país é o do evento. Moeda EUR em ambos os percursos. As taxas usadas são as devolvidas pelo helper atual, sem introduzir taxas BR. Asserções monetárias são literais, não fórmulas copiadas.

| Valor | Evento PT | Evento ES |
|---|---:|---:|
| Receita líquida fictícia | 1.000,03 | 1.000,03 |
| Despesa base | 100,01 | 100,01 |
| Despesa com IVA atual | 123,01 | 121,01 |
| BP 10% sobre receita líquida de uma venda do valor bruto acima | 10,00 | 10,00 |
| Resultado líquido do evento / DRE normal | 900,02 | 900,02 |
| Base com despesas brutas / DRE apresentação Brasil | 877,02 | 879,02 |
| Parte de 50% do destinatário | 438,51 | 439,51 |
| Base e total a transferir | 433,51 | 434,51 |

O acerto devolve financiamento pago pelo sócio 20,01 menos receita retida 10,01, deduz extras 5 e adiantamento 10; transferência sem IVA adicional. C1/C2 do motor têm de conferir e o motor não pode devolver erros. Workbook real contém resultado e transferência numéricos. O BP é um subcaso independente (não se finge que é o custo 100,01 do fecho). DRE real de `buildDREForExport` é comparada ao cêntimo através de `roundCents`, porque os totais devolvidos ainda podem conter ruído binário; não se afirma igualdade binária nem precisão decimal universal.

A apresentação `brasilMode` da DRE mantém regras/valores D-ERP347/#245. O teste não converte moeda nem transforma empresa PT em BR. A função DRE exportada não prova a paridade completa com `ReportDREBrasil.tsx`, todos os PDFs ou uma sessão no browser.

## Rastreabilidade de moeda original e câmbio

Esta tabela descreve código/payloads, não schema efetivo. Não se inferiu persistência a partir de tipos gerados nem se consultaram bases.

| Percurso | Evidência de código | Preservado no trecho lido × lacuna |
|---|---|---|
| Helpers | `src/lib/currency.ts`, `convertToEur`/`eurToOriginal` | Só retornam número EUR/original reconstruído; não carregam origem. Reconversão perde cêntimos e não recupera original |
| Transações | `src/components/TransactionFormModal.tsx` (payloads a partir de 1610), `TransactionEditModal.tsx` (690–718) | Payload inclui currency/original_amount/fx_rate/fx_rate_source para não EUR; edição prefere original existente e reconstrói se ausente. `parseFloat(...) || null` torna zero ausente no payload. Persistência/triggers não verificados |
| BP | `src/components/ForecastEditModal.tsx` (36–47, 253–262) | Prefere original existente e envia campos de câmbio; fallback por reconversão é vulnerável à perda. Inserção e ciclo completo não exercitados |
| Parcelas | `src/components/ScheduleInstallmentsModal.tsx`, `TransactionInstallmentsEditor.tsx`, `TransactionInstallmentGroupEditor.tsx`, `TransactionRenegotiateInstallmentsModal.tsx`; `src/lib/installment-nets.ts` | Fluxos lidos usam amount/formatam EUR; helper de bases não transporta moeda/câmbio. Preservação BRL por parcela não comprovada |
| Pagamentos e estornos | `src/lib/payment-settlement.ts` | Classifica status/reversed_at; não transporta nem soma moeda original. Estorno financeiro e diferenças cambiais não verificados |
| Motor de fecho | `src/lib/event-settlement-inputs.ts`, `event-settlement-engine.ts` / implementação partilhada | Contrato do motor usa totais/perímetros numéricos; baseline parte de EUR pronto. Carregamento/persistência não testados |
| DRE | `src/lib/export-dre.ts`, `src/components/ReportDREBrasil.tsx` | Agrega amount e IVA; apresentação Brasil usa despesas brutas. Não demonstrado transporte de original/câmbio; vista não é seletor fiscal/moeda |
| Export | `src/lib/export-bp-transactions.ts`, `export-bp-committed-xlsx.ts`, `export-event-bp-pdf.ts`, `export-partner-statement-doc.ts` | Não se encontrou original_amount/fx_rate nos três primeiros pela busca literal; workbook do sócio recebe totais do documento. Export contador BR e fidelidade original continuam lacunas |
| Snapshots | `src/hooks/useBPVersions.ts` (65–88), `src/lib/bp-planilha-version.ts` | Hook chama RPC e filtro seleciona versão; nenhum destes prova que original/câmbio são copiados. RPC/schema real e restore não verificados |

## Verificação antes/depois

A execução antes começou antes de criar o ficheiro BR1. A suite é a definida em `vitest.config.ts` (src); não abrange automaticamente toda a árvore supabase nem scripts externos.

| Verificação | Resultado local |
|---|---|
| Antes — `bunx vitest run` | Exit 0; 330 ficheiros passaram, 2 skipped; 3.201 testes passaram, 6 skipped, 11 todo (3.218 total); 176,76 s |
| Depois — `bunx vitest run` | Exit 0; 331 ficheiros passaram, 2 skipped; 3.219 testes passaram, 6 skipped, 11 todo (3.236 total); 138,69 s |
| Novo ficheiro isolado — `bunx vitest run src/lib/__tests__/issue457-br1-baselines.test.ts` | Exit 0; 18/18, sem skip/todo; 1,74 s |
| Tipos — `bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit` | Exit 0; sem diagnósticos |
| Build — `bun run build` | Exit 0; Vite 9.142 módulos, 1 min 42 s; avisos de Browserslist antigo, imports estáticos/dinâmicos e tamanho de chunks; dependências/configuração preservadas |

Delta antes/depois: +1 ficheiro e +18 testes passados; zero falhas em ambas as execuções e nenhuma alteração de skips/todos. `git diff --check` passou; links relativos dos novos documentos e prefixo integral original de DECISIONS conferidos. O diff final contém apenas seis ficheiros autorizados (teste, relatório, visão, INDEX, DECISIONS e resumo). CI remoto do diff depende da revisão/integração pelo controller; não foi criado commit nem PR nesta cópia local.

## Mapa de lacunas e próximo pacote

- Precisão: preservar BRL original exatamente e provar transportes/round-trip por documento, conta, parcelas e snapshots exige contrato e regressões adicionais; não alterar D7 sem contraprova ao Pedro.
- Validação: helpers baixos não têm política uniforme para taxas inválidas/ausentes; testes caracterizam comportamento e não autorizam usar zero como ausência fiscal.
- Financeiro: não há novos baselines de perdas do motor, retenções tributárias BR, diferenças cambiais, montantes de estorno, múltiplos níveis ou reconciliação persistida; parte já tem testes anteriores, sem promessa de cobertura integral.
- Outputs: novos casos cobrem um builder DRE e workbook; PDF, render React, restore de snapshot, XLSX contabilístico e integrações externas não estão certificados.
- Operação: sem snapshots de eventos reais, browser autenticado ou E2E; gate 5 permanece parcial. Não há parecer contábil/jurídico recebido nem validação de contrato de export BR.
- Próximo pacote mínimo proposto: contratos sintéticos de transporte original/câmbio em parcelas/snapshots/export e cenário monetário de estorno/perda usando módulos reais, com âmbito próprio; sem segundo motor. Antes de produção, reunir evidências de cada um dos [seis gates](../../planejamento/plataforma-saas-2027.md#seis-gates-da-fase-8-e-evidência-necessária) e obter go/no-go formal.

Não foram alterados produção, dependências, CI, flags, QUADRO, estados, .lovable, supabase, drizzle, .github ou .env. Não houve serviço MP, Live/homolog remoto, DDL/DML, credenciais, deploy/Publish ou envios. Quarentena mantida; fase 8.0 parcial, #457 não fechada e piloto BR/SaaS não declarados prontos.

# Sistema de Gestão de Eventos como SaaS em 2027

Documento vivo. Referência desta revisão: 02/11/2026, repo `5ed4352f7999d3cd6052e3f93cffe5e2d71aad5e`, pacote BR1 da #462, filha da #457. Evidência local de código, sem consulta a bases ou confirmação de comportamento Live.

Pedro confirmou o objetivo de um Sistema de Gestão de Eventos como plataforma SaaS em 2027: uma plataforma de gestão com capacidades reutilizáveis entre empresas. Social Music é o piloto BR indicado; não é um produto separado nem autoriza cadastro, publicação de dados ou onboarding. Fontes da direção: #457, comentários [6567993220](https://github.com/pedrompropicio/mundopropicio/issues/457#issuecomment-6567993220) e [6567622911](https://github.com/pedrompropicio/mundopropicio/issues/457#issuecomment-6567622911), conforme corpo e despacho fornecidos à #462. Os comentários não foram consultados remotamente nesta execução.

## Atual verificado no repositório × pendente

| Capacidade | Evidência atual local | Prontidão ainda por demonstrar |
|---|---|---|
| Multiempresa e capacidades por empresa | `src/hooks/useCompany.ts`, `src/hooks/useCompanyFeatures.ts`, `src/components/RequireFeature.tsx`, `src/lib/features.ts` | Isolamento efetivo atual, configuração e operação de cada tenant; o hook não prova RLS Live |
| Gestão financeira de eventos | Reexports `src/lib/iva.ts`, `bp-formula.ts`, `event-settlement-engine.ts`, `partner-statement-doc.ts`; implementação partilhada em `supabase/functions/_shared/settlement/` | Cobertura completa BP/transações/parcelas/fecho, persistência, reconciliação e cenários históricos |
| PT→ES | `src/hooks/useEventIvaCountry.ts` e `.lovable/memory/features/iva-espanha.md`; BR1 exercita cálculo PT/ES | Não demonstra empresa fiscal ES nem obrigações fiscais locais |
| Moedas e câmbio | `src/lib/currency.ts`; formulários de transação e edição de forecast preservam campos de origem no payload | Precisão BRL em todo o ciclo, snapshots/export e tratamento uniforme de ausência/erro |
| Documentos e exportação | `src/lib/export-dre.ts`, `export-partner-statement-doc.ts`, `export-bp-transactions.ts`; BR1 exercita DRE e workbook sintéticos | Contrato do export com contador BR, completude de documentos, integração externa e persistência exata |
| Onboarding | Fluxos referidos na memória `multi-tenant-test-suite.md` | Repetibilidade, critérios de aceitação, suporte e percurso de entrada/saída SaaS não verificados; não declarar onboarding pronto |
| Operabilidade | `docs/procedimentos/PROC-promocao.md` e estado de plataforma descrevem promoção e trabalho de homologação | Evidência operacional atual de recuperação, monitorização, incidentes, segregação e integrações; os estados são históricos |
| Billing, SLA, custos e condições comerciais | Sem avaliação neste pacote | Maturidade, contratação, preço, SLA, arquitetura nova e data exata de lançamento não decididos por este documento |

Reutilizar uma codebase multi-tenant e o `company_features` existente, sem fork nem condições pelo nome da empresa, nem mecanismo paralelo de flags. País fiscal da empresa, moeda do documento, moeda da conta e país do evento são dimensões distintas. O desenho futuro deve preservar exatamente BRL original e câmbio; EUR canónico continua D7 até contraprova apresentada ao Pedro. O plano antigo é referência de desenho, não prova de implementação ou autorização para o implementar.

A DRE Brasil mantém a apresentação e regras acordadas com sócios brasileiros (D-ERP347/#245); não seleciona país fiscal nem moeda. PT→ES continua válido para empresa PT e evento em Espanha. Não se reinterpretam dados ou regras existentes como suporte fiscal BR.

## ERP e contabilidade externa

A plataforma reúne gestão, dados, documentos, exportação e integrações com a contabilidade externa. Cálculos e estimativas gerenciais dependem de regras validadas. Escrituração, SPED e apuração oficial permanecem externos. Pedidos de validação contábil e jurídica continuam pendentes; nenhum parecer foi recebido no contexto fornecido. Não se definem alíquotas, incidências, calendários fiscais ou schema. Campo ausente não equivale a zero fiscal.

## Seis gates da fase 8 e evidência necessária

A quarentena permanece. As marcações antigas do plano e os estados de plataforma/financeiro não são comprovação atual. Nenhum gate é declarado concluído pelo BR1.

| Gate | Evidência de saída a obter pelo responsável autorizado | Situação neste pacote |
|---|---|---|
| 1. Batch 9 NOT NULL sem incidente | Registo de aplicação e verificação no ambiente autorizado | Não verificado |
| 2. RLS legacy = 0 | Auditoria atual com universo, ator e resultado explícitos | Não verificado |
| 3. 14 dias sem bug multi-tenant | Janela datada e registo de incidentes acompanhado | Não verificado |
| 4. Segundo cliente operacional | Aceitação operacional sem divulgar dados privados | Não verificado; indicação de piloto não a substitui |
| 5. Baselines DRE/BP completos | Matriz de cenários, resultados e lacunas aceites para proteger o refactor | Parcial: BR1 sintético; sem snapshots operacionais/E2E |
| 6. Go/no-go formal | Decisão do Pedro após leitura das cinco evidências anteriores | Pendente; aprovação do BR1 não libera fase 8.1 |

## Próximo pacote mínimo proposto

A revisão seguinte pode completar, sob novo despacho delimitado, os contratos e casos sintéticos de parcelas, preservação original/câmbio em snapshots e exportações, perdas/estornos monetários e erros de integração, sem duplicar motores. O [relatório BR1](../testes/issue457/br1-baselines-20261102.md) delimita a cobertura presente. A sequência de implementação de produção continua dependente de evidências dos seis gates, pareceres aplicáveis e decisão formal. Este documento não aprova TaxEngine, schema, rollout, arquitetura nova ou prioridade comercial.

# Sistema de Gestão de Eventos como SaaS em 2027

Documento vivo. Referência desta revisão: 02/11/2026, repo `6a58f5bf466f907eccc265ed1856a5ab4596f3d2`, pacote BR1b da #465, filha da #457; BR1 da #462 integrado. Evidência local de código, sem consulta a bases ou confirmação de comportamento Live.

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

## Etapas e critérios de saída

Plano proposto BR1b, organizado a partir do despacho #465 e do plano do 0 referido no comentário 6568495364 da #457 (contexto fornecido, sem consulta remota). Responsáveis são encaminhamentos para confirmação pelo 0. Nenhuma duração, data de entrega, preço ou SLA é assumido. O objetivo de 2027 é direção D-ERP351, não compromisso de lançamento.

| Etapa | Entrega | Dependência | Responsável proposto | Critério de saída | Estado em 02/11/2026 |
|---|---|---|---|---|---|
| 0 — Base BR1 | Inventário e 18 baselines sintéticos de #462 | Base main integrada | Executor #462 / revisão 0 | Testes e relatório BR1 integrados, limites explícitos | Done para o pacote BR1; gate de baselines integrais permanece parcial |
| 1 — Contrato/prontidão BR1b | Contrato monetário, mapa por borda, regressões reais pontuais, gates e pauta de assessoria | BR1; decisões monetárias/fiscais abertas identificadas | Executor #465; 0 revê; Pedro/assessoria decidem | Documentos revistos, testes locais/CI e aceite das lacunas/menor próximo incremento | Preparado localmente nesta entrega; revisão/merge manual do 0 e decisões pendentes |
| 2 — Adapter PT/ES | Refactor incremental preservando comportamento e cêntimos, sem criar empresa ES | Seis gates e go formal, baselines completos; despacho próprio | Financeiro/2 com revisão 0 | Paridade PT e PT→ES em cenários aceites, homolog e promoção autorizadas | Não iniciado; TaxEngine fora desta entrega |
| 3 — Base BR/cadastros/tributos documentais | Dados e regras documentais versionadas, plano de contas validado e dimensões separadas | Etapa 2; pareceres e decisões; #403/0302 conferida, sem duplicação | Financeiro + assessoria; estrutura pelo 0/PROC-promocao | Campos/ausências/versões validados, isolamento e mapeamento contabilístico aceites | Proposta; sem schema, alíquotas ou calendários novos |
| 4 — Ciclo financeiro BR | Original exato por BP/TX/parcela/pagamento/estorno/snapshot e reconciliação de contas | Contrato monetário decidido, capacidade D7 demonstrada, etapas 2–3, autorizações R1/R2 próprias | Financeiro + 7; 0 coordena | Totais por moeda e resíduos conferem; partial/estorno/restore concorrentes testados, PT intacto | Lacunas concretas mapeadas; não iniciado |
| 5 — Exports/contabilidade externa | Export versionado com dados/documentos e mapeamento aceite | Etapas 3–4; contrato do contador/ERP externo validado | Financeiro/assessoria, revisão 0 | XLSX/documentos sintéticos reconciliados e aceite do destinatário; completude/erros demonstrados | Pendente; não é escrituração/SPED/apuração oficial |
| 6 — Piloto Social Music em homolog | Roteiro sintético operacional da mesma codebase, com company_features existente | Etapas anteriores e despacho para homolog; segregação e permissões validadas | 0 + responsável do piloto indicado por Pedro | Cenários de entrada, operação, correção, export e suporte aceites, sem dados reais/fork/if nominal | Não iniciado; indicação do piloto não encerra gate de segundo cliente operacional |
| 7 — Prontidão SaaS | Onboarding repetível, observabilidade, recuperação, suporte, saída e decisões comerciais | Aceite do piloto, evidência operacional e decisões de Pedro | Pedro/0 + plataforma e frentes operacionais | Checklist de operação e responsabilidades aprovado; contratação/custos/SLA definidos com origem quando aplicável | Pendente; não declarar SaaS pronto ou go/no-go |

A ordem não concede autorização de execução. O menor próximo PR deve tratar a repartição do original nas parcelas, conforme o [relatório BR1b](../testes/issue457/br1b-contrato-20261102.md#próximo-pr-de-produção-mínimo-proposto), antes de tentar certificar o ciclo inteiro. Regras de câmbio, fiscalidade, imutabilidade e saldos permanecem decisões pendentes; EUR canónico D7 é preservado. A etapa 2 continua condicionada a go, mesmo com um pacote corretivo de precisão proposto separadamente.

Correção funcional R1 #467 preparada localmente para a lacuna de comparação: mudanças apenas em moeda/original/taxa/fonte passam a aparecer no filtro de diferenças e por versão no modal/PDF, com totais EUR preservados. [Relatório e limites](../testes/issue457/comparacao-moeda-20261102.md). Revisão/integração manual pelo 0 e publicação pendentes; integrado não significa publicado. O contrato continua proposta, sem iniciar TaxEngine, resolver parcelas ou validar gates.

A [matriz BR1b dos seis gates](contrato-monetario-multiempresa.md#seis-gates--matriz-de-evidência) identifica fonte, data, universo, limites, responsável e próxima verificação; contém SELECTs mínimos como proposta para um futuro Sim, nunca executados. A aprovação destes documentos não encerra gates nem a mãe #457. O [contrato monetário](contrato-monetario-multiempresa.md) contém a pauta contábil/jurídica preparada, sem envio nem parecer. O desenho antigo de fase 8 permanece histórico: flags novas, datas e prazos ali escritos não são plano operativo atual.

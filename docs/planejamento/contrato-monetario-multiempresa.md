# Contrato monetário multiempresa — proposta BR1b

Referência: 02/11/2026, #465 (BR1b da #457), HEAD `6a58f5bf466f907eccc265ed1856a5ab4596f3d2`. Documento de prontidão, sem alteração de produção, schema ou política. O despacho fornecido prevalece sobre o desenho histórico da fase 8. Nenhuma consulta a base foi feita.

## Estatuto e fontes

**Decidido** significa decisão já registada, não aprovação deste texto. **Observado** significa leitura de código local ou execução sintética identificada. **Proposto pendente** exige decisão/validação antes de implementação; não se transforma em regra pela publicação deste contrato.

Fontes lidas: INDEX, QUADRO, estados de plataforma e financeiro, AGENTS raiz e `supabase/AGENTS.md`, D-ERP345–351 e PROC-promocao. Memórias anteriores ao diagnóstico: `.lovable/memory/features/multi-country-roadmap.md`, `iva-espanha.md`, `multi-tenant-test-suite.md`, `transactions-bp-linkage.md`, `transaction-installments.md`, `payment-amount-invariants.md`, `reverse-transaction.md`, `payment-account-ownership.md` e `reporting/bp-vs-transactions.md`. `.lovable/plan-fase-8-multi-pais.md` é histórico de desenho: vistos, prazos, flags a criar e ambientes antigos não constituem prova atual nem substituem `company_features`/PROC-promocao. A memória de linkage diz que não existe `transactions.forecast_id`; o INSERT atual do formulário envia esse campo. A memória de parcelas inclui o Modelo B antigo; o formulário atual cria transações irmãs. Usar o código observado para delimitar a investigação e confirmar o catálogo apenas sob autorização própria.

[BR1](../testes/issue457/br1-baselines-20261102.md) e `src/lib/__tests__/issue457-br1-baselines.test.ts` já caracterizam perda na reconversão e assimetria de FX inválido. Não foram alterados nem repetidos. O corpo/despacho de #465, a referência ao plano do 0 no comentário 6568495364 e o CI 41383542878/SUCCESS são contexto fornecido, não consultas remotas do executor.

## Dimensões, exatidão e decisões abertas

Os nomes abaixo são conceitos de contrato, não proposta aprovada de colunas/tipos novos.

| Item | Decidido / observado | Proposta pendente e aceitação a obter |
|---|---|---|
| Empresa e país fiscal | Uma codebase multiempresa, D-ERP351; D1 histórico atribui semântica à empresa | Identificar empresa e versão do enquadramento fiscal separadamente de cidade/evento. Pedro + assessoria confirmam enquadramento antes de regras BR |
| País do evento | `useEventIvaCountry.ts` resolve cidade/subeventos; empresa PT pode operar evento ES | Preservar PT→ES. País do evento não cria empresa ES nem escolhe moeda ou regime |
| Moeda do documento | `currency`, `original_amount` e `fx_rate` aparecem em TX/BP | Original decimal exato informado deve sobreviver ao ciclo; definir escala por moeda e representação decimal/inteira em implementação posterior. Nunca recuperar original por EUR/taxa |
| Moeda da conta | `account_id` liga o pagamento à conta; saldo lido no helper usa `paid_amount` | Validar capacidade de conta não EUR e unidade de saldo/implantação antes de permitir operação BR. Não tratar moeda documental como moeda da conta |
| Base canónica | D7 mantém armazenamento EUR; D6 histórico prevê consolidação em líquido EUR | Preservar EUR até contraprova de capacidade e decisão de Pedro. BR1 prova que EUR isolado não reconstrói BRL; não prova impossibilidade de EUR + original exato |
| Semântica do montante | PT observado: `amount` base sem IVA EUR; `paid_amount` bruto EUR. D1/D2 do desenho histórico prevêem BR bruto com tributos como deduções, sem implementação comprovada | Identificar base/bruto e deduções por versão e operação; validar convenção BR com assessoria sem alterar PT. Original exato precisa indicar a mesma natureza do valor documental, não apenas moeda |
| Valor e origem | Formulários enviam original; origem da captura/documento não tem contrato uniforme comprovado | Retenção de valor informado, moeda, origem (manual/importação/documento), identidade/versionamento e vínculo documental. Retificar por versão/rastreio, sem reescrever original confirmado silenciosamente |
| Imutabilidade após confirmação | Há guards financeiros em fluxos existentes; não demonstram imutabilidade integral do original | Exigir original confirmado imutável no contrato proposto; Pedro decide o marco de confirmação e exceções autorizadas. Definir cancelamento/retificação e auditoria com assessoria; não inventar freeze universal |
| Câmbio | `fx_rate_source`; `currency.ts` devolve `dateUsed/source` na sugestão; payloads lidos não comprovam fixing persistido | Taxa positiva finita, direção explícita (EUR por unidade original), data solicitada e fixing usado, fonte e motivo de override. Bloquear ausência/erro onde conversão é necessária. Pedro/assessoria decidem fonte, competência e datas; sugestão não é política contabilística |
| Arredondamento | Conversão arredonda EUR a 2 casas; `computeInstallmentNets` usa bases de 4 casas | Aprovar escala, modo e momento por borda, distribuição determinística do resíduo e reconciliação por moeda. Não aplicar duas casas a bases de parcelas indiscriminadamente; não usar tolerância para apagar original |
| Zero e ausente | `parseFloat(originalAmount) || null` elimina zero no payload; comparador distingue linha ausente de linha zero | Zero explícito deve manter-se zero; desconhecido/não aplicável não deve virar zero financeiro/fiscal. Definir estados e validação por campo; rejeitar NaN/Infinity. Não aprovar fallback cambial implícito |
| Sinal/estorno | `type` distingue receita/despesa; RPC distingue `cash_refund` e `supplier_credit` | Definir sinal uma vez por representação, vínculo ao original, montante e moeda estornados, total/parcial e saldo residual; impedir dupla negação. Crédito de fornecedor não prova entrada em caixa |
| Pagamento parcial | `paid_amount` é EUR derivado no servidor, com exceções; lote calcula original restante proporcionalmente ao EUR restante | Somar liquidações originais válidas na sua moeda em vez de inferir saldo original de proporção EUR. Acordar retenções/créditos, tolerâncias e quitação cambial, sem criar regra nova de saldos |
| Diferença cambial | `closes_transaction` permite fecho estrangeiro; não é lançamento de diferença cambial demonstrado | Guardar valor contabilizado e valor liquidado, com taxas/datas distintas; assessoria define reconhecimento, classificação e reversão da diferença. Não lançar diferença pelo simples resíduo |
| Consolidação | D6 histórico não autoriza somar semânticas/moedas diferentes | Relatórios devem identificar base e universo, ausência de taxa e incompletude; aprovar competência/conversão antes de consolidar empresas. Não somar bruto BR com líquido PT |
| Tributos documentais | D-ERP351: ERP gerencial alimenta contabilidade externa; D-ERP347/#245 mantém apresentação DRE aos sócios | Incidência, vigência, regime e operação precisam de validação e versão para tributos novos e antigos. Ausente ≠ zero. IBS agregado não se soma novamente aos componentes. Sem alíquotas/calendários codificados, apuração oficial, SPED ou emissão NF |

## Rastreio das bordas reais

Universo: os trechos locais citados neste HEAD. Payload e tipos não provam persistência, ACL efetiva, instalação ou efeitos de triggers. As linhas de código são âncoras deste HEAD, não promessa de estabilidade futura.

| Borda e funções | Campos lidos/enviados e exatidão observada | Menor pacote corretivo / prova que falta |
|---|---|---|
| BP → edição | `ForecastEditModal.tsx:36–47,253–262`: prefere `forecast.original_amount`, senão `eurToOriginal(amount, fx_rate)`; `forecastEditDiff` filtra alterações; envia `currency/original_amount/fx_rate/fx_rate_source` | Original existente pode ser usado; fallback não garante original exato (BR1). Separar edição de valor conhecido de reconstrução pendente; confirmar fixing e proteção do original no writer |
| BP → TX | `TransactionFormModal.tsx:1552–1613`: usa `selectedForecastId` em `forecast_id`, `amount`, `iva_rate`, categorias e campos FX do estado do formulário. `TransactionFormModal.tsx:3003–3023` preenche amount/IVA/categoria ao selecionar linha, sem copiar moeda/FX nesse handler. `EventForecast.tsx:1251–1285`, `bulkCreateTxMutation`, envia amount/iva_rate/forecast_id sem currency/original_amount/fx_rate/fonte no INSERT observado | Omissão no payload da geração é concreta; efeito de defaults/triggers não comprovado. Exercitar criação manual e geração BP separadamente com mock do writer; corrigir transporte dos campos após contrato e provar inicialização/cópia de moeda/original e FK. Não inferir transferência de FX por existência da FK nem por match de descrição |
| TX → parcelas | `TransactionFormModal.tsx:1542–1557,1790–1838`: `computeInstallmentNets(grossParcels, baseTotal, multiplier)` produz bases; primeira e irmãs recebem o mesmo `originalAmount` integral, currency/taxa/fonte; irmãs têm group/number/total. `TransactionRenegotiateInstallmentsModal.tsx:169` também usa helper. Editors formatam EUR | Bases numéricas testadas, mas original por parcela não repartido no payload observado. Corrigir primeiro a repartição original do grupo, preservar total e resíduo por moeda e impedir duplicação na edição/renegociação. Sem afirmar que cada original integral foi persistido |
| Parcelas → pagamento | `TransactionPaymentModal.tsx:510–516`: original do pagamento é reconstruído de `addAmount` EUR via taxa do dia ou TX. `BatchPaymentModal.tsx:149–158,460–468`: `remainingFx = origAmt * remainingEurClean / total`, arredondado; envia moeda/original/taxa/fonte e `closes_transaction` | Reconversão/proporção não é prova de saldo original. Próximo pacote deve transportar original parcial explícito e reconciliar pagamentos válidos antes de calcular restante. Datas e fontes precisam de contrato e revalidação no servidor |
| Pagamento → estorno e saldo | `PaymentTimeline.tsx:252–282`: RPCs `reverse_payment` (`p_amount` incluído) e `reverse_transaction`. `payment-settlement.ts` só classifica paid/não estornado. `account-balance.ts:computeAccountBalance` usa `paid_amount`, corte por conta e ajustes; não executa estorno | Regressões BR1b provam consumo monetário de estados já derivados, sem provar derivação/efeito real. Parcial em moeda original, caixa versus crédito, concorrência e atomicidade exigem UI+RPC+catálogo em pacote próprio |
| Writer servidor → snapshot | `useBPVersions.ts:67–88` chama `create_bp_snapshot`; SQL versionado `supabase/migrations/20260920202855_62cedbbe-e0ab-46e1-b652-261a8cf30d9c.sql:60–64,143–147` agrega `to_jsonb(f.*)` no payload master/split | Contraprova: captura versionada não faz whitelist que omita FX. Sem catálogo atual não afirmar perda nem preservação efetiva. Inspecionar freeze, cenário/clonagem e restore em conjunto; fixture integral deve voltar sem perda de original/zero/fixing |
| Snapshot → comparação | Correção R1 #467 preparada na cópia local: ForecastSnapshot/buildMultiDiff preserva e compara currency/original_amount/fx_rate/fx_rate_source; modal e PDF exibem valores por versão e campos alterados, mesmo com EUR constante | A expectativa de invisibilidade BR1b passa a positiva; legados, ausência/zero, decimais equivalentes e inválidos têm regressões sintéticas. [Prova e limites](../testes/issue457/comparacao-moeda-20261102.md). Revisão/integração pelo 0 e publicação pendentes; não prova freeze/restore nem aprova este contrato |
| TX/snapshot → DRE/export | `export-dre.ts:buildDREForExport` agrega amount/IVA; `ReportDREBrasil.tsx` apresenta regra aos sócios. `export-bp-transactions.ts` renderiza PDF; `export-bp-committed-xlsx.ts:buildCommittedBpWorkbook` usa `buildClosingReportData`, cabeçalhos base/IVA/total; `export-partner-statement-doc.ts` renderiza documento partilhado | BR1 já cobre DRE/workbook do sócio. Outputs citados não constituem export de original/fixing para contador. Definir export versionado com base/original/moeda/taxa/data/fonte, documentos e reconciliação; testar builder real e bytes XLSX após existir contrato de consumo. Não duplicar motor nem chamar este pacote de export fiscal BR |

SQL histórico de `_derive_paid_amount` (`20260928221118_bea24c4b-e61c-4fd0-b901-59eba78bfbe1.sql:2–45`) soma `amount` EUR e considera `closes_transaction`; o trecho filtra `status='paid'`. Isso diverge da descrição atual de exclusão de `reversed_at` no helper: é motivo para obter definição instalada, não diagnóstico de bug corrente. `reverse_payment` em `20260811130821_3d1200d5-3022-47ed-8b13-d0d8f89c6120.sql` usa `p_amount` para crédito de fornecedor e marca reversão; não transporta original/fixing nesse trecho. Migrações posteriores podem mudar corpos: história não prova catálogo atual. SQL/UI indivisíveis não foram reproduzidos em mini-pipeline, PGlite nem teste espelho.

## Seis gates — matriz de evidência

Nenhum gate encerrado nesta entrega. Data de avaliação documental: 02/11/2026. Responsáveis abaixo são encaminhamentos propostos para o 0 confirmar, sem nova atribuição operacional.

| Gate | Fonte / data / universo / limite | Estado | Responsável e próxima verificação |
|---|---|---|---|
| Batch 9 NOT NULL sem incidente | Plano fase 8 §0 de maio/2026 marca visto; memória mantém quarentena; sem lista canónica de colunas ou catálogo atual neste pacote | Histórico, atual inconclusivo | 2/0: recuperar manifesto Batch 9, confirmar NOT NULL em todas as colunas e registo de incidentes/aplicação com ambiente/data |
| RLS legacy = 0 | Plano §0 e memória descrevem auditoria; sem resultado contemporâneo; existência de testes não prova ACL atual | Histórico, atual pendente | 2/0: auditar catálogo e ator/universo, políticas legadas e permissões; arquivar resultado sanitizado e data |
| 14 dias sem incidente multi-tenant | Visto antigo não inclui janela nem registo atual; estados lidos descrevem frentes, não janela de ausência | Inconclusivo | 2/0: indicar início/fim, fontes de incidentes, critérios e cobertura; ausência de Issue encontrada não é ausência de incidente |
| Segundo cliente operacional | D-ERP351/#457 (02/11) indica Social Music como piloto; nenhum aceite operacional fornecido | Pendente | Pedro/0: obter aceite operacional com universo/ambiente, sem publicar clientes/dados; existência de empresa ou piloto não basta |
| Baselines completos | BR1 de 02/11: 18 testes sintéticos, PT/ES; BR1b: 8 novos casos em helpers; sem snapshots operacionais/E2E, restore nem liquidação persistida | Parcial verificado localmente, gate pendente | Financeiro + 7 + 2/0: fechar matriz de cenários/lacunas, baselines autorizados e reconciliação; não trocar critério por contagem de testes |
| Go/no-go formal | Despacho #465 autoriza testes/documentação; comentário 6568495364 é referência de plano fornecida | Pendente | Pedro, coordenado pelo 0: decisão explícita após evidências anteriores e pareceres aplicáveis; autorização de planeamento não equivale a go |

### PROPOSTA de inspeção SELECT para um futuro «Sim»

Texto apenas, revisto contra os conceitos citados, **não executado**. O 0 deve delimitar ambiente, ator, data e manifesto antes de pedir Sim. Não recolher linhas financeiras, IDs ou dados privados. Não chamar RPC que possa escrever só por ser invocada com SELECT.

```sql
-- Gate 1: substituir os parâmetros pelo manifesto Batch 9 aprovado,
-- uma execução por coluna; zero linhas significa objeto ausente, não sucesso.
SELECT table_schema, table_name, column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = :schema_name AND table_name = :table_name
  AND column_name = :column_name;

-- Gate 2: triagem de candidatos legacy, não auditoria completa de isolamento.
-- Universo public+crm e padrão literal aproximado; variantes semânticas exigem revisão.
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname IN ('public', 'crm')
  AND (coalesce(qual, '') ~* 'auth\.uid\(\)\s+IS\s+NOT\s+NULL'
    OR coalesce(with_check, '') ~* 'auth\.uid\(\)\s+IS\s+NOT\s+NULL');

-- Borda financeira: obter definições e segurança, sem chamar as funções.
-- Todas as overloads, incluindo diferenças de defaults, devem ser revistas.
SELECT p.oid::regprocedure AS assinatura, p.prosecdef, p.proconfig, p.proacl,
       pg_get_functiondef(p.oid) AS definicao
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('create_bp_snapshot', 'revert_to_bp_version',
    'reverse_payment', 'reverse_transaction', '_derive_paid_amount');
```

Os parâmetros `:...` são placeholders para revisão, não SQL pronto a executar. Gate 1 precisa ainda de registo sem incidente, não só NOT NULL. Gate 2 exige revisão semântica de todas as políticas relevantes, roles efetivos e RLS ativo, não só zero matches nesta triagem. Para janela de incidentes, aceite do cliente, baselines e go formal não há tabela canónica demonstrada: pedir evidência documental ao responsável, sem inventar SELECT em tabelas presumidas. Análises financeiras futuras respeitam D-ERP289: corte por conta no primeiro `bank_statements.period_from`, obtido na hora sob autorização; estes SELECTs de catálogo não medem histórico financeiro.

## Pauta para assessoria indicada por Pedro — preparada, não enviada

Sem parecer recebido ou validação jurídica/fiscal realizada. O ERP fornece gestão/documentos/dados para contabilidade externa; cálculos estimados só após regras validadas.

| Tema | Pergunta e insumos a validar | Saída esperada / decisão aberta |
|---|---|---|
| Incidência, vigência, regime, operação | Que país fiscal, regime e natureza/competência da operação determinam cada tributo/retenção, antigo ou novo? Como documentar isenção, não incidência e informação desconhecida? | Matriz versionada de regras e fontes validada pela assessoria; Pedro decide âmbito gerencial. Sem codificar lei/alíquota/calendário por inferência |
| Documentos e retenções | Quais campos são obrigatórios por documento/operação, como retificar e comprovar? Como representar agregado IBS e componentes sem dupla soma? | Esquema de dados documentais e validações com vigência, ausência distinta de zero; não emissão de NF ou apuração oficial |
| Plano de contas e DRE | Qual mapeamento gerencial BR e export para contas externas? Como separar custos, tributos, retenções e créditos? | Template/mapeamento aprovado; preservar D-ERP347/#245 como apresentação aos sócios, sem convertê-la em política fiscal |
| Câmbio e diferenças | Qual fixing/fonte/data para documento, parcela, pagamento e consolidação? Como reconhecer diferenças, estorno parcial e crédito? | Política aprovada por competência, sinal e reconciliação; decisão sobre tolerâncias/imutabilidade. EUR D7 permanece até decisão explícita de Pedro |
| Export de dados/documentos | Quais colunas, versões, identificadores, anexos, formato e reconciliações a contabilidade externa aceita? | Amostra sintética e aceite do contrato; definir limites de integração e responsabilidade. Sem ERP-alvo, SPED ou escrituração presumidos |

#403/0302 já trata contas estrangeiras e identificador fiscal de fornecedor: reutilizar o trabalho existente após confirmação de estado pelo 0, sem criar cadastro concorrente nem assumir que o ficheiro preparado foi instalado. Dados/contas/países são dimensões separadas. Social Music permanece piloto sem dados reais, fork ou condição nominal. O [plano SaaS](plataforma-saas-2027.md) organiza as etapas; o [relatório BR1b](../testes/issue457/br1b-contrato-20261102.md) delimita o próximo PR mínimo, riscos e autorizações.

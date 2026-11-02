# #475 / E2b — matriz de preservação da renegociação · 02/11/2026

## Resultado e fronteira

Esta matriz identifica condições que o próximo candidato à `public.renegotiate_transaction_installments(uuid,jsonb,text) RETURNS uuid` precisa preservar e as contraprovas ainda necessárias. **Não há candidato SQL, migração, preflight executável ou alteração de guarda nesta parcela.** O inventário amplia o relatório anterior com a evolução estrutural, ligações de triggers/helpers, escritores efetivos, recursos partilhados e ensaios de interleaving. Não certifica catálogo instalado nem autoriza aplicação.

Base e HEAD local: `714ba8a138f5b2fe7002135fe3d8715be93abaa0`; árvore inicialmente limpa. Início conferido às 09:30:48 UTC, dentro da validade até 09:59 UTC. Autorização/reserva, CI verde da base e situação da PR anterior são contexto do despacho fornecido, sem consulta remota. O despacho limita escritas a este novo documento e `.executor/resumo.md`; prevalece sobre o corpo histórico da Issue e sobre rituais gerais de atualização documental. Não houve rede MP, catálogo MP, Live, credenciais, dados reais, aplicação, commit, push ou merge. #475/#457 permanecem abertas; não se declara Brasil pronto.

## Método, leituras e significado da evidência

Lidos `docs/INDEX.md`, QUADRO (execução/frente financeira), estado financeiro e estado de vínculo BP, AGENTS raiz e Supabase (não há AGENTS subordinado em docs/testes/issue457), arranque 0 de 02/11, D-ERP345–351 pelo índice canónico e PROC-promocao. Lidos os dois relatórios anteriores exigidos, os cinco corpos SQL e os quatro testes de caracterização, sem os modificar. Memórias consultadas apenas como orientação: `transaction-installments.md`, `transactions-bp-linkage.md`, `payment-amount-invariants.md`, `transaction-paid-guardrails.md` e `transaction-documents.md`; nenhum dado operacional dessas memórias é reproduzido aqui.

A memória de parcelas descreve Modelo B; o código de criação atual usa Modelo A (primeira TX e irmãs estruturais). A memória BP descreve guarda L2 e ausência de `forecast_id`; a fonte posterior cria N:1 e remove/substitui esses triggers. Prevalecem #298/Modelo A, o código atual e as guardas #471. Os relatórios anteriores são evidência histórica, não uma nova execução nem uma descrição do catálogo instalado.

Legenda usada em todas as linhas da matriz:

- **O**: comportamento observado pela leitura de código/SQL versionado; não executado com todo o schema de produto.
- **T1–T4**: comportamento demonstrado pelos quatro testes de caracterização atuais, no fixture mínimo PGlite descrito adiante.
- **H**: hipótese/obrigação de prova ainda não ensaiada; inclui protocolos concorrentes, identidade instalada e compatibilidade do candidato futuro.

Fontes e hashes estão no Anexo A; cada referência `Snnn:linha` resolve um ficheiro completo. B registra declarações estruturais; C registra assinaturas, ligações de triggers, remoções e ACL/policies. D registra SQL dinâmico e pontos cegos; E segue chamadas reais. A pesquisa foi feita nos históricos versionados `supabase/migrations/` e `drizzle/migrations/`, com seguimento dos helpers financeiros e dos clientes identificados. O registo é de **fonte**, não uma reconstrução executada do catálogo. Pesquisa textual não prova ausência de dependências dinâmicas, de outros callers nem de alterações externas.

## 1. Linhagem dos cinco corpos da RPC

Todos têm a mesma assinatura, retorno uuid, LANGUAGE plpgsql, SECURITY DEFINER e search_path public. A ordem abaixo é a dos nomes de fonte Supabase; não demonstra ordem de instalação. Hash é do ficheiro inteiro no Anexo A.

| Ordem de fonte | Fonte / linhas de entrada | Alteração relevante e limite |
|---|---|---|
| R1 · 31/08 15:04:44 | S365:1; ACL no fim do ficheiro | Cria a RPC, autoriza admin/manager, faz REVOKE ALL FROM PUBLIC e GRANT EXECUTE authenticated. Não prova grants nominais adicionais/owner reais. |
| R2 · 31/08 17:56:23 | S367:31 | Acrescenta `has_permission(...,'manage_transactions')`; o mesmo ficheiro alarga UPDATE/DELETE de pagamentos a editor. O caller concorrente não se limita a admin. |
| R3 · 31/08 18:42:12 | S368:1 | Acrescenta EXISTS de filhas com split_percentage, bloqueando mãe rateada; não recusa todas as outras filhas/pais possíveis. |
| R4 · 31/08 18:45:00 | S369:1 | Mesmo corpo lógico de R3, terminação/espaços diferentes; não é a última fonte encontrada. |
| R5 · 12/09 17:32:12 | S394:1 | Copia `operation_key` para irmãs; mantém o arredondamento independente e não inclui `forecast_id` na lista INSERT. É a última redefinição nominal encontrada nesses históricos; não se presume instalada. |

No corpo R5: autorização precede a leitura; `SELECT * ... WHERE id=p_transaction_id FOR UPDATE` está na linha 37. Linhas 42–91 recusam tipo, valor pago, qualquer perna de pagamento, grupo, filha/mãe rateada, reembolso, transitória e vínculos a sócios; evento é lido sem lock e só `status='completed'` bloqueia. Linhas 93–116 validam array, mínimo duas linhas, datas não vazias, amounts positivos e soma ±0,01. O cast das datas das irmãs ocorre dentro do loop de escrita, depois de UPDATE/auditoria da original: atomicidade pode reverter, mas não é pré-validação integral antes da primeira mutação. Não há teto explícito, validação de objeto/escala/finito nem qualificação estrangeira completa.

Linhas 118–143 guardam os valores antigos, geram grupo e atualizam a original sem trocar ID; 145–184 criam irmãs/auditoria. R5 arredonda cada quota original por `round(original_amount * amount / old_amount,2)`. Não recompõe total por EUR×FX, mas não conserva necessariamente os cêntimos totais. `coalesce(currency,'EUR')` não é uma qualificação de moeda desconhecida. Os quatro testes não provam os restantes casos.

## 2. Evolução estrutural e superfície de preservação

B contém as declarações locais e FKs diretas, com origem e linha, para evitar reduzir a análise à fórmula da RPC. A leitura relevante é:

| Família | Evolução de fonte | Consequência para a próxima implementação |
|---|---|---|
| Identidade/estado | S200:56; paid_amount, due_date, payment_date, invoice_ref, specification e estados alterados no histórico B | A original deve continuar a ser a parcela 1, com o mesmo ID/created_at; não fazer DELETE/recreate. Estados importados/legados não são prova de elegibilidade. |
| Estrutura de grupo/rateio | S223:2; split_mode/split_amount em B; S363:1 | parent_transaction_id tem FK/cascade; parcelas e rateio partilham a coluna. O grupo usa installment_group_id/number/total, nunca a descrição como identidade. Não inferir unicidade/cardinalidade só da existência dessas três colunas. |
| Moeda/IVA | S239:8; IVA em S333:1; S128:1 | `amount` é base EUR; original/FX são metadados distintos. A CHECK encontrada enumera EUR/BRL/USD; não foi localizada aqui uma substituição que prove GBP em transactions. GBP no cliente/fixture não demonstra aceitação do schema completo. Validar isto antes de prometer os três estrangeiros. |
| BP | S356:1; S359:1/37; S443:4 | forecast_id é FK N:1; event_forecasts.transaction_id permanece âncora. INSERT/UPDATE podem disparar sync em ambos os sentidos e validar evento/empresa/versão. FK foi tornada deferrable em S429:4; não desligar constraints para fazer passar o candidato. |
| Operação/fatura | S393:1 e S395:1; invoice_group_id em B | operation_key tem domínio com separadores; R5 copia literalmente. Não regenerar/chamar texto normalizado de “mesma chave”; invoice_group_id não equivale a installment_group_id. |
| Outros vínculos | settlement_id, event_settlement_id, card_session_id, retenção declarada, IBAN, confidencialidade, shared_cost, cache_contract e partner_contract em B | A lista INSERT de R5 não cobre todas as colunas posteriores ou já existentes. Para cada campo, justificar preservação, recusa do contexto ou default compatível; não omitir silenciosamente. |
| Exclusão/selos | S077:8/19/33; S078:16/65 | CHECK #404 só permite marca em receitas compatíveis; #413 lê o forecast e propaga às TX compatíveis. A RPC só admite despesa. Isto **não** autoriza uma herança nova em parcelas nem copiar flags para contrariar CHECKs. |
| Auditoria/anexos | S203:3; S205:2; S035:109 | FK dos anexos continua na original; existem log explícito da RPC e trigger para system_audit_log. A obrigação de rollback do log explícito não equivale à obrigação de sucesso de todo o log de sistema: este trigger engole FK/not-null. |

Há lacunas de fonte além da fórmula: a memória nomeia `zz_rederive_paid_amount_on_amount_change`, mas não se encontrou o corpo correspondente nos dois históricos pesquisados; referência em memória/watch não fornece definição instalável. A pesquisa suplementar em ficheiros manuais encontrou a menção em watch, não o corpo desse helper. Campos de estorno usados por funções posteriores também não ficam integralmente explicados pelas declarações diretas de transactions em B. Estes pontos exigem catálogo fiel; não se inventa DDL para completar o fixture.

## 3. Matriz por invariante

Em “lock/ordem”, `→` indica apenas a sequência observada naquela rotina. Não representa uma ordem global validada. UPDATE/INSERT/DELETE e FKs podem adquirir locks implícitos; um EXISTS sem linhas não bloqueia futuras inserções. Qualquer aquisição via trigger depende da versão efetiva do helper e da ordem de disparo. Entre triggers equivalentes do mesmo timing/evento, os nomes determinam ordem alfabética; nomes/enabled efetivos só o catálogo prova. Prefixos zz/zzz não são um protocolo de serialização.

| ID / invariante | Escritores e guarda atual (O) | Lock/ordem e recurso partilhado (O) | Lacuna / contraprova necessária (H, salvo T indicado) |
|---|---|---|---|
| I01 · total original exato, origem única | R5 UPDATE/INSERT; #471 usa installment-original só na criação cliente. R5 não valida finito/escala/FX completo. | R5 bloqueia TX original; lê original_amount armazenado antes de alterar. | **T1** demonstra 100,01→100,02. Futuro: cêntimos numeric exatos/maiores restos, desempate pela ordem, original zero preservado; bases EUR de até quatro casas sem recálculo IVA. Testar 100,02/3, pesos desiguais, menos cêntimos que parcelas, BRL/USD/GBP conforme schema, inválidos/ausentes/limites. |
| I02 · uma TX única, sem grupo nem dependência estrutural incompatível | R5 recusa installment_group_id e split_percentage, e filhas rateadas; split RPC 0070 recusa qualquer parent/filha e parcelas. Form/edição escrevem grupos/filhas. | R5 TX→EXISTS filhas sem lock explícito nas filhas; 0070 TX→leituras BP. | R5 não recusa parent_transaction_id não nulo nem todas as filhas. Segunda renegociação com mesmo ID deve esperar, reler e recusar; criação concorrente de filha precisa de protocolo e revalidação. Não basta FOR UPDATE na mãe. |
| I03 · ausência de pagamentos, inclusive planned/cancelled/reversed | R5 paid_amount>0 e EXISTS de **qualquer** transaction_payments. Modal/batch/timeline escrevem pernas; reverse_payment altera perna e TX. validate_installments_total compara planned+paid com bruto. | Escrita normal: perna→trigger sync→_derive_paid_amount→UPDATE TX; reverse_payment: perna FOR UPDATE→TX FOR UPDATE. R5: TX→consulta pernas. Recurso comum TX e pernas. | **H corrida com pagamento**: guardas consultam sem lock prévio explícito comum; FK pode bloquear a inserção, mas não demonstra revalidação após espera nem preservação do bruto usado antes da espera. Ensaiar duas ordens, planned e paid, inclusive alteração da transaction_id. Um plano futuro não pode fixar TX→pernas cegamente e inverter reverse_payment. |
| I04 · valor pago/estado derivado e estornos | _derive_paid_amount (S445:2), sync (:51), paid-guard/materialize (S450:3/12/30), clear_reversal_on_repay (0066:83). | Derivação lê TX/soma antes do UPDATE; materialize pode escrever pernas a partir da TX; reverse_payment e crédito usam locks próprios. | Fixture dos quatro testes não instala estes triggers. Demonstrar que não nasce pagamento automático, não se limpa estorno indevidamente, status/data não derivam de snapshot desatualizado. R5 não recusa expressamente status reversed/pago sem paid_amount; qualificar antes de dividir. |
| I05 · autorização pela empresa da TX | R5 usa has_role/has_permission da empresa ativa, depois seleciona por ID sob SECDEF. 0070 usa has_role_in/has_permission_in com company_id da linha; 0066 verifica row_belongs_to_current_company. | R5 TX FOR UPDATE apenas; perfis/roles/permissões são leituras STABLE, sem locks de autorização explícitos. | **T2** demonstra gestor A a escrever B no fixture com sessão authenticated. Não transplantar um helper isolado nem inventar novo admin. Exigir sessão, pertença e permissão pelo tenant da linha; confirmar exceções canónicas, owner/ACL/search_path/RLS/FORCE RLS. Refusar tenant nulo/incoerente antes de mutações/auditoria. |
| I06 · isolamento das relações e dos logs | company_id fornecido nas irmãs de R5; set_company_id_on_insert preenche só NULL. Logs explícitos não fornecem company_id. Policies restritivas criadas dinamicamente em abril. | Sem lock global de empresa na RPC. Triggers podem resolver company_id pela empresa ativa, inclusive em auditoria. | T2 só mede três TX em B; não mede empresa dos logs. Testar referências BP/conta/fornecedor/categoria/evento de outra empresa, log em empresa correta, zero efeitos em tenant alheio e nenhum privilégio herdado de PUBLIC/anon. |
| I07 · fecho/estágio e master | R5 lê events.status sem lock, rejeita completed. close_event (S066:61; base 0280:92) passa pelo acesso/checklist; 0281 redefine regras de master/subevento. Hook useEventStages chama RPC. | close_event: evento→settlements ORDER BY id→cache configs ORDER BY id→checklist→UPDATE evento. R5 TX→leitura de evento; não adquire o lock de close_event. | **H corrida com fecho**: testar fecho antes/depois do início da renegociação, subevento com master a fechar, histórico/cancelado conforme contrato. Guardas de carimbo só protegem events; não provam exclusão mútua com TX. Não alterar semanticamente completed/em_fecho nesta correção monetária. |
| I08 · selo e congelamento de sócios | seal_event_settlement (0071:66); guard_sealed_event_settlement e guard_frozen_* (0270). #404/#413 guardam mudanças da marca com selo no evento/master. | 0071 faz leitura do selo sem FOR UPDATE explícito e UPDATE posterior; freeze RPC bloqueia participante; 0270 lê participantes por EXISTS. R5 não participa nesses locks. | Ensaio concorrente de selar/congelar com as fontes efetivas, incluindo 0281 para a checklist do master/subeventos. O snapshot fiscal/financeiro não pode divergir do que se preserva; ausência de guarda universal de amount em #404 não significa permissão. Não inventar herança #413/#404. |
| I09 · “Pago pelo Sócio” | Modal e PartnerPaidExpensesPanel inserem partner_paid_expenses antes de UPDATE TX; R5 recusa qualquer vínculo, independentemente de aprovação. | Cliente executa duas chamadas; não há transação de aplicação/lock contínuo entre elas. Recursos: vínculo, TX, participante. | A proposta pendente também deve excluir elegibilidade. Inserção concorrente pode existir antes de a TX refletir paid_amount; testar janela entre INSERT do vínculo e UPDATE TX, com commit/rollback de cada sessão. FOR UPDATE na TX não é prova sobre o vínculo. |
| I10 · extra/adiantamento/reembolso/transitória | R5 recusa flags e partner_advance_expenses. convert/revert_partner_extra (0066:21/56) bloqueiam TX e validam empresa; _partner_extra_assert_can_write lê status evento. Reembolso propaga pagamentos; 0286 protege exclusão. | 0066 TX→vínculo→UPDATE TX; congelamento de extras é outra tabela (event_partner_extras), não se confunde com partner_advance_expenses. | Testar convert/revert concorrente e INSERT direto do vínculo; não presumir que todos usam a RPC. Recusar razões transitórias/reembolso incoerentes; preservar comportamento das isenções dos triggers, sem ampliar renegociação a esses fluxos. |
| I11 · BP N:1, âncora, evento/empresa e categoria | R5 conserva forecast_id só por não tocar na original, omite nas irmãs; sync_tx_forecast_to_anchor lê/preenche âncora; sync_forecast_anchor_to_tx escreve TX. Guarda de mesma empresa/evento/versão; realinhamento de categoria posterior aos L2 removidos. | Escrita BP→TX e TX→BP cria direções opostas; selects sem lock explícito e UPDATE condicionais. #413 também propaga BP→TX. | **T1** mede só 1 forecast_id em 3, sem triggers. Demonstrar contrato N:1 e consumo total sem duplicar âncora, snapshot/version_id não vinculável, categoria/empresa/evento compatíveis. Mudança simultânea de linha/âncora/categoria deve preservar coesão ou recusar atomicamente. Não declarar resolvido copiando forecast_id sem ensaio dos triggers. |
| I12 · operation_key, invoice_ref e invoice_group_id | R5 copia literalmente; constraint operation_key com grupos alfanuméricos separados por hífen. Form/editores escrevem também estes campos. | TX original bloqueada; não há reserva global de operation_key em R5. | T1 mede três operation_keys idênticas “kept” em schema sem constraint real; isto não demonstra aceitação do formato de produto (o fixture nem a instala). Testar chave sintética válida `TEST-475`, referências nulas e preenchidas, sem normalização ou unicidade inventada. |
| I13 · identidade, anexos e armazenamento | R5 faz UPDATE da original; não duplica transaction_documents. transaction-document-storage chama delete-transaction-document; referências podem partilhar file_url. | FK/CASCADE liga documentos à TX; eliminação servidor conta referências antes de mover storage. RPC não adquire lock de objeto externo. | “Anexo mantido” significa mesmos IDs/transaction_id/URLs no fixture sintético, sem envios/storage real. Testar anexar/remover concorrente e rollback; manter anexos na primeira TX, não clonar nem apagar objetos. Atomicidade SQL não inclui storage remoto. |
| I14 · exclusão, selos #404 e herança #413 | CHECK de transactions_excluded_from_partner_settlement exige income compatível; inherit_house_only_from_forecast retorna sem alteração com forecast_id NULL. Propagação só a income compatível. | Leituras de forecast/selos/master sem FOR UPDATE explícito; UPDATE BP pode bloquear TX. | Uma despesa elegível não ganha marca de receita; não copiar marca arbitrária nem remover guardas para passar. Comparar antes/depois da original e irmãs sob triggers reais e recusar contexto impossível. Regras de income não se tornam regras de parcelas por analogia. |
| I15 · split/rateio e shared_cost | R5 bloqueia split dos dois lados; sync_shared_cost_mirror/force_exclude podem escrever espelho/transação. split_transaction_by_bp_lines também usa TX e BP. | Mãe→filhas por chamadas cliente; espelho via trigger pode envolver outra empresa/conta; nenhuma ordem global provada. | Testar pai/filha/mãe com filhas sem split/filha transitória, alteração concorrente de split e custo partilhado. Menor recorte deve recusar shared_cost/contextos não qualificados, sem apagar espelhos nem misturar grupos. |
| I16 · cachê, contratos e bilheteira/cartões | cache_* usa advisory `cache:root:artist`, contratos e TX; partner contracts usam participante/settlement/contrato/TX e guard zzz. Campos settlement_id/card_session_id/held_by_supplier_id não são copiados em R5. | Cache: advisory→contrato/TX; partner: participante→settlement, depois TX; cancel começa contrato. São recursos adicionais à TX original. | Não existe prova de que despesa única com estes vínculos possa ser renegociada. Menor recorte recusa tais contextos; não alterar RPCs de contratos nem inventar cópia de cache_role/partner_contract_role. Testar concorrência com vínculo/cancelamento como rejeição e verificar ausência de órfãos. |
| I17 · auditoria obrigatória e rollback | R5 insere dois logs originais e um por irmã; audit_transactions_change (0066:109) também escreve system_audit_log, mas absorve FK/not-null. | Log explícito dentro da mesma chamada SQL; triggers encadeados dentro da transação. | **T3/T4** demonstram rollback de irmã/auditoria explícita no fixture. Não demonstram falha no UPDATE original nem atomicidade de todos os efeitos com triggers. Injetar cada falha, comparar estado integral e distinguir falha absorvida do system log de falha propagada do log da RPC. Não mudar essa política sem decisão. |
| I18 · contrato EUR/IVA e UI #471 | Form e modal usam computeInstallmentNets; helper estrangeiro só na criação. Editor recusa mudança monetária se algum membro não EUR; permite data isolada destravada. | Criação/edição cliente sequenciais; renegociação usa uma única RPC. Datas na UI mantêm DatePicker existente; não se cria campo nesta parcela. | Futuro preserva EUR, tolerância D7 e quatro casas, sem multiplicar FX/IVA. Contraprovar com IVA 23 e bases fracionárias; nenhuma alteração a guardas, criação atómica geral ou edição de grupo. Os quatro testes não executam UI. |
| I19 · encontros/compensações geridos e bloqueio de documento | Fontes manuais S182:121/177–214 definem issue335_guard: documentos em grupos preparing/applied/reversing não podem mudar amount/IVA, original, moeda, grupo, BP, chave e outros metadados; S188:13 substitui _derive_paid_amount sob contexto de reversão. | Core: advisory pedido→controlo partilhado→fornecedor/contas→pais evento/selos via helper→BP ORDER BY id FOR UPDATE NOWAIT→TX ORDER BY id FOR UPDATE NOWAIT→pernas ORDER BY id FOR NO KEY UPDATE NOWAIT; guard legado usa KEY SHARE antes de verificar grupos. RPC de renegociação não participa nesse protocolo. | Estas fontes são manuais/inertes no checkout; estado documental não certifica que sejam os bytes instalados. Não usar role/GUC isolado como autorização nem criar contexto privado na renegociação. Recusar documento gerido/contexto desconhecido; ensaiar corrida com encontro e reversão, não apenas pagamentos. |
| I20 · escritores de serviço, eliminação e edição direta | update-transaction valida pertença da empresa e faz UPDATE por service-role; approve-transaction escreve estado; apply-coala-bp pode mudar amount/apagar TX; ads-invoice-apply pode apagar mãe após conferir dependentes. | Leituras de autorização/estado e UPDATE/DELETE são requests distintos, sem lock contínuo observado; update-transaction também propaga campos/IVA a filhas pendentes (482–556) e campos documentais a invoice_group_id (560–626), decidindo com o snapshot lido antes do UPDATE. DELETE da TX adquire lock e pode cascatar pernas/anexos; nenhuma chamada externa é coberta pela transação da renegociação. | Ensaiar UPDATE incompatível/DELETE contra a RPC e revalidação após espera. Se houver eliminação legítima após uma renegociação confirmada, distinguir sequência serial permitida de perda parcial/órfãos. Não prometer prevenção global pela única RPC nem alterar estes escritores nesta parcela. |
| I21 · aprovação/elevação de verba atómica | approve-transaction → approveAtomic (S147:1) → approve_transactions_atomic (S016:5). O serviço autoriza; a RPC bloqueia aprováveis, recalcula excesso, eleva BP, aprova, audita e propaga a filhas. | TX selecionadas FOR UPDATE SKIP LOCKED (:41)→linhas BP FOR UPDATE (:55)→TX filhas FOR UPDATE SKIP LOCKED (:174). Esta é outra ordem TX→BP a confrontar com gates/triggers BP→TX. | Não confundir ausência de erro com aprovação integral: locked/skipped_ids fazem parte do resultado. Testar aprovação/raise em paralelo com a renegociação e revalidar estado/BP; não duplicar verba nem perder irmãs aprovadas. A assinatura SECDEF e ACL de serviço precisam da identidade instalada. |

O grafo local tem direções potencialmente opostas: TX→BP (sync/INSERT de irmãs) e BP→TX (realinhamento/propagação/aprovação); perna→TX (reverse/derivação) e TX→perna (materialização); evento/selos/cache→leituras de fontes na checklist; encontro→pais→BP→TX. Não se escolhe uma ordem global de locks a partir de uma só rotina. S178:135 acrescenta FOR UPDATE OF f no gate de BP, ausente na versão Supabase antiga: um harness que usar apenas essa versão esconderia uma aresta relevante.

## 4. Menor recorte posterior e dependências

O menor recorte proposto é **preparar uma única substituição da RPC existente**, sem writer novo e sem habilitar clientes: uma despesa estrangeira única estruturalmente qualificada, original armazenado qualificado sob lock, ausência revalidada de pagamentos/vínculos/contextos especiais e repartição exata dentro da transação já usada pela RPC. Não é demonstrável, com o checkout isolado, que uma troca aritmética seja compatível com todos os protocolos acima; essa conclusão continua condicionada aos gates abaixo.

Precondições que podem ser demonstradas localmente numa próxima parcela autorizada:

- Fixar os bytes/base R5 e o conjunto explícito de triggers/helpers/constraints do harness; não tratar a ordem de nomes entre históricos como uma instalação reproduzida.
- Qualificar uma TX sem parent/grupo/filhas prévias e sem contextos de pagamento, reembolso, transitória, split, shared_cost, contratos, cachê, cartão, encontro gerido ou liquidação especial; falhar fechado em metadados incompletos/incompatíveis. Estas recusas são proposta de recorte, não guardas já implementadas.
- Validar o plano inteiro (objetos, datas reais, cardinalidade, escala, finito e limites) antes da primeira mutação; preservar amounts EUR positivos, soma ±0,01 e IVA. Não decidir aqui um teto novo ou uma mudança D7.
- Usar exclusivamente original_amount armazenado (não soma histórica, descrição, EUR×FX nem original novo do caller), moeda reconhecida, FX finito positivo e fonte existente preservada. Aritmética numeric exata em cêntimos e maiores restos; zero explícito não vira NULL. Qualificação estrutural não demonstra conferência da fatura.
- Explicitar o destino de cada metadado da original e das irmãs. `forecast_id` é N:1 no código atual; a proposta deve demonstrar preservação desse vínculo e da âncora com os triggers, ou recusar o caso e declarar a cobertura pendente. Não usar regras #413/#404 para preencher uma omissão arbitrária.
- Demonstrar autorização com sessão não proprietária, pertença e permissão na empresa da TX segundo padrões canónicos; não depender de RLS contornável pelo owner SECDEF nem só de permissões da empresa ativa. Ensaiar o conjunto de locks comum antes de escolher ordem.
- Reproduzir T1–T4 contra a base e acrescentar aceitação real contra o candidato; falha no UPDATE, em cada irmã e no log explícito tem de deixar estado idêntico. Guards clientes #471 ficam até contrato/aceitação próprios.

Dependências externas que impedem declarar compatibilidade integral ou instalação pronta:

| Gate | Evidência necessária / responsável ou janela | Consequência enquanto falta |
|---|---|---|
| G1 · catálogo instalado | Janela autorizada do 0: definição, identidade de assinatura/overloads, owner, proconfig, proacl efetiva e privilégios herdados, RLS/FORCE, triggers enabled/ordem, constraints/deferrability/índices/FKs, dependências estáticas e patches dinâmicos. Comparar com baseline revista; nenhum SELECT MP nesta sessão. | Não inferir que R5, ACL inicial ou manifest A representam a base real; divergência bloqueia preparação de instalação. |
| G2 · lacunas de fonte | Corpo de rederive_paid_amount_on_amount_change; schema de estorno; domínio GBP; versões reais de _derive_paid_amount e writer de fecho/selo; efeitos de invólucros/policies dinâmicos. | Não completar com stubs permissivos nem omitir triggers no ensaio de aceitação. |
| G3 · regras/limites | Frente dona valida qualificação de origem/fatura, limites seguros/cardinalidade/pesos e compatibilidade das recusas de contextos especiais; revisão da preservação BP/campos por campo. | Não oferecer suporte geral a estrangeiras nem mudar D7/herança; não extrapolar a grupos existentes. |
| G4 · concorrência | PostgreSQL local/efémero multi-sessão autorizado para ensaio sintético, catálogo fiel e escritores de ambas as pontas. Se exigirem alteração de escritores além da RPC, novo recorte/autorização. | Não declarar que FOR UPDATE resolve phantoms ou que a RPC isolada basta. |
| G5 · promoção/reversão | PROC-promocao em autorização posterior: candidato completo, rollback condicionado à identidade exata, revisão, hashes, gates e janelas próprias. | Nenhum candidato/migração/preflight parcial entregue aqui; CI local não prova CI do diff ou aprovação operacional. |

## 5. Plano sintético posterior — não executado nesta parcela

Não usar mocks do writer para provar integridade. Usar base sintética com duas empresas, atores sem privilégios em tabelas, auth.uid adaptado só ao harness, roles e helpers fiéis, schemas de produto necessários e seeds sem dados reais. Cada teste captura estado ordenado por PK (TX, pernas, grupos, BP/âncoras, vínculos, contratos/espelhos afetados, anexos e ambos os logs), além de contagens e somas exatas. IDs aleatórios/tempos de criação só entram no estado esperado quando forem novos efeitos legítimos.

### Rollback e autorização

| Ensaio futuro | Estímulo | Resultado esperado de aceitação |
|---|---|---|
| P01 · UPDATE original | Falha controlada no trigger/constraint do UPDATE; repetir com supressão do UPDATE (RETURN NULL de trigger no harness/rowcount zero), após validação mas antes de persistir primeira parcela | Exceção propagada e estado completo idêntico, sem grupo/irmãs/logs novos. |
| P02 · irmã N e auditoria | Falha em cada posição de INSERT; repetir no log explícito da original/irmãs | Original, anexos, BP/âncora, logs e dependentes iguais à captura anterior; não só contagem de TX. T3/T4 são antecedente mínimo. |
| P03 · ACL efetiva | anon, authenticated sem sessão/sem permissão, gestor A contra B, actor da empresa correta; conferir session_user/current_user e grants via PUBLIC | Chamadas proibidas recusadas antes de escrita; dono de execução correto com search_path fixo; nenhum acesso tenant por ID arbitrário. Usar SET SESSION AUTHORIZATION em NOLOGIN no harness, não só SET ROLE do administrador. |
| P04 · permissões canónicas | Exceção negada por empresa, utilizador em duas empresas, empresa ativa diferente da TX, linha com company_id NULL, referências de outro tenant | Resultados iguais ao padrão canónico aprovado; não criar bypass de platform_admin nem conceder tables ao caller para fazer passar. Nenhum log no tenant errado. |
| P05 · validação completa | Moeda desconhecida, original ausente/NaN/infinito/negativo/escala extra, FX inválido, plano não-array/linha não-objeto/data impossível/amount nulo/zero/negativo/escala extra/soma incompatível/teto | Recusa sem primeira mutação; original zero é distinto de ausente quando permitido. Pesos zero continuam recusados se o contrato exige positivo. |
| P06 · aritmética e EUR | 100,01/3; 100,02/3; [1,2,3]; 0,01/4; zero; empate; limites; BRL/USD/GBP se schema qualificado; EUR+IVA e bases 4 casas | Soma original exata; desempate por índice; FX/fonte inalterados; amount/IVA e tolerância EUR iguais à base; nenhum centavo criado/perdido. |
| P07 · metadados | Original com forecast_id válido, chave TEST-475, invoice_group/ref, anexos; repetir cada contexto incompatível I02–I21 | Original mantém identidade/anexos; irmãs mantêm metadados contratados; âncora única e consumo N:1 correto. Rejeições deixam estado idêntico. Não usar o “kept” sem domínio do fixture como aceitação da constraint real. |
| P08 · rollback de instalação (somente plano) | Em base descartável, capturar função/owner/ACL/config/dependências antes e depois do futuro candidato; ensaiar reversão com identidade coincidente e divergente | Restauração byte/definição/ACL conforme contrato revisado; recusar reversão perante deriva, sem substituir objeto alheio. Nada a reverter nesta parcela documental. |

### Concorrência: duas ligações reais, barreiras observáveis

Usar duas conexões PostgreSQL independentes A/B, autocommit desligado e isolamento explicitado (READ COMMITTED como primeira matriz; repetir níveis relevantes da aplicação). Coordenar por barreiras do harness/estado de locks e comandos concluídos, sem sleeps como prova. Uma terceira conexão apenas de observação pode confirmar pg_locks/pg_stat_activity e wait graph; guardar ordem, SQLSTATE, duração, commit/rollback e estado final. Não alterar timeouts de gates para ocultar deadlock; deadlock observado é achado, não PASS automático por retry. Pontos de pausa só no harness, preservando bytes do writer sob teste.

| Ensaio | A / ponto de pausa | B / interleaving reverso obrigatório | Resultado esperado e falsificador |
|---|---|---|---|
| C01 · duas renegociações | A bloqueia TX e deixa chamada sem COMMIT após criar grupo | B tenta mesma TX; repetir com B primeiro e A em ROLLBACK | B espera; após commit relê grupo e recusa, sem segunda família. Após rollback, uma única renegociação pode concluir. Duas famílias ou soma duplicada falsificam. |
| C02 · pagamento primeiro | A escreve perna planned/paid e mantém transação aberta antes de finalizar derivação/commit | B tenta renegociação; repetir cancel/reversed e mudança da transaction_id | Após commit da perna, renegociação recusa qualquer perna; após rollback, revalida. Resultado com grupo criado ignorando perna commitada falsifica. Registar qualquer inversão perna→TX / TX→perna. |
| C03 · renegociação primeiro | A segura TX e pausa antes/apos EXISTS de pernas e antes do commit do grupo | B inicia INSERT/UPDATE de perna com bruto antigo; repetir fluxos real modal e reverse_payment, comissões/crédito quando aplicável | Nenhum pagamento incompatível com estado novo fica persistido; bloqueio por FK ou UPDATE deve ser observado, não presumido. Se B puder concluir legitimamente sobre a primeira parcela nova, validar pelo novo bruto; não exigir proibição de todo pagamento futuro. Leitura antiga aceita sem revalidação é contraprova. |
| C04 · fecho primeiro | A close_event bloqueia evento e pausa na checklist/antes do carimbo | B renegocia TX do evento e do subevento; inverter prioridades e repetir legacy status completed | Fecho e mutação incompatível não podem ambos confirmar com snapshot/checklist obsoletos. Espera/revalidação ou recusa atómica conforme protocolo revisto; nenhuma gravação após estado protegido. Não pressupor que R5 já faz isto. |
| C05 · selo/congelamento | A sela settlement ou congela participante; pausa antes de confirmar | B tenta renegociação/alteração de vínculo relevante; inverter A/B e considerar master | Não alterar fonte protegida do snapshot nem invalidar selo; mostrar recurso comum efetivamente bloqueado. Checks EXISTS sem espera/revalidação não são prova suficiente. |
| C06 · sócio | A insere vínculo pago/proposto e para antes do UPDATE TX; repetir convert/revert extra sob lock TX | B renegocia; inverter A/B, commit e rollback de A | Vínculo confirmado torna contexto inelegível; nenhuma irmã órfã nem vínculo apenas na parcela com valor encolhido por corrida. Demonstrar fluxos diretos e RPC. |
| C07 · BP/split/metadados | A muda âncora/categoria/forecast_id ou cria filha de rateio; pausa nos dois lados do trigger | B renegocia; inverter TX→BP e BP→TX, e anexar/remover documentos na original | Vínculo e rateio coesos ou operação recusada; ausência de deadlock não basta se o consumo/original divergir. Anexos continuam ligados à original, sem duplicação de storage. |
| C08 · contratos/supressão de contexto | A liga/cancela contrato/cache ou altera shared_cost, contexto que o recorte propõe recusar | B qualifica e tenta renegociar; inverter, commit/rollback | Nenhuma janela permite passar qualificação antiga; recusas sem órfãos/espelhos novos. Se não existir lock comum com a RPC, reportar necessidade de ampliar recorte em vez de simular sucesso. |
| C09 · encontro/estorno gerido | A aplica/reverte encontro nas fontes manuais revistas, com contexto legítimo criado pelo command trigger | B renegocia a mesma TX; inverter e observar locks de pais/BP/TX e KEY SHARE | Documento gerido continua protegido; nenhuma passagem por role/GUC falso. Recusa/espera demonstrada sob sessão não proprietária e catálogo fiel, não pelo fixture de T1–T4. |
| C10 · escritor de serviço/DELETE | A altera amount/evento/BP via escritor efetivo ou apaga a TX; segura transação antes de confirmar | B renegocia; inverter A/B e comparar estado com uma sequência serial admitida | Sem grupo parcial, logs/documentos órfãos ou metadados de snapshot antigo. Repetir propagação de invoice_group_id iniciada antes de a original ganhar installment_group_id: datas próprias das parcelas não podem ser sobrescritas por decisão do snapshot antigo. Validar rowcount/NOT FOUND depois da espera; não confundir DELETE serial legítimo com corrida aceita indevidamente. |
| C11 · aprovação/elevação de verba | A aprova/eleva verba pela cadeia real approveAtomic e mantém TX/BP bloqueados | B renegocia; inverter prioridades e registar approved_ids/skipped_ids e propagação de filhas | Nenhuma dupla elevação nem aprovação parcial reportada como integral; estado do grupo e consumo BP correspondem a uma sequência serial permitida. Bloqueio/SKIP LOCKED tem de ser observado, sem tratar skip como aceitação da renegociação. |

**PGlite** executa SQL PostgreSQL em memória e já dá prova útil de aritmética/statement rollback e de uma sessão não proprietária no fixture mínimo. Esses quatro testes não carregam triggers/FKs/policies de produto e não demonstram MVCC com duas sessões reais, espera por locks, deadlocks, FK concorrente, catálogo instalado, isolamento completo ou storage externo. Duas promises no mesmo PGlite, mocks ou um cronómetro não substituem as duas ligações PostgreSQL. Nenhum C01–C11 nem P01–P08 foi executado aqui como aceitação de candidato; o SQL dos testes existentes continua a executar apenas nos fixtures locais inertes exigidos pela suíte.

## 6. Provas atuais e validação desta parcela

Fixture imutado em S143: beforeAll cria schema mínimo, usa corpo R5 e helpers versionados de empresa/papel/permissão; auth.uid/is_platform_admin são adaptadores sintéticos, ACL explicitamente reproduzida, sem triggers de produto. A primeira chamada aritmética não representa caller real; a segunda usa SET SESSION AUTHORIZATION authenticated e restaura postgres no finally. Não há grant de tabelas ao caller.

| Teste atual | O que mede | O que não mede |
|---|---|---|
| T1 · fonte latest / 100.01 | Soma original 100.02, linked=1 e operation_keys=3 num grupo de três | Correção de algoritmo, CHECK operation_key de produto, herança BP sob triggers, GBP/IVA e qualificação. |
| T2 · manager A / TX B | Três TX persistidas em B através da chamada direta autenticada com helpers de fonte | Catálogo/ACL reais, isolamento de todos os dependentes/logs, rejeição por candidato futuro. |
| T3 · sibling failure | CHECK sintético impede irmã; original amount/original_amount/grupo e auditoria explícita voltam ao estado anterior | Falha no UPDATE original, todos os metadados/dependentes, concorrência e triggers reais. |
| T4 · audit failure | CHECK sintético impede transaction_audit_log; SQL real reverte original e logs | Política de system_audit_log que absorve certas exceções, efeitos externos ou candidato inexistente. |

Verificações executadas nesta sessão, com código/testes/fixtures de produto intocados:

- `bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit`: exit 0, log sem diagnósticos.
- `bunx vitest run`: exit 0; 341 ficheiros passaram, 2 skipped; 3401 testes passaram, 6 skipped e 11 todo preexistentes (3418 total), duração 193,90 s. Inclui `src/test/issue475-source-blockers.test.ts`: 4/4, 4423 ms. Não se acrescentou skip, timeout ou gate relaxado; não houve execução integral anterior separada nesta parcela documental e não há falha nova medida.
- Build: `bun run --cwd /tmp/issue475-matriz-build build`, exit 0; Vite 52,90 s e PWA gerado. Foi executado numa cópia temporária dos inputs de build, com node_modules e fontes partilhadas referenciados só para leitura, sem ficheiros .env. Isto evita o plugin que grava `dist/version.json` fora da lista editável do checkout. Duas tentativas anteriores falharam por inputs ausentes nessa cópia (_shared e guia markdown); corrigiu-se a cópia de validação, sem alteração de produto. Não são regressões do repositório nem foram ocultadas. Avisos de Browserslist/chunks mantidos.
- Caminhos/linhas/hashes do registo conferidos contra os bytes do checkout; referências de fonte do corpo resolvidas para A. Leitura do diff completo e conferência de todos os caminhos novos/alterados limitadas aos dois autorizados; o diff foi percorrido integralmente e as declarações dos anexos foram comparadas com a fonte normalizada, além da conferência dos hashes/linhas; `git diff --check` sem erros. A saída temporária do executor pode estar ignorada pelo Git e foi conferida explicitamente.

Logs locais transitórios: `/tmp/issue475-matriz-tsgo.log`, `/tmp/issue475-matriz-vitest.log`, `/tmp/issue475-matriz-build-final2.log`. As contagens e limites relevantes estão transcritos aqui; retenção dos logs não é requisito para ler esta matriz. CI remoto do diff, revisão e merge não foram executados/verificados por esta sessão; o CI da base é contexto do despacho, não substitui esse gate.


## Anexo A — registo de fontes e identidade local

Cada S identifica o ficheiro completo, não uma definição de catálogo. Ordem S é apenas ordem lexicográfica de caminho. Em Supabase a ordem histórica de fonte é o prefixo temporal; em Drizzle é o prefixo numérico. Não existe aqui uma ordem total de instalação entre os dois históricos. As substituições por nome e os patches dinâmicos têm de ser reconciliados no catálogo autorizado. Linhas são 1-based do checkout base.

| ID | Caminho | Linhas do ficheiro | SHA-256 completo |
|---|---|---:|---|
| S001 | `.lovable/memory/features/payment-amount-invariants.md` | 1–135 | `f1dd9523713f9705ac30cebe3a9cdee9a90403d0708266314f4d9b3958a26f99` |
| S002 | `.lovable/memory/features/transaction-documents.md` | 1–35 | `385b2ad4cce99982941cee4b521bc814ab8bc8729a2f4662789f033810a951de` |
| S003 | `.lovable/memory/features/transaction-installments.md` | 1–356 | `b66082e4ed2a911591b63fd3289fb53d60a2a59ac4ad7bff368b777bde38ba8c` |
| S004 | `.lovable/memory/features/transaction-paid-guardrails.md` | 1–22 | `13bcedde3247917759fe62e2f6e3baf5de1ac641b430f829b3561172cd560d59` |
| S005 | `.lovable/memory/features/transactions-bp-linkage.md` | 1–131 | `3688fe2db897adb86d52589a5555357ed2d9b16dcdcec1bd3908d213cd5a1184` |
| S006 | `AGENTS.md` | 1–75 | `7d2b02cebe4aa3d3b5485b94f0c83a23b07b4a5c67e5d3a7966d1691e3258686` |
| S007 | `docs/DECISIONS.md` | 1–6591 | `070f46aae8f31e23ac2c581e0c95a4c6f013cfc24b84e5350b89d724657dd659` |
| S008 | `docs/INDEX.md` | 1–194 | `2b48f74f02a879ca23035789301a7b5c2d4cbcbb04d7a2bb03d90c1c06847b09` |
| S009 | `docs/QUADRO.md` | 1–468 | `4677c7a65cc2a830aab567965dbde6264171157de8d6f5fd28251d733e2765df` |
| S010 | `docs/estado/estado-financeiro-e-tesouraria.md` | 1–170 | `71f7136d5d4c788b424821bc60ae9478e8ea2c76192caf5f894db541665fb219` |
| S011 | `docs/estado/estado-vinculo-bp-transacoes.md` | 1–162 | `dc15de1582209ea655670565ab768cc1cb14a545ab02627def524cd9bd423f38` |
| S012 | `docs/procedimentos/PROC-promocao.md` | 1–43 | `72187ca3ec7d5719c665bcedae4b894e01dc19082cdf1f99c1c3324e31504376` |
| S013 | `docs/prompts/arranque-0-cowork-chatgpt-2026-11-02.md` | 1–18 | `31bdfcd86b222c98b433bb57ff1ddcd9af512303a7cd682c211006c042d7aa2f` |
| S014 | `docs/testes/issue457/parcelas-original-20261102.md` | 1–72 | `05eb79118e1fcb11664c5a31732417c9fae49194d95252050563ecf1fa6452d6` |
| S015 | `docs/testes/issue457/renegociacao-original-servidor-20261102.md` | 1–63 | `5d651fe65645db4aef5d0c34b935cf8fc8b75ff57875666342c6780337e455f5` |
| S016 | `drizzle/migrations/0011_approve_transactions_atomic.sql` | 1–194 | `0269f0b4a0f1dafb2bda99833f444654241bae1eef37cbfab89802cd110456a8` |
| S017 | `drizzle/migrations/0026_derp274_invariant_item_duplica_transacao.sql` | 1–60 | `3e11820537a41ba4d70ec441cdf2fc2689c99c90b32e8a25134f4217391b1b18` |
| S018 | `drizzle/migrations/0035_derp190_balance_settling_payments_only.sql` | 1–18 | `0d106f135952e3e115f45f7dcaa927a9e335d55858b6d0bfe12a5ad97be3bf7f` |
| S019 | `drizzle/migrations/0040_0040_derp195_secdef_row_company_guards.sql` | 1–216 | `646376d72e1666ea35020f400a63bd0d0827f32941179dcf4b28519dca234650` |
| S020 | `drizzle/migrations/0041_0041_derp195_invariants_tenant_predicate.sql` | 1–73 | `af41580173c5ee0ee394726634ce4bd7d10949dcb28020d30af5a372eb1c565f` |
| S021 | `drizzle/migrations/0043_derp196_283_parte4_backfill_pax_guard.sql` | 1–79 | `c0e4f08894dc29e27ec2d56aebe917e85d45161ff7b9540d819e2cd462104cfd` |
| S022 | `drizzle/migrations/0044_derp197_284_invariante_transacao_duplica_fatura.sql` | 1–59 | `8da9ce551ca5068ca8e9b4d37be4159c0a1b7b40357f7f262a3b08603ab354fe` |
| S023 | `drizzle/migrations/0045_derp198_285_iva_rate_divisao_inteira.sql` | 1–148 | `f4b893ace16b8816e38b6e8021bcd77e27fe92ea2cccf70fc3f3bba900126fa3` |
| S024 | `drizzle/migrations/0047_derp200_287_camarim_adiantamento_entrada.sql` | 1–170 | `c29ae497315e24c653cc1272ca37c182b3c79dbf07bb429eae80f29a07956b0f` |
| S025 | `drizzle/migrations/0048_derp201_supplier_similarity_flags.sql` | 1–172 | `3de4cceeb5c280946f72feadcd4be2b054593f8c624ca5459d8ddf2a539e8013` |
| S026 | `drizzle/migrations/0049_derp202_285_invariante_pago_abaixo_do_bruto.sql` | 1–59 | `9700f876a707f6ca117df7365f426e5cf64e056e86e75072bdf51fed6056c726` |
| S027 | `drizzle/migrations/0051_derp203_285_rateio_filhas_bruto.sql` | 1–32 | `6b4ca8b71e44f9d0a73dd4076a5aebac4c709402374fe26feefafc0dec7eeed7` |
| S028 | `drizzle/migrations/0052_derp_remove_tx_paga_sem_linha_ref_paid_157.sql` | 1–287 | `b305a7e67fe33eea4a515c6ef27e221ab7ce392107be219848e1655e6e874e93` |
| S029 | `drizzle/migrations/0059_partner_portal_expenses_manual_extras.sql` | 1–67 | `ba7166a72c52e1de55c9d578854dc848933ad295b169fa0c19719bf8bb2c6877` |
| S030 | `drizzle/migrations/0061_derp214_ticketline_parallel_series_invariant.sql` | 1–67 | `97d7d462f819a613df381aab839d6b1594cb3cfd8ad2b889a87a8fa1d1f8b3e2` |
| S031 | `drizzle/migrations/0062_derp215_invariant_documentos_inalcancaveis.sql` | 1–55 | `a085aa3d5cabd67a284a08d03d8b8dfb6594094c339572b3e9dcecd0a2b6c319` |
| S032 | `drizzle/migrations/0063_derp216_isolation_email_company_views.sql` | 1–91 | `0d5f8af81daa98c4fc5c3d4ca90133f02741f50a1d89837370e37ebca221223e` |
| S033 | `drizzle/migrations/0064_derp217_views_readonly_storage_backup_manifest.sql` | 1–173 | `9954982f3ffb492c69018b70d8211c63fd6234cb6c6756f7c96d8fdcbfd29889` |
| S034 | `drizzle/migrations/0065_derp217_fix_storage_invariant_ambiguous.sql` | 1–50 | `378b43f1a8d99d377c291309ac388cb974b7de8c4032a59a48918606ac67248a` |
| S035 | `drizzle/migrations/0066_derp218_silent_writes_partner_extra_reversal_link_date.sql` | 1–329 | `e21a48844089ab433d52153233fb027c9a318b11d6cabc89b150d31c2894c551` |
| S036 | `drizzle/migrations/0067_derp219_delete_cascade_settlement_reverse_forecast_amount_rateio.sql` | 1–247 | `727c17f588a0f59bc4312c754736526789986412bebcd63c6eab646659ebff77` |
| S037 | `drizzle/migrations/0068_derp219_fix_rateio_invariant_ambiguous.sql` | 1–21 | `a7307f0f797e8deb11ad942e023473bbe0eaa9c19ecb12f2c10e228b7d239395` |
| S038 | `drizzle/migrations/0070_derp221_sepa_guard_planned_installments_split_bp.sql` | 1–182 | `b6aac67a0b8feb3e098374a3eb82e6269b3ead11929f1a13cbfd684313864fb7` |
| S039 | `drizzle/migrations/0071_collect_event_benchmarks.sql` | 1–124 | `6d8d0e1798070aed92bbfe29cf09c01b9d0cb8a06a05f78d2cf7b1ef7e79dd26` |
| S040 | `drizzle/migrations/0072_collect_event_benchmarks_count_refunds.sql` | 1–57 | `95ffd4ea3b73cb23af6fecbc983c542833672889c4dc19ec2ef9080891c37cad` |
| S041 | `drizzle/migrations/0073_bp_link_same_event_only_and_anchor_fix.sql` | 1–70 | `8ce027a38588c10791dfc2a22534896a59317d01481eb404145b17643eebf085` |
| S042 | `drizzle/migrations/0075_payment_list_settlement_channel_guard.sql` | 1–59 | `60ead5c4581e92b5035e24287fc4c272273691187df5c64121518a59f1c59efd` |
| S043 | `drizzle/migrations/0077_derp231_ticket_office_statements.sql` | 1–124 | `f67723b8da2c8639b29fa4a85942697789455aa79f39a8b7509bbec84e6af5c0` |
| S044 | `drizzle/migrations/0079_derp233_advances_fks.sql` | 1–7 | `714aa408407df13a349a142ba8ed5c4bcd2e89543d8893e4017d2ead3e5cfa08` |
| S045 | `drizzle/migrations/0089_derp238_invariant_cash_negativo.sql` | 1–64 | `afb911772bc996dc720c1702692ea63a47bc2793bf0e6aa2fe25753688ab5e93` |
| S046 | `drizzle/migrations/0091_derp_296_save_ticket_office_settlement.sql` | 1–268 | `c4b7a01cc250a82ef70d39bfef9fc07e09cd3a4620efab451cccfed0cc6ce2ba` |
| S047 | `drizzle/migrations/0093_derp_296_link_only_non_eligible.sql` | 1–14 | `3d402fb4f190ca57d8e3cf0d07fd615e6df86b65c910c15690ffd55d0fc2569b` |
| S048 | `drizzle/migrations/0094_derp_296_triggers_own_invoice_paid.sql` | 1–201 | `8fe9230e2c11144a0c7e27c92db4227a984de30d705710a7c8acd41fc0c1972e` |
| S049 | `drizzle/migrations/0096_derp_304_invariant_natureza_divergente.sql` | 1–76 | `0888558e32e88bb933e9d87798035bfa60d42cd32dcb952f6d5dce2aff854663` |
| S050 | `drizzle/migrations/0097_derp_299_invariant_tabelas_1000_por_nome.sql` | 1–39 | `9d053e3aee77c83511bb3086005b598911441ea36d14a27d021afe49f1802a60` |
| S051 | `drizzle/migrations/0099_derp_114_d2_verba_no_trigger.sql` | 1–129 | `7c01db0803f095564a51003a34c1d488a95e967587f8fbec25edd83c76e30c3f` |
| S052 | `drizzle/migrations/0102_0102_derp_244_sepa_bank_executions.sql` | 1–40 | `147457e999890507f9eb1dab61ee6fbc79d5586ca0c523bcd5cf257619529994` |
| S053 | `drizzle/migrations/0104_0104_derp_246_partner_country_and_refund.sql` | 1–11 | `377175fcd43c544184205d0ce577d1e61f7bcbff7bb7787ee07c3e1dc15daee0` |
| S054 | `drizzle/migrations/0115_derp254_permissions_per_company.sql` | 1–97 | `028c806bab36e13def7da5d4140b4e3f4f5e2cf1c458a4cb444eb07bbf58c4c1` |
| S055 | `drizzle/migrations/0137_realtime_event_financials.sql` | 1–16 | `276b0af17585f45d71f2d8d9ad6ea1e174dff86d8ddd77cc599f66d507bb3202` |
| S056 | `drizzle/migrations/0214_cache_payment_contracts.sql` | 1–687 | `8bd259c44d18df3c3f00bb0dc5e4ace0e5b10bd0ea121efe85c235528c8b200d` |
| S057 | `drizzle/migrations/0216_cache_contracts_bp_line_and_freeze.sql` | 1–287 | `a3ea9419020cfa6d277e8fb566708d952816a027b30c9dfe8843ab37d0531874` |
| S058 | `drizzle/migrations/0217_cache_cancel_contract_canonical_deps.sql` | 1–86 | `c3bb4c05e2ce01d45d672e6d7a77887b807957203ec029bf1ab4ac43180378a8` |
| S059 | `drizzle/migrations/0237_cache_attach_advance_to_contract.sql` | 1–265 | `dc0b98ee2db9fa2d4e56220ebe84103abd3b9daa475688cc102588c504a22de4` |
| S060 | `drizzle/migrations/0270_p1_freeze_guard.sql` | 1–73 | `cd23de49e7b068327d8e41b3464026c2ff0a61b074223f34d819a1ba84b28ff7` |
| S061 | `drizzle/migrations/0271_p3_partner_contracts_tables.sql` | 1–51 | `553588948cfc800e0652e893c2bc64633cea3a7b32195cb3ecb4495fc8b3b726` |
| S062 | `drizzle/migrations/0272_p3_transitory_reason_10_1_03.sql` | 1–47 | `a1104862b83e7118f06d82b6552c659e8c65d6aadf19e92f99f9e11ca3029481` |
| S063 | `drizzle/migrations/0273_0273_p3_partner_contract_rpcs.sql` | 1–307 | `a228b3f422ad1997d8be9c0c61b0c1e8484c8f99c4ac19dd83d90d23b9a10399` |
| S064 | `drizzle/migrations/0274_0274_p3_partner_contract_guards.sql` | 1–80 | `37ba57f74073a85186d71cdbe567f375763e07aa12ed47de447ce0ba1cdde26c` |
| S065 | `drizzle/migrations/0280_p1_event_stages.sql` | 1–155 | `7a51c04980402f2f2347fd9b56bcca53ff3e72ed8cb711ed7eb8f61471f44696` |
| S066 | `drizzle/migrations/0281_p1b_substage_follows_master.sql` | 1–128 | `382f0e874b60606deaf68019fbf83770caeb8468a1eb8796b329784e0b5acab1` |
| S067 | `drizzle/migrations/0282_p4_financial_position_base.sql` | 1–325 | `6f174c92624a6738ae843bb78c7396b7686305e71013d724457ae02c78ea53a7` |
| S068 | `drizzle/migrations/0283_p4b_financial_position_permission.sql` | 1–334 | `61269535ee9d1a9ef077ae74513cb8fdfe28525234cafa088a6db6d7003876b6` |
| S069 | `drizzle/migrations/0284_0284_p5b_a_pagar_por_evento.sql` | 1–369 | `7b1ecb61045eadd21e909a0da7d56d6ebfe66046b8004d16d22aee9fe60becd7` |
| S070 | `drizzle/migrations/0285_0285_p6b_a_pagar_caches.sql` | 1–409 | `7ac3022659a738f39be5218d1f197e3d57828cdb1e2d1ab5529a9fe838505de7` |
| S071 | `drizzle/migrations/0286_reembolso_pagamento_fora_resultado.sql` | 1–338 | `232e449253bddb32a9d8a6bca3e8e7a2328fda1b93490b3e393115da9b9fdff8` |
| S072 | `drizzle/migrations/0287_reembolso_invariante_corpo_exato_0286.sql` | 1–281 | `4bea9f3b0e3e5a3bf3bca899834124e4265a41c04637f60a2fbf1f07a119e397` |
| S073 | `drizzle/migrations/0288_reembolso_invariante_corpo_exato_0286_b.sql` | 1–281 | `51eeb696a791d919c8f748dd6e13f08bc956481be2006fd1eb50cd732370c19f` |
| S074 | `drizzle/migrations/0289_0289_p5c_cenario_receita_prevista.sql` | 1–522 | `b489f043fa7796769f4530fd84e1dc10ef964376b9764c8f1774f7ebe35f317b` |
| S075 | `drizzle/migrations/0294_derp332_storage_path_belongs_to_current_company.sql` | 1–30 | `88b5f3c5db82cb3116c6b413bfa69c1506064c8319f60299ed4d1a2babb7e40e` |
| S076 | `drizzle/migrations/0295_partner_aporte_mirror_descricao_sem_prefixo.sql` | 1–107 | `899b8781ba7a5cb58c6af75b15222223180f978baafdc7b93fa43e5d78d73e27` |
| S077 | `drizzle/migrations/0296_issue404_excluded_from_partner_settlement.sql` | 1–71 | `f6039203ba5ed551c217dbb926da9d7be9f8163f593416420fde4b7bf98f085b` |
| S078 | `drizzle/migrations/0297_issue413_house_only_inherit_from_bp.sql` | 1–90 | `0d505b532fe828255f413eec0f904b8374b866433c1b3938dbdb5ebcb13066f0` |
| S079 | `drizzle/migrations/0298_issue418_card_load_category_by_company.sql` | 1–119 | `9cdfb37d55690f7a36b933a99b5b0f3b0867e08c2c19cff9d8c03e5c68aaea32` |
| S080 | `drizzle/migrations/0301_issue401_reconcile_bank_line_devolucao.sql` | 1–561 | `ea01a9148a2eca38e9bf31f88e9efd7031a3304ed808e6b6abef3796b6e885bf` |
| S081 | `drizzle/migrations/0303_issue338_delete_transaction_documents_permission.sql` | 1–60 | `b0badf321e0c6c154ac21adcb3449a54c4c27f5742c2c7b3e1f538cbbcd46207` |
| S082 | `src/components/BPAttachmentModal.tsx` | 1–396 | `832aa6d5073b5f56014f3c2f70f18f77fa4807f8fcb6427d91e9663809a9fb5b` |
| S083 | `src/components/BatchPaymentModal.tsx` | 1–897 | `3b49ac7b8bcba295bfc1003b4abd5b673050f4348090f8e8d7ea9f7f8628c3d7` |
| S084 | `src/components/CacheContractsPanel.tsx` | 1–759 | `e0f23c349580fbaee8280550aecbbd41db23094c8153288ca3302d1003808335` |
| S085 | `src/components/EventForecast.tsx` | 1–4802 | `a25702d5ebc1600c7b02e4b02702eb9d3d160f7016f6e81b1ad95246125952ea` |
| S086 | `src/components/EventRealizedAllocation.tsx` | 1–932 | `3a80d0c6d07df648ebea36ec67f692eacc7e64ff3034b634d538fee78bc38346` |
| S087 | `src/components/FinancialOperationsTab.tsx` | 1–592 | `89bd1cde87ebf78080682bbda5547dcab5cfa29cb2bc455ed8a695bcd7ed7c3e` |
| S088 | `src/components/LinkBpLineDialog.tsx` | 1–246 | `d67fd9c8624cc5248f9ef260e973611f643dcc4be749d84f632dcf7bdaffee6a` |
| S089 | `src/components/LinkReimbursementNoteModal.tsx` | 1–263 | `c13adceee40ad2b757d180584017fc60b04c75ea0dcb01356fe5292bbfd90bf8` |
| S090 | `src/components/OperationKeyManager.tsx` | 1–292 | `45ecee3bb847da8b707a89c2dd771eaa1ff48b26a4ba2593a4d401d52654b349` |
| S091 | `src/components/OrphanAttachmentsResolver.tsx` | 1–474 | `2a3d3f8522efa31565fddd112413e72ea8e64453d7bf3897a4c344b4321ec579` |
| S092 | `src/components/PaidByPartnerPanel.tsx` | 1–146 | `4d306d656e3d56dfc1688aa9d4235ac8d3b7299992efedd4d2ba9546c9cea81f` |
| S093 | `src/components/PartnerPaidExpensesPanel.tsx` | 1–501 | `5a6b2bd4f1fcbdd6eeca28692209db73a4f854601eddf5069b354998a3ee9e17` |
| S094 | `src/components/PaymentListReceipts.tsx` | 1–342 | `6faee8d03e62d261a9e486151c100c5f4611e5f578b89f11903978d218082fb8` |
| S095 | `src/components/PaymentTimeline.tsx` | 1–844 | `c2a6646638c9b885f50d343d70a158ce47211b9800bc030c245bba8b29b80a97` |
| S096 | `src/components/QuickAdvanceModal.tsx` | 1–231 | `20c966a10213e9ddf99328db0cb0b71b982f350be20ef47203f14c0a5e34579a` |
| S097 | `src/components/ReimbursementNoteDetail.tsx` | 1–876 | `7581e31cefb0e944e89f775d62866d3e388fc08703499b93c7c82edbbe1fd779` |
| S098 | `src/components/SettlementSealControl.tsx` | 1–260 | `ec8fa87550c7c8a28f03d96bd47e2d2733c038798c26e4432b64f4a686b130b5` |
| S099 | `src/components/SplitByBpLinesModal.tsx` | 1–122 | `9a19a2efd40aba0d9ea35bcd7687708931ca47a8646b75a22a1564734bd2ddf2` |
| S100 | `src/components/SponsorsImportModal.tsx` | 1–688 | `d4fe19f5f949d773b0c0a6ff6d2a007eccc7035ed3d6a6cda01aeb6434054c0e` |
| S101 | `src/components/TicketOfficeAdvancesPanel.tsx` | 1–491 | `ed6dccc0502641377185bc8c254bef1db27442154a572b7e99ba8a7ce4d1df58` |
| S102 | `src/components/TicketOfficeSettlementModal.tsx` | 1–1522 | `71c8d0e1b0aa60a530efb3a6be8472bcb4f3b683dcbfe93b699a0c45a9697437` |
| S103 | `src/components/TicketOfficeSettlementsPanel.tsx` | 1–421 | `b9fea99dc383e1eb04af6668276a3427cdeec54d06deebcefba3ad18c200708a` |
| S104 | `src/components/TransactionDocumentsModal.tsx` | 1–691 | `c0b4fdba73614adee66a26d22ff88f59bd9aeb476a7a1fc37956a1ccc794552f` |
| S105 | `src/components/TransactionEditModal.tsx` | 1–2845 | `405b2ae8100ae6c39f76b8bd6a3936357f19c12f60c1b403dd0dfee38500212b` |
| S106 | `src/components/TransactionFormModal.tsx` | 1–4433 | `4d20d44a2995a6128ae0b10e2d1029c28c76beec6d9e9715953dbce2750f8364` |
| S107 | `src/components/TransactionInstallmentGroupEditor.tsx` | 1–583 | `595c1835d68cfe28929a7946d4b93a0d3987988c3b9cf9e4110618c17c3b4fc6` |
| S108 | `src/components/TransactionPaymentModal.tsx` | 1–1196 | `f0957c67065af3e669810e85f30ffdc1d8423799d58b51c14e119a18b04b5a35` |
| S109 | `src/components/TransactionPaymentsListModal.tsx` | 1–644 | `83f70e2f5f618ffb7c25e44356f9d29e03a232dffdd716cba81471203a0400b5` |
| S110 | `src/components/TransactionRenegotiateInstallmentsModal.tsx` | 1–328 | `a4545afb6d5c86b9f380bb8fb9678bbbfb4a003a9b6314f663a8f3f8a617aa40` |
| S111 | `src/components/TransferFormModal.tsx` | 1–283 | `b41b4054390cef0009a05d9f8f2802602e5db4b914e6306ee3ee1093efd9629d` |
| S112 | `src/components/bank/BankLineDocumentsDialog.tsx` | 1–279 | `d638b5d787ab346e5385eaa1d9ab5e98cefdbd1909f6a0c07325049db9d7469f` |
| S113 | `src/components/bank/BankLineLaunchModal.tsx` | 1–990 | `e3d1293ef9f34fcd7d185d7884291fc6210096517f551aec5475cc2a813fd38d` |
| S114 | `src/components/camarim/CamarimFundMoveModal.tsx` | 1–399 | `6efe3f3c69b89ce42a9f35f2576437cde15ef7cfd106102b598c0aedeaedeae2` |
| S115 | `src/components/cards/NewCardExpenseModal.tsx` | 1–751 | `f9d136c56af49039a444150665b91dac8c33dc0e23f6cb661270806b0b602f23` |
| S116 | `src/components/cards/cardLoadHelpers.ts` | 1–47 | `91a193bf1c8ccd7f6b66661f03c8bf1cef1b5d3493770fa7ed8896161b31671d` |
| S117 | `src/components/fecho/BpUnusedBudgetPanel.tsx` | 1–734 | `cdfe31aacc342888835d9fea56cebfacd99d0019b057fa85fd86545802125a8e` |
| S118 | `src/hooks/useBPVersions.ts` | 1–483 | `1c5a966d0912c791ec41d570a6940340535b2baa4b2c0841d902260c4edfceb1` |
| S119 | `src/hooks/useEventStages.ts` | 1–68 | `157f586b7b859148d0053b68316c442af7c7e69fac063d580c82d3c49501b963` |
| S120 | `src/lib/__tests__/issue471-installment-flows.test.ts` | 1–202 | `bffca869b29a14a4111a59849160254c54f88da598b8cdc8ad42cc53065db775` |
| S121 | `src/lib/__tests__/issue471-installment-original.test.ts` | 1–31 | `c5c7b84236c1700c7132b34c7882698949bf9a522b328586f73a7f5d25433ee9` |
| S122 | `src/lib/admin-window.ts` | 1–79 | `fa67c2ffa0897af94057f1652cc0f5bf7f237ffcc9b2d41ad1f4e25304f9841f` |
| S123 | `src/lib/bp-line-relink.ts` | 1–122 | `e4777052847ea5c5232dc39f6e41a048bb2d5aab49e001e08541b620a808ed5a` |
| S124 | `src/lib/delete-transaction-cascade.ts` | 1–44 | `3de2f1be04db19af84518fd696f559486647817c4f1113b66456896f02b1e630` |
| S125 | `src/lib/import-pl-xlsx.ts` | 1–1145 | `2af5f4616a6db31a7d75c45886cb5823e1681f255b1d64e4c4d7d5a0adade6a1` |
| S126 | `src/lib/installment-guard.ts` | 1–118 | `3c9b5e9440302bd1977428463c7c3eb549ab91adc9420d8b5aff2ec13f42801c` |
| S127 | `src/lib/installment-nets.ts` | 1–55 | `cd925485eb39e81a9cce6453958245e34502b7dd2c8f0e971d3483966bee0047` |
| S128 | `src/lib/installment-original.ts` | 1–63 | `cc98f5946304a2bd2e03cd53157aa32742b73c89078ea8a4484299a4fd926c9a` |
| S129 | `src/lib/invoice-group.ts` | 1–422 | `1d9e0e4f79b09976dc41218e5cc146a6c3230b07d0f817334928b5e812eb68ae` |
| S130 | `src/lib/offset-plan/rpc.ts` | 1–238 | `677b914d41e2acb4bf415a67fbc84d22a9caa1675a48a2ec4bc51282cd0e6212` |
| S131 | `src/lib/sponsorship-bp-sync.ts` | 1–198 | `36592e2991aa24e7268c886e640bdece5f4562688ee59eedb8adbefee050d37a` |
| S132 | `src/lib/supplier-credits.ts` | 1–81 | `1cc1e335ff932c50eaa2d31281510349f90e453e14a52e740f169870c06047f9` |
| S133 | `src/lib/transaction-document-storage.ts` | 1–32 | `51dc9ddfbc3bf1eebdf2d4a6ca1eea45006298d31be287bc305a02ff9728ab63` |
| S134 | `src/lib/transaction-offsets.ts` | 1–126 | `3c530f8a7a5519e8c322ce4d7476a9904eb5bffe5df3952bf5da7c658e1bd776` |
| S135 | `src/lib/undo.ts` | 1–327 | `51b636bb461e226be68d76af09243e3f89b3a606f1d1be6c641720414bf83dfe` |
| S136 | `src/pages/AccountCategories.tsx` | 1–344 | `b43d8d67b2aa43a8ed15fee6f64afe989c922bf13d401c965013638f90e4066a` |
| S137 | `src/pages/BankReconciliation.tsx` | 1–2474 | `af4b7a0fe28712c8e233d04b80073b1bda2066f12a8ea01af1d540002d6f3ac9` |
| S138 | `src/pages/CardSessionDetail.tsx` | 1–1461 | `4a35aaad17e12b872f002b3682ebd217dfbe36c4214a0eddccd0c00c1efcf67f` |
| S139 | `src/pages/Quotations.tsx` | 1–298 | `9ed7577c18ca1418670f9286e8a328f5492d95668273bd784a8ad7ffeb9a2db8` |
| S140 | `src/pages/ReconciliacaoBpTx.tsx` | 1–661 | `0b8c9662101ef28c9eeb7d90345a42d14ed25c37ed85fe29d8b5d342f1e1f1bb` |
| S141 | `src/pages/RecurringTransactions.tsx` | 1–654 | `59dec9bb1aa7164e7891ef899ab0c4acaf873cba35b9202189cecac8615ff9c1` |
| S142 | `src/pages/Transactions.tsx` | 1–2242 | `918e07ab206610707f617ee309838fa88532be0dbfb3659a57454e4244468459` |
| S143 | `src/test/issue475-source-blockers.test.ts` | 1–113 | `e869d41a5c4b7eabe11a048b19d524375aa6d41605117fafe0902d6e1eba48cf` |
| S144 | `supabase/AGENTS.md` | 1–3 | `c4a593a91c43a79de00879fea8e566841a74d212962ee9a3dda8ffca46237b17` |
| S145 | `supabase/functions/ads-invoice-apply/index.ts` | 1–908 | `ca23a2692368986ee1498bb16b0b91cca5680d035984f95691b1001f84b987d5` |
| S146 | `supabase/functions/apply-coala-bp/index.ts` | 1–2462 | `4d65c4c616c46a00981edf8dde75cb3ec2d878c589cfcc17a22f2fa6ef598d48` |
| S147 | `supabase/functions/approve-transaction/approve-rpc.ts` | 1–41 | `b5696a1c6f72d98c6f807dbe11c230c9d15ccda24eecb22eeb6490ef5fbd1dee` |
| S148 | `supabase/functions/approve-transaction/index.ts` | 1–314 | `c9abebfb7c2172f1342e65db12e880a8df1bdc9203808add259cc4c79476d97b` |
| S149 | `supabase/functions/audit-invoice-groups/index.ts` | 1–301 | `f9318092a6ff6240fdccac55a315fb27bcf0021b35346d195d11dd6d84569fa9` |
| S150 | `supabase/functions/classify-coala-tx-with-ai/index.ts` | 1–389 | `c61ae401edf97e52b4cb3ac9704dbdb18a3047e09c35888e0340bc7680fd8dff` |
| S151 | `supabase/functions/close-camarim-session/index.ts` | 1–1246 | `1918e7a6bbcd2e67d4cc263e2691339422c8010df75f4018a24dbc4657506e02` |
| S152 | `supabase/functions/close-card-session/index.ts` | 1–1098 | `73e960dff53bbc4a19cf56b86050ae93f96ee9cd9791996f1d30565dce0043b6` |
| S153 | `supabase/functions/data-entry/AGENTS.md` | 1–16 | `c33e5440be1686bc932f1b13ea3710a2bd2bfda3fa5acd9f1ce95a7d5c28ddd4` |
| S154 | `supabase/functions/delete-transaction-document/index.ts` | 1–156 | `3b4357bd41c264c46940ae83e3bd6ada5a3c023bb5965250ffe329da6bc7ee44` |
| S155 | `supabase/functions/ingest-transaction-document/index.ts` | 1–420 | `1b4df493a013ef364a7c653bbb90793de866c9a8767b4f9f22aedb75cd6e79ad` |
| S156 | `supabase/functions/update-transaction/index.ts` | 1–646 | `7cc029141feb6ce039c4f11e40b60e2f5bf893629fa0fe8596b751b75a5608fc` |
| S157 | `supabase/manual/0271_p3_partner_contracts_tables.sql` | 1–51 | `553588948cfc800e0652e893c2bc64633cea3a7b32195cb3ecb4495fc8b3b726` |
| S158 | `supabase/manual/0272_p3_transitory_reason_10_1_03.sql` | 1–49 | `623b4348d4651551752a007c8cb5135c93d0effe58f3d3e8020f35ab22fe576d` |
| S159 | `supabase/manual/0273_p3_partner_contract_rpcs.sql` | 1–307 | `a228b3f422ad1997d8be9c0c61b0c1e8484c8f99c4ac19dd83d90d23b9a10399` |
| S160 | `supabase/manual/0274_p3_partner_contract_guards.sql` | 1–80 | `37ba57f74073a85186d71cdbe567f375763e07aa12ed47de447ce0ba1cdde26c` |
| S161 | `supabase/manual/0281_p1b_substage_follows_master.sql` | 1–128 | `382f0e874b60606deaf68019fbf83770caeb8468a1eb8796b329784e0b5acab1` |
| S162 | `supabase/manual/0282_p4_financial_position_base.sql` | 1–325 | `6f174c92624a6738ae843bb78c7396b7686305e71013d724457ae02c78ea53a7` |
| S163 | `supabase/manual/0283_p4b_financial_position_permission.sql` | 1–334 | `61269535ee9d1a9ef077ae74513cb8fdfe28525234cafa088a6db6d7003876b6` |
| S164 | `supabase/manual/0284_p5b_a_pagar_por_evento.sql` | 1–369 | `7b1ecb61045eadd21e909a0da7d56d6ebfe66046b8004d16d22aee9fe60becd7` |
| S165 | `supabase/manual/0285_p6b_a_pagar_caches.sql` | 1–409 | `7ac3022659a738f39be5218d1f197e3d57828cdb1e2d1ab5529a9fe838505de7` |
| S166 | `supabase/manual/0286_reembolso_pagamento_fora_resultado.sql` | 1–340 | `97992dcb8c8c36fa0a99f16eca9a1c4b1bfdc27d2856d2325eb47b2fdfbfe4df` |
| S167 | `supabase/manual/0289_p5c_cenario_receita_prevista.sql` | 1–522 | `c2bb1fe7c1bbd8b3a5fc24ca6c7b018ebe86d97d0ffa2c005804bec4bc21ab3f` |
| S168 | `supabase/manual/0296_issue404_excluded_from_partner_settlement.sql` | 1–71 | `f6039203ba5ed551c217dbb926da9d7be9f8163f593416420fde4b7bf98f085b` |
| S169 | `supabase/manual/0297_issue413_house_only_inherit_from_bp.sql` | 1–90 | `0d505b532fe828255f413eec0f904b8374b866433c1b3938dbdb5ebcb13066f0` |
| S170 | `supabase/manual/0298_issue418_card_load_category_by_company.sql` | 1–119 | `9cdfb37d55690f7a36b933a99b5b0f3b0867e08c2c19cff9d8c03e5c68aaea32` |
| S171 | `supabase/manual/0301_issue401_reconcile_bank_line_devolucao.sql` | 1–561 | `ea01a9148a2eca38e9bf31f88e9efd7031a3304ed808e6b6abef3796b6e885bf` |
| S172 | `supabase/manual/0303_issue338_delete_transaction_documents_permission.sql` | 1–60 | `b0badf321e0c6c154ac21adcb3449a54c4c27f5742c2c7b3e1f538cbbcd46207` |
| S173 | `supabase/manual/20261021_issue335_cash_position.INERTE.sql` | 1–128 | `acb5534ab3b739c8c6414a9012e6c3cc66842a65a7e1505267e0b77a7cb62ce4` |
| S174 | `supabase/manual/20261021_issue335_cash_position.ROLLBACK-INERTE.sql` | 1–106 | `6e13ca40c24d71b0ca93280c38631ecc04933f89f44278ab4045e475e5f2596b` |
| S175 | `supabase/manual/20261021_issue335_cash_position_invariant.ROLLBACK-INERTE.sql` | 1–68 | `94caeccd0dfdf8326faf02aef36052b41bb2fd96980f029e4ff0424964b6c175` |
| S176 | `supabase/manual/20261021_issue335_cash_watch.INERTE.sql` | 1–79 | `b906804631d2d5da00b13b4e24aebb8030b5368d05b928015265720b380c9f08` |
| S177 | `supabase/manual/20261021_issue335_cash_watch.ROLLBACK-INERTE.sql` | 1–14 | `876f384e8eda70575b0af1106989d3eb10ba02577edf62fe51a46b2e2882bded` |
| S178 | `supabase/manual/20261021_issue335_offset_approval.INERTE.sql` | 1–165 | `c2a7e14c204a0bd3eabdabc3dbf6d4d8224f7991f9d50c4b88692ffefdcdd67f` |
| S179 | `supabase/manual/20261021_issue335_offset_approval.ROLLBACK-INERTE.sql` | 1–137 | `8e10af4b3db0a9e13b76d142f331c50b31450c1e80d9c7f29dd15e441981bc23` |
| S180 | `supabase/manual/20261021_issue335_offset_balance.INERTE.sql` | 1–128 | `db667f07a1e4d4900e3d14712dd2bb4e1b38a6d1a6c5ad1d8378e43da5bd0b48` |
| S181 | `supabase/manual/20261021_issue335_offset_balance.ROLLBACK-INERTE.sql` | 1–81 | `9ca77d14d030453b1097c5999954d0432fa2e3345de57b363ddd7c86287b9eb0` |
| S182 | `supabase/manual/20261021_issue335_offset_core.INERTE.sql` | 1–1164 | `4d0c673a2c7f89e07212786343cfb2a891218d42268acc9f7a79391d6038650c` |
| S183 | `supabase/manual/20261021_issue335_offset_core.ROLLBACK-INERTE.sql` | 1–715 | `8d1d3d0588a4dbb68adaea65978e357182f6ef5f6d4f47e239fce61b425b5c99` |
| S184 | `supabase/manual/20261021_issue335_offset_group_storage.INERTE.sql` | 1–115 | `5817fca6c2d44f6b18dfaef7f0c49e4a66ee8ac34b87944b20f4b29c3772198f` |
| S185 | `supabase/manual/20261021_issue335_offset_group_storage.ROLLBACK-INERTE.sql` | 1–24 | `f00b02fdaecd472628b6074e0fb7bbc7b87083063cc15fbf7a70ed669d581509` |
| S186 | `supabase/manual/20261021_issue335_offset_invariants.INERTE.sql` | 1–288 | `dd40e9200173cff04a40ccb54178e072b8a53bbc2566b464fb8c3097e3f605f3` |
| S187 | `supabase/manual/20261021_issue335_offset_invariants.ROLLBACK-INERTE.sql` | 1–268 | `3da1fc7e9ee3027338e8a27dd7d209087f16911a4b54a0b0831856e4e146ec9c` |
| S188 | `supabase/manual/20261021_issue335_status.INERTE.sql` | 1–59 | `2fc7cb619360a1c3185cf897dd5283eeef85155329e1da9b38243572b027d52c` |
| S189 | `supabase/manual/20261021_issue335_status.ROLLBACK-INERTE.sql` | 1–52 | `386aa5008618e08798732ea366359cae060cfdd8cd3493eb6133d893260daab1` |
| S190 | `supabase/manual/20261021_issue335_trigger_watch.INERTE.sql` | 1–107 | `34a69e357ca4ddb90a4251bc391c3e3815a7e7e372e7ec8591c4965aaf7c8421` |
| S191 | `supabase/manual/rollback_0237.sql` | 1–101 | `b83d9fbb8e47ab0d8b32bdf186b2ae1e56d52bdb974235855935f87762e3ae0f` |
| S192 | `supabase/manual/rollback_0271_p3_partner_contracts_tables.sql` | 1–5 | `94cb8a46efc4d15c9d61975ac07f72270925e6aeab00c4fb5247d04ac700e083` |
| S193 | `supabase/manual/rollback_0272_p3_transitory_reason_10_1_03.sql` | 1–50 | `654562fe08655d46d2d0eb2e38356fed0bed1c0e62c606456216e190bc39c148` |
| S194 | `supabase/manual/rollback_0274_p3_partner_contract_guards.sql` | 1–5 | `495462cc74f26a017c0a1b9487c64c5cd1f5ee25e4315a6724e1b7b86fb7b450` |
| S195 | `supabase/manual/rollback_0284_p5b_a_pagar_por_evento_comentado.sql` | 1–317 | `0f092945b4aaa2c57204e483a501f6921165f1c02a2aeb5623d3c1ebe92452b6` |
| S196 | `supabase/manual/rollback_0285_p6b_a_pagar_caches_comentado.sql` | 1–367 | `cd1eb358981b441124437bff9533beb19c7017195c1db3e0978e2f7ed565360b` |
| S197 | `supabase/manual/rollback_0286_reembolso_pagamento_comentado.sql` | 1–268 | `6bd29db83179369751c3b1a26862d4a3226b2752a505a78caeeec1d038b2bf8b` |
| S198 | `supabase/manual/rollback_0296_issue404_excluded_from_partner_settlement_comentado.sql` | 1–13 | `7226e5d7074fdefdbbaa1648372862fa30c09f2a4912b5a2ccc1768283e5b7d8` |
| S199 | `supabase/manual/rollback_0297_issue413_house_only_inherit_from_bp_comentado.sql` | 1–8 | `c1e02c6bbae1e5470781102f3e4e41cfa94ce40a53d867f57afb3cb3db3caa59` |
| S200 | `supabase/migrations/20260317112302_0966ea18-afee-468b-9299-db8ad68609d7.sql` | 1–176 | `3e90f9114d2e789a6d473d650eb4f8c0d74cbb890a8fc6046a91eaac8b84d945` |
| S201 | `supabase/migrations/20260317115615_1a935844-68c1-40c2-8bba-3340da3909cd.sql` | 1–25 | `427bb1358398ec8045d07fb7e53c671c8bf4fc96eea4d17e8429adca7b25bf65` |
| S202 | `supabase/migrations/20260317120649_65dff232-0760-4087-aa6e-a85f3957f760.sql` | 1–1 | `3ff6fac5c440a878c09777d9ab7a533b281ac58e28764d74a76ff1e6ca051893` |
| S203 | `supabase/migrations/20260317121553_f5bda9d5-63d6-4455-a91f-33f51ea4cf67.sql` | 1–18 | `239f62d1ea022434e6e23d2f01342c01a51bdbc97ddf95324604714948dccbc9` |
| S204 | `supabase/migrations/20260317122916_cc89baf6-cf80-4b1e-a72c-09c5ed25d38b.sql` | 1–87 | `ccd938093b80def247d233046d6ff8d8c9c75335b2df0cc2f83e9d687c1fe569` |
| S205 | `supabase/migrations/20260317124948_bb5589cb-5a0d-42d9-8efe-cfde82cce5ee.sql` | 1–40 | `9febb31d9f7c62fda13aecced00f70391a5f4a383b97baadca622dfe9e7262d4` |
| S206 | `supabase/migrations/20260317133443_f470c553-1483-4388-a6fa-2ae8c61053e5.sql` | 1–1 | `9460cbe9d563eb1021978d79c2f0901f54ba4d8ba3d2eb5af11ecec3b9ccf649` |
| S207 | `supabase/migrations/20260317140515_561ff4fc-98ea-4903-ad48-07f65d7400b7.sql` | 1–2 | `3d393d0cd27852ce07661dc1c50694a902f6eda3a699c8f24f3c62fa63b51456` |
| S208 | `supabase/migrations/20260317143149_346cef8f-fa7f-4226-8e55-2abe3660161d.sql` | 1–40 | `59a1c035dc7cf035b70830f8fef26c1319b61edeae01a702a698e744fb4611e0` |
| S209 | `supabase/migrations/20260317212720_489b04b9-18d1-4945-ba66-78fcfed963e1.sql` | 1–6 | `66e91af4a68cc8a5bf4421bf819dc661c16157ef635b8527f22ac0301bb663c8` |
| S210 | `supabase/migrations/20260317214227_7b205982-364e-4a3f-b2f0-c3157519687b.sql` | 1–2 | `aaeaa53e5e071ad0a96de0b83146e3f23c0efd1b1afd88bfa22a77a88dfa0a1e` |
| S211 | `supabase/migrations/20260318031654_319769d2-6426-453b-baa3-2cc8ac196a13.sql` | 1–28 | `f0984b43844423b1a5967ea784d2fbd3a5b3fd0dfaf13153a536cf52242cf22a` |
| S212 | `supabase/migrations/20260318210925_6c5c2eed-11de-4962-876c-84cc1173bc2e.sql` | 1–2 | `abbdb5ca00efda28b77b6a7bfe31a8c82d81705898782c7ac49d0564617608e7` |
| S213 | `supabase/migrations/20260319225910_cbd0e749-e93d-4b2c-a8f0-7844903f96a2.sql` | 1–62 | `77e15a7ed42b4327a599357d2b6c42f8d690c6d2fe29f43284cbc9bdf418bdc9` |
| S214 | `supabase/migrations/20260319230650_7970cbb2-f1a5-483e-8425-b2ad30c7204d.sql` | 1–69 | `b9d4f31215cb6666387cf24552b8d46269dab02a0ee03d8d36c485701291bd8e` |
| S215 | `supabase/migrations/20260321020811_5f5a03f4-b533-4a5d-9a04-488d45d3bab8.sql` | 1–39 | `c4f59b8954f1379ed6f81ba41fe459047d7f8520d3c8afcc0139e063b7672d9c` |
| S216 | `supabase/migrations/20260321114928_998472ed-893f-4dd3-93af-db36698b0faf.sql` | 1–26 | `ab73c2e67b5c647d02f146833c830de0293e5c4f02471fc238841b28410f65f8` |
| S217 | `supabase/migrations/20260321120543_2bf0d18d-3272-4892-a450-e75716b984e0.sql` | 1–105 | `9f9f5cd306e3def70c98107e6068ebb1bf336caaba31353e3faac35614bd64ad` |
| S218 | `supabase/migrations/20260321124244_f85e5444-7395-4fc9-996b-64e0ec0e34f4.sql` | 1–144 | `d3e42452840f97e3ae78d27f5b706243e3c4c82dca72443e0868c00f0f645dc2` |
| S219 | `supabase/migrations/20260321231824_b1a52086-5a99-4018-8209-d2d9608e0bb3.sql` | 1–1 | `d3a16c26d29ef2a0119e0bad3882e9524ba47c8fd9e459b33a5d07858319f66c` |
| S220 | `supabase/migrations/20260323123335_75b7c209-dbb9-4570-b1bf-9508c6e660eb.sql` | 1–125 | `2dbbbaa3b5b7e6ed831451ed47f2c8fb87b0280a0e705aae5a72b415bf672af5` |
| S221 | `supabase/migrations/20260324174706_9d3f5c07-2db4-446c-81f1-794fd3e81d6c.sql` | 1–1 | `ed5208a4186878f6dda0c5aafe8eb91b432f0bc88241b2f69004e6899094901b` |
| S222 | `supabase/migrations/20260407104429_eebe1f88-630d-454d-942d-3c109aec3ccf.sql` | 1–1 | `18ebcbf8202ab47b6ac1b87a8b37ba824ed30860e1a06fad9466a5661cf259eb` |
| S223 | `supabase/migrations/20260408165312_9af480c2-62f8-4049-84d4-6cf1cfba2102.sql` | 1–10 | `f8d12af0b935bd2bffec300d2ec5f2b4c0cc9e2955ec4ed8ab090215d68d1a3f` |
| S224 | `supabase/migrations/20260410073545_a3a3a2d4-e8f6-470a-be33-384fe0332d81.sql` | 1–127 | `0d622e95b71143d10d3b4d936f850f3100fa8ed0d1e12dcf6857f05417ca2d86` |
| S225 | `supabase/migrations/20260410080235_ccb32137-2f47-489a-80e5-e79934506e0f.sql` | 1–28 | `05204c3e29ac7737057a6288ba0c9adb91ee7686c566854411cac5943a6e54ee` |
| S226 | `supabase/migrations/20260410090116_c63d6b5d-0c79-48ef-a462-1d8bceb92597.sql` | 1–183 | `88ca37c3eb4918abbdbd54ad7d62a89aa6b1df77b19637917e63dc42fa82018d` |
| S227 | `supabase/migrations/20260410090308_2df06407-1a29-4eac-8663-94f27e3df105.sql` | 1–48 | `829e8616fe2dbc5d81d4f83b119e31fd92ca361d420bc3bc481843e73fe9b680` |
| S228 | `supabase/migrations/20260410110817_9ea8d097-f6c0-4bfb-8e49-de6e84e0716c.sql` | 1–64 | `a20e1440d96d0075991371f2b3e1ba0937a6e6b773373ee1e80f497222a4c468` |
| S229 | `supabase/migrations/20260411004436_a94e5060-3d6f-4015-8420-6a4b140b5928.sql` | 1–18 | `2edf68614b5e54b9ed8cc96d063e30d348a8fcdef32be01af49b82119a8c2b35` |
| S230 | `supabase/migrations/20260412015924_78892ae1-5180-4359-a128-e13bf5dc5e06.sql` | 1–2 | `d50c4d8c2de41338c852ec8effc6876dd2cd255b8edabd5d8cf459b6c2036cc2` |
| S231 | `supabase/migrations/20260412123633_ba14cf20-6a4a-4c67-87d5-093a20e97f54.sql` | 1–9 | `35211454f20f07db227035f79619cd692f92623feadaae2e1f3c742440e56582` |
| S232 | `supabase/migrations/20260412132411_9c0e112a-d80b-4a8e-8c35-54a3f5396746.sql` | 1–7 | `ee73f814aad15170069e267f02f6182b87b064f1dcd1a6393b12439c4c1ad627` |
| S233 | `supabase/migrations/20260413141605_f82efb08-5c35-4c21-b44a-af452f5d625c.sql` | 1–53 | `6a356cd93726987ae54f3190e561ae28a73f16ed6406fb135c6dfd461d3f1985` |
| S234 | `supabase/migrations/20260414135202_404e7f4e-a9ff-44c6-8675-7fb43f9f1939.sql` | 1–23 | `718048b36bf3765a55203a3721b90056b8540c8f2a34c13cdffc3a08144c2dae` |
| S235 | `supabase/migrations/20260414201908_9be3d351-1d87-4ed1-bbd5-c31719771334.sql` | 1–4 | `3b536f7ee1ee9ff75878b9943842084dfcb5d369c80efcab695c5905d89bd4de` |
| S236 | `supabase/migrations/20260414204955_cbf51eef-82d3-4c77-b650-8250dd45fa93.sql` | 1–4 | `bb21a3b6e31ed0a0a96cc4cf11bbe79015c0c3460b57313cbf6eef270995b949` |
| S237 | `supabase/migrations/20260415194439_0991de5d-8de4-4ebe-b1e8-01bc06ca29a0.sql` | 1–66 | `f92a9ff9fd63f69e61c2053ba950e09897ba89a46fc57d1cc4dc7d471f6b17c5` |
| S238 | `supabase/migrations/20260417160256_cca1baaf-4600-4786-86d0-5266578bde12.sql` | 1–127 | `a4d1a19a3d16ccdf64848530855f240b6087ed0617e178c3db4c3a921af5b8c8` |
| S239 | `supabase/migrations/20260419181710_a708498b-ce25-4424-a914-170f274df847.sql` | 1–40 | `32b56ecb4c2329dba0f88735f66e193dd3e3602d06d4ece5af96aa871376232f` |
| S240 | `supabase/migrations/20260420023648_2e7a7732-9aab-4716-97df-d43907f580b4.sql` | 1–64 | `4c617a07f9344c0eaeeeecbcf3fe41c59d2dac757966ccdb79f2b84765ea5295` |
| S241 | `supabase/migrations/20260420124841_f6f5980a-0201-4339-b2b4-8beb0fac3618.sql` | 1–20 | `10a0ada5562e8e320bf236a1962618a31bdb154c23d19f9f58cd2f7b6c40370d` |
| S242 | `supabase/migrations/20260420202231_16cebfe8-f3bf-4df0-967c-ec5efaaa0e8a.sql` | 1–1 | `fd74d9b1ceed2245a5dccfb7191e979fca7b6c87b33de65ced67dfa6286c65a8` |
| S243 | `supabase/migrations/20260421035828_eea48908-0774-46a9-9e24-fa6e2090a612.sql` | 1–37 | `e8d6751efef53dfb577e7754585bb12d2073ded3cf61908c805d113d9a1a1ca9` |
| S244 | `supabase/migrations/20260421135434_440a64cd-e05c-4bf1-a455-445e74353ac0.sql` | 1–18 | `732cc17d8e040a45db85e9cd3f7110c32d8aae836c705f1cb580ce35aee9a6fe` |
| S245 | `supabase/migrations/20260421205830_715e33e0-1cc5-4d35-a991-4a25db637cc0.sql` | 1–9 | `d05bdfb76dd6ae1233be03f312781fe8bd6d4aa119f533afe1f45b4c59ccddb9` |
| S246 | `supabase/migrations/20260423132713_21bec13d-ab0c-423b-be44-a07426aa4d14.sql` | 1–58 | `748c27c48029bd948c57d3e409be80c13e114df33fa71703a147459a0a91a2b3` |
| S247 | `supabase/migrations/20260423134709_846b8801-d16a-4ded-bc64-64a963ea23c2.sql` | 1–46 | `8bb30dab2e4fde3e01630d4da5a302196c3c6bef3f8d3f2b14cbef50666d277c` |
| S248 | `supabase/migrations/20260423192819_65af983d-a2b7-4103-abb7-e03876f4c34a.sql` | 1–297 | `f0fc2b7e3e574bb4fd6a0bd59bfe8405caa2f62ce131f90dc8509948a5cec894` |
| S249 | `supabase/migrations/20260423233912_cccacf69-c752-4e00-9f14-a529e95909d4.sql` | 1–79 | `c493415b7d2b99b7fd9e9d325695d7cc1a5d37716d01568b275acd98530a7490` |
| S250 | `supabase/migrations/20260426014047_a551e22a-509e-46f8-a630-f4d7568b909c.sql` | 1–287 | `efafba2f177459dad2d8799ccbde36ba1ff45bba1e0e8df008692569d5419c23` |
| S251 | `supabase/migrations/20260426015256_b93b763a-a8cf-4649-870d-28ac557a567f.sql` | 1–180 | `d0b72593008a2cfd179566c1545eb7db4290a9b788f1d4d956f7a88a778edc02` |
| S252 | `supabase/migrations/20260426020315_c061d23d-3908-48b7-b77b-b56d2da6dc5f.sql` | 1–340 | `356c28ed501d0f8ee28c5be545e26bdd92a755619e0c35efe30299c571114416` |
| S253 | `supabase/migrations/20260426020734_5034aaf2-1255-47b5-aac1-7afefac8d096.sql` | 1–250 | `1b613a5238126b361a2c9c1a9ed281bb9f2dbb0c0da3081833a033cee6a3a1fd` |
| S254 | `supabase/migrations/20260426022109_71c2fd46-1e97-4d75-8c40-60880eefc5f0.sql` | 1–283 | `c1b607fc7dd87fa4477139195e57a871f3a222192142984b92ad9ff81b3c6826` |
| S255 | `supabase/migrations/20260426022617_f96433bd-d9a4-4fe7-a99e-711a07749271.sql` | 1–366 | `c16a86ef442966467f7081c4458407b7b92478a44e8c091d64df0a1cf4fb210d` |
| S256 | `supabase/migrations/20260426023050_1c8019c2-4d47-4e6f-88ac-f1f670af164f.sql` | 1–208 | `5be7ece3589700aaf1a11ff89693ca23b0d0ccdbb3eff6c5e997a287e0829eca` |
| S257 | `supabase/migrations/20260426025227_7d1fd383-2a6d-4d7f-84ea-cb242dcdd2cb.sql` | 1–558 | `c547a2998b9e3ced386672a10a9ceafe9895f5afccc1bb5874ba13a5e7e6654c` |
| S258 | `supabase/migrations/20260426025322_9dda490a-e42a-44e9-8b3c-0ef43994d961.sql` | 1–143 | `5f213858f48bfa4219a3cce8fb5e222072f675844720df92a2b87879fe50d7ac` |
| S259 | `supabase/migrations/20260426030654_1667e5a7-3abc-4990-a9b1-d039ce9165df.sql` | 1–336 | `d8e46ff2ee2f28bdeaed934968d8c69ed110b6258c65562e43dd7fc0255bbf99` |
| S260 | `supabase/migrations/20260426032742_959dd71b-9cee-497d-97c7-f169c857ddcc.sql` | 1–339 | `7462f1807beaa256dd20a994d179f4249e2b406193c801ec3a59a6462f6d4b15` |
| S261 | `supabase/migrations/20260426043730_95b40112-e4a1-4b84-8fe7-1cb4b4455e7c.sql` | 1–659 | `7f9c23f978d142f530bc170a0401e99c6d6061031f0e4bf1084acb9dc79408b6` |
| S262 | `supabase/migrations/20260426044940_f0e2627c-48f5-4b16-89d3-218a3e986118.sql` | 1–647 | `1e56d6daf772ad95fec8fdcd43808ca77df6635dc5c342ab6e74d0421e2d3e83` |
| S263 | `supabase/migrations/20260426144130_cbc8f3e4-7757-42c3-bc2a-474392c285f3.sql` | 1–147 | `25ab9e2c9cd63c59d01b9efda1650b99e0ebe9d0cbb5a0ad586cfcb9e6a60543` |
| S264 | `supabase/migrations/20260426145540_b69ca86a-b8da-439e-be5e-4b9c444b3cb0.sql` | 1–451 | `34c786721fee4a3f7e91b86a6514c7e83be794c436dd0e2534e8dc9ce90e6f3c` |
| S265 | `supabase/migrations/20260426165039_38e72d7a-0d7b-4f89-b88f-82fedc0d2d03.sql` | 1–195 | `c9c0e530c59b458216b89e2638d86de157eb8d2591fb90c2b441d0d72c78a955` |
| S266 | `supabase/migrations/20260426170655_bb6ae0d2-914a-45c3-84a3-9ffec5f8e8aa.sql` | 1–154 | `86ffabc24614ea81b59aa7a99bf087700bd5b447b85c747b4e23dcfc20bfec42` |
| S267 | `supabase/migrations/20260426172114_3e23652d-5ea6-4bbc-b7e8-ba3aadb4c189.sql` | 1–63 | `ef6881ed728c9936abeee951a0a17bfd4f677896166620a917279748b9fd159c` |
| S268 | `supabase/migrations/20260426174028_90cd9514-581d-4e05-bca0-8a87d8911bb6.sql` | 1–151 | `73c9ea9dc4931c561b6806660cad216ff2367be46598172317979a65f41b027b` |
| S269 | `supabase/migrations/20260426175504_103ccb66-8594-49a6-af08-7d159a0fce90.sql` | 1–60 | `19a659d2ef8191b94ad36340f791c6cc3766a754a524acd1b86eebb7126436f0` |
| S270 | `supabase/migrations/20260426175719_0d0b61b9-1a0e-4f5e-a2b4-3ac9bbba918c.sql` | 1–152 | `ef589e112ef080a04ae6214d6285f65e4006752bdde826059665a263c311a626` |
| S271 | `supabase/migrations/20260428122732_90cf7c9f-586f-4c44-84f8-9acdcd0f91f6.sql` | 1–25 | `6ebc6efad79eb71a3bddd66f3a5a78ed6d6b4ebdbbb5460ca656d40c1725709b` |
| S272 | `supabase/migrations/20260428190807_7328b2c1-4efc-43b0-9449-d4b1db4626d0.sql` | 1–5 | `080b1d30bb52845c61c3f476345f3f346ca857a3b3f8e8555db98a815a5cdd7b` |
| S273 | `supabase/migrations/20260429021930_f270ff05-38a5-405a-9997-c40c3a9f795d.sql` | 1–204 | `3f551778042333a29a4e9b352d9b7eae13f8fb5400a0a96694f7016bddbac6d4` |
| S274 | `supabase/migrations/20260429022451_f4f31f05-801f-4cf2-9e01-e934e8d8f5f5.sql` | 1–229 | `1a54967e80698154ea6b9411c3ebcceb24d27ad7be56066deabe302e10218387` |
| S275 | `supabase/migrations/20260429023352_bdde43fb-864e-45b1-89dd-9bfb7e029795.sql` | 1–77 | `b1cfaa3592a95fa986d74366388cc237f1d7d6aaad968a6e74960fc164ea5516` |
| S276 | `supabase/migrations/20260429023624_58b2b0a6-3a37-4760-8558-ede61968e0eb.sql` | 1–72 | `a047a0fd806d537d8317f3183abe83aaddec569ef0a79cad69ab2de0da6b0f3a` |
| S277 | `supabase/migrations/20260429025150_67b18ee9-d4c4-4978-a155-01bacfb57b03.sql` | 1–128 | `f716a31268fb5b3a4f8d3ca7a17c9d88169c7daa13f8af048493bcb171f40600` |
| S278 | `supabase/migrations/20260429033420_d0deed9b-a439-4edc-8265-c81856c1d080.sql` | 1–122 | `869685079298d10666c9989c0dd3304d8c0e959ad465c20b71bb297a236700e8` |
| S279 | `supabase/migrations/20260429033756_e6cf356e-f8e8-45c5-ade9-6c4f626499b7.sql` | 1–38 | `9f455ae830ee0dcf487df506e676ed06ed1c19fbdd2889e19bcfc2ff20ddd0cd` |
| S280 | `supabase/migrations/20260429034054_b2eb3121-d38b-4529-85f8-7395c1a55929.sql` | 1–154 | `3fbb0a6c6e23dcd7544ad43a5e3798a3eab8fed4ad47c0000fd4da4da635e20d` |
| S281 | `supabase/migrations/20260429034154_6a0dc901-4fe6-4dae-a1da-04c6ee687717.sql` | 1–149 | `e803014c74304031c73a8da5c1fa9cd6dbc35e4fa6866ee864c8900c7504ffee` |
| S282 | `supabase/migrations/20260429034335_b4d19648-ab1e-4fef-be31-aab43c5eb232.sql` | 1–170 | `33bb18c07a8a9aa0d43aceb5601d837336fc8c176a93ec5a4f7fdeca6a110084` |
| S283 | `supabase/migrations/20260429034716_30c1cc53-6d66-481a-b17c-16f267fc6ec5.sql` | 1–108 | `9a3dc3e569548d26ee079b47c98f2b4c3687a91819bc44d3a49ffa7a93e74889` |
| S284 | `supabase/migrations/20260429044019_c8022215-3618-4bc5-996f-98e4b7ea1919.sql` | 1–118 | `843cd011eeeaed1ea31e8b8e73f9ac9403187dfff10ade0794fe06a073ec9d5e` |
| S285 | `supabase/migrations/20260429195944_0a200860-cb39-4061-97b7-4a968f69ad31.sql` | 1–119 | `06c35bf4ee75bc27b8e0d7808cd11d5bade62ffcce6fafbf4257c962f6f84bdd` |
| S286 | `supabase/migrations/20260429200350_5d5e8c9c-149a-4249-aa5f-648c88ac7d64.sql` | 1–119 | `c765696e710404f2f5be83bf87f94ce1a3ec7b0d5316b8cb6e7efbeab87b35c8` |
| S287 | `supabase/migrations/20260429213952_3654c853-a574-4704-beb4-aea31b9ffdd1.sql` | 1–63 | `c71a73d62cd47a3bbc5a842cbfb211ad5382f652880eb2159cb8f6b6bd5dc3b2` |
| S288 | `supabase/migrations/20260430032104_ba05c786-ad03-4c20-bb0a-a8ef562a7a90.sql` | 1–81 | `cb86959c1c9d4a630d638a7deaa8e9f571a0b54d67a8f742ff4764aacec59528` |
| S289 | `supabase/migrations/20260430033938_1cb98882-aca7-4af2-9920-aebde8e65611.sql` | 1–94 | `39dc88b29569c03c0488ebf68896f884f29845430e27fdbcb04f3192293aa835` |
| S290 | `supabase/migrations/20260430133558_7f618235-3dbb-4eee-8458-d1c18e085581.sql` | 1–93 | `c07e1c1534c3238a85c96b7051c4573365145550c1f81e4fc67f7d0d76a83923` |
| S291 | `supabase/migrations/20260430140433_9d30b324-276c-4bd7-8e08-6530267b6e00.sql` | 1–163 | `484e86fc081ae1d3432c488d907c6c8ac248c8802895a3c3f3a6c4b8df5d99cf` |
| S292 | `supabase/migrations/20260501192024_47ca70bb-f3e9-4222-a5b6-71446c1c9d57.sql` | 1–218 | `14742728525d2ffe802fac6b822970a15e617d46eab9b3999459045f3d3287c7` |
| S293 | `supabase/migrations/20260501201351_be458c67-0d1b-4e45-88a1-c7f244b74d07.sql` | 1–41 | `9a6f954e3d1329afafc7ac59951b826183cd06b08d2c572134503fd164875d30` |
| S294 | `supabase/migrations/20260502160039_8f1dd3b3-6319-4245-9356-a92ac5f7d8d3.sql` | 1–22 | `8da9d62f02842f465e804a7612d881360cdf4c77492ea556ccc7595ef13a5297` |
| S295 | `supabase/migrations/20260502164119_9eccbfeb-d280-4696-b564-98842afad59f.sql` | 1–34 | `533e4347026d83f970212cfae28938312953712b8e0f04fbb1811dd115567a9c` |
| S296 | `supabase/migrations/20260502170220_7a2f61cc-ab4e-4fcd-a629-0ea343a48c53.sql` | 1–80 | `c9048b34bc9412cdc83e219063a4023f3350d656916b093f0d294dc9af1568f3` |
| S297 | `supabase/migrations/20260505035503_505938be-b44e-4c7f-ae8c-2fe9e771e3a0.sql` | 1–35 | `e5feaf12dda0ca9e286c2caf8323ba8d44fc5a65bcb204402234887860bd51da` |
| S298 | `supabase/migrations/20260507210701_579d5c11-d4ca-436e-bd0c-a57f052d5862.sql` | 1–88 | `4834f75f611ef1708fbce3d82c9dfc5626d4bef9019079d151d28d640417a86e` |
| S299 | `supabase/migrations/20260508232525_0a6ce0b3-048f-4e0d-9022-68da84173af6.sql` | 1–2 | `899d848dd74c846a54ec93e8f63e0cb38a066517b932832694f4d3c85c52b161` |
| S300 | `supabase/migrations/20260511200047_aabf13b1-04fc-4ac6-a578-5f9621e3b453.sql` | 1–123 | `36aa865ac5a0ec354e8099f0ac8da4be97ee818506f7de24348cd6cd697761de` |
| S301 | `supabase/migrations/20260514131452_15b43d6c-d45f-43df-b054-c88dc355beb0.sql` | 1–215 | `0b97b6299f4dadf9452c50e46d70780f043512783d035345d92fce8e72eee292` |
| S302 | `supabase/migrations/20260515013743_a0e44697-fa1d-4832-8287-996a3220c035.sql` | 1–19 | `34702434df9583653279ac95f78b067636c70060b0fe4027ff3ef091c60f5d21` |
| S303 | `supabase/migrations/20260515033243_98b35018-d0b8-4d47-9fd6-f040d8f56b80.sql` | 1–86 | `c3d5fbb5480321d18ffdbb6813b885358aeaf629aef433955f75a42efcc3f46c` |
| S304 | `supabase/migrations/20260515115515_4b4b71b2-7a68-479b-b5c9-c6e8e965663a.sql` | 1–221 | `a2de583ad45b2fe312945c6afb1010b884f05d11b01eb1a43021d0c717a72994` |
| S305 | `supabase/migrations/20260516161042_b8c76325-58d9-4ae4-a8a2-67137c0812a7.sql` | 1–222 | `155dfd4760c9a1c97dc02a88beedfbea5871968af2b7a5f3a569d0e00f435241` |
| S306 | `supabase/migrations/20260516163904_83fcf3b3-2d1e-4fad-8b6f-314e50c143bb.sql` | 1–219 | `f6c1124c54ffd4945d7c89bf8b7654b5a97226346f8600bbfc5cafc3ef0fa61e` |
| S307 | `supabase/migrations/20260516181255_a14d66f5-e69b-46f4-9e75-455f0c859b45.sql` | 1–141 | `90a3604a9bafcf5ea13cc3f71d6d19890f583e8047d082fc0a183942da612b38` |
| S308 | `supabase/migrations/20260518161633_f0f3c991-f73a-4616-b247-67600f6b37c4.sql` | 1–75 | `962a40e84da6fbdbbea679282337325849a54058dd94055d2360739f1ab5956d` |
| S309 | `supabase/migrations/20260520183128_564d863a-f66a-42d0-ada9-1a2fa6ef0357.sql` | 1–197 | `cf3f0a8575348ea4f69f8d347faecbd0d469641d1936797bb6d9bc8f2ed8ac7b` |
| S310 | `supabase/migrations/20260520183305_3511b169-f845-40e2-906a-c41cf1b37a1a.sql` | 1–4 | `3591a950990c51de57e30a904cdd97bb55e923a35d3eec0343d5eb7aaf88a328` |
| S311 | `supabase/migrations/20260520183423_dde573fa-6e68-46b5-8860-f3e9d68ee8b3.sql` | 1–73 | `e4e6b561d5288c57b9e4476d16dedb4eb584c24476b37bb988ca891abfecaae5` |
| S312 | `supabase/migrations/20260520183802_a689f8bd-2e7d-429b-b90e-cd922623ca13.sql` | 1–39 | `55fdde6b58fdad3aa6240044d3d45029bcf67f0f219fc2bd8654502030375df1` |
| S313 | `supabase/migrations/20260520184719_54ee6338-c40e-4b9a-9c07-9ffa2ea2c3a1.sql` | 1–79 | `e8d894af7f8b1ebd188c251562254ea3ef9becafa905a954928f3cb31b5659de` |
| S314 | `supabase/migrations/20260520184905_1fc8c4e2-e8e5-42cf-a18e-e61dc243d713.sql` | 1–37 | `42b67b74323fd75a6ae449bfaadac7fa273110c83585e5e07b8272f9535d0b88` |
| S315 | `supabase/migrations/20260520185022_1360015c-45df-4512-9e91-6d095bfc4f30.sql` | 1–81 | `c5df3830d90fdb1edec1924912f81b5d823fc2c9ac47dd04511123d0edf0f6df` |
| S316 | `supabase/migrations/20260525184529_edec5690-d682-482e-9c1a-e39cc697f016.sql` | 1–9 | `7d8dfc0a2d6bffcec7c8ef007463b0e881188b86663ff7056fc772ba5606a37a` |
| S317 | `supabase/migrations/20260608214750_63ab4fa3-11fd-4d1d-a0ee-54380cdf7469.sql` | 1–46 | `d378d3d0e5ad3aa55e6d67647cbda1456bdab66faf96575b6d059ff737bdd991` |
| S318 | `supabase/migrations/20260611120000_event_cash_treasury.sql` | 1–229 | `51d32a91fcac504fd7393f59becc79e423f23dbae87991331ebcb26f7d041e90` |
| S319 | `supabase/migrations/20260616144053_5e8b15c9-cadb-4921-b179-383f14261ce2.sql` | 1–65 | `1bb55cc4afefbbafcd83cdc4a7bb122fbb93b1ec70cb8d22737ef8e74f3875c1` |
| S320 | `supabase/migrations/20260616160112_2eea73be-532f-4df5-a2c2-0ab9e7f76e94.sql` | 1–334 | `9ca25003b572a203965e1a7f2d5067f003ad787c4b7fed78bb70d4e90c15a2f1` |
| S321 | `supabase/migrations/20260616173928_bf24c6d7-999f-4f82-9745-a888837bb51f.sql` | 1–60 | `b4cf69d8c444398268deb83c792b5e011c8a6d2d6218747ce0041920d4996c25` |
| S322 | `supabase/migrations/20260616190938_8ee8d190-8caa-494f-a335-dc1dfd3a1474.sql` | 1–61 | `c0bd0d9bbc1da7bcf31a6bf28e9e74a0e37217894126b7e7518ccecf9664abec` |
| S323 | `supabase/migrations/20260618113151_5e705c30-521d-4cab-894f-d553bcdb7240.sql` | 1–63 | `6c653c0d4845612bf89a693c70d1b401ee8a9e94d760dcecac565f5bc32117a0` |
| S324 | `supabase/migrations/20260709144752_c4b59592-3146-431f-a062-497a05c82fae.sql` | 1–214 | `2c6016466d0f18aa2c799c9e0fbeb4c38516de7cddd2992a33887b17984185cf` |
| S325 | `supabase/migrations/20260709164409_a341582a-94f5-44f9-87e4-505856fd084a.sql` | 1–209 | `079f44ba39895963a77d1b04d148d788d94f0b6d0eee40bd7dbe374f0f6163c5` |
| S326 | `supabase/migrations/20260709171326_5bc3b131-7bad-4370-aa0d-5762d53c0e56.sql` | 1–189 | `d583d4fb4fc041b715621de4047861559f8660189494adf856f86dc951a16e44` |
| S327 | `supabase/migrations/20260712223418_b7afd536-1158-425e-8efc-f48c0cb28e09.sql` | 1–91 | `bdc4aa33c7071c6e69134e68ae06da9476e054e5c0511325b90ffb3a3f46b335` |
| S328 | `supabase/migrations/20260713153334_41b25c4d-796a-4bb5-b850-9d85e648c0a8.sql` | 1–7 | `de399758405b2d38239cdad848e104bbebdfd2d3aeeb1d097ce44fee7842db09` |
| S329 | `supabase/migrations/20260714160212_3ffac88f-fc7a-4f41-984f-40935bfc0d87.sql` | 1–15 | `b3c3785efe84c4f77376846b3275cb658e3cb864a0121c1345b1172194f940e8` |
| S330 | `supabase/migrations/20260714184732_743491f3-ce7d-476b-b069-4fcc3cf99b43.sql` | 1–116 | `6ef5b2b342f92e881d1beff6dc8f909cbfd263b25b755872e448eed442afad0d` |
| S331 | `supabase/migrations/20260714192415_46e408aa-aa47-43d1-8042-c7b8211508b2.sql` | 1–115 | `586e7ba52f41fa942349de570a402b3d82e87e9e5e45ece3ca1bef23f80a7403` |
| S332 | `supabase/migrations/20260715142416_2e7076f7-5f43-48db-a0b8-f91413e9a918.sql` | 1–107 | `5416dcf0e2baaca3b9dda76b89af82e917889512834e287e22955005a8930396` |
| S333 | `supabase/migrations/20260805110402_fb19361c-68d6-4164-b667-265d4fa2a7b2.sql` | 1–7 | `ec25ea447a2e13280d637fbb492672ff8ab986beb6e3725d85a62127808b03d1` |
| S334 | `supabase/migrations/20260811130821_3d1200d5-3022-47ed-8b13-d0d8f89c6120.sql` | 1–275 | `f62ecb24fe0249b3da1c79c462cf4dbe09f8d9cc1249941821c0090b7dda8e67` |
| S335 | `supabase/migrations/20260811170757_63eb1f9e-3a74-4405-9009-f332a21be74e.sql` | 1–78 | `79b82cca9de9cc509c9e8cfd91c6aa5806fa85dda834aeb4f37685dc6719720c` |
| S336 | `supabase/migrations/20260812004850_2910fefc-44e2-4396-8d11-691bb41a26e0.sql` | 1–37 | `e71ab3f68db2e4c5312d11e212503d35ba47cfde143f2c448424ce3ec9c7ae41` |
| S337 | `supabase/migrations/20260814124614_6179ad95-69a3-457c-96c3-0fd5a293337f.sql` | 1–36 | `92756ecf28fd7722862f8fd10cda93e4b8e3fc026922eb6f73e47a8ebdd2fad8` |
| S338 | `supabase/migrations/20260814134718_bfa719b0-fa2f-40c8-9cb0-f9b4968c195e.sql` | 1–28 | `be2849053380dbde4ad3da0fe1a2cba67caed3fb98dc44bfbab8b30585514de1` |
| S339 | `supabase/migrations/20260814201050_05709f2c-659b-41a8-9e08-a48fa4ee3f89.sql` | 1–37 | `7a6aa11c4b78eeb4775d1d322e61457b70a70a495316d0de45608755841983a5` |
| S340 | `supabase/migrations/20260814211159_1e421d4e-1a2e-4511-8180-d63284a500e6.sql` | 1–33 | `c4d5d7a365940f55341c157e5e54597cc83e4b5d39b915c2a84cb5b86df8fe1f` |
| S341 | `supabase/migrations/20260818105438_3bd734d5-0849-42b6-b59f-e0b110f552e5.sql` | 1–14 | `887a42b86eec7dad32c4a0f3a2cceeca5d9972adf04768fa1e098ae664c2953b` |
| S342 | `supabase/migrations/20260818191239_405c65f6-e418-4f12-a90b-60593b155059.sql` | 1–41 | `fcaced7d2574ec508242417063dc4d9c57a08b120329555277f44b9e1dd4926f` |
| S343 | `supabase/migrations/20260819224410_c517150b-58b8-4fcb-a6ad-2b8c52e1f74a.sql` | 1–16 | `6eef18ff5de0a1762c659f82cc1ec0f148f7a24fc3f9a7c12a9d72af52d5618e` |
| S344 | `supabase/migrations/20260819230738_53f03d5f-37c4-4fb7-9a6e-2ed4e1881d22.sql` | 1–132 | `604264e5b38a9198690b23563d12d88200ec05f7d3d254e19554bfaa0cbab10d` |
| S345 | `supabase/migrations/20260820110300_8d3e952c-1cd0-4229-9ecc-f022a95904a8.sql` | 1–57 | `857e61e7decd1aa22d0b0ddcfe76a1fd2388e21846f9940f802228eadb5f5877` |
| S346 | `supabase/migrations/20260820191402_98acf476-5f71-4bcd-b01d-2c0e01232287.sql` | 1–14 | `f84d99080906e08b7be5b9eea9a3a700922a2648e2e03806042ad24f164b6cdd` |
| S347 | `supabase/migrations/20260822010127_6413ca40-d359-4fbe-bbd4-19c7709771df.sql` | 1–123 | `681283e75740700fb8ba0666dcbe0d86c96aaa8190f05ef3b960451f9089bdf5` |
| S348 | `supabase/migrations/20260822035803_804e84f8-34d1-4958-889e-ad16e0504c18.sql` | 1–202 | `2ca3e77d10f9f26fdf43b2b54b2e073a10b92a0c2388a3ae035da8291aa7137a` |
| S349 | `supabase/migrations/20260822035847_cc38245e-7640-4659-b3b8-4b6baf82fb99.sql` | 1–87 | `e31db3c2d46bfaf4cb1ca1869030ba227d8337bf8360d6c2ba348c670939f649` |
| S350 | `supabase/migrations/20260822035937_efe54278-0756-4ec4-a13a-560f22367d16.sql` | 1–83 | `4349cd56474dc4e322951d55b9a4b84347317e6ee953a3b95111d85b02ff9bad` |
| S351 | `supabase/migrations/20260825124356_f80c6ff3-4377-4271-88e9-ce4cc092fcfa.sql` | 1–11 | `46965b47c0dc14b94114771909e2860045c13f1c721929035014b558a5d88988` |
| S352 | `supabase/migrations/20260825133647_3473c587-9a42-4e00-bc62-04e305230d17.sql` | 1–309 | `cecc876039104b970c03e49a1ef3033f368b2aafbf06f8c4e6f8385164efc805` |
| S353 | `supabase/migrations/20260827154144_2270da9f-46ef-4b33-b24b-4fd9e1544739.sql` | 1–39 | `f6ff41a251fc6c788b3b4922b0633e7786ab01e46327315d36c626c267a614cc` |
| S354 | `supabase/migrations/20260827161600_0e668b8b-f54e-4b2a-90e1-baea35802662.sql` | 1–64 | `5058c2155336dfee9cf2c81c77c48882b06bbe476b0db4049423eeba67e23e4d` |
| S355 | `supabase/migrations/20260827171237_8d52091e-7fb8-4aec-8701-86803157f486.sql` | 1–12 | `4b93633718ffb60775d493fa1e327f73cbed8ef0e609e7a6f8b0f143ac7f5581` |
| S356 | `supabase/migrations/20260828153551_d75a7ab4-ed5c-4ce6-87c4-4a9b3643f1d0.sql` | 1–13 | `2990e43c39fbfbb0e0e0635891b2753b70469bf2b78b95326b8600991ef24ff8` |
| S357 | `supabase/migrations/20260828154702_74478bd7-afef-48bb-9ee2-a51128856228.sql` | 1–91 | `19cd68da9c3ecea3cf34fdd71f68e57e67aeed0b055cab74a348d74540390fbb` |
| S358 | `supabase/migrations/20260828171427_66380047-a2d5-4609-8bea-31dc4260465d.sql` | 1–233 | `ef771cd54d3b0a2eafc87513cffee87f5ca80d5448d2f2cbb9957a405991cd02` |
| S359 | `supabase/migrations/20260828172631_610bc07f-7123-48e3-80e9-1d805136e700.sql` | 1–91 | `1f3a2bd013e805bf1c02d144bf76dc72189d058468154b569b3260d54522208b` |
| S360 | `supabase/migrations/20260828175828_27346f59-3d25-42b4-b408-969cd5bbd7e8.sql` | 1–171 | `746aeaacb734a9b66736ee34357004d4cf429d12c16175306a6d107421d3d20f` |
| S361 | `supabase/migrations/20260830080652_c5da026e-41e1-48b8-a9c0-bd4033b4e947.sql` | 1–26 | `78e098ed7b79b65dae779030640f4ee218e44aad988ebfe139b7ccbdacf8e0ef` |
| S362 | `supabase/migrations/20260830210619_0db5e97a-3be1-4cb7-9e7d-87b5cf803572.sql` | 1–112 | `2b73646c98075fc723ee3e2baacbaa4ef9c1864e9e8239895d3fbef4a0b805a0` |
| S363 | `supabase/migrations/20260831142820_1d8978b6-71e0-4c07-b5a3-1d2c6ee7298f.sql` | 1–15 | `68de74bf2e39fbdc2a1d9f78acf6aac6c6efa7f4f6ebe654e868978d1d2e23b3` |
| S364 | `supabase/migrations/20260831142900_c63d7b4b-9c5a-4c4e-ad6b-9fbcabb25658.sql` | 1–49 | `10260e15a9072097a3dbdeb2e880af67edf047fc6241c18da7d2fa0de5921b4c` |
| S365 | `supabase/migrations/20260831150444_c88835a6-3dc9-480d-8781-f8adb04d46b2.sql` | 1–184 | `d158ff52eccef2c4d059056b95f27f1bf5efa045a40711894f034b3739420bd8` |
| S366 | `supabase/migrations/20260831165609_7fe4de8d-22cf-42d9-8158-69bdb980d6d8.sql` | 1–2 | `4b3e2b276e3b0942f75b5808e6bac66970df06633b871976f973e18ac5faa893` |
| S367 | `supabase/migrations/20260831175623_0376acd1-9d2d-4e46-a9d7-637eccb2ba49.sql` | 1–208 | `7d866c5bdac9096d586b60160a59be774c4e097e7d562778838495644cafae1e` |
| S368 | `supabase/migrations/20260831184212_4dcc5d22-8bc7-4bb1-8561-67c60f614e4b.sql` | 1–186 | `07f19420206e22af02b4e843f0549b451e553e943d138b1b61752d697eaa556c` |
| S369 | `supabase/migrations/20260831184500_renegotiate_block_split_parent.sql` | 1–188 | `a8b33daa2cda4f193d332fc3245eecdb5e0c430ee97579007b23733e47519e9b` |
| S370 | `supabase/migrations/20260902225144_1a949807-d4aa-4488-8bc7-ca0ca4f8e6ec.sql` | 1–33 | `62afd3bb18aefc15859fa1e12e776793e20fe5e7fc3a5786ae8df70c48ac95f8` |
| S371 | `supabase/migrations/20260902230514_16de0ce0-dde2-46d5-9d55-8a01aea836e1.sql` | 1–504 | `bad0974b9b3483d99545353590da6dfd0e6a3b68c16639261dc5087dfe34d551` |
| S372 | `supabase/migrations/20260902231429_5aa81920-cf05-4440-92fb-c6f7f44e98ac.sql` | 1–40 | `3e488b1306ffb1e36ddd7a7f825e39e358833e417b3d6e40e0dec986b84dcbc2` |
| S373 | `supabase/migrations/20260902232057_85cccfdf-5cfb-4fac-bd61-81ab5f41d3a2.sql` | 1–41 | `cf8887c09d8f75e05786f8f337260b0b65beaf381af70681a7b1eecf5c6a6cbb` |
| S374 | `supabase/migrations/20260903002716_aa89e64a-b45b-463f-9b99-eb3652198733.sql` | 1–47 | `6bc5c74f9cb796f7244a6250f008761b71753456de87976084bf5a33d65867bc` |
| S375 | `supabase/migrations/20260903013456_f5bbee88-8fa9-4d60-9677-09ba9932224f.sql` | 1–68 | `5e099f5266b1f9dce68edb14d940ac39fe3d7de50c18f1efdecea5e3a4020569` |
| S376 | `supabase/migrations/20260903113124_6e2fd13b-fa37-4150-8797-ea1c981861ba.sql` | 1–121 | `32926795888d3cd9e177931b96632316607899a33721091256eb1bea6cdad244` |
| S377 | `supabase/migrations/20260906235107_7c5a6df6-4d1a-4003-b211-2dd8ccbbe42f.sql` | 1–16 | `3ccd7d52d39efd7561564db7c8a908a2d3219071cda1973a58a53588b12b5748` |
| S378 | `supabase/migrations/20260908180025_799cd699-529f-4189-8e19-77009685142f.sql` | 1–397 | `16458ea447c5b67b97ac80eb17c012b3fb9a1b4599209b98fbc5b2454ee3096b` |
| S379 | `supabase/migrations/20260908180233_d4d39653-2df0-4ff4-8bd2-61f2e27b0bbb.sql` | 1–496 | `88d3b80a5e3ec27c4e8d0a1c0a1f77d5cb78fa40dc8b4fd7f9c0dd88ac87063f` |
| S380 | `supabase/migrations/20260909123359_a25e7159-fd3a-49b1-8074-80b706ec8f1e.sql` | 1–81 | `82ab2894bf3ee9d255bfebbca6e45468b46ffcea2bb5d102c3feb11b85a35005` |
| S381 | `supabase/migrations/20260909195352_eb89ddd4-b732-41fa-8162-3fd51a6b9871.sql` | 1–98 | `0385885e40ff4d85ec71fa9905d326e06d3f4e38aea1ffe62404d651c9d6768b` |
| S382 | `supabase/migrations/20260909203309_b453670a-bc9a-4a4d-a0c3-a74f8fd05d9f.sql` | 1–61 | `a831073ec7f44f1606368af1bd27396e74581a776e48e0fda7f862bbafb9af1a` |
| S383 | `supabase/migrations/20260909213213_c596a50f-84da-4257-a6d3-f2c1f9d3bce3.sql` | 1–101 | `c4f5902f261e06a9fa03d32592c58ef0d8359081d48ce6bc4388c97121f71f78` |
| S384 | `supabase/migrations/20260911000848_829d57de-eff8-4584-96e2-db36cc0888fa.sql` | 1–59 | `dac836568b66283223e952a6621419852c7e2a2f0d573a37c66f6c57b140ad18` |
| S385 | `supabase/migrations/20260911003710_edab7dab-4fbc-4acb-b76c-02dabb5a309d.sql` | 1–120 | `19c4b648dd91595a021ab4018431965a624214e0207269bf22544f11c0086b8e` |
| S386 | `supabase/migrations/20260911014016_56d3910c-3a79-407c-885c-2b5a7e403cab.sql` | 1–24 | `d83d53ccc97ce442dfec19757c0ce146c9631fed9dc69b2c92dc48922b168628` |
| S387 | `supabase/migrations/20260911143727_5167c2fe-81f6-49cd-ba7f-214f917141db.sql` | 1–63 | `8467ca84ccc6c34e1964713ec0d7b2f25150e63036a4d18fa2f873992d67709c` |
| S388 | `supabase/migrations/20260911151528_258da097-d130-4ad8-969b-548b0fb4f3ed.sql` | 1–292 | `e8077451448157f89d11def5ef0a3b7c20f75291c40917849c70d10fb448698b` |
| S389 | `supabase/migrations/20260911161621_4a3f0e28-3ecb-4d2b-8760-6ca6e4d9c6c9.sql` | 1–81 | `43d00617bb0de8d8f5b74732af26f80344d4ada5cf67f5fb5ea4397290c40d71` |
| S390 | `supabase/migrations/20260912142408_a8e6186b-676f-4502-a412-f4895769c1ad.sql` | 1–66 | `5b908cd7e73341075ece65f61745f3478f2e4afee63fffb04d6e9253e086a1a1` |
| S391 | `supabase/migrations/20260912154632_780b7414-023f-4eb0-81ef-5ddf876810e4.sql` | 1–17 | `30793c03d0af71de5fec12b46dc0b1ec96f3ee26940ab29255ded6aee6b5965e` |
| S392 | `supabase/migrations/20260912170721_36e45dcc-598f-44f5-9f50-fa17f040d3c1.sql` | 1–7 | `a91b38d20e751873ea68d551144238a462261044006f3caece90844d2c79604c` |
| S393 | `supabase/migrations/20260912172845_c393cae2-126b-4fe8-98d0-713021c01f86.sql` | 1–9 | `8407cb359aeb3ce76a54b5a08f39098d88512a58456fc6704207bea2616c0be7` |
| S394 | `supabase/migrations/20260912173212_851813b9-a9d0-481a-935e-be25b3f8b9ec.sql` | 1–188 | `4f6fb777161277fecd59f23157ba8d1b7822ecf8531efe38f8d777957eca89c9` |
| S395 | `supabase/migrations/20260912175123_b7b63183-77e6-4b73-90ac-511493b90018.sql` | 1–6 | `46f11885304c82b1df9634f7e2b4322074625f69f916a758c160126b81626035` |
| S396 | `supabase/migrations/20260912181654_a6b71810-588b-47f5-a836-5cc09c825250.sql` | 1–130 | `8271174061baf184691a7190d5f83d25276a606f54c679dbf2c92e8329252daf` |
| S397 | `supabase/migrations/20260912184107_ee7d05ec-2730-4d03-a797-bb828d450680.sql` | 1–86 | `c35cae30a9aa31ff313ccacc14c78dd892a120353c7b492dea0174a4ff9c53f8` |
| S398 | `supabase/migrations/20260912185027_f1400cd0-c8dd-4ea1-b616-43765886403a.sql` | 1–45 | `d00f80d8de430b5cbd64e55cda65fd3ece275de279099e01f41d26d90d3d0871` |
| S399 | `supabase/migrations/20260912193941_e33bfb5f-eba7-440a-a815-f8e6b4f43651.sql` | 1–110 | `55cee37f75c3bf52ae5c91a0193dfdae2375c03d138f7e69656e1a79f4bf3209` |
| S400 | `supabase/migrations/20260912231054_c7bbf9bc-6d83-40ed-bd97-db5778b7b44d.sql` | 1–66 | `c330cf563b0828965b9cccbaacfd3ad34c0e3f39ab62e913a35d1c434f6b90cf` |
| S401 | `supabase/migrations/20260913003309_49cbaa48-3609-4c5b-8f8e-b8717c491317.sql` | 1–278 | `a2b56c22e5b1cb38f8fbc461dcdde58625148475f35a1d6175f3e5e0244e0bcf` |
| S402 | `supabase/migrations/20260913021127_911735a4-a1a6-4245-9080-9abed744c4ad.sql` | 1–336 | `4691fb5996782cf672ff7ce515a3087c6bb2ea2446ee204b54c49a4dbd54f297` |
| S403 | `supabase/migrations/20260913021445_f4057ed5-6118-40b2-a57e-1a74faf879a5.sql` | 1–100 | `0584cfddf84fdafb9db17df68d6c866855235d349048efe7ec836d3061bdea45` |
| S404 | `supabase/migrations/20260913035919_bbf8a296-cf3d-4efe-a28b-a66fa432c673.sql` | 1–77 | `1954649ce5917537b134c1a80ff2d51584822a249352a7297f60ea72317978e9` |
| S405 | `supabase/migrations/20260913051421_e2f5e1a7-cdb9-4372-a885-9916f9f8edd7.sql` | 1–128 | `6be50329dc65b10739c4827d87514f3760e641e963389a84128681eb1003c37a` |
| S406 | `supabase/migrations/20260913060148_7c92312e-0147-4a46-8f8e-fa425229c3fb.sql` | 1–169 | `9407548cef9c91719d381149c897588fe2c608eff6a72a4e8a105d50c1c46562` |
| S407 | `supabase/migrations/20260913132000_352c26e5-1056-451a-8b15-077b8a2a7d89.sql` | 1–131 | `accc3be12f976143572fbf1be97225606ad2371d493ddff01f5be9cef5a748db` |
| S408 | `supabase/migrations/20260913134707_c390d480-344f-4c09-a8fc-7a5eb5311ef0.sql` | 1–462 | `da75c2bab0253e9a63547f8e1f31f1de2e0858875e9f7e8def5714dafe6c46b6` |
| S409 | `supabase/migrations/20260914135432_9a60522d-4434-4c6b-aaf2-1c6402e98f1a.sql` | 1–288 | `83371fe895f40014b2bb8244ee442073300379925fe1a321c45c2c95370ef1d8` |
| S410 | `supabase/migrations/20260914143056_bc8dd9a9-a96d-43df-a66f-6014df3aca1a.sql` | 1–387 | `d2547cc04a375e73c47f3f69c58e007af7fd7d32f18d06a44087a94dc3e08130` |
| S411 | `supabase/migrations/20260914183227_3362026a-cc79-45e2-9221-918b632fb1f2.sql` | 1–263 | `c8831fc1799897c23abe7e63809dc4b5aebc4bf8b98787460b049b37eb2b767c` |
| S412 | `supabase/migrations/20260916024749_0bc034ea-f069-45c8-ad0a-12c4427a7ab1.sql` | 1–213 | `3942f910d4a051e1c834df6fa525b687d92b49391482c0961711793e0b038aa1` |
| S413 | `supabase/migrations/20260916032701_6925fcc4-817e-4a02-b1b6-66c240d91a2a.sql` | 1–124 | `1f362495d5ac2dd063588ae6d663a2446d498d26025b4aff365c1f63c48eae82` |
| S414 | `supabase/migrations/20260916033508_adffc858-2118-4a9c-9d6e-6ac24b8fa832.sql` | 1–129 | `677bb91976ec99703ed550eb9acec93ad316c2c59f14e90f45cb6fd3fadb8909` |
| S415 | `supabase/migrations/20260916034536_0bf70b79-daa8-4dcc-a24e-d81ff04b78ba.sql` | 1–270 | `f5d2d368fae41313b52cc7797e29cc0996cb8c8b9d752eff9847048038751792` |
| S416 | `supabase/migrations/20260916114057_e57ab379-bec5-40e7-835a-65cfe75b75e2.sql` | 1–93 | `6265f6077a49efcd89ad02a1b43ae4102d61f6ae7919b501a0b0fcd09d7a275f` |
| S417 | `supabase/migrations/20260917114852_194b05d8-4437-4dda-8ac0-f09e5c71f2b7.sql` | 1–120 | `3cfacd09ca3976ecd9a9c0ebba27366e171ba176cd8852fb19713641780699df` |
| S418 | `supabase/migrations/20260917115514_28240247-ae1d-4402-b396-032d823b26a0.sql` | 1–42 | `bdbc0b4b817ce35962465ae86accd7235fa5ef3c1e8cd672f5613e178ca345bf` |
| S419 | `supabase/migrations/20260917115647_44b84355-35d1-4103-8e23-503a0dd13c62.sql` | 1–267 | `1c36b7afa33e61a632767f8b6dca16ea476fabfb95e7b846657c1bdb2b794519` |
| S420 | `supabase/migrations/20260917220647_dea5692d-4154-4f45-a23b-56e727385ee3.sql` | 1–371 | `f0fd25ac205461bc4818de93b0d1fc9a8c05aaa2e0ba7447683e846e6902bfed` |
| S421 | `supabase/migrations/20260917222206_cc918411-1854-44d9-bca2-265a9418485a.sql` | 1–214 | `dfaccb5860bdb40536330d66a3983c1d941e77f1607203e8fc2cb3a33bc236cb` |
| S422 | `supabase/migrations/20260918001849_e3eb12d6-6cf3-4fba-aaed-42c6fc08255d.sql` | 1–93 | `091c7d78c1ed555dd47791e3054a590c775038d20995737c81382c158926ac69` |
| S423 | `supabase/migrations/20260918114652_85e14284-385e-46e4-a34b-5f97d2b452f5.sql` | 1–74 | `eea2cb92b691989649f6f8f9bb53304cc0aaabb7b32ef319871f05ecd3fef335` |
| S424 | `supabase/migrations/20260918163626_328d9fc7-2581-42ff-b9a5-16d9851ae9bc.sql` | 1–492 | `e00977b7ad8b9f15ec299a055a5b69a6b85b13a9cde85cc36781f41d02a876d4` |
| S425 | `supabase/migrations/20260918164711_6b91dad2-0ce7-47a5-b183-4e6f55d3f9fc.sql` | 1–145 | `c52a68292ed6d7ad3f0b9dd01b4e2bc92ea923a1b5bde4bf1ae697e9d7ccf294` |
| S426 | `supabase/migrations/20260918165632_19308e54-fb06-4932-bdbb-25550e463e83.sql` | 1–145 | `e4498ac2c7338e04e8755aac2ef30d63b73a4e68b1fba5fbc04d44cdb0855aa9` |
| S427 | `supabase/migrations/20260918173137_34502f74-ceb0-4550-82cf-23e0c7afff5e.sql` | 1–152 | `11a1821c4f6378993e57c1cfdd34a9b4e228501c769956eac228d756c926805e` |
| S428 | `supabase/migrations/20260918182529_80628a10-816f-4405-86db-93b8b47080b8.sql` | 1–284 | `fb2e63f00ca9f340a9c652522838e8156750253d3caea9d3bc68f2b76bb87cec` |
| S429 | `supabase/migrations/20260918194802_c421e213-aa0c-45ac-995e-9724f9087ef2.sql` | 1–307 | `831db3fd7ce5a05cf8505c20d57b9a6afdac70bae1c50d33faadebe225171509` |
| S430 | `supabase/migrations/20260918200744_c300c854-2dd9-4cf8-93ac-2b4f6de99fdf.sql` | 1–204 | `d705f0510c028adf51a2e7e2d9ec6421c03677d29bc214620d5b5d226666e36d` |
| S431 | `supabase/migrations/20260918202957_24ccf1dd-1553-4a66-b6d9-915f0b6c70cc.sql` | 1–248 | `4fc7671f88324f9c701b5c062b2e8eb477d76dfbc26a50b7ff02712cefdd4891` |
| S432 | `supabase/migrations/20260918213306_87fcde19-3e93-4a56-871c-85f8bb73d9ed.sql` | 1–49 | `882a1594f91fe50a411d9df4159008ec8570e4bcc9f6849b24212fb7b07bb6c1` |
| S433 | `supabase/migrations/20260918223345_9131cb6f-1c88-4208-8a50-cecb6faf2fb9.sql` | 1–98 | `cfab57e9ec9aed89476746bba5e5b9cd56b1ac17330454a9ab1f3b1f275eac13` |
| S434 | `supabase/migrations/20260919143900_6749e1e6-f1e0-4199-8f72-d67a74573671.sql` | 1–62 | `0b2f4c07a98daf64649ad0d7ce23346d73ea8ae2b4fce2391e1658728d6d7538` |
| S435 | `supabase/migrations/20260919150613_6bbb6c1b-c4af-4908-bcf6-49b287fb831f.sql` | 1–86 | `d88870b81025ee221450640a44930878134ffb5f98ba4ff56a433605cb6fd3ba` |
| S436 | `supabase/migrations/20260919150738_8536df64-45d3-46ed-9275-2b8963611349.sql` | 1–56 | `777c24152f0cf77587ba44749e760d04b501f707b6785276251928f94a23aeb8` |
| S437 | `supabase/migrations/20260920185807_75975a05-3e5c-4694-a35f-f4d1c4162c35.sql` | 1–85 | `0160347df504230426941aca1b61c9e9675410a60fff2b52912044273d26bfb5` |
| S438 | `supabase/migrations/20260920202855_62cedbbe-e0ab-46e1-b652-261a8cf30d9c.sql` | 1–226 | `89b1da1275a5412c237f3fc98bb3bf18d628d87f2983349f7155d1a57420e031` |
| S439 | `supabase/migrations/20260920204047_24602c4f-3c48-471f-9953-48bb42c523a6.sql` | 1–98 | `b653ed8bb4ca35b2e33659082008c48c592176e8148b188215ba08c45e756668` |
| S440 | `supabase/migrations/20260922051848_d0be97bd-6c75-4d52-8b84-92c8d074c59f.sql` | 1–44 | `d03225c7dd92ad6df4a40ff8e5104434138e948cb32ea7f4b549f3400f7c5d39` |
| S441 | `supabase/migrations/20260922175952_c2dfd13e-4f5b-4f61-9da7-45a29d86460c.sql` | 1–153 | `bbb5db884bf11f1456dbd57dbba6d5569bc431baf0b11d9aba0a3c0d6c6c37ae` |
| S442 | `supabase/migrations/20260923143931_f16b86e3-630d-4625-805d-0696c6e202e5.sql` | 1–305 | `9a50c43f355c1a1b692771d546f27850c528d34db6208401a17b424ae7d9d009` |
| S443 | `supabase/migrations/20260923165107_2cf8dcd7-7fbd-4e97-ae49-f2785c03fb07.sql` | 1–387 | `6e0a73102d51755b4a0498d50ed6f86826b4b1030749fb6e1b0c8dcd0f0c8253` |
| S444 | `supabase/migrations/20260924211456_48f0d3a1-6824-4866-8c88-ef8c9b382ef6.sql` | 1–80 | `bd2af5544bd61f0e3bd5bf2ec23a29e1e36a886f2bbf19f29c733f20f920accd` |
| S445 | `supabase/migrations/20260928221118_bea24c4b-e61c-4fd0-b901-59eba78bfbe1.sql` | 1–608 | `e60cacc7345c1d41d740e98a3cbdebdb1775fef425c3cbb786261226ccb7e5d9` |
| S446 | `supabase/migrations/20260930101458_5bdbefad-7062-4d28-a0be-c956b86d8447.sql` | 1–366 | `42eba6288681cb238cec9ee473e39fb6816314efb2e2a9747a0722c3545574da` |
| S447 | `supabase/migrations/20260930173444_430707bf-29ee-45ff-a797-57194faca209.sql` | 1–74 | `270f81163dae37129591b1be388bf90e2a8184ce1b18cc582c8c18f8dc24df8b` |
| S448 | `supabase/migrations/20260930190108_5b0ea3f9-dd18-429a-a9ac-b486725c7ad1.sql` | 1–58 | `a5c95cc023ee52a857f191f6418eebb8ab2a1bda11ad43cc3fe95760bdf400dd` |
| S449 | `supabase/migrations/20261002103000_camarim_invariant_saldo_sessao.sql` | 1–263 | `4d212ad61a4829bfe23b083e4cafdadec23d12799a47f39f29cba9fe9476243e` |
| S450 | `supabase/migrations/20261002120740_6be30c36-594d-4678-9477-1a3b995136ac.sql` | 1–316 | `f4f8e02bbd8ba77759ff36bda926b99b28783041193948b9384e99ccd7d47783` |
| S451 | `supabase/migrations/20261010184500_derp238_invariant_cash_negativo.sql` | 1–64 | `afb911772bc996dc720c1702692ea63a47bc2793bf0e6aa2fe25753688ab5e93` |
| S452 | `supabase/migrations/20261010213100_0091_derp_296_save_ticket_office_settlement.sql` | 1–268 | `c4b7a01cc250a82ef70d39bfef9fc07e09cd3a4620efab451cccfed0cc6ce2ba` |
| S453 | `supabase/migrations/20261010213300_0093_derp_296_link_only_non_eligible.sql` | 1–14 | `3d402fb4f190ca57d8e3cf0d07fd615e6df86b65c910c15690ffd55d0fc2569b` |
| S454 | `supabase/migrations/20261010213400_0094_derp_296_triggers_own_invoice_paid.sql` | 1–201 | `8fe9230e2c11144a0c7e27c92db4227a984de30d705710a7c8acd41fc0c1972e` |
| S455 | `supabase/migrations/20261026213000_iva_repasse_mp_transfers.sql` | 1–125 | `f5732a9c4ab9280aaf001ad04daa688d5a2b4be422e509aad8b7993696818512` |
| S456 | `supabase/migrations/20261026220500_0270_p1_freeze_guard.sql` | 1–73 | `cd23de49e7b068327d8e41b3464026c2ff0a61b074223f34d819a1ba84b28ff7` |

## Anexo B — alterações estruturais e referências estáticas

Inventário textual de CREATE/ALTER TABLE de transactions e tabelas dependentes diretas, incluindo REFERENCES transactions noutras tabelas. Cada entrada aponta ao início da instrução; o ficheiro completo e hash estão em A. A captura não executa a instrução. Inclui versões substituídas: não somar constraints removidas como se estivessem simultaneamente ativas. Campos introduzidos por SQL dinâmico são registrados separadamente em D.

| Fonte:linha | Operação / declaração (normalizada) |
|---|---|
| S200:56 | `CREATE TABLE public.transactions ( id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL, type TEXT NOT NULL CHECK (type IN ('income', 'expense')), category_id UUID REFERENCES public.account_categories(id), description TEXT NOT NULL, amount NUMERIC NOT NULL, iva_rate INTEGER NOT NULL DEFAULT 23 CHECK (iva_rate IN (23, 13, 6, 0)), date DATE NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('paid', 'pending', 'overdue')), supplier_id UUID, created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now() );` |
| S200:71 | `ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;` |
| S200:105 | `ALTER TABLE public.transactions ADD CONSTRAINT transactions_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);` |
| S202:1 | `ALTER TABLE public.transactions ADD COLUMN paid_amount numeric NOT NULL DEFAULT 0;` |
| S203:3 | `CREATE TABLE public.transaction_audit_log ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE, changed_by text NOT NULL DEFAULT 'system', changed_at timestamptz NOT NULL DEFAULT now(), field_name text NOT NULL, old_value text, new_value text );` |
| S203:13 | `ALTER TABLE public.transaction_audit_log ENABLE ROW LEVEL SECURITY;` |
| S205:2 | `CREATE TABLE public.transaction_documents ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE, name text NOT NULL, file_url text NOT NULL, doc_type text NOT NULL DEFAULT 'comprovativo', uploaded_by text NOT NULL DEFAULT 'system', uploaded_at timestamptz NOT NULL DEFAULT now() );` |
| S205:12 | `ALTER TABLE public.transaction_documents ENABLE ROW LEVEL SECURITY;` |
| S206:1 | `ALTER TABLE public.transactions ADD COLUMN due_date date DEFAULT NULL;` |
| S207:1 | `ALTER TABLE public.transactions DROP CONSTRAINT transactions_status_check;` |
| S207:2 | `ALTER TABLE public.transactions ADD CONSTRAINT transactions_status_check CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'paid'::text, 'overdue'::text]));` |
| S208:17 | `CREATE TABLE public.payment_list_items ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_list_id uuid NOT NULL REFERENCES public.payment_lists(id) ON DELETE CASCADE, transaction_id uuid NOT NULL REFERENCES public.transactions(id), created_at timestamp with time zone NOT NULL DEFAULT now() );` |
| S209:2 | `ALTER TABLE public.event_forecasts ADD COLUMN status TEXT NOT NULL DEFAULT 'draft', ADD COLUMN approved_at TIMESTAMP WITH TIME ZONE, ADD COLUMN approved_by TEXT, ADD COLUMN transaction_id UUID REFERENCES public.transactions(id);` |
| S210:1 | `ALTER TABLE public.transactions ADD COLUMN specification text DEFAULT null;` |
| S211:28 | `ALTER TABLE public.transactions ADD COLUMN account_id UUID REFERENCES public.financial_accounts(id);` |
| S212:1 | `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS payment_date date NULL;` |
| S212:2 | `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS invoice_ref text NULL;` |
| S219:1 | `ALTER TABLE public.transactions ADD COLUMN pl_override_note text DEFAULT NULL;` |
| S222:1 | `ALTER TABLE public.transaction_documents ADD COLUMN is_accounting boolean NOT NULL DEFAULT false;` |
| S223:2 | `ALTER TABLE public.transactions ADD COLUMN parent_transaction_id uuid REFERENCES public.transactions(id) ON DELETE CASCADE DEFAULT NULL;` |
| S223:6 | `ALTER TABLE public.transactions ADD COLUMN split_percentage numeric DEFAULT NULL;` |
| S224:3 | `ALTER TABLE public.transactions ADD COLUMN is_reimbursement boolean NOT NULL DEFAULT false, ADD COLUMN reimbursement_to text;` |
| S224:11 | `CREATE TABLE public.reimbursement_notes ( id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, code text NOT NULL UNIQUE, employee_name text NOT NULL, status text NOT NULL DEFAULT 'draft', total_amount numeric NOT NULL DEFAULT 0, payment_transaction_id uuid REFERENCES public.transactions(id), approved_by text, approved_at timestamp with time zone, paid_at timestamp with time zone, notes text, created_by text NOT NULL DEFAULT 'system', created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now() );` |
| S224:28 | `CREATE TABLE public.reimbursement_note_items ( id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, reimbursement_note_id uuid NOT NULL REFERENCES public.reimbursement_notes(id) ON DELETE CASCADE, transaction_id uuid NOT NULL REFERENCES public.transactions(id), created_at timestamp with time zone NOT NULL DEFAULT now(), UNIQUE(transaction_id) );` |
| S225:3 | `CREATE TABLE public.partner_paid_expenses ( id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE, partner_id UUID NOT NULL REFERENCES public.event_partners(id) ON DELETE CASCADE, transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE, notes TEXT, created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), UNIQUE(transaction_id) );` |
| S225:13 | `ALTER TABLE public.partner_paid_expenses ENABLE ROW LEVEL SECURITY;` |
| S228:42 | `CREATE TABLE public.supplier_credit_usages ( id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, credit_id UUID NOT NULL REFERENCES public.supplier_credits(id) ON DELETE CASCADE, transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE, amount NUMERIC NOT NULL DEFAULT 0, used_by TEXT NOT NULL DEFAULT 'system', notes TEXT, created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now() );` |
| S230:2 | `ALTER TABLE public.transactions ADD COLUMN is_hidden boolean NOT NULL DEFAULT false;` |
| S231:2 | `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS is_transitory boolean NOT NULL DEFAULT false;` |
| S232:2 | `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS exclude_from_result boolean NOT NULL DEFAULT false;` |
| S233:8 | `CREATE TABLE public.event_cache_payments ( id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, cache_config_id uuid NOT NULL REFERENCES public.event_cache_configs(id) ON DELETE CASCADE, event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE, supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL, category_id uuid REFERENCES public.account_categories(id) ON DELETE SET NULL, amount numeric NOT NULL DEFAULT 0, description text NOT NULL DEFAULT '', notes text, transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL, withholding_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL, sort_order integer NOT NULL DEFAULT 0, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now() );` |
| S235:1 | `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'transfer', ADD COLUMN IF NOT EXISTS payment_entity text, ADD COLUMN IF NOT EXISTS payment_reference text;` |
| S236:2 | `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS split_mode text DEFAULT 'percentage', ADD COLUMN IF NOT EXISTS split_amount numeric;` |
| S237:3 | `CREATE TABLE public.transaction_payments ( id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE, amount NUMERIC NOT NULL, payment_date DATE NOT NULL, account_id UUID REFERENCES public.financial_accounts(id), payment_method TEXT NOT NULL DEFAULT 'transfer', payment_entity TEXT, payment_reference TEXT, invoice_ref TEXT, withholding_amount NUMERIC NOT NULL DEFAULT 0, credit_amount NUMERIC NOT NULL DEFAULT 0, notes TEXT, created_by TEXT NOT NULL DEFAULT 'sistema', created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now() );` |
| S237:22 | `ALTER TABLE public.transaction_payments ENABLE ROW LEVEL SECURITY;` |
| S238:3 | `CREATE TABLE public.ticket_office_settlements ( id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, financial_account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT, event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT, gross_revenue NUMERIC NOT NULL DEFAULT 0, total_deductions NUMERIC NOT NULL DEFAULT 0, net_calculated NUMERIC NOT NULL DEFAULT 0, net_adjusted NUMERIC, adjustment_notes TEXT, net_transferred NUMERIC NOT NULL DEFAULT 0, transfer_account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL, transfer_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL, status TEXT NOT NULL DEFAULT 'draft', document_url TEXT, document_name TEXT, notes TEXT, closed_at TIMESTAMPTZ, closed_by UUID, reversed_at TIMESTAMPTZ, reversed_by UUID, reversal_reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by UUID NOT NULL DEFAULT auth.uid(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CONSTRAINT settlements_status_check CHECK (status IN ('draft', 'confirmed', 'reversed')) );` |
| S238:36 | `ALTER TABLE public.transactions ADD COLUMN settlement_id UUID REFERENCES public.ticket_office_settlements(id) ON DELETE SET NULL;` |
| S239:8 | `ALTER TABLE public.transactions ADD COLUMN currency text NOT NULL DEFAULT 'EUR', ADD COLUMN original_amount numeric, ADD COLUMN fx_rate numeric, ADD COLUMN fx_rate_source text;` |
| S239:19 | `ALTER TABLE public.transactions ADD CONSTRAINT transactions_currency_check CHECK (currency IN ('EUR', 'BRL', 'USD'));` |
| S241:2 | `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS invoice_group_id uuid;` |
| S242:1 | `ALTER TABLE public.partner_paid_expenses ADD COLUMN IF NOT EXISTS paid_date date;` |
| S243:1 | `CREATE TABLE public.partner_advance_expenses ( id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, transaction_id UUID NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE CASCADE, partner_id UUID NOT NULL REFERENCES public.event_partners(id) ON DELETE RESTRICT, event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE, notes TEXT, created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now() );` |
| S243:14 | `ALTER TABLE public.partner_advance_expenses ENABLE ROW LEVEL SECURITY;` |
| S245:1 | `ALTER TABLE public.ticket_office_settlements ADD COLUMN IF NOT EXISTS venue_retained_amount NUMERIC NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS venue_retained_invoice_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS venue_retained_payment_id UUID REFERENCES public.transaction_payments(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS venue_retained_notes TEXT;` |
| S248:48 | `CREATE TABLE public.camarim_items ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), session_id UUID NOT NULL REFERENCES public.camarim_sessions(id) ON DELETE CASCADE, event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT, supplier_id UUID NULL REFERENCES public.suppliers(id) ON DELETE SET NULL, supplier_name_raw TEXT NULL, document_type TEXT NOT NULL DEFAULT 'invoice', document_number TEXT NULL, document_date DATE NULL, service_description TEXT NULL, category_id UUID NULL REFERENCES public.account_categories(id) ON DELETE SET NULL, type TEXT NOT NULL DEFAULT 'expense', base_amount NUMERIC NOT NULL DEFAULT 0, iva_amount NUMERIC NOT NULL DEFAULT 0, total_amount NUMERIC NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'EUR', payment_origin TEXT NOT NULL, buyer_profile_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL, ocr_confidence TEXT NULL, ocr_raw_payload JSONB NULL, status TEXT NOT NULL DEFAULT 'new', has_document BOOLEAN NOT NULL DEFAULT true, document_issue_reason TEXT NULL, needs_accounting_review BOOLEAN NOT NULL DEFAULT false, bp_scope TEXT NOT NULL DEFAULT 'local_city', bp_forecast_id UUID NULL REFERENCES public.event_forecasts(id) ON DELETE SET NULL, integration_mode TEXT NOT NULL DEFAULT 'none', transaction_id UUID NULL REFERENCES public.transactions(id) ON DELETE SET NULL, notes TEXT NULL, created_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CONSTRAINT camarim_items_document_type_check CHECK (document_type IN ('invoice', 'receipt', 'ticket', 'other')), CONSTRAINT camarim_items_type_check CHECK (type = 'expense'), CONSTRAINT camarim_items_currency_check CHECK (char_length(currency) = 3), CONSTRAINT camarim_items_payment_origin_check CHECK (payment_origin IN ('advance', 'company_card', 'out_of_pocket')), CONSTRAINT camarim_items_ocr_confidence_check CHECK (ocr_confidence IS NULL OR ocr_confidence IN ('high', 'medium', 'low')), CONSTRAINT camarim_items_status_check CHECK (status IN ('new', 'ocr_read', 'pending_review', 'validated', 'issue', 'closed', 'integrated')), CONSTRAINT camarim_items_bp_scope_check CHECK (bp_scope IN ('master_common', 'local_city')), CONSTRAINT camarim_items_integration_mode_check CHECK (integration_mode IN ('none', 'draft_transaction', 'accounting_only')) );` |
| S271:4 | `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS declared_withholding_rate numeric NULL, ADD COLUMN IF NOT EXISTS declared_withholding_amount numeric NULL;` |
| S271:18 | `ALTER TABLE public.transactions ADD CONSTRAINT transactions_declared_withholding_nonneg CHECK ( (declared_withholding_rate IS NULL OR declared_withholding_rate >= 0) AND (declared_withholding_amount IS NULL OR declared_withholding_amount >= 0) );` |
| S275:4 | `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);` |
| S275:5 | `ALTER TABLE public.transaction_documents ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);` |
| S275:6 | `ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);` |
| S275:7 | `ALTER TABLE public.transaction_audit_log ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);` |
| S275:11 | `ALTER TABLE public.partner_advance_expenses ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);` |
| S276:12 | `ALTER TABLE public.partner_paid_expenses ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);` |
| S292:20 | `CREATE TABLE IF NOT EXISTS public.sponsorship_pipeline ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE, supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL, supplier_name text NOT NULL, contact_name text, contact_email text, contact_phone text, stage public.sponsorship_stage NOT NULL DEFAULT 'lead', doc_status public.sponsorship_doc_status, proposed_amount numeric(14,2) DEFAULT 0, confirmed_amount numeric(14,2) DEFAULT 0, currency text NOT NULL DEFAULT 'EUR', iva_rate numeric(5,2) DEFAULT 23, is_barter boolean NOT NULL DEFAULT false, barter_description text, priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')), owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, next_followup_date date, notes text, lost_reason text, closed_at timestamptz, auto_sync_bp boolean NOT NULL DEFAULT true, linked_forecast_id uuid REFERENCES public.event_forecasts(id) ON DELETE SET NULL, linked_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL, sort_order int NOT NULL DEFAULT 0, created_by uuid REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now() );` |
| S299:2 | `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS iban_override TEXT;` |
| S303:7 | `CREATE TABLE IF NOT EXISTS public.coala_sync_deletes ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), config_id UUID NOT NULL REFERENCES public.coala_sync_config(id) ON DELETE CASCADE, run_id UUID REFERENCES public.coala_sync_runs(id) ON DELETE SET NULL, target_table TEXT NOT NULL CHECK (target_table IN ('event_forecasts','transactions')), target_id UUID NOT NULL, snapshot JSONB NOT NULL, reason TEXT, deleted_at TIMESTAMPTZ NOT NULL DEFAULT now() );` |
| S307:79 | `CREATE TABLE IF NOT EXISTS public.bp_tx_reconciliation_ignored ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE, transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE, ignored_by uuid REFERENCES auth.users(id) ON DELETE SET NULL, ignored_at timestamptz NOT NULL DEFAULT now(), reason text, UNIQUE (transaction_id) );` |
| S308:3 | `CREATE TABLE IF NOT EXISTS public.coala_ai_classification_suggestions ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE, company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE, requested_at timestamptz NOT NULL DEFAULT now(), requested_by uuid REFERENCES auth.users(id), ai_response_raw jsonb NOT NULL, top_candidate_code text, top_candidate_id uuid REFERENCES public.account_categories(id), top_confidence numeric, bp_l2_filter_applied boolean DEFAULT false, applied_auto boolean NOT NULL DEFAULT false, applied_at timestamptz, applied_by uuid REFERENCES auth.users(id), revoked_at timestamptz, revoked_by uuid REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now() );` |
| S309:7 | `ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS scheduled_date date, ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'paid';` |
| S309:18 | `ALTER TABLE public.transaction_payments ADD CONSTRAINT transaction_payments_status_check CHECK (status IN ('planned','paid','cancelled'));` |
| S310:2 | `ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_status_check;` |
| S310:3 | `ALTER TABLE public.transactions ADD CONSTRAINT transactions_status_check CHECK (status IN ('pending','approved','paid','overdue','partially_paid'));` |
| S321:2 | `ALTER TABLE public.partner_event_access ADD COLUMN IF NOT EXISTS default_tab text NOT NULL DEFAULT 'bp' CHECK (default_tab IN ('bp','tickets','transactions'));` |
| S325:37 | `CREATE TABLE public.card_session_loads ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id), session_id UUID NOT NULL REFERENCES public.card_sessions(id) ON DELETE CASCADE, amount NUMERIC NOT NULL CHECK (amount > 0), load_date DATE NOT NULL DEFAULT CURRENT_DATE, source_account_id UUID NULL REFERENCES public.financial_accounts(id) ON DELETE SET NULL, out_transaction_id UUID NULL REFERENCES public.transactions(id) ON DELETE SET NULL, in_transaction_id UUID NULL REFERENCES public.transactions(id) ON DELETE SET NULL, notes TEXT NULL, created_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now() );` |
| S325:54 | `CREATE TABLE public.card_session_items ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id), session_id UUID NOT NULL REFERENCES public.card_sessions(id) ON DELETE CASCADE, submitted_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL, item_date DATE NOT NULL DEFAULT CURRENT_DATE, supplier_name TEXT NULL, description TEXT NULL, amount NUMERIC NOT NULL CHECK (amount > 0), iva_rate NUMERIC NOT NULL DEFAULT 0, event_id UUID NULL REFERENCES public.events(id) ON DELETE SET NULL, category_id UUID NULL REFERENCES public.account_categories(id) ON DELETE SET NULL, document_path TEXT NULL, ocr_raw_payload JSONB NULL, status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','rejected')), rejection_reason TEXT NULL, transaction_id UUID NULL UNIQUE REFERENCES public.transactions(id) ON DELETE SET NULL, reviewed_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL, reviewed_at TIMESTAMPTZ NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now() );` |
| S325:85 | `ALTER TABLE public.transactions ADD COLUMN card_session_id UUID NULL REFERENCES public.card_sessions(id) ON DELETE SET NULL;` |
| S328:2 | `ALTER TABLE public.camarim_fund_moves ADD COLUMN IF NOT EXISTS transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL;` |
| S333:1 | `ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_iva_rate_check;` |
| S333:2 | `ALTER TABLE public.transactions ADD CONSTRAINT transactions_iva_rate_check CHECK (iva_rate = ANY (ARRAY[23, 13, 6, 0, 21, 10, 4]));` |
| S335:1 | `CREATE TABLE public.accountant_transaction_reviews ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, transaction_id uuid NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE CASCADE, status text NOT NULL CHECK (status IN ('conferido','pendente')), note text, reviewed_by uuid, reviewed_at timestamptz, response_note text, responded_by uuid, responded_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now() );` |
| S337:1 | `ALTER TABLE public.partner_paid_expenses ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved', ADD COLUMN IF NOT EXISTS proposed_by uuid, ADD COLUMN IF NOT EXISTS approved_by uuid, ADD COLUMN IF NOT EXISTS approved_at timestamptz;` |
| S337:7 | `ALTER TABLE public.partner_paid_expenses ADD CONSTRAINT partner_paid_expenses_status_check CHECK (status IN ('approved', 'pending_approval'));` |
| S341:4 | `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS ordering_partner_id uuid REFERENCES public.event_partners(id) ON DELETE SET NULL;` |
| S351:1 | `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS paying_partner_id uuid REFERENCES public.event_partners(id);` |
| S354:1 | `CREATE TABLE public.partner_capital_moves ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL DEFAULT current_company_id() REFERENCES public.companies(id), event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE, partner_id uuid NOT NULL REFERENCES public.event_partners(id) ON DELETE CASCADE, transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE, kind text NOT NULL CHECK (kind IN ('aporte','devolucao','distribuicao')), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (transaction_id) );` |
| S356:1 | `ALTER TABLE public.transactions ADD COLUMN forecast_id uuid REFERENCES public.event_forecasts(id) ON DELETE SET NULL;` |
| S363:1 | `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS installment_group_id uuid NULL, ADD COLUMN IF NOT EXISTS installment_number integer NULL, ADD COLUMN IF NOT EXISTS installment_total integer NULL;` |
| S377:1 | `ALTER TABLE public.ads_invoice ADD COLUMN IF NOT EXISTS confirmed_by uuid, ADD COLUMN IF NOT EXISTS confirmed_at timestamptz, ADD COLUMN IF NOT EXISTS applied_by uuid, ADD COLUMN IF NOT EXISTS applied_at timestamptz, ADD COLUMN IF NOT EXISTS parent_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL;` |
| S377:8 | `ALTER TABLE public.ads_invoice_line ADD COLUMN IF NOT EXISTS transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL;` |
| S383:17 | `CREATE TABLE public.bank_statement_lines ( id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, company_id uuid NOT NULL DEFAULT current_company_id(), statement_id uuid NOT NULL REFERENCES public.bank_statements(id) ON DELETE CASCADE, financial_account_id uuid NOT NULL REFERENCES public.financial_accounts(id) ON DELETE CASCADE, booking_date date NOT NULL, value_date date, description text NOT NULL DEFAULT '', amount numeric NOT NULL, balance_after numeric, raw jsonb, line_hash text NOT NULL, status text NOT NULL DEFAULT 'unmatched', matched_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL, matched_payment_list_id uuid REFERENCES public.payment_lists(id) ON DELETE SET NULL, matched_sepa_export_id uuid REFERENCES public.payment_list_sepa_exports(id) ON DELETE SET NULL, created_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL, matched_by text, matched_at timestamptz, note text, created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT bank_statement_lines_status_chk CHECK (status IN ('unmatched','matched','ignored')), CONSTRAINT bank_statement_lines_hash_uniq UNIQUE (financial_account_id, line_hash) );` |
| S384:8 | `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS is_confidential boolean NOT NULL DEFAULT false;` |
| S390:1 | `create table if not exists public.bank_line_transactions ( id uuid primary key default gen_random_uuid(), line_id uuid not null references public.bank_statement_lines(id) on delete cascade, transaction_id uuid not null references public.transactions(id) on delete cascade, company_id uuid not null default current_company_id(), created_at timestamptz not null default now(), unique (line_id, transaction_id) );` |
| S391:1 | `ALTER TABLE public.transaction_documents ADD COLUMN IF NOT EXISTS partner_visible boolean NOT NULL DEFAULT true;` |
| S392:1 | `ALTER TABLE public.transactions ADD CONSTRAINT transactions_payment_method_check CHECK (payment_method IS NULL OR payment_method IN ('transfer','service_payment','direct_debit','state_payment','compensation'));` |
| S392:5 | `ALTER TABLE public.transaction_payments ADD CONSTRAINT transaction_payments_payment_method_check CHECK (payment_method IS NULL OR payment_method IN ('transfer','service_payment','direct_debit','state_payment','compensation'));` |
| S393:1 | `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS operation_key text;` |
| S395:1 | `ALTER TABLE public.transactions ADD CONSTRAINT transactions_operation_key_check CHECK (operation_key IS NULL OR operation_key ~ '^[A-Z0-9]+(-[A-Z0-9]+)+$');` |
| S400:3 | `ALTER TABLE public.transactions ADD COLUMN event_settlement_id uuid REFERENCES public.event_settlements(id) ON DELETE SET NULL;` |
| S406:6 | `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS held_by_supplier_id uuid NULL REFERENCES public.suppliers(id) ON DELETE SET NULL;` |
| S406:15 | `ALTER TABLE public.transactions ADD CONSTRAINT transactions_held_by_only_compensation_income CHECK (held_by_supplier_id IS NULL OR (payment_method = 'compensation' AND type = 'income'));` |
| S412:9 | `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS shared_cost_account_id uuid REFERENCES public.financial_accounts(id), ADD COLUMN IF NOT EXISTS shared_cost_counterparty_id uuid REFERENCES public.suppliers(id);` |
| S412:52 | `CREATE TABLE IF NOT EXISTS public.shared_cost_mirror ( id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, company_id uuid NOT NULL, account_id uuid NOT NULL REFERENCES public.financial_accounts(id), source_transaction_id uuid NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE CASCADE, mirror_transaction_id uuid NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE CASCADE, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now() );` |
| S417:1 | `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS transitory_reason text;` |
| S417:3 | `ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_transitory_reason_domain;` |
| S417:5 | `ALTER TABLE public.transactions ADD CONSTRAINT transactions_transitory_reason_domain CHECK (transitory_reason IS NULL OR transitory_reason IN ( 'partner_advance','repasse','caucao','emprestimo_socio', 'carga_cartao','aporte_socio','entrada_a_repassar' ));` |
| S417:116 | `ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_transitory_reason_required;` |
| S417:118 | `ALTER TABLE public.transactions ADD CONSTRAINT transactions_transitory_reason_required CHECK (NOT is_transitory OR transitory_reason IS NOT NULL) NOT VALID;` |
| S418:27 | `ALTER TABLE public.transactions VALIDATE CONSTRAINT transactions_transitory_reason_required;` |
| S428:3 | `ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS closes_transaction boolean NOT NULL DEFAULT false;` |
| S429:4 | `ALTER TABLE public.transactions ALTER CONSTRAINT transactions_forecast_id_fkey DEFERRABLE INITIALLY IMMEDIATE;` |
| S429:6 | `ALTER TABLE public.transactions ALTER CONSTRAINT transactions_settlement_id_fkey DEFERRABLE INITIALLY IMMEDIATE;` |
| S431:1 | `ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'EUR', ADD COLUMN IF NOT EXISTS original_amount numeric, ADD COLUMN IF NOT EXISTS fx_rate numeric, ADD COLUMN IF NOT EXISTS fx_rate_source text;` |
| S431:19 | `ALTER TABLE public.transaction_payments DROP CONSTRAINT IF EXISTS transaction_payments_fx_required;` |
| S431:21 | `ALTER TABLE public.transaction_payments ADD CONSTRAINT transaction_payments_fx_required CHECK (currency = 'EUR' OR (original_amount IS NOT NULL AND fx_rate IS NOT NULL));` |
| S445:66 | `CREATE TABLE public.transaction_offsets ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id), receivable_transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE, payable_transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE, amount numeric(14,2) NOT NULL CHECK (amount > 0), note text, created_by text, created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT transaction_offsets_pair_unique UNIQUE (receivable_transaction_id, payable_transaction_id) );` |
| S445:168 | `ALTER TABLE public.transaction_payments ADD COLUMN offset_id uuid NULL REFERENCES public.transaction_offsets(id) ON DELETE RESTRICT;` |
| S042:1 | `ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS payment_list_id uuid NULL REFERENCES public.payment_lists(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS outside_batch boolean NOT NULL DEFAULT false;` |
| S043:23 | `CREATE TABLE public.ticket_office_statement_lines ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), statement_id uuid NOT NULL REFERENCES public.ticket_office_statements(id) ON DELETE CASCADE, company_id uuid NOT NULL REFERENCES public.companies(id), line_type text NOT NULL CHECK (line_type IN ('event_right','ticketline_invoice','venue_settlement','advance','carry_over')), position integer NOT NULL DEFAULT 0, description text NOT NULL, amount numeric(14,2), pending_document boolean NOT NULL DEFAULT false, event_id uuid REFERENCES public.events(id), ticket_office_settlement_id uuid REFERENCES public.ticket_office_settlements(id), transaction_id uuid REFERENCES public.transactions(id), invoice_group_id uuid, previous_statement_id uuid REFERENCES public.ticket_office_statements(id), notes text, created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT tosl_amount_or_pending CHECK (amount IS NOT NULL OR pending_document) );` |
| S044:1 | `ALTER TABLE public.event_ticket_office_advances ADD CONSTRAINT event_ticket_office_advances_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT, ADD CONSTRAINT event_ticket_office_advances_financial_account_id_fkey FOREIGN KEY (financial_account_id) REFERENCES public.financial_accounts(id) ON DELETE RESTRICT, ADD CONSTRAINT event_ticket_office_advances_target_account_id_fkey FOREIGN KEY (target_account_id) REFERENCES public.financial_accounts(id) ON DELETE RESTRICT, ADD CONSTRAINT event_ticket_office_advances_settlement_id_fkey FOREIGN KEY (settlement_id) REFERENCES public.ticket_office_settlements(id) ON DELETE RESTRICT, ADD CONSTRAINT event_ticket_office_advances_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE RESTRICT;` |
| S052:4 | `CREATE TABLE public.payment_list_bank_executions ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE, payment_list_id uuid NOT NULL REFERENCES public.payment_lists(id) ON DELETE CASCADE, sepa_export_id uuid NOT NULL REFERENCES public.payment_list_sepa_exports(id) ON DELETE CASCADE, transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE, bank_statement_line_id uuid NOT NULL, match_kind text NOT NULL CHECK (match_kind IN ('lote','linha')), confirmed_by uuid NOT NULL DEFAULT auth.uid(), confirmed_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT payment_list_bank_executions_line_fkey FOREIGN KEY (bank_statement_line_id) REFERENCES public.bank_statement_lines(id) ON DELETE CASCADE, UNIQUE (sepa_export_id, transaction_id) );` |
| S053:6 | `ALTER TABLE public.transactions DROP CONSTRAINT transactions_transitory_reason_domain;` |
| S053:7 | `ALTER TABLE public.transactions ADD CONSTRAINT transactions_transitory_reason_domain CHECK ( transitory_reason IS NULL OR transitory_reason = ANY (ARRAY['partner_advance','repasse','caucao','emprestimo_socio','carga_cartao','aporte_socio','entrada_a_repassar','devolucao_socio']::text[]) );` |
| S056:63 | `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS cache_contract_id uuid REFERENCES public.cache_payment_contracts(id), ADD COLUMN IF NOT EXISTS cache_role text, ADD COLUMN IF NOT EXISTS cache_root_event_id uuid, ADD COLUMN IF NOT EXISTS cache_artist_supplier_id uuid;` |
| S056:68 | `ALTER TABLE public.transactions ADD CONSTRAINT transactions_cache_role_check CHECK (cache_role IS NULL OR cache_role IN ('artist_balance','withholding','advance')) NOT VALID;` |
| S061:3 | `CREATE TABLE public.partner_payment_contracts ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, settlement_id uuid NOT NULL REFERENCES public.event_settlements(id), participant_id uuid NOT NULL REFERENCES public.event_settlement_participants(id), event_id uuid NOT NULL REFERENCES public.events(id), direction text NOT NULL DEFAULT 'out' CHECK (direction = 'out'), beneficiary_supplier_id uuid NOT NULL REFERENCES public.suppliers(id), gross numeric(14,2) NOT NULL CHECK (gross > 0), withholding_applies boolean NOT NULL, withholding_rate numeric(5,2) CHECK (withholding_rate IS NULL OR (withholding_rate > 0 AND withholding_rate < 100)), withholding_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (withholding_amount >= 0), withholding_due_date date, due_date date NOT NULL, advances_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (advances_amount >= 0), balance_tx_id uuid REFERENCES public.transactions(id), withholding_tx_id uuid REFERENCES public.transactions(id), label text, idempotency_key text, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid, cancelled_at timestamptz, cancelled_by uuid, cancel_reason text, replaced_by uuid REFERENCES public.partner_payment_contracts(id), CONSTRAINT ppc_withholding_shape CHECK ( (withholding_applies AND withholding_rate IS NOT NULL AND withholding_due_date IS NOT NULL) OR (NOT withholding_applies AND withholding_rate IS NULL AND withholding_amount = 0 AND withholding_tx_id IS NULL)), CONSTRAINT ppc_amounts CHECK (withholding_amount + advances_amount <= gross) );` |
| S061:46 | `ALTER TABLE public.transactions ADD COLUMN partner_contract_id uuid REFERENCES public.partner_payment_contracts(id), ADD COLUMN partner_contract_role text CHECK (partner_contract_role IS NULL OR partner_contract_role IN ('balance','withholding','advance'));` |
| S062:2 | `ALTER TABLE public.transactions DROP CONSTRAINT transactions_transitory_reason_domain;` |
| S062:4 | `ALTER TABLE public.transactions ADD CONSTRAINT transactions_transitory_reason_domain CHECK (((transitory_reason IS NULL) OR (transitory_reason = ANY (ARRAY['partner_advance'::text, 'repasse'::text, 'caucao'::text, 'emprestimo_socio'::text, 'carga_cartao'::text, 'aporte_socio'::text, 'entrada_a_repassar'::text, 'devolucao_socio'::text, 'distribuicao_resultado'::text]))));` |
| S077:8 | `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS excluded_from_partner_settlement boolean NOT NULL DEFAULT false;` |
| S077:19 | `ALTER TABLE public.transactions ADD CONSTRAINT transactions_excluded_from_partner_settlement_check CHECK ( NOT excluded_from_partner_settlement OR (type = 'income' AND NOT exclude_from_result AND NOT is_transitory AND event_settlement_id IS NULL) );` |

## Anexo C — helpers, assinaturas, triggers e ACL de fonte

C1 registra definições de funções com acesso estático às tabelas nucleares e seus helpers públicos referenciados, mais fecho/selos/permissões. A assinatura é a declaração até RETURNS; os pontos de lock são linhas do corpo, não uma prova de protocolo global. “Sem FOR UPDATE/advisory explícito” não exclui locks implícitos de UPDATE/FK nem locks adquiridos por helpers/triggers. C2 inclui os triggers diretos e os restantes triggers definidos nos ficheiros financeiros selecionados. C3 indexa ACL/policies por instrução; expressões completas devem ser lidas na fonte com o hash de A. A presença de EXECUTE ou CREATE POLICY num literal dinâmico não prova aplicação.

### C1 — assinaturas e locks explícitos

| Fonte:linha | Declaração | Propriedades do cabeçalho | Linhas de locks no corpo |
|---|---|---|---|
| S204:27 | `CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)` | `BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S213:48 | `CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)` | `boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S214:51 | `CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)` | `boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S246:1 | `create or replace function public.protect_master_split_forecast_links()` | `trigger language plpgsql set search_path = public as`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S247:1 | `create or replace function public.protect_master_split_forecast_links()` | `trigger language plpgsql set search_path = public as`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S250:48 | `CREATE OR REPLACE FUNCTION public.create_bp_snapshot( _event_id uuid, _description text DEFAULT NULL, _approve_immediately boolean DEFAULT false, _scenario_label text DEFAULT NULL, _scenario_assumptions jsonb DEFAULT NULL, _is_pinned_scenario boolean DEFAULT false, _created_by uuid DEFAULT NULL, _created_by_label text DEFAULT NULL )` | `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S251:129 | `CREATE OR REPLACE FUNCTION public.discard_bp_version_draft( _version_id uuid, _performed_by uuid DEFAULT NULL, _performed_by_label text DEFAULT NULL )` | `void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S252:2 | `CREATE OR REPLACE FUNCTION public.reconcile_bp_overrides_for_event( _event_id uuid, _trigger_version_id uuid, _trigger_version_number int, _performed_by uuid DEFAULT NULL, _performed_by_label text DEFAULT NULL )` | `void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S252:138 | `CREATE OR REPLACE FUNCTION public.create_bp_snapshot(_event_id uuid, _description text DEFAULT NULL::text, _approve_immediately boolean DEFAULT false, _scenario_label text DEFAULT NULL::text, _scenario_assumptions jsonb DEFAULT NULL::jsonb, _is_pinned_scenario boolean DEFAULT false, _created_by uuid DEFAULT NULL::uuid, _created_by_label text DEFAULT NULL::text)` | `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S253:26 | `CREATE OR REPLACE FUNCTION public.bp_version_linked_tx_count(_event_id uuid)` | `int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S253:41 | `CREATE OR REPLACE FUNCTION public._revert_event_to_version( _event_id uuid, _target_version_id uuid, _performed_by uuid, _performed_by_label text, _force boolean )` | `void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S254:2 | `CREATE OR REPLACE FUNCTION public.promote_scenario_to_active( _scenario_version_id uuid, _description text DEFAULT NULL, _performed_by uuid DEFAULT NULL, _performed_by_label text DEFAULT NULL )` | `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S255:14 | `CREATE OR REPLACE FUNCTION public.promote_scenario_to_active( _scenario_version_id uuid, _description text DEFAULT NULL, _performed_by uuid DEFAULT NULL, _performed_by_label text DEFAULT NULL, _force boolean DEFAULT false )` | `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S255:317 | `CREATE OR REPLACE FUNCTION public.discard_bp_version_draft( _version_id uuid, _performed_by uuid DEFAULT NULL, _performed_by_label text DEFAULT NULL )` | `void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S256:3 | `CREATE OR REPLACE FUNCTION public.list_orphan_transactions_for_event( _event_id uuid )` | `TABLE ( transaction_id uuid, tx_description text, tx_amount numeric, tx_date date, tx_category_id uuid, tx_category_name text, tx_status text, best_forecast_id uuid, best_forecast_description text, best_forecast_amount numeric, match_score int, match_reason text ) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S256:110 | `CREATE OR REPLACE FUNCTION public.relink_orphan_transactions( _event_id uuid, _pairs jsonb, _performed_by uuid DEFAULT NULL, _performed_by_label text DEFAULT NULL )` | `TABLE ( relinked_count int, skipped_count int, details jsonb ) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S257:8 | `CREATE OR REPLACE FUNCTION public.create_bp_snapshot( _event_id uuid, _description text DEFAULT NULL::text, _approve_immediately boolean DEFAULT false, _scenario_label text DEFAULT NULL::text, _scenario_assumptions jsonb DEFAULT NULL::jsonb, _is_pinned_scenario boolean DEFAULT false, _created_by uuid DEFAULT NULL::uuid, _created_by_label text DEFAULT NULL::text )` | `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S257:251 | `CREATE OR REPLACE FUNCTION public.promote_scenario_to_active( _scenario_version_id uuid, _description text DEFAULT NULL::text, _performed_by uuid DEFAULT NULL::uuid, _performed_by_label text DEFAULT NULL::text, _force boolean DEFAULT false )` | `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S258:1 | `CREATE OR REPLACE FUNCTION public._revert_event_to_version( _event_id uuid, _target_version_id uuid, _performed_by uuid, _performed_by_label text, _force boolean )` | `void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S259:11 | `CREATE OR REPLACE FUNCTION public.promote_scenario_to_active( _scenario_version_id uuid, _description text DEFAULT NULL::text, _performed_by uuid DEFAULT NULL::uuid, _performed_by_label text DEFAULT NULL::text, _force boolean DEFAULT false, _other_scenarios_actions jsonb DEFAULT '[]'::jsonb )` | `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S260:2 | `CREATE OR REPLACE FUNCTION public.reconcile_bp_overrides_for_event( _event_id uuid, _trigger_version_id uuid, _trigger_version_number int, _performed_by uuid DEFAULT NULL, _performed_by_label text DEFAULT NULL )` | `void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S260:72 | `CREATE OR REPLACE FUNCTION public.create_bp_snapshot( _event_id uuid, _description text DEFAULT NULL, _approve_immediately boolean DEFAULT false, _scenario_label text DEFAULT NULL, _scenario_assumptions jsonb DEFAULT NULL, _is_pinned_scenario boolean DEFAULT false, _created_by uuid DEFAULT NULL, _created_by_label text DEFAULT NULL )` | `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S260:188 | `CREATE OR REPLACE FUNCTION public.bp_version_linked_tx_count(_event_id uuid)` | `int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S260:192 | `CREATE OR REPLACE FUNCTION public.discard_bp_version_draft( _version_id uuid, _performed_by uuid DEFAULT NULL, _performed_by_label text DEFAULT NULL )` | `void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S261:17 | `CREATE OR REPLACE FUNCTION public.create_bp_snapshot( _event_id uuid, _description text DEFAULT NULL::text, _approve_immediately boolean DEFAULT false, _scenario_label text DEFAULT NULL::text, _scenario_assumptions jsonb DEFAULT NULL::jsonb, _is_pinned_scenario boolean DEFAULT false, _created_by uuid DEFAULT NULL::uuid, _created_by_label text DEFAULT NULL::text )` | `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S261:237 | `CREATE OR REPLACE FUNCTION public.promote_scenario_to_active( _scenario_version_id uuid, _description text DEFAULT NULL::text, _performed_by uuid DEFAULT NULL::uuid, _performed_by_label text DEFAULT NULL::text, _force boolean DEFAULT false, _other_scenarios_actions jsonb DEFAULT '[]'::jsonb )` | `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S262:20 | `CREATE OR REPLACE FUNCTION public.create_bp_snapshot( _event_id uuid, _description text DEFAULT NULL::text, _approve_immediately boolean DEFAULT false, _scenario_label text DEFAULT NULL::text, _scenario_assumptions jsonb DEFAULT NULL::jsonb, _is_pinned_scenario boolean DEFAULT false, _created_by uuid DEFAULT NULL::uuid, _created_by_label text DEFAULT NULL::text )` | `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S262:234 | `CREATE OR REPLACE FUNCTION public.promote_scenario_to_active( _scenario_version_id uuid, _description text DEFAULT NULL::text, _performed_by uuid DEFAULT NULL::uuid, _performed_by_label text DEFAULT NULL::text, _force boolean DEFAULT false, _other_scenarios_actions jsonb DEFAULT '[]'::jsonb )` | `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S263:101 | `CREATE OR REPLACE FUNCTION public.suggest_formalidade(_forecast_id uuid)` | `public.bp_formalidade LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S264:1 | `CREATE OR REPLACE FUNCTION public.promote_scenario_to_active(_scenario_version_id uuid, _description text DEFAULT NULL::text, _performed_by uuid DEFAULT NULL::uuid, _performed_by_label text DEFAULT NULL::text, _force boolean DEFAULT false, _other_scenarios_actions jsonb DEFAULT '[]'::jsonb)` | `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S265:2 | `CREATE OR REPLACE FUNCTION public.analyze_formalidade_bulk(_event_ids uuid[] DEFAULT NULL)` | `TABLE ( forecast_id uuid, event_id uuid, event_name text, description text, category_code text, category_name text, bp_amount numeric, current_formalidade public.bp_formalidade, suggested_formalidade public.bp_formalidade, confidence text, reason text, paid_total numeric, approved_total numeric, has_transaction boolean ) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S266:2 | `CREATE OR REPLACE FUNCTION public.analyze_formalidade_bulk(_event_ids uuid[] DEFAULT NULL)` | `TABLE ( forecast_id uuid, event_id uuid, event_name text, description text, category_code text, category_name text, bp_amount numeric, current_formalidade public.bp_formalidade, suggested_formalidade public.bp_formalidade, confidence text, reason text, paid_total numeric, approved_total numeric, has_transaction boolean ) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S267:1 | `CREATE OR REPLACE FUNCTION public.formalidade_audit_stats(_event_ids uuid[] DEFAULT NULL)` | `TABLE ( total_lines integer, total_events integer, with_direct_tx integer, with_category_match integer, without_any_match integer, count_estimado integer, count_fechado integer, count_pago_parcial integer, count_pago_total integer ) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S268:1 | `CREATE OR REPLACE FUNCTION public.analyze_formalidade_bulk(_event_ids uuid[] DEFAULT NULL::uuid[])` | `TABLE(forecast_id uuid, event_id uuid, event_name text, description text, category_code text, category_name text, bp_amount numeric, current_formalidade bp_formalidade, suggested_formalidade bp_formalidade, confidence text, reason text, paid_total numeric, approved_total numeric, has_transaction boolean) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S269:2 | `CREATE OR REPLACE FUNCTION public._debug_analyze_formalidade(_event_ids uuid[])` | `TABLE(forecast_id uuid, description text, current_f text, suggested_f text, confidence text, paid numeric, bp numeric) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S270:3 | `CREATE OR REPLACE FUNCTION public.analyze_formalidade_bulk(_event_ids uuid[] DEFAULT NULL::uuid[])` | `TABLE(forecast_id uuid, event_id uuid, event_name text, description text, category_code text, category_name text, bp_amount numeric, current_formalidade bp_formalidade, suggested_formalidade bp_formalidade, confidence text, reason text, paid_total numeric, approved_total numeric, has_transaction boolean) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S273:62 | `CREATE OR REPLACE FUNCTION public.current_company_id()` | `uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S273:73 | `CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid DEFAULT auth.uid())` | `boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S274:66 | `CREATE OR REPLACE FUNCTION public.row_belongs_to_current_company(_row_company_id uuid)` | `boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S274:197 | `CREATE OR REPLACE FUNCTION public.set_company_id_on_insert()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S277:8 | `CREATE OR REPLACE FUNCTION public.storage_path_belongs_to_current_company(_name text)` | `boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S278:53 | `CREATE OR REPLACE FUNCTION public.current_company_id()` | `uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S278:58 | `CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid DEFAULT auth.uid())` | `boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S279:2 | `CREATE OR REPLACE FUNCTION public.set_company_id_on_insert()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S280:1 | `CREATE OR REPLACE FUNCTION public.run_rls_isolation_test()` | `TABLE(block text, check_name text, status text, details text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S281:3 | `CREATE OR REPLACE FUNCTION public.run_rls_isolation_test()` | `TABLE(block text, check_name text, status text, details text) LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S282:27 | `CREATE OR REPLACE FUNCTION public.run_rls_isolation_test()` | `TABLE(block text, check_name text, status text, details text) LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S283:8 | `CREATE OR REPLACE FUNCTION public.current_company_id()` | `uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S284:5 | `CREATE OR REPLACE FUNCTION public.run_rls_isolation_test()` | `TABLE(block text, check_name text, status text, details text) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S285:1 | `CREATE OR REPLACE FUNCTION public.run_rls_isolation_test()` | `TABLE(block text, check_name text, status text, details text) LANGUAGE plpgsql SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S286:1 | `CREATE OR REPLACE FUNCTION public.run_rls_isolation_test()` | `TABLE(block text, check_name text, status text, details text) LANGUAGE plpgsql SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S291:117 | `CREATE OR REPLACE FUNCTION public.recalculate_pax_benchmarks(_company_id uuid DEFAULT NULL)` | `integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S298:9 | `CREATE OR REPLACE FUNCTION public.reimbursement_propagate_payment()` | `TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S300:44 | `CREATE OR REPLACE FUNCTION public.update_updated_at_column()` | `TRIGGER LANGUAGE plpgsql SET search_path=public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S301:43 | `CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)` | `boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S301:60 | `CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)` | `boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S301:84 | `CREATE OR REPLACE FUNCTION public.has_role_in(_user_id uuid, _role app_role, _company_id uuid)` | `boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S301:91 | `CREATE OR REPLACE FUNCTION public.has_permission_in(_user_id uuid, _permission text, _company_id uuid)` | `boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S301:104 | `CREATE OR REPLACE FUNCTION public.current_company_id()` | `uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S302:2 | `CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)` | `boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S304:1 | `CREATE OR REPLACE FUNCTION public.create_bp_snapshot( _event_id uuid, _description text DEFAULT NULL::text, _approve_immediately boolean DEFAULT false, _scenario_label text DEFAULT NULL::text, _scenario_assumptions jsonb DEFAULT NULL::jsonb, _is_pinned_scenario boolean DEFAULT false, _created_by uuid DEFAULT NULL::uuid, _created_by_label text DEFAULT NULL::text )` | `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S306:6 | `CREATE OR REPLACE FUNCTION public.validate_tx_category_l2_match( _tx_category_id uuid, _forecast_id uuid )` | `boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S306:114 | `CREATE OR REPLACE FUNCTION public.enforce_forecast_tx_link_l2_match()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S309:35 | `CREATE OR REPLACE FUNCTION public.tx_has_installment_schedule(_tx_id uuid)` | `boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S309:52 | `CREATE OR REPLACE FUNCTION public.sync_paid_amount_from_payments()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S309:132 | `CREATE OR REPLACE FUNCTION public.validate_installments_total()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S311:2 | `CREATE OR REPLACE FUNCTION public.sync_paid_amount_from_payments()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S312:2 | `CREATE OR REPLACE FUNCTION public.sync_paid_amount_from_payments()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S313:2 | `CREATE OR REPLACE FUNCTION public.sync_paid_amount_from_payments()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S314:1 | `CREATE OR REPLACE FUNCTION public.sync_paid_amount_from_payments()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S315:1 | `CREATE OR REPLACE FUNCTION public.sync_paid_amount_from_payments()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S317:1 | `CREATE OR REPLACE FUNCTION public.current_company_id()` | `uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S318:35 | `CREATE OR REPLACE FUNCTION public.get_event_cash_position( p_company_id uuid, p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL )` | `TABLE ( level text, event_id uuid, master_event_id uuid, parent_event_id uuid, event_name text, event_date date, is_sub boolean, realized numeric, committed numeric, pending numeric ) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S318:157 | `CREATE OR REPLACE FUNCTION public.get_event_cash_position_invariant( p_company_id uuid )` | `TABLE ( sum_realized numeric, sum_initial numeric, lhs numeric, rhs_computebalance numeric, diff numeric, is_balanced boolean ) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S319:4 | `CREATE OR REPLACE FUNCTION public.user_has_event_access(p_user_id uuid, p_event_id uuid)` | `boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S319:38 | `CREATE OR REPLACE FUNCTION public.user_supplier_id(p_user_id uuid)` | `uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S322:4 | `CREATE OR REPLACE FUNCTION public.get_bp_line_attachments(_event_ids uuid[])` | `TABLE ( forecast_id uuid, kind text, document_id uuid, file_name text ) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S323:7 | `CREATE OR REPLACE FUNCTION public.get_bp_l3_attachments(_event_ids uuid[])` | `TABLE(event_id uuid, category_id uuid, kind text, document_id uuid, file_name text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S324:5 | `CREATE OR REPLACE FUNCTION public.reverse_transaction( p_tx_id uuid, p_kind text, p_reason text, p_valid_until date, p_release_for_repayment boolean )` | `jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | 38 |
| S324:202 | `CREATE OR REPLACE FUNCTION public.reverse_transaction( p_tx_id uuid, p_kind text, p_reason text, p_valid_until date DEFAULT NULL )` | `jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S326:1 | `CREATE OR REPLACE FUNCTION public.reverse_transaction( p_tx_id uuid, p_kind text, p_reason text, p_valid_until date, p_release_for_repayment boolean )` | `jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | 34 |
| S327:3 | `CREATE OR REPLACE FUNCTION public.card_load_on_out_paid()` | `TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S327:63 | `CREATE OR REPLACE FUNCTION public.card_load_on_out_delete()` | `TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S330:2 | `CREATE OR REPLACE FUNCTION public.get_partner_bp_realized(p_event_id uuid)` | `jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S331:2 | `CREATE OR REPLACE FUNCTION public.get_partner_bp_realized(p_event_id uuid)` | `jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S332:1 | `CREATE OR REPLACE FUNCTION public.get_partner_bp_realized(p_event_id uuid)` | `jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S334:1 | `CREATE OR REPLACE FUNCTION public.reverse_payment(p_payment_id uuid, p_kind text, p_reason text, p_valid_until date DEFAULT NULL::date, p_amount numeric DEFAULT NULL::numeric)` | `jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | 26, 39 |
| S334:152 | `CREATE OR REPLACE FUNCTION public.apply_supplier_credit( p_credit_id uuid, p_transaction_id uuid, p_amount numeric, p_payment_id uuid DEFAULT NULL::uuid )` | `jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | 180, 185 |
| S336:1 | `CREATE OR REPLACE FUNCTION public.enforce_payment_list_item_bankable()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S339:1 | `CREATE OR REPLACE FUNCTION public.enforce_payment_list_item_bankable()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S340:1 | `CREATE OR REPLACE FUNCTION public.enforce_payment_list_item_bankable()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S342:1 | `CREATE OR REPLACE FUNCTION public.enforce_payment_list_item_bankable()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S344:1 | `CREATE OR REPLACE FUNCTION public.get_partner_event_tx_aggregates(p_event_ids uuid[])` | `TABLE ( event_id uuid, tx_type text, category_id uuid, iva_rate numeric, base_amount numeric, iva_amount numeric, gross_amount numeric, tx_count integer ) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S344:69 | `CREATE OR REPLACE FUNCTION public.get_partner_event_partner_expenses(p_event_ids uuid[])` | `TABLE ( kind text, id uuid, event_id uuid, notes text, entry_date date, description text, base_amount numeric, iva_rate numeric, total_amount numeric, created_at timestamptz ) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S347:32 | `CREATE OR REPLACE FUNCTION public.sync_tx_category_from_forecast()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S347:82 | `CREATE OR REPLACE FUNCTION public.realign_tx_category_from_forecast()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S348:1 | `CREATE OR REPLACE FUNCTION public.bp_tx_link_allowed( _tx_event uuid, _tx_company uuid, _fc_event uuid, _fc_company uuid )` | `boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S348:25 | `CREATE OR REPLACE FUNCTION public.enforce_forecast_tx_same_event()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S348:105 | `CREATE OR REPLACE FUNCTION public.sync_tx_category_from_forecast()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S348:154 | `CREATE OR REPLACE FUNCTION public.realign_tx_category_from_forecast()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S349:1 | `CREATE OR REPLACE FUNCTION public._test_bp_tx_guards()` | `jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S350:1 | `CREATE OR REPLACE FUNCTION public._test_bp_tx_guards()` | `jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S357:1 | `CREATE OR REPLACE FUNCTION public.list_orphan_transactions_for_event(_event_id uuid)` | `TABLE(transaction_id uuid, tx_description text, tx_amount numeric, tx_date date, tx_category_id uuid, tx_category_name text, tx_status text, best_forecast_id uuid, best_forecast_description text, best_forecast_amount numeric, match_score integer, match_reason text) LANGUAGE plpgsql STABLE SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S358:1 | `CREATE OR REPLACE FUNCTION public.check_system_invariants()` | `TABLE ( code text, severity text, title text, offenders bigint, sample jsonb, checked_at timestamptz ) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S359:1 | `CREATE OR REPLACE FUNCTION public.sync_forecast_anchor_to_tx()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S359:37 | `CREATE OR REPLACE FUNCTION public.sync_tx_forecast_to_anchor()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S360:1 | `CREATE OR REPLACE FUNCTION public.check_system_invariants()` | `TABLE ( code text, severity text, title text, offenders bigint, sample jsonb, checked_at timestamptz ) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S362:3 | `CREATE OR REPLACE FUNCTION public.validate_installments_total()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S365:1 | `CREATE OR REPLACE FUNCTION public.renegotiate_transaction_installments( p_transaction_id uuid, p_installments jsonb, p_changed_by text )` | `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | 40 |
| S367:31 | `CREATE OR REPLACE FUNCTION public.renegotiate_transaction_installments(p_transaction_id uuid, p_installments jsonb, p_changed_by text)` | `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | 67 |
| S368:1 | `CREATE OR REPLACE FUNCTION public.renegotiate_transaction_installments(p_transaction_id uuid, p_installments jsonb, p_changed_by text)` | `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | 37 |
| S369:1 | `CREATE OR REPLACE FUNCTION public.renegotiate_transaction_installments(p_transaction_id uuid, p_installments jsonb, p_changed_by text)` | `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | 37 |
| S370:22 | `CREATE OR REPLACE FUNCTION public.event_budget_mode(_event_id uuid)` | `text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S371:45 | `CREATE OR REPLACE FUNCTION public.promote_scenario_to_active(_scenario_version_id uuid, _description text DEFAULT NULL::text, _performed_by uuid DEFAULT NULL::uuid, _performed_by_label text DEFAULT NULL::text, _force boolean DEFAULT false, _other_scenarios_actions jsonb DEFAULT '[]'::jsonb)` | `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S372:8 | `CREATE OR REPLACE FUNCTION public.enforce_transaction_approval_permission()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S373:1 | `CREATE OR REPLACE FUNCTION public.enforce_transaction_approval_permission()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S374:1 | `CREATE OR REPLACE FUNCTION public.enforce_transaction_approval_permission()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S375:1 | `CREATE OR REPLACE FUNCTION public.enforce_transaction_approval_permission()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S376:1 | `CREATE OR REPLACE FUNCTION public.event_close_blockers(_event_id uuid)` | `jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S378:5 | `CREATE OR REPLACE FUNCTION public.bp_capture_tx_links(_event_id uuid)` | `jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S378:28 | `CREATE OR REPLACE FUNCTION public.bp_restore_tx_links(_event_id uuid, _links jsonb)` | `jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S378:113 | `CREATE OR REPLACE FUNCTION public.bp_version_linked_tx_count(_event_id uuid)` | `integer LANGUAGE sql STABLE SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S378:253 | `CREATE OR REPLACE FUNCTION public._revert_event_to_version(_event_id uuid, _target_version_id uuid, _performed_by uuid, _performed_by_label text, _force boolean)` | `void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S379:7 | `CREATE OR REPLACE FUNCTION public.promote_scenario_to_active(_scenario_version_id uuid, _description text DEFAULT NULL::text, _performed_by uuid DEFAULT NULL::uuid, _performed_by_label text DEFAULT NULL::text, _force boolean DEFAULT false, _other_scenarios_actions jsonb DEFAULT '[]'::jsonb)` | `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S380:1 | `CREATE OR REPLACE FUNCTION public.enforce_transaction_approval_permission()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S381:1 | `CREATE OR REPLACE FUNCTION public.get_event_cash_position(p_company_id uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date)` | `TABLE(level text, event_id uuid, master_event_id uuid, parent_event_id uuid, event_name text, event_date date, is_sub boolean, realized numeric, committed numeric, pending numeric) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S382:1 | `CREATE OR REPLACE FUNCTION public.get_event_cash_position_invariant(p_company_id uuid)` | `TABLE(sum_realized numeric, sum_initial numeric, lhs numeric, rhs_computebalance numeric, diff numeric, is_balanced boolean) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S384:13 | `CREATE OR REPLACE FUNCTION public.can_see_confidential(_user uuid)` | `boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S385:8 | `CREATE OR REPLACE FUNCTION public._account_true_balance_raw(_account_id uuid)` | `numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S387:1 | `CREATE OR REPLACE FUNCTION public._account_true_balance_asof_raw( _account_id uuid, _as_of date DEFAULT NULL )` | `numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S388:129 | `CREATE OR REPLACE FUNCTION public.event_close_blockers(_event_id uuid)` | `jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S389:10 | `CREATE OR REPLACE FUNCTION public.event_budget_mode(_event_id uuid)` | `text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S394:1 | `CREATE OR REPLACE FUNCTION public.renegotiate_transaction_installments(p_transaction_id uuid, p_installments jsonb, p_changed_by text)` | `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | 37 |
| S396:4 | `CREATE OR REPLACE FUNCTION public.rename_operation_key(_old_key text, _new_key text)` | `jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S396:77 | `CREATE OR REPLACE FUNCTION public.clear_operation_key(_key text)` | `jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S397:6 | `CREATE OR REPLACE FUNCTION public._ticket_office_balance_raw(_account_id uuid)` | `numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S397:50 | `CREATE OR REPLACE FUNCTION public.ticket_office_balances(_account_ids uuid[])` | `TABLE(account_id uuid, balance numeric) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S398:5 | `CREATE OR REPLACE FUNCTION public._ticket_office_balance_raw(_account_id uuid)` | `numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S399:1 | `CREATE OR REPLACE FUNCTION public.create_settlement_transfer( p_settlement_id uuid, p_from_account_id uuid, p_to_account_id uuid, p_amount numeric, p_date date, p_credited boolean )` | `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S400:52 | `CREATE OR REPLACE FUNCTION public.prevent_delete_event_settlement_with_lines()` | `trigger LANGUAGE plpgsql SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S402:17 | `CREATE OR REPLACE FUNCTION public.guard_sealed_event_settlement()` | `trigger LANGUAGE plpgsql SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S402:171 | `CREATE OR REPLACE FUNCTION public.prevent_delete_event_settlement_with_lines()` | `trigger LANGUAGE plpgsql SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S402:200 | `CREATE OR REPLACE FUNCTION public.seal_event_settlement( _settlement_id uuid, _snapshot jsonb, _bp_version_id uuid DEFAULT NULL, _note text DEFAULT NULL )` | `jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S402:256 | `CREATE OR REPLACE FUNCTION public.unseal_event_settlement( _settlement_id uuid, _reason text )` | `jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S403:1 | `CREATE OR REPLACE FUNCTION public.guard_sealed_event_settlement()` | `trigger LANGUAGE plpgsql SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S404:1 | `CREATE OR REPLACE FUNCTION public.get_partner_event_tx_aggregates(p_event_ids uuid[])` | `TABLE ( event_id uuid, tx_type text, category_id uuid, iva_rate numeric, base_amount numeric, iva_amount numeric, gross_amount numeric, tx_count integer ) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S405:20 | `CREATE OR REPLACE FUNCTION public.get_partner_settlement_summary( _event_id uuid, _settlement_id uuid, _partner_share numeric DEFAULT 0, _transfer_with_vat boolean DEFAULT false )` | `TABLE ( partner_share numeric, disbursement numeric, adjustments numeric, revenues_held numeric, extras numeric, transfer_base numeric, transfer_vat numeric, transfer_total numeric ) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S406:20 | `CREATE OR REPLACE FUNCTION public.get_partner_settlement_summary(_event_id uuid, _settlement_id uuid, _partner_share numeric DEFAULT 0, _transfer_with_vat boolean DEFAULT false)` | `TABLE(partner_share numeric, disbursement numeric, adjustments numeric, revenues_held numeric, extras numeric, transfer_base numeric, transfer_vat numeric, transfer_total numeric) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S407:6 | `CREATE OR REPLACE FUNCTION public.has_staff_role(_user_id uuid)` | `boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S408:2 | `CREATE OR REPLACE FUNCTION public.user_supplier_id(p_user_id uuid)` | `uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S408:18 | `CREATE OR REPLACE FUNCTION public.user_event_partner_ids(_user uuid, _event_ids uuid[])` | `SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S408:79 | `CREATE OR REPLACE FUNCTION public.get_partner_event_partner_expenses(p_event_ids uuid[])` | `TABLE(kind text, id uuid, event_id uuid, notes text, entry_date date, description text, base_amount numeric, iva_rate numeric, total_amount numeric, created_at timestamp with time zone) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S408:209 | `CREATE OR REPLACE FUNCTION public.get_partner_event_tx_aggregates(p_event_ids uuid[])` | `TABLE(event_id uuid, tx_type text, category_id uuid, iva_rate numeric, base_amount numeric, iva_amount numeric, gross_amount numeric, tx_count integer) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S408:291 | `CREATE OR REPLACE FUNCTION public.get_partner_settlement_summary(_event_id uuid, _settlement_id uuid, _partner_share numeric DEFAULT 0, _transfer_with_vat boolean DEFAULT false)` | `TABLE(partner_share numeric, disbursement numeric, adjustments numeric, revenues_held numeric, extras numeric, transfer_base numeric, transfer_vat numeric, transfer_total numeric) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S409:57 | `CREATE OR REPLACE FUNCTION public.run_invariant_checks()` | `TABLE ( name text, description text, severity text, current_count bigint, reference_count bigint, conforme boolean, notes text ) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S410:40 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_raw()` | `TABLE( name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb ) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S410:278 | `CREATE OR REPLACE FUNCTION public.run_invariant_checks()` | `TABLE( name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb ) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S410:299 | `CREATE OR REPLACE FUNCTION public.check_system_invariants()` | `TABLE(code text, severity text, title text, offenders bigint, sample jsonb, checked_at timestamp with time zone) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S411:16 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_raw()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S412:107 | `CREATE OR REPLACE FUNCTION public.sync_shared_cost_mirror()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S413:4 | `CREATE OR REPLACE FUNCTION public.event_close_blockers(_event_id uuid)` | `jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S414:1 | `CREATE OR REPLACE FUNCTION public.get_partner_bp_realized(p_event_id uuid)` | `jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S415:12 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_raw()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S416:1 | `CREATE OR REPLACE FUNCTION public.enforce_transaction_approval_permission()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S417:62 | `CREATE OR REPLACE FUNCTION public.card_load_on_out_paid()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S419:1 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_raw()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S420:12 | `CREATE OR REPLACE FUNCTION public.create_card_session_load( p_session_id uuid, p_amount numeric, p_load_date date, p_source_account_id uuid, p_notes text DEFAULT NULL )` | `uuid LANGUAGE plpgsql SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S420:84 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_raw()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S421:56 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_extra()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S421:113 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S421:130 | `CREATE OR REPLACE FUNCTION public.run_invariant_checks()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S422:31 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_extra()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S423:1 | `CREATE OR REPLACE FUNCTION public.create_card_session_load( p_session_id uuid, p_amount numeric, p_load_date date, p_source_account_id uuid, p_notes text DEFAULT NULL )` | `uuid LANGUAGE plpgsql SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S424:383 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_extra()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S425:1 | `CREATE OR REPLACE FUNCTION public.launch_from_bank_lines(p_items jsonb)` | `uuid[] LANGUAGE plpgsql SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S426:1 | `CREATE OR REPLACE FUNCTION public.launch_from_bank_lines(p_items jsonb)` | `uuid[] LANGUAGE plpgsql SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S427:21 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_extra()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S428:9 | `CREATE OR REPLACE FUNCTION public.sync_paid_amount_from_payments()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S428:118 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_extra()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S430:17 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_extra()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S431:42 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_extra()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S433:45 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_secrets()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S433:81 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S434:15 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_infra()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S434:49 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S435:41 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_secdef()` | `TABLE(name text, current_count bigint, reference_count bigint, conforme boolean, severity text, scope text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public','pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S436:3 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_secdef()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S436:40 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S437:12 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_docs()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S437:68 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S438:1 | `CREATE OR REPLACE FUNCTION public.create_bp_snapshot(_event_id uuid, _description text DEFAULT NULL::text, _approve_immediately boolean DEFAULT false, _scenario_label text DEFAULT NULL::text, _scenario_assumptions jsonb DEFAULT NULL::jsonb, _is_pinned_scenario boolean DEFAULT false, _created_by uuid DEFAULT NULL::uuid, _created_by_label text DEFAULT NULL::text)` | `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S439:1 | `CREATE OR REPLACE FUNCTION public.enforce_transaction_approval_permission()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S441:5 | `CREATE OR REPLACE FUNCTION public.reconcile_bank_line(p_line_id uuid, p_items jsonb)` | `void LANGUAGE plpgsql SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S442:45 | `CREATE OR REPLACE FUNCTION public.reduce_forecast_budget( _forecast_id uuid, _new_amount numeric, _observation text )` | `public.event_forecasts LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S442:144 | `CREATE OR REPLACE FUNCTION public.event_close_blockers(_event_id uuid)` | `jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S443:4 | `CREATE OR REPLACE FUNCTION public.enforce_tx_forecast_same_event()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S443:89 | `CREATE OR REPLACE FUNCTION public.enforce_forecast_amount_floor()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S443:161 | `CREATE OR REPLACE FUNCTION public.reduce_forecast_budget(_forecast_id uuid, _new_amount numeric, _observation text)` | `event_forecasts LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S444:23 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_infra()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S445:2 | `CREATE OR REPLACE FUNCTION public._derive_paid_amount(p_tx_id uuid)` | `void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S445:51 | `CREATE OR REPLACE FUNCTION public.sync_paid_amount_from_payments()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S445:104 | `CREATE OR REPLACE FUNCTION public.validate_transaction_offset()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S445:174 | `CREATE OR REPLACE FUNCTION public._apply_transaction_offset(p_offset_id uuid, p_origin_payment_id uuid)` | `uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S445:239 | `CREATE OR REPLACE FUNCTION public._reverse_transaction_offsets_for(p_tx_id uuid)` | `void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S445:311 | `CREATE OR REPLACE FUNCTION public.transaction_offset_create( p_receivable uuid, p_payable uuid, p_amount numeric, p_note text DEFAULT NULL)` | `uuid LANGUAGE plpgsql SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S445:337 | `CREATE OR REPLACE FUNCTION public.transaction_offset_remove(p_offset_id uuid)` | `void LANGUAGE plpgsql SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S445:374 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_extra()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S446:302 | `CREATE OR REPLACE FUNCTION public.admin_cost_override_write( p_reason text, p_row jsonb, p_transaction_id uuid DEFAULT NULL )` | `uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S448:3 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_docs()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S449:9 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_extra()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S450:3 | `CREATE OR REPLACE FUNCTION public._paid_guard_is_exempt(p public.transactions)` | `boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S450:12 | `CREATE OR REPLACE FUNCTION public.guard_paid_amount_vs_payments()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S450:29 | `CREATE OR REPLACE FUNCTION public.materialize_paid_amount_payment()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S450:81 | `CREATE OR REPLACE FUNCTION public.launch_from_bank_lines(p_items jsonb)` | `uuid[] LANGUAGE plpgsql SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S450:271 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_paid()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S450:304 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S451:13 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_cash()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S451:38 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S452:8 | `CREATE OR REPLACE FUNCTION public.save_ticket_office_settlement( p_settlement_id uuid, p_payload jsonb, p_confirm boolean, p_selected jsonb, p_transfer jsonb, p_retained_payment_notes text, p_remainder_payment_notes text, p_audit_user text )` | `jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | 70, 143 |
| S454:5 | `CREATE OR REPLACE FUNCTION public.save_ticket_office_settlement( p_settlement_id uuid, p_payload jsonb, p_confirm boolean, p_selected jsonb, p_transfer jsonb, p_retained_payment_notes text, p_remainder_payment_notes text, p_audit_user text )` | `jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | 63, 137 |
| S455:8 | `CREATE OR REPLACE FUNCTION public.get_partner_settlement_summary(_event_id uuid, _settlement_id uuid, _partner_share numeric DEFAULT 0, _transfer_with_vat boolean DEFAULT false)` | `TABLE(partner_share numeric, disbursement numeric, adjustments numeric, revenues_held numeric, extras numeric, transfer_base numeric, transfer_vat numeric, transfer_total numeric) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S456:2 | `CREATE OR REPLACE FUNCTION public.guard_frozen_settlement_participant()` | `trigger LANGUAGE plpgsql SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S456:49 | `CREATE OR REPLACE FUNCTION public.guard_frozen_partner_extras()` | `trigger LANGUAGE plpgsql SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S016:5 | `CREATE OR REPLACE FUNCTION public.approve_transactions_atomic( p_ids uuid[], p_raises jsonb, p_caller_name text )` | `jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | 41, 55, 174 |
| S017:3 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_cards()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S017:45 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S019:26 | `CREATE OR REPLACE FUNCTION public._scope_event_ids_to_company(_event_ids uuid[])` | `uuid[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S019:169 | `CREATE FUNCTION public.analyze_formalidade_bulk(_event_ids uuid[] DEFAULT NULL::uuid[])` | `TABLE(forecast_id uuid, event_id uuid, event_name text, description text, category_code text, category_name text, bp_amount numeric, current_formalidade bp_formalidade, suggested_formalidade bp_formalidade, confidence text, reason text, paid_total numeric, approved_total numeric, has_transaction boolean) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S019:177 | `CREATE FUNCTION public.formalidade_audit_stats(_event_ids uuid[] DEFAULT NULL::uuid[])` | `TABLE(total_lines integer, total_events integer, with_direct_tx integer, with_category_match integer, without_any_match integer, count_estimado integer, count_fechado integer, count_pago_parcial integer, count_pago_total integer) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S020:6 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_tenant()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S020:57 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S021:37 | `CREATE OR REPLACE FUNCTION public.recalculate_pax_benchmarks(_company_id uuid DEFAULT NULL::uuid)` | `integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S022:9 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_duplicate_invoices()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S022:44 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S023:2 | `CREATE OR REPLACE FUNCTION public.reimbursement_propagate_payment()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S023:50 | `CREATE OR REPLACE FUNCTION public.get_partner_settlement_summary(_event_id uuid, _settlement_id uuid, _partner_share numeric DEFAULT 0, _transfer_with_vat boolean DEFAULT false)` | `TABLE(partner_share numeric, disbursement numeric, adjustments numeric, revenues_held numeric, extras numeric, transfer_base numeric, transfer_vat numeric, transfer_total numeric) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S024:7 | `CREATE OR REPLACE FUNCTION public._camarim_fund_move_legs(p_move_id uuid)` | `TABLE(bank_tx uuid, session_tx uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S024:39 | `CREATE OR REPLACE FUNCTION public.camarim_sync_session_leg_payment(p_tx uuid)` | `void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S024:128 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_camarim()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S024:154 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S025:136 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_suppliers()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S025:155 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S026:8 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_paid_below_gross()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S026:41 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S028:1 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_raw()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S029:3 | `CREATE OR REPLACE FUNCTION public.get_partner_event_partner_expenses(p_event_ids uuid[])` | `TABLE(kind text, id uuid, event_id uuid, notes text, entry_date date, description text, base_amount numeric, iva_rate numeric, total_amount numeric, created_at timestamp with time zone) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S030:3 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_ticketline_series()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S030:48 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S031:2 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_unreachable_docs()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'storage', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S031:35 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S032:20 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_isolation()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S032:70 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S033:86 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_storage()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'storage', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S033:151 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S034:1 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_storage()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'storage', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S035:2 | `CREATE OR REPLACE FUNCTION public._partner_extra_assert_can_write(p_event_id uuid)` | `void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S035:21 | `CREATE OR REPLACE FUNCTION public.convert_transaction_to_partner_extra( p_tx_id uuid, p_partner_id uuid, p_event_id uuid, p_notes text DEFAULT NULL, p_clear_forecast boolean DEFAULT true)` | `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | 27 |
| S035:56 | `CREATE OR REPLACE FUNCTION public.revert_partner_extra(p_tx_id uuid, p_clear_transitory boolean DEFAULT true)` | `integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | 61 |
| S035:83 | `CREATE OR REPLACE FUNCTION public.clear_reversal_on_repay()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S035:109 | `CREATE OR REPLACE FUNCTION public.audit_transactions_change()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S035:148 | `CREATE OR REPLACE FUNCTION public.reconcile_bank_line(p_line_id uuid, p_items jsonb)` | `void LANGUAGE plpgsql SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S036:4 | `CREATE OR REPLACE FUNCTION public.delete_transaction_cascade( p_transaction_id uuid, p_reason text DEFAULT NULL, p_cascade_invoice_group boolean DEFAULT true, p_caller_name text DEFAULT NULL )` | `jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | 39 |
| S036:107 | `CREATE OR REPLACE FUNCTION public.reverse_ticket_office_settlement(p_settlement_id uuid, p_reason text, p_caller_name text DEFAULT NULL)` | `jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | 125 |
| S036:195 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_rateio()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S036:224 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S037:1 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_rateio()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S038:27 | `CREATE OR REPLACE FUNCTION public.update_planned_installments(p_transaction_id uuid, p_rows jsonb, p_changed_by text)` | `int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | 32, 48 |
| S038:86 | `CREATE OR REPLACE FUNCTION public.split_transaction_by_bp_lines(p_transaction_id uuid, p_lines jsonb, p_changed_by text)` | `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | 91 |
| S039:2 | `CREATE OR REPLACE FUNCTION public.collect_event_benchmarks(_event_id uuid)` | `jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S039:66 | `CREATE OR REPLACE FUNCTION public.seal_event_settlement(_settlement_id uuid, _snapshot jsonb, _bp_version_id uuid DEFAULT NULL::uuid, _note text DEFAULT NULL::text)` | `jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S040:2 | `CREATE OR REPLACE FUNCTION public.collect_event_benchmarks(_event_id uuid)` | `jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S041:3 | `CREATE OR REPLACE FUNCTION public.bp_tx_link_allowed(_tx_event uuid, _tx_company uuid, _fc_event uuid, _fc_company uuid)` | `boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S041:21 | `CREATE OR REPLACE FUNCTION public.sync_tx_forecast_to_anchor()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S042:8 | `CREATE OR REPLACE FUNCTION public.enforce_payment_list_batch_channel()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S045:13 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_cash()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S045:38 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S046:8 | `CREATE OR REPLACE FUNCTION public.save_ticket_office_settlement( p_settlement_id uuid, p_payload jsonb, p_confirm boolean, p_selected jsonb, p_transfer jsonb, p_retained_payment_notes text, p_remainder_payment_notes text, p_audit_user text )` | `jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | 70, 143 |
| S048:5 | `CREATE OR REPLACE FUNCTION public.save_ticket_office_settlement( p_settlement_id uuid, p_payload jsonb, p_confirm boolean, p_selected jsonb, p_transfer jsonb, p_retained_payment_notes text, p_remainder_payment_notes text, p_audit_user text )` | `jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | 63, 137 |
| S049:12 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_dre_nature()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S049:49 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S051:1 | `CREATE OR REPLACE FUNCTION public.enforce_transaction_approval_permission()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | 101 |
| S054:2 | `CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)` | `boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S054:20 | `CREATE OR REPLACE FUNCTION public.has_permission_in(_user_id uuid, _permission text, _company_id uuid)` | `boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S056:75 | `CREATE OR REPLACE FUNCTION public.cache_max_contracts()` | `int LANGUAGE sql IMMUTABLE SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S056:78 | `CREATE OR REPLACE FUNCTION public._cache_alloc(p_total numeric, p_weights numeric[], p_absorber int)` | `numeric[] LANGUAGE plpgsql IMMUTABLE SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S056:93 | `CREATE OR REPLACE FUNCTION public._cache_assert_actor()` | `uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S056:106 | `CREATE OR REPLACE FUNCTION public._cache_cities(p_root uuid, p_artist uuid)` | `TABLE(idx int, event_id uuid, event_name text, event_date date, forecast_id uuid, cap numeric, is_absorber boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S056:128 | `CREATE OR REPLACE FUNCTION public._cache_category(p_company uuid)` | `uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S056:133 | `CREATE OR REPLACE FUNCTION public._cache_free_advances(p_root uuid, p_artist uuid)` | `TABLE(tx_id uuid, event_id uuid, amount numeric, legacy boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S056:150 | `CREATE OR REPLACE FUNCTION public._cache_create_contract( p_uid uuid, p_root uuid, p_artist uuid, p_beneficiary uuid, p_gross numeric, p_wh_applies boolean, p_wh_rate numeric, p_wh_due date, p_artist_due date, p_advance_ids uuid[], p_label text, p_key text )` | `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | 203 |
| S056:331 | `CREATE OR REPLACE FUNCTION public._cache_cancel_contract(p_uid uuid, p_contract uuid, p_reason text)` | `void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | 335, 338 |
| S056:406 | `CREATE OR REPLACE FUNCTION public.create_cache_advance( p_event_id uuid, p_artist_supplier_id uuid, p_supplier_id uuid, p_amount numeric, p_due_date date, p_description text DEFAULT NULL, p_idempotency_key text DEFAULT NULL )` | `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | 418 |
| S056:463 | `CREATE OR REPLACE FUNCTION public.add_cache_contract_advance( p_contract_id uuid, p_amount numeric, p_due_date date, p_description text DEFAULT NULL, p_idempotency_key text DEFAULT NULL )` | `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | 473, 478, 481, 491 |
| S056:543 | `CREATE OR REPLACE FUNCTION public.cache_contract_context(p_event_id uuid, p_artist_supplier_id uuid)` | `jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S056:617 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_cache_contracts()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S056:659 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S057:7 | `CREATE OR REPLACE FUNCTION public._cache_guc_choices()` | `jsonb LANGUAGE sql STABLE SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S057:16 | `CREATE OR REPLACE FUNCTION public._cache_event_in_closing(p_root uuid)` | `boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S057:26 | `CREATE OR REPLACE FUNCTION public._cache_resolve_lines(p_root uuid, p_artist uuid, p_choices jsonb DEFAULT NULL)` | `TABLE(event_id uuid, event_name text, event_date date, forecast_id uuid, cap numeric, source text, cache_config_id uuid, frozen boolean, candidates jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S057:110 | `CREATE OR REPLACE FUNCTION public._cache_cities_x(p_root uuid, p_artist uuid, p_choices jsonb DEFAULT NULL)` | `TABLE(idx int, event_id uuid, event_name text, event_date date, forecast_id uuid, cap numeric, is_absorber boolean, source text, cache_config_id uuid, frozen boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S057:124 | `CREATE OR REPLACE FUNCTION public._cache_cities(p_root uuid, p_artist uuid)` | `TABLE(idx int, event_id uuid, event_name text, event_date date, forecast_id uuid, cap numeric, is_absorber boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S057:130 | `CREATE OR REPLACE FUNCTION public._cache_assert_lines(p_root uuid, p_artist uuid, p_choices jsonb DEFAULT NULL)` | `void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S057:142 | `CREATE OR REPLACE FUNCTION public._cache_free_advances_x(p_root uuid, p_artist uuid, p_choices jsonb DEFAULT NULL)` | `TABLE(tx_id uuid, event_id uuid, amount numeric, legacy boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S057:160 | `CREATE OR REPLACE FUNCTION public._cache_free_advances(p_root uuid, p_artist uuid)` | `TABLE(tx_id uuid, event_id uuid, amount numeric, legacy boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S057:212 | `CREATE OR REPLACE FUNCTION public.create_cache_advance( p_event_id uuid, p_artist_supplier_id uuid, p_supplier_id uuid, p_amount numeric, p_due_date date, p_description text DEFAULT NULL, p_idempotency_key text DEFAULT NULL, p_line_choices jsonb DEFAULT NULL )` | `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | 225 |
| S058:6 | `CREATE OR REPLACE FUNCTION public._cache_cancel_contract(p_uid uuid, p_contract uuid, p_reason text)` | `void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS`; owner efetivo pendente | 12, 15, 29, 77 |
| S059:3 | `CREATE OR REPLACE FUNCTION public.attach_cache_advance_to_contract(p_contract_id uuid, p_advance_tx_id uuid, p_confirm_beneficiary boolean DEFAULT false)` | `jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | 19, 20, 21, 40, 41, 111 |
| S059:134 | `CREATE OR REPLACE FUNCTION public.cache_contract_context(p_event_id uuid, p_artist_supplier_id uuid)` | `jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S059:198 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_cache_contracts()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S060:2 | `CREATE OR REPLACE FUNCTION public.guard_frozen_settlement_participant()` | `trigger LANGUAGE plpgsql SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S060:49 | `CREATE OR REPLACE FUNCTION public.guard_frozen_partner_extras()` | `trigger LANGUAGE plpgsql SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S063:4 | `CREATE OR REPLACE FUNCTION public._partner_contract_share(_participant_id uuid)` | `numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | 14, 18 |
| S063:35 | `CREATE OR REPLACE FUNCTION public._partner_contract_assert_unpaid(_ids uuid[])` | `void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | 39 |
| S063:58 | `CREATE OR REPLACE FUNCTION public._partner_contract_advance(_participant_id uuid, _tx_id uuid, _beneficiary uuid, _confirm boolean)` | `numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | 64 |
| S063:85 | `CREATE OR REPLACE FUNCTION public.create_partner_payment_contract( _participant_id uuid, _beneficiary uuid, _gross numeric, _wh_applies boolean, _wh_rate numeric, _wh_due date, _due date, _advance_ids uuid[] DEFAULT '{}'::uuid[], _label text DEFAULT NULL, _key text DEFAULT NULL)` | `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | 111 |
| S063:159 | `CREATE OR REPLACE FUNCTION public.cancel_partner_payment_contract(_contract_id uuid, _reason text)` | `jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | 166 |
| S063:228 | `CREATE OR REPLACE FUNCTION public.attach_partner_advance_to_contract(_contract_id uuid, _advance_tx_id uuid, _confirm_beneficiary boolean DEFAULT false)` | `jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | 235, 237, 241 |
| S063:262 | `CREATE OR REPLACE FUNCTION public.partner_contract_status(_participant_id uuid)` | `jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S065:28 | `CREATE FUNCTION public._event_stage_access(p_event_id uuid,p_mode text DEFAULT 'read')` | `public.events LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S065:47 | `CREATE FUNCTION public.event_stage(p_event_id uuid)` | `text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S065:64 | `CREATE FUNCTION public.event_close_checklist(p_event_id uuid)` | `jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S065:92 | `CREATE FUNCTION public.close_event(p_event_id uuid,p_reason text DEFAULT NULL)` | `jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS`; owner efetivo pendente | 95, 100, 101 |
| S065:111 | `CREATE FUNCTION public.reopen_event_closure(p_event_id uuid,p_reason text)` | `jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS`; owner efetivo pendente | 115 |
| S066:3 | `CREATE OR REPLACE FUNCTION public.event_stage(p_event_id uuid)` | `text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S066:24 | `CREATE OR REPLACE FUNCTION public.event_close_checklist(p_event_id uuid)` | `jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S066:61 | `CREATE OR REPLACE FUNCTION public.close_event(p_event_id uuid,p_reason text DEFAULT NULL)` | `jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS`; owner efetivo pendente | 64, 70, 71 |
| S066:81 | `CREATE OR REPLACE FUNCTION public.reopen_event_closure(p_event_id uuid,p_reason text)` | `jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS`; owner efetivo pendente | 85 |
| S067:6 | `CREATE FUNCTION public.get_financial_position_base(p_company_id uuid, p_year integer DEFAULT NULL)` | `jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S068:12 | `CREATE OR REPLACE FUNCTION public.get_financial_position_base(p_company_id uuid, p_year integer DEFAULT NULL)` | `jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S069:5 | `CREATE OR REPLACE FUNCTION public.get_financial_position_base(p_company_id uuid, p_year integer DEFAULT NULL)` | `jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S070:5 | `CREATE OR REPLACE FUNCTION public.get_financial_position_base(p_company_id uuid, p_year integer DEFAULT NULL)` | `jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S071:5 | `CREATE OR REPLACE FUNCTION public.reimbursement_payment_force_exclude()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S071:60 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_extra()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S072:3 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_extra()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S073:3 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_extra()` | `TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S074:91 | `CREATE OR REPLACE FUNCTION public.get_financial_position_base(p_company_id uuid, p_year integer DEFAULT NULL)` | `jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S075:1 | `CREATE OR REPLACE FUNCTION public.storage_path_belongs_to_current_company(_name text)` | `boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S076:1 | `create or replace function public.sync_partner_aporte_mirror()` | `trigger language plpgsql security definer set search_path = public as`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S078:65 | `CREATE OR REPLACE FUNCTION public.propagate_house_only_to_transactions()` | `trigger LANGUAGE plpgsql SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S079:64 | `CREATE OR REPLACE FUNCTION public.card_load_on_out_paid()` | `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS`; owner efetivo pendente | Sem FOR UPDATE/advisory explícito |
| S080:253 | `CREATE OR REPLACE FUNCTION public.reconcile_bank_line(p_line_id uuid, p_items jsonb)` | `void LANGUAGE plpgsql SET search_path TO 'public' AS`; owner efetivo pendente | 298, 466 |

### C2 — ligações de triggers e remoções

| Fonte:linha | Declaração / ligação |
|---|---|
| S200:29 | `CREATE TRIGGER update_account_categories_updated_at BEFORE UPDATE ON public.account_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();` |
| S200:51 | `CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();` |
| S200:75 | `CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();` |
| S200:102 | `CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();` |
| S200:144 | `CREATE TRIGGER update_quotations_updated_at BEFORE UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();` |
| S208:40 | `CREATE TRIGGER update_payment_lists_updated_at BEFORE UPDATE ON public.payment_lists FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();` |
| S215:36 | `CREATE TRIGGER update_recurring_transactions_updated_at BEFORE UPDATE ON public.recurring_transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();` |
| S224:95 | `CREATE TRIGGER update_reimbursement_notes_updated_at BEFORE UPDATE ON public.reimbursement_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();` |
| S228:37 | `CREATE TRIGGER update_supplier_credits_updated_at BEFORE UPDATE ON public.supplier_credits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();` |
| S229:15 | `CREATE TRIGGER enforce_paid_payment_date BEFORE INSERT OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.validate_paid_requires_payment_date();` |
| S233:51 | `CREATE TRIGGER update_cache_payments_updated_at BEFORE UPDATE ON public.event_cache_payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();` |
| S237:60 | `CREATE TRIGGER update_transaction_payments_updated_at BEFORE UPDATE ON public.transaction_payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();` |
| S238:42 | `CREATE TRIGGER trg_settlements_updated_at BEFORE UPDATE ON public.ticket_office_settlements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();` |
| S243:35 | `CREATE TRIGGER update_partner_advance_expenses_updated_at BEFORE UPDATE ON public.partner_advance_expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();` |
| S246:53 | `drop trigger if exists trg_protect_master_split_forecast_links on public.event_forecasts;` |
| S246:55 | `create trigger trg_protect_master_split_forecast_links before update on public.event_forecasts for each row execute function public.protect_master_split_forecast_links();` |
| S248:241 | `CREATE TRIGGER update_camarim_sessions_updated_at BEFORE UPDATE ON public.camarim_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();` |
| S248:246 | `CREATE TRIGGER update_camarim_fund_moves_updated_at BEFORE UPDATE ON public.camarim_fund_moves FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();` |
| S248:251 | `CREATE TRIGGER update_camarim_items_updated_at BEFORE UPDATE ON public.camarim_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();` |
| S250:42 | `DROP TRIGGER IF EXISTS trg_enforce_pinned_scenario_limit ON public.bp_versions;` |
| S250:43 | `CREATE TRIGGER trg_enforce_pinned_scenario_limit BEFORE INSERT OR UPDATE OF is_pinned_scenario ON public.bp_versions FOR EACH ROW EXECUTE FUNCTION public.enforce_pinned_scenario_limit();` |
| S263:70 | `CREATE TRIGGER trg_log_formalidade_change BEFORE UPDATE OF formalidade ON public.event_forecasts FOR EACH ROW EXECUTE FUNCTION public.log_formalidade_change();` |
| S273:22 | `DROP TRIGGER IF EXISTS trg_companies_updated_at ON public.companies;` |
| S273:23 | `CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();` |
| S274:225 | `CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert()', v_table );` |
| S275:73 | `CREATE TRIGGER set_company_id_trigger BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert()', t );` |
| S276:68 | `CREATE TRIGGER set_company_id_trigger BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert()', t );` |
| S278:21 | `DROP TRIGGER IF EXISTS trg_companies_updated_at ON public.companies;` |
| S278:22 | `CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();` |
| S279:32 | `CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert()', r.table_name );` |
| S291:85 | `CREATE TRIGGER trg_sim_curve_updated_at BEFORE UPDATE ON public.event_simulator_sales_curve_buckets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();` |
| S291:113 | `CREATE TRIGGER trg_sim_bench_updated_at BEFORE UPDATE ON public.event_simulator_pax_benchmarks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();` |
| S298:57 | `DROP TRIGGER IF EXISTS trg_reimbursement_propagate_payment ON public.transactions;` |
| S298:58 | `CREATE TRIGGER trg_reimbursement_propagate_payment AFTER INSERT OR UPDATE OF status, paid_amount, payment_date ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.reimbursement_propagate_payment();` |
| S298:84 | `DROP TRIGGER IF EXISTS trg_reimbursement_revert_on_tx_delete ON public.transactions;` |
| S298:85 | `CREATE TRIGGER trg_reimbursement_revert_on_tx_delete BEFORE DELETE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.reimbursement_revert_on_tx_delete();` |
| S300:51 | `CREATE TRIGGER trg_meta_creatives_updated_at BEFORE UPDATE ON crm.meta_creatives FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();` |
| S305:203 | `CREATE TRIGGER trg_coala_capture_category_change AFTER INSERT OR UPDATE OF category_id ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.coala_capture_category_change();` |
| S306:108 | `DROP TRIGGER IF EXISTS trg_enforce_tx_category_l2_match ON public.transactions;` |
| S306:109 | `CREATE TRIGGER trg_enforce_tx_category_l2_match BEFORE INSERT OR UPDATE OF category_id ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.enforce_tx_category_l2_match();` |
| S306:149 | `DROP TRIGGER IF EXISTS trg_enforce_forecast_tx_link_l2_match ON public.event_forecasts;` |
| S306:150 | `CREATE TRIGGER trg_enforce_forecast_tx_link_l2_match BEFORE INSERT OR UPDATE OF transaction_id, category_id ON public.event_forecasts FOR EACH ROW EXECUTE FUNCTION public.enforce_forecast_tx_link_l2_match();` |
| S306:216 | `DROP TRIGGER IF EXISTS trg_coala_capture_forecast_category_change ON public.event_forecasts;` |
| S306:217 | `CREATE TRIGGER trg_coala_capture_forecast_category_change AFTER INSERT OR UPDATE OF category_id ON public.event_forecasts FOR EACH ROW EXECUTE FUNCTION public.coala_capture_forecast_category_change();` |
| S309:123 | `DROP TRIGGER IF EXISTS trg_sync_paid_amount_from_payments ON public.transaction_payments;` |
| S309:124 | `CREATE TRIGGER trg_sync_paid_amount_from_payments AFTER INSERT OR UPDATE OR DELETE ON public.transaction_payments FOR EACH ROW EXECUTE FUNCTION public.sync_paid_amount_from_payments();` |
| S309:190 | `DROP TRIGGER IF EXISTS trg_validate_installments_total ON public.transaction_payments;` |
| S309:191 | `CREATE TRIGGER trg_validate_installments_total BEFORE INSERT OR UPDATE ON public.transaction_payments FOR EACH ROW EXECUTE FUNCTION public.validate_installments_total();` |
| S320:156 | `DROP TRIGGER IF EXISTS audit_event_forecasts_changes ON public.event_forecasts;` |
| S320:157 | `CREATE TRIGGER audit_event_forecasts_changes AFTER INSERT OR UPDATE OR DELETE ON public.event_forecasts FOR EACH ROW EXECUTE FUNCTION public.log_table_change();` |
| S325:32 | `CREATE TRIGGER trg_card_sessions_updated_at BEFORE UPDATE ON public.card_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();` |
| S325:80 | `CREATE TRIGGER trg_card_session_items_updated_at BEFORE UPDATE ON public.card_session_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();` |
| S327:57 | `DROP TRIGGER IF EXISTS trg_card_load_on_out_paid ON public.transactions;` |
| S327:58 | `CREATE TRIGGER trg_card_load_on_out_paid AFTER UPDATE OF status ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.card_load_on_out_paid();` |
| S327:88 | `DROP TRIGGER IF EXISTS trg_card_load_on_out_delete ON public.transactions;` |
| S327:89 | `CREATE TRIGGER trg_card_load_on_out_delete BEFORE DELETE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.card_load_on_out_delete();` |
| S335:76 | `CREATE TRIGGER update_atr_updated_at BEFORE UPDATE ON public.accountant_transaction_reviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();` |
| S336:35 | `CREATE TRIGGER trg_payment_list_items_bankable BEFORE INSERT ON public.payment_list_items FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_list_item_bankable();` |
| S338:25 | `DROP TRIGGER IF EXISTS trg_enforce_tx_paid_requires_account ON public.transactions;` |
| S338:26 | `CREATE TRIGGER trg_enforce_tx_paid_requires_account BEFORE INSERT ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.enforce_tx_paid_requires_account();` |
| S347:23 | `DROP TRIGGER IF EXISTS trg_enforce_tx_category_l2_match ON public.transactions;` |
| S347:24 | `DROP TRIGGER IF EXISTS trg_enforce_forecast_tx_link_l2_match ON public.event_forecasts;` |
| S347:72 | `CREATE TRIGGER trg_sync_tx_category_from_forecast AFTER INSERT OR UPDATE OF category_id, transaction_id ON public.event_forecasts FOR EACH ROW EXECUTE FUNCTION public.sync_tx_category_from_forecast();` |
| S347:121 | `CREATE TRIGGER trg_realign_tx_category_from_forecast AFTER UPDATE OF category_id ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.realign_tx_category_from_forecast();` |
| S348:59 | `DROP TRIGGER IF EXISTS trg_enforce_forecast_tx_same_event ON public.event_forecasts;` |
| S348:60 | `CREATE TRIGGER trg_enforce_forecast_tx_same_event BEFORE INSERT OR UPDATE OF transaction_id ON public.event_forecasts FOR EACH ROW EXECUTE FUNCTION public.enforce_forecast_tx_same_event();` |
| S348:100 | `DROP TRIGGER IF EXISTS trg_unlink_forecasts_on_tx_event_change ON public.transactions;` |
| S348:101 | `CREATE TRIGGER trg_unlink_forecasts_on_tx_event_change AFTER UPDATE OF event_id ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.unlink_forecasts_on_tx_event_change();` |
| S352:80 | `DROP TRIGGER IF EXISTS trg_validate_event_forecast_partner_roles ON public.event_forecasts;` |
| S352:81 | `CREATE TRIGGER trg_validate_event_forecast_partner_roles BEFORE INSERT OR UPDATE OF event_id, ordering_partner_id, paying_partner_id ON public.event_forecasts FOR EACH ROW EXECUTE FUNCTION public.validate_event_forecast_partner_roles();` |
| S353:34 | `DROP TRIGGER IF EXISTS trg_force_transitory_capital ON public.transactions;` |
| S353:36 | `CREATE TRIGGER trg_force_transitory_capital BEFORE INSERT OR UPDATE OF category_id ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.force_transitory_for_capital_branch();` |
| S354:60 | `CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.partner_capital_moves FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();` |
| S354:63 | `CREATE TRIGGER trg_partner_capital_moves_updated_at BEFORE UPDATE ON public.partner_capital_moves FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();` |
| S359:85 | `CREATE TRIGGER trg_sync_forecast_anchor_to_tx AFTER INSERT OR UPDATE OF transaction_id ON public.event_forecasts FOR EACH ROW EXECUTE FUNCTION public.sync_forecast_anchor_to_tx();` |
| S359:89 | `CREATE TRIGGER trg_sync_tx_forecast_to_anchor AFTER INSERT OR UPDATE OF forecast_id ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.sync_tx_forecast_to_anchor();` |
| S362:103 | `DROP TRIGGER IF EXISTS trg_validate_paid_amount_not_exceeds_gross ON public.transactions;` |
| S362:104 | `CREATE TRIGGER trg_validate_paid_amount_not_exceeds_gross BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.validate_paid_amount_not_exceeds_gross();` |
| S371:18 | `DROP TRIGGER IF EXISTS set_forecast_baseline_amount_trg ON public.event_forecasts;` |
| S371:19 | `CREATE TRIGGER set_forecast_baseline_amount_trg BEFORE INSERT ON public.event_forecasts FOR EACH ROW EXECUTE FUNCTION public.set_forecast_baseline_amount();` |
| S372:36 | `DROP TRIGGER IF EXISTS enforce_transaction_approval_permission ON public.transactions;` |
| S372:37 | `CREATE TRIGGER enforce_transaction_approval_permission BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.enforce_transaction_approval_permission();` |
| S373:36 | `DROP TRIGGER IF EXISTS enforce_transaction_approval_permission ON public.transactions;` |
| S373:38 | `CREATE TRIGGER enforce_transaction_approval_permission BEFORE INSERT OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.enforce_transaction_approval_permission();` |
| S376:117 | `DROP TRIGGER IF EXISTS enforce_event_close_blockers ON public.events;` |
| S376:118 | `CREATE TRIGGER enforce_event_close_blockers BEFORE UPDATE OF status ON public.events FOR EACH ROW EXECUTE FUNCTION public.enforce_event_close_blockers();` |
| S386:20 | `DROP TRIGGER IF EXISTS trg_force_confidential_restricted_account ON public.transactions;` |
| S386:21 | `CREATE TRIGGER trg_force_confidential_restricted_account BEFORE INSERT OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.force_confidential_for_restricted_account();` |
| S400:26 | `CREATE TRIGGER validate_forecast_event_settlement BEFORE INSERT OR UPDATE OF event_settlement_id, event_id ON public.event_forecasts FOR EACH ROW EXECUTE FUNCTION public.validate_forecast_event_settlement();` |
| S400:48 | `CREATE TRIGGER validate_transaction_event_settlement BEFORE INSERT OR UPDATE OF event_settlement_id, event_id ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.validate_transaction_event_settlement();` |
| S400:64 | `CREATE TRIGGER prevent_delete_event_settlement_with_lines BEFORE DELETE ON public.event_settlements FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_event_settlement_with_lines();` |
| S402:67 | `DROP TRIGGER IF EXISTS trg_guard_sealed_event_settlement ON public.event_settlements;` |
| S402:68 | `CREATE TRIGGER trg_guard_sealed_event_settlement BEFORE INSERT OR UPDATE OR DELETE ON public.event_settlements FOR EACH ROW EXECUTE FUNCTION public.guard_sealed_event_settlement();` |
| S406:138 | `DROP TRIGGER IF EXISTS trg_enforce_held_revenue_is_paid ON public.transactions;` |
| S406:139 | `CREATE TRIGGER trg_enforce_held_revenue_is_paid BEFORE INSERT OR UPDATE OF held_by_supplier_id, status ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.enforce_held_revenue_is_paid();` |
| S412:101 | `DROP TRIGGER IF EXISTS trg_force_exclude_result_shared_cost ON public.transactions;` |
| S412:102 | `CREATE TRIGGER trg_force_exclude_result_shared_cost BEFORE INSERT OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.force_exclude_from_result_for_shared_cost();` |
| S412:196 | `DROP TRIGGER IF EXISTS trg_sync_shared_cost_mirror ON public.transactions;` |
| S412:197 | `CREATE TRIGGER trg_sync_shared_cost_mirror AFTER INSERT OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.sync_shared_cost_mirror();` |
| S412:201 | `DROP TRIGGER IF EXISTS trg_sync_shared_cost_mirror_del ON public.transactions;` |
| S412:202 | `CREATE TRIGGER trg_sync_shared_cost_mirror_del BEFORE DELETE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.sync_shared_cost_mirror();` |
| S417:56 | `DROP TRIGGER IF EXISTS trg_force_transitory_capital ON public.transactions;` |
| S417:57 | `CREATE TRIGGER trg_force_transitory_capital BEFORE INSERT OR UPDATE OF category_id, is_transitory ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.force_transitory_for_capital_branch();` |
| S440:40 | `DROP TRIGGER IF EXISTS enforce_payment_date_not_future ON public.transaction_payments;` |
| S440:42 | `CREATE TRIGGER enforce_payment_date_not_future BEFORE INSERT OR UPDATE ON public.transaction_payments FOR EACH ROW EXECUTE FUNCTION public.validate_payment_date_not_future();` |
| S443:83 | `DROP TRIGGER IF EXISTS trg_enforce_tx_forecast_same_event ON public.transactions;` |
| S443:84 | `CREATE TRIGGER trg_enforce_tx_forecast_same_event BEFORE INSERT OR UPDATE OF forecast_id, event_id ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.enforce_tx_forecast_same_event();` |
| S443:143 | `DROP TRIGGER IF EXISTS trg_enforce_forecast_amount_floor ON public.event_forecasts;` |
| S443:144 | `CREATE TRIGGER trg_enforce_forecast_amount_floor BEFORE UPDATE OF amount ON public.event_forecasts FOR EACH ROW EXECUTE FUNCTION public.enforce_forecast_amount_floor();` |
| S445:101 | `CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.transaction_offsets FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();` |
| S445:164 | `CREATE TRIGGER trg_validate_transaction_offset BEFORE INSERT OR UPDATE ON public.transaction_offsets FOR EACH ROW EXECUTE FUNCTION public.validate_transaction_offset();` |
| S445:307 | `CREATE TRIGGER trg_apply_transaction_offsets AFTER INSERT OR UPDATE OF status, reversed_at OR DELETE ON public.transaction_payments FOR EACH ROW EXECUTE FUNCTION public.apply_transaction_offsets();` |
| S446:268 | `DROP TRIGGER IF EXISTS trg_enforce_admin_window_event ON public.transactions;` |
| S446:269 | `CREATE TRIGGER trg_enforce_admin_window_event BEFORE INSERT OR UPDATE OF event_id, category_id, date, company_id, type ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.enforce_admin_window_event();` |
| S450:71 | `DROP TRIGGER IF EXISTS zz_guard_paid_amount_vs_payments ON public.transactions;` |
| S450:72 | `CREATE TRIGGER zz_guard_paid_amount_vs_payments BEFORE UPDATE OF paid_amount ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.guard_paid_amount_vs_payments();` |
| S450:76 | `DROP TRIGGER IF EXISTS zz_materialize_paid_amount_payment ON public.transactions;` |
| S450:77 | `CREATE TRIGGER zz_materialize_paid_amount_payment AFTER INSERT OR UPDATE OF paid_amount ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.materialize_paid_amount_payment();` |
| S456:45 | `CREATE TRIGGER trg_guard_frozen_settlement_participant BEFORE UPDATE OR DELETE ON public.event_settlement_participants FOR EACH ROW EXECUTE FUNCTION public.guard_frozen_settlement_participant();` |
| S456:71 | `CREATE TRIGGER trg_guard_frozen_partner_extras BEFORE INSERT OR UPDATE OR DELETE ON public.event_partner_extras FOR EACH ROW EXECUTE FUNCTION public.guard_frozen_partner_extras();` |
| S024:110 | `DROP TRIGGER IF EXISTS zz_camarim_session_leg_follows_bank ON public.transaction_payments;` |
| S024:111 | `CREATE TRIGGER zz_camarim_session_leg_follows_bank AFTER INSERT OR UPDATE OR DELETE ON public.transaction_payments FOR EACH ROW EXECUTE FUNCTION public.trg_camarim_session_leg_follows_bank();` |
| S035:104 | `DROP TRIGGER IF EXISTS trg_clear_reversal_on_repay ON public.transaction_payments;` |
| S035:105 | `CREATE TRIGGER trg_clear_reversal_on_repay AFTER INSERT ON public.transaction_payments FOR EACH ROW EXECUTE FUNCTION public.clear_reversal_on_repay();` |
| S035:139 | `DROP TRIGGER IF EXISTS zz_audit_transactions_change ON public.transactions;` |
| S035:140 | `CREATE TRIGGER zz_audit_transactions_change AFTER INSERT OR UPDATE OR DELETE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.audit_transactions_change();` |
| S042:56 | `DROP TRIGGER IF EXISTS trg_enforce_payment_list_batch_channel ON public.transaction_payments;` |
| S042:57 | `CREATE TRIGGER trg_enforce_payment_list_batch_channel BEFORE INSERT ON public.transaction_payments FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_list_batch_channel();` |
| S060:45 | `CREATE TRIGGER trg_guard_frozen_settlement_participant BEFORE UPDATE OR DELETE ON public.event_settlement_participants FOR EACH ROW EXECUTE FUNCTION public.guard_frozen_settlement_participant();` |
| S060:71 | `CREATE TRIGGER trg_guard_frozen_partner_extras BEFORE INSERT OR UPDATE OR DELETE ON public.event_partner_extras FOR EACH ROW EXECUTE FUNCTION public.guard_frozen_partner_extras();` |
| S064:77 | `CREATE TRIGGER zzz_partner_contract_guard BEFORE INSERT OR UPDATE OR DELETE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.guard_partner_contract_transactions();` |
| S064:79 | `CREATE TRIGGER zzz_partner_payment_contracts_guard BEFORE INSERT OR UPDATE OR DELETE ON public.partner_payment_contracts FOR EACH ROW EXECUTE FUNCTION public.guard_partner_payment_contracts();` |
| S065:25 | `CREATE TRIGGER z_stage_fields_guard BEFORE INSERT OR UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public._event_stage_guard();` |
| S065:26 | `CREATE TRIGGER zz_stage_legacy_reopen BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public._event_stage_legacy_reopen();` |
| S071:24 | `DROP TRIGGER IF EXISTS trg_reimbursement_payment_force_exclude ON public.reimbursement_notes;` |
| S071:25 | `CREATE TRIGGER trg_reimbursement_payment_force_exclude BEFORE INSERT OR UPDATE OF payment_transaction_id ON public.reimbursement_notes FOR EACH ROW EXECUTE FUNCTION public.reimbursement_payment_force_exclude();` |
| S071:47 | `DROP TRIGGER IF EXISTS trg_reimbursement_payment_guard_exclude ON public.transactions;` |
| S071:48 | `CREATE TRIGGER trg_reimbursement_payment_guard_exclude BEFORE UPDATE OF exclude_from_result ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.reimbursement_payment_guard_exclude();` |
| S077:64 | `CREATE TRIGGER trg_guard_excluded_from_partner_settlement BEFORE INSERT OR UPDATE OF excluded_from_partner_settlement ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.guard_excluded_from_partner_settlement();` |
| S077:67 | `CREATE TRIGGER trg_guard_forecast_excluded_from_partner_settlement BEFORE INSERT OR UPDATE OF excluded_from_partner_settlement ON public.event_forecasts FOR EACH ROW EXECUTE FUNCTION public.guard_excluded_from_partner_settlement();` |
| S078:58 | `CREATE TRIGGER trg_inherit_house_only_from_forecast BEFORE INSERT OR UPDATE OF forecast_id, excluded_from_partner_settlement, type, exclude_from_result, is_transitory, event_settlement_id ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.inherit_house_only_from_forecast();` |
| S078:88 | `CREATE TRIGGER trg_propagate_house_only_to_transactions AFTER UPDATE OF excluded_from_partner_settlement ON public.event_forecasts FOR EACH ROW EXECUTE FUNCTION public.propagate_house_only_to_transactions();` |

### C3 — políticas e ACL relevantes

| Fonte:linha | Instrução (nome/assinatura e alvo na fonte) |
|---|---|
| S200:72 | `CREATE POLICY "Transactions are viewable by authenticated users" ON public.transactions FOR SELECT TO authenticated USING (true);` |
| S200:73 | `CREATE POLICY "Transactions can be managed by authenticated users" ON public.transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);` |
| S200:99 | `CREATE POLICY "Suppliers are viewable by authenticated users" ON public.suppliers FOR SELECT TO authenticated USING (true);` |
| S200:100 | `CREATE POLICY "Suppliers can be managed by authenticated users" ON public.suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);` |
| S201:9 | `CREATE POLICY "Transactions are viewable by everyone" ON public.transactions FOR SELECT TO anon USING (true);` |
| S201:10 | `CREATE POLICY "Transactions can be managed by everyone" ON public.transactions FOR ALL TO anon USING (true) WITH CHECK (true);` |
| S201:16 | `CREATE POLICY "Suppliers are viewable by everyone" ON public.suppliers FOR SELECT TO anon USING (true);` |
| S201:17 | `CREATE POLICY "Suppliers can be managed by everyone" ON public.suppliers FOR ALL TO anon USING (true) WITH CHECK (true);` |
| S203:15 | `CREATE POLICY "Audit log is viewable by everyone" ON public.transaction_audit_log FOR SELECT TO anon USING (true);` |
| S203:16 | `CREATE POLICY "Audit log can be inserted by everyone" ON public.transaction_audit_log FOR INSERT TO anon WITH CHECK (true);` |
| S203:17 | `CREATE POLICY "Audit log is viewable by authenticated" ON public.transaction_audit_log FOR SELECT TO authenticated USING (true);` |
| S203:18 | `CREATE POLICY "Audit log can be inserted by authenticated" ON public.transaction_audit_log FOR INSERT TO authenticated WITH CHECK (true);` |
| S204:63 | `CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);` |
| S204:66 | `CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());` |
| S204:70 | `CREATE POLICY "Roles viewable by authenticated" ON public.user_roles FOR SELECT TO authenticated USING (true);` |
| S204:73 | `CREATE POLICY "Only admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));` |
| S205:14 | `CREATE POLICY "Transaction docs viewable by authenticated" ON public.transaction_documents FOR SELECT TO authenticated USING (true);` |
| S205:18 | `CREATE POLICY "Transaction docs insertable by authenticated" ON public.transaction_documents FOR INSERT TO authenticated WITH CHECK (true);` |
| S205:22 | `CREATE POLICY "Transaction docs deletable by authenticated" ON public.transaction_documents FOR DELETE TO authenticated USING (true);` |
| S211:22 | `CREATE POLICY "Financial accounts manageable by admin" ON public.financial_accounts FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));` |
| S213:16 | `CREATE POLICY "Role permissions manageable by admin" ON public.role_permissions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));` |
| S214:17 | `CREATE POLICY "User permissions manageable by admin" ON public.user_permissions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));` |
| S215:27 | `CREATE POLICY "Recurring transactions viewable by authenticated" ON public.recurring_transactions FOR SELECT TO authenticated USING (true);` |
| S215:31 | `CREATE POLICY "Recurring transactions manageable by authenticated" ON public.recurring_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);` |
| S216:3 | `DROP POLICY IF EXISTS "Transactions are viewable by everyone" ON public.transactions;` |
| S216:4 | `DROP POLICY IF EXISTS "Transactions can be managed by everyone" ON public.transactions;` |
| S216:7 | `DROP POLICY IF EXISTS "Suppliers are viewable by everyone" ON public.suppliers;` |
| S216:8 | `DROP POLICY IF EXISTS "Suppliers can be managed by everyone" ON public.suppliers;` |
| S216:22 | `DROP POLICY IF EXISTS "Audit log is viewable by everyone" ON public.transaction_audit_log;` |
| S216:23 | `DROP POLICY IF EXISTS "Audit log can be inserted by everyone" ON public.transaction_audit_log;` |
| S217:7 | `DROP POLICY IF EXISTS "Transactions can be managed by authenticated users" ON public.transactions;` |
| S217:10 | `CREATE POLICY "Transactions insertable by authenticated" ON public.transactions FOR INSERT TO authenticated WITH CHECK (true);` |
| S217:15 | `CREATE POLICY "Transactions updatable by authenticated" ON public.transactions FOR UPDATE TO authenticated USING (true);` |
| S217:20 | `CREATE POLICY "Transactions deletable by admin or manager" ON public.transactions FOR DELETE TO authenticated USING ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) );` |
| S217:28 | `DROP POLICY IF EXISTS "Suppliers can be managed by authenticated users" ON public.suppliers;` |
| S217:30 | `CREATE POLICY "Suppliers insertable by authenticated" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (true);` |
| S217:34 | `CREATE POLICY "Suppliers updatable by authenticated" ON public.suppliers FOR UPDATE TO authenticated USING (true);` |
| S217:38 | `CREATE POLICY "Suppliers deletable by admin or manager" ON public.suppliers FOR DELETE TO authenticated USING ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) );` |
| S217:56 | `CREATE POLICY "Quotations deletable by admin or manager" ON public.quotations FOR DELETE TO authenticated USING ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) );` |
| S217:74 | `CREATE POLICY "Supplier documents deletable by admin or manager" ON public.supplier_documents FOR DELETE TO authenticated USING ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) );` |
| S217:84 | `CREATE POLICY "Account categories manageable by admin" ON public.account_categories FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));` |
| S217:90 | `DROP POLICY IF EXISTS "Recurring transactions manageable by authenticated" ON public.recurring_transactions;` |
| S217:92 | `CREATE POLICY "Recurring transactions insertable by authenticated" ON public.recurring_transactions FOR INSERT TO authenticated WITH CHECK (true);` |
| S217:96 | `CREATE POLICY "Recurring transactions updatable by authenticated" ON public.recurring_transactions FOR UPDATE TO authenticated USING (true);` |
| S217:100 | `CREATE POLICY "Recurring transactions deletable by admin or manager" ON public.recurring_transactions FOR DELETE TO authenticated USING ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) );` |
| S218:5 | `DROP POLICY IF EXISTS "Transaction docs deletable by authenticated" ON public.transaction_documents;` |
| S218:6 | `CREATE POLICY "Transaction docs deletable by admin or manager" ON public.transaction_documents FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S218:14 | `CREATE POLICY "Payment lists deletable by admin or manager" ON public.payment_lists FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S218:22 | `CREATE POLICY "Payment list items deletable by admin or manager" ON public.payment_list_items FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S218:34 | `CREATE POLICY "Cache configs deletable by admin or manager" ON public.event_cache_configs FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S218:46 | `CREATE POLICY "Cache deductions deletable by admin or manager" ON public.event_cache_deductions FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S218:58 | `CREATE POLICY "Event dates deletable by admin or manager" ON public.event_dates FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S218:65 | `DROP POLICY IF EXISTS "Event forecasts manageable by authenticated" ON public.event_forecasts;` |
| S218:66 | `CREATE POLICY "Event forecasts insertable by authenticated" ON public.event_forecasts FOR INSERT TO authenticated WITH CHECK (true);` |
| S218:68 | `CREATE POLICY "Event forecasts updatable by authenticated" ON public.event_forecasts FOR UPDATE TO authenticated USING (true);` |
| S218:70 | `CREATE POLICY "Event forecasts deletable by admin or manager" ON public.event_forecasts FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S218:77 | `DROP POLICY IF EXISTS "Ticket lots manageable by authenticated" ON public.event_ticket_lots;` |
| S218:78 | `CREATE POLICY "Ticket lots insertable by authenticated" ON public.event_ticket_lots FOR INSERT TO authenticated WITH CHECK (true);` |
| S218:80 | `CREATE POLICY "Ticket lots updatable by authenticated" ON public.event_ticket_lots FOR UPDATE TO authenticated USING (true);` |
| S218:82 | `CREATE POLICY "Ticket lots deletable by admin or manager" ON public.event_ticket_lots FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S218:89 | `DROP POLICY IF EXISTS "Ticket zones manageable by authenticated" ON public.event_ticket_zones;` |
| S218:90 | `CREATE POLICY "Ticket zones insertable by authenticated" ON public.event_ticket_zones FOR INSERT TO authenticated WITH CHECK (true);` |
| S218:92 | `CREATE POLICY "Ticket zones updatable by authenticated" ON public.event_ticket_zones FOR UPDATE TO authenticated USING (true);` |
| S218:94 | `CREATE POLICY "Ticket zones deletable by admin or manager" ON public.event_ticket_zones FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S218:106 | `CREATE POLICY "Ticket sales deletable by admin or manager" ON public.ticket_sales FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S218:118 | `CREATE POLICY "Cities deletable by admin or manager" ON public.cities FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S218:130 | `CREATE POLICY "Venues deletable by admin or manager" ON public.venues FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S218:142 | `CREATE POLICY "Venue reservations deletable by admin or manager" ON public.venue_reservations FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S220:8 | `DROP POLICY IF EXISTS "Transactions insertable by authenticated" ON public.transactions;` |
| S220:9 | `CREATE POLICY "Transactions insertable by privileged roles" ON public.transactions FOR INSERT TO authenticated WITH CHECK ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role) );` |
| S220:18 | `DROP POLICY IF EXISTS "Transactions updatable by authenticated" ON public.transactions;` |
| S220:19 | `CREATE POLICY "Transactions updatable by privileged roles" ON public.transactions FOR UPDATE TO authenticated USING ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role) );` |
| S220:29 | `CREATE POLICY "Quotations insertable by privileged roles" ON public.quotations FOR INSERT TO authenticated WITH CHECK ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role) );` |
| S220:39 | `CREATE POLICY "Quotations updatable by privileged roles" ON public.quotations FOR UPDATE TO authenticated USING ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role) );` |
| S220:48 | `DROP POLICY IF EXISTS "Recurring transactions insertable by authenticated" ON public.recurring_transactions;` |
| S220:49 | `CREATE POLICY "Recurring transactions insertable by privileged roles" ON public.recurring_transactions FOR INSERT TO authenticated WITH CHECK ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role) );` |
| S220:58 | `DROP POLICY IF EXISTS "Recurring transactions updatable by authenticated" ON public.recurring_transactions;` |
| S220:59 | `CREATE POLICY "Recurring transactions updatable by privileged roles" ON public.recurring_transactions FOR UPDATE TO authenticated USING ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role) );` |
| S220:68 | `DROP POLICY IF EXISTS "Suppliers insertable by authenticated" ON public.suppliers;` |
| S220:69 | `CREATE POLICY "Suppliers insertable by privileged roles" ON public.suppliers FOR INSERT TO authenticated WITH CHECK ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role) );` |
| S220:78 | `DROP POLICY IF EXISTS "Suppliers updatable by authenticated" ON public.suppliers;` |
| S220:79 | `CREATE POLICY "Suppliers updatable by privileged roles" ON public.suppliers FOR UPDATE TO authenticated USING ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role) );` |
| S220:89 | `CREATE POLICY "Events insertable by privileged roles" ON public.events FOR INSERT TO authenticated WITH CHECK ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role) );` |
| S220:99 | `CREATE POLICY "Events updatable by privileged roles" ON public.events FOR UPDATE TO authenticated USING ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role) );` |
| S220:108 | `DROP POLICY IF EXISTS "Event forecasts insertable by authenticated" ON public.event_forecasts;` |
| S220:109 | `CREATE POLICY "Event forecasts insertable by privileged roles" ON public.event_forecasts FOR INSERT TO authenticated WITH CHECK ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role) );` |
| S220:118 | `DROP POLICY IF EXISTS "Event forecasts updatable by authenticated" ON public.event_forecasts;` |
| S220:119 | `CREATE POLICY "Event forecasts updatable by privileged roles" ON public.event_forecasts FOR UPDATE TO authenticated USING ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role) );` |
| S224:45 | `CREATE POLICY "Reimbursement notes insertable by privileged roles" ON public.reimbursement_notes FOR INSERT TO authenticated WITH CHECK ( has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager') OR has_role(auth.uid(), 'editor') );` |
| S224:54 | `CREATE POLICY "Reimbursement notes updatable by privileged roles" ON public.reimbursement_notes FOR UPDATE TO authenticated USING ( has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager') OR has_role(auth.uid(), 'editor') );` |
| S224:63 | `CREATE POLICY "Reimbursement notes deletable by admin or manager" ON public.reimbursement_notes FOR DELETE TO authenticated USING ( has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager') );` |
| S224:76 | `CREATE POLICY "Reimbursement note items insertable by privileged roles" ON public.reimbursement_note_items FOR INSERT TO authenticated WITH CHECK ( has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager') OR has_role(auth.uid(), 'editor') );` |
| S224:85 | `CREATE POLICY "Reimbursement note items deletable by privileged roles" ON public.reimbursement_note_items FOR DELETE TO authenticated USING ( has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager') OR has_role(auth.uid(), 'editor') );` |
| S225:15 | `CREATE POLICY "Authenticated users can view partner paid expenses" ON public.partner_paid_expenses FOR SELECT TO authenticated USING (true);` |
| S225:18 | `CREATE POLICY "Admins and managers can insert partner paid expenses" ON public.partner_paid_expenses FOR INSERT TO authenticated WITH CHECK ( public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') );` |
| S225:24 | `CREATE POLICY "Admins and managers can delete partner paid expenses" ON public.partner_paid_expenses FOR DELETE TO authenticated USING ( public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') );` |
| S226:6 | `CREATE POLICY "Account access viewable by own user or privileged" ON public.financial_account_access FOR SELECT TO authenticated USING ( user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) );` |
| S226:18 | `CREATE POLICY "Partner access viewable by own user or admin" ON public.partner_event_access FOR SELECT TO authenticated USING ( user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) );` |
| S226:29 | `DROP POLICY IF EXISTS "Users can view all roles" ON public.user_roles;` |
| S226:30 | `DROP POLICY IF EXISTS "user_roles_select" ON public.user_roles;` |
| S226:39 | `DROP POLICY IF EXISTS %I ON public.user_roles', pol.policyname);` |
| S226:43 | `CREATE POLICY "User roles viewable by own user or privileged" ON public.user_roles FOR SELECT TO authenticated USING ( user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) );` |
| S226:65 | `CREATE POLICY "User permissions viewable by own user or admin" ON public.user_permissions FOR SELECT TO authenticated USING ( user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) );` |
| S226:83 | `DROP POLICY IF EXISTS %I ON public.transaction_audit_log', pol.policyname);` |
| S226:87 | `CREATE POLICY "Transaction audit log insertable by privileged roles" ON public.transaction_audit_log FOR INSERT TO authenticated WITH CHECK ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role) );` |
| S226:105 | `DROP POLICY IF EXISTS %I ON public.system_audit_log', pol.policyname);` |
| S226:109 | `CREATE POLICY "System audit log insertable by privileged roles" ON public.system_audit_log FOR INSERT TO authenticated WITH CHECK ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) );` |
| S226:117 | `CREATE POLICY "System audit log insertable by service role" ON public.system_audit_log FOR INSERT TO public WITH CHECK (auth.role() = 'service_role'::text);` |
| S226:125 | `CREATE POLICY "Supplier documents updatable by privileged roles" ON public.supplier_documents FOR UPDATE TO authenticated USING ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role) );` |
| S226:137 | `CREATE POLICY "Cache configs insertable by admin or manager" ON public.event_cache_configs FOR INSERT TO authenticated WITH CHECK ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) );` |
| S226:145 | `CREATE POLICY "Cache configs updatable by admin or manager" ON public.event_cache_configs FOR UPDATE TO authenticated USING ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) );` |
| S226:156 | `CREATE POLICY "Cache deductions deletable by admin or manager" ON public.event_cache_deductions FOR DELETE TO authenticated USING ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) );` |
| S226:164 | `CREATE POLICY "Cache deductions insertable by admin or manager" ON public.event_cache_deductions FOR INSERT TO authenticated WITH CHECK ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) );` |
| S226:172 | `CREATE POLICY "Cache deductions updatable by admin or manager" ON public.event_cache_deductions FOR UPDATE TO authenticated USING ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) );` |
| S227:3 | `DROP POLICY IF EXISTS "Ticket zones insertable by authenticated" ON public.event_ticket_zones;` |
| S227:4 | `DROP POLICY IF EXISTS "Ticket zones updatable by authenticated" ON public.event_ticket_zones;` |
| S227:5 | `DROP POLICY IF EXISTS "Ticket lots insertable by authenticated" ON public.event_ticket_lots;` |
| S227:6 | `DROP POLICY IF EXISTS "Ticket lots updatable by authenticated" ON public.event_ticket_lots;` |
| S227:11 | `DROP POLICY IF EXISTS "Audit log can be inserted by authenticated" ON public.transaction_audit_log;` |
| S227:12 | `DROP POLICY IF EXISTS "Roles viewable by authenticated" ON public.user_roles;` |
| S227:16 | `CREATE POLICY "Ticket sales insertable by privileged roles" ON public.ticket_sales FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role));` |
| S227:20 | `CREATE POLICY "Ticket sales updatable by privileged roles" ON public.ticket_sales FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role));` |
| S227:25 | `CREATE POLICY "Venues insertable by privileged roles" ON public.venues FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role));` |
| S227:29 | `CREATE POLICY "Venues updatable by privileged roles" ON public.venues FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role));` |
| S227:33 | `DROP POLICY IF EXISTS "Transaction docs insertable by authenticated" ON public.transaction_documents;` |
| S227:34 | `CREATE POLICY "Transaction docs insertable by privileged roles" ON public.transaction_documents FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role));` |
| S227:39 | `CREATE POLICY "Venue reservations insertable by privileged roles" ON public.venue_reservations FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S227:43 | `CREATE POLICY "Venue reservations updatable by privileged roles" ON public.venue_reservations FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S227:47 | `CREATE POLICY "Venue reservations deletable by privileged roles" ON public.venue_reservations FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S228:21 | `CREATE POLICY "Supplier credits viewable by authenticated" ON public.supplier_credits FOR SELECT TO authenticated USING (true);` |
| S228:25 | `CREATE POLICY "Supplier credits insertable by admin or manager" ON public.supplier_credits FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S228:29 | `CREATE POLICY "Supplier credits updatable by admin or manager" ON public.supplier_credits FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S228:33 | `CREATE POLICY "Supplier credits deletable by admin or manager" ON public.supplier_credits FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S228:54 | `CREATE POLICY "Credit usages viewable by authenticated" ON public.supplier_credit_usages FOR SELECT TO authenticated USING (true);` |
| S228:58 | `CREATE POLICY "Credit usages insertable by admin or manager" ON public.supplier_credit_usages FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role));` |
| S228:62 | `CREATE POLICY "Credit usages deletable by admin or manager" ON public.supplier_credit_usages FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S233:32 | `CREATE POLICY "Cache payments insertable by admin or manager" ON public.event_cache_payments FOR INSERT TO authenticated WITH CHECK ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) );` |
| S233:38 | `CREATE POLICY "Cache payments updatable by admin or manager" ON public.event_cache_payments FOR UPDATE TO authenticated USING ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) );` |
| S233:44 | `CREATE POLICY "Cache payments deletable by admin or manager" ON public.event_cache_payments FOR DELETE TO authenticated USING ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) );` |
| S234:3 | `DROP POLICY IF EXISTS "Transaction docs deletable by admin or manager" ON public.transaction_documents;` |
| S234:4 | `CREATE POLICY "Transaction docs deletable by privileged roles" ON public.transaction_documents FOR DELETE TO authenticated USING ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role) );` |
| S234:14 | `CREATE POLICY "Transaction docs deletable by privileged roles" ON storage.objects FOR DELETE TO authenticated USING ( bucket_id = 'transaction-documents' AND ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role) ) );` |
| S237:25 | `CREATE POLICY "Transaction payments viewable by authenticated" ON public.transaction_payments FOR SELECT TO authenticated USING (true);` |
| S237:30 | `CREATE POLICY "Transaction payments insertable by privileged roles" ON public.transaction_payments FOR INSERT TO authenticated WITH CHECK ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role) );` |
| S237:39 | `CREATE POLICY "Transaction payments updatable by admin or manager" ON public.transaction_payments FOR UPDATE TO authenticated USING ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) ) WITH CHECK ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) );` |
| S237:51 | `CREATE POLICY "Transaction payments deletable by admin or manager" ON public.transaction_payments FOR DELETE TO authenticated USING ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) );` |
| S238:51 | `CREATE POLICY "Authenticated users can view settlements" ON public.ticket_office_settlements FOR SELECT TO authenticated USING (true);` |
| S238:57 | `CREATE POLICY "Managers can create settlements" ON public.ticket_office_settlements FOR INSERT TO authenticated WITH CHECK ( public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'manage_accounts') );` |
| S238:66 | `CREATE POLICY "Managers can update draft, admins can update any" ON public.ticket_office_settlements FOR UPDATE TO authenticated USING ( public.has_role(auth.uid(), 'admin') OR ( public.has_permission(auth.uid(), 'manage_accounts') AND status = 'draft' ) );` |
| S238:78 | `CREATE POLICY "Admins can delete settlements" ON public.ticket_office_settlements FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));` |
| S238:96 | `CREATE POLICY "Managers can upload settlement files" ON storage.objects FOR INSERT TO authenticated WITH CHECK ( bucket_id = 'ticket-office-settlements' AND ( public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'manage_accounts') ) );` |
| S238:108 | `CREATE POLICY "Managers can update settlement files" ON storage.objects FOR UPDATE TO authenticated USING ( bucket_id = 'ticket-office-settlements' AND ( public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'manage_accounts') ) );` |
| S238:120 | `CREATE POLICY "Admins can delete settlement files" ON storage.objects FOR DELETE TO authenticated USING ( bucket_id = 'ticket-office-settlements' AND public.has_role(auth.uid(), 'admin') );` |
| S243:16 | `CREATE POLICY "Partner advance expenses viewable by authenticated" ON public.partner_advance_expenses FOR SELECT TO authenticated USING (true);` |
| S243:20 | `CREATE POLICY "Partner advance expenses insertable by admin or manager" ON public.partner_advance_expenses FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S243:25 | `CREATE POLICY "Partner advance expenses updatable by admin or manager" ON public.partner_advance_expenses FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S243:30 | `CREATE POLICY "Partner advance expenses deletable by admin or manager" ON public.partner_advance_expenses FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S248:156 | `CREATE POLICY "Camarim sessions manageable by admin or manager" ON public.camarim_sessions FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S248:169 | `CREATE POLICY "Camarim session events manageable by admin or manager" ON public.camarim_session_events FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S248:182 | `CREATE POLICY "Camarim fund moves manageable by admin or manager" ON public.camarim_fund_moves FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S248:195 | `CREATE POLICY "Camarim items manageable by admin or manager" ON public.camarim_items FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S248:208 | `CREATE POLICY "Camarim item documents manageable by admin or manager" ON public.camarim_item_documents FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S248:221 | `CREATE POLICY "Camarim item reviews manageable by admin or manager" ON public.camarim_item_reviews FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S248:234 | `CREATE POLICY "Camarim integrations manageable by admin or manager" ON public.camarim_integrations FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S248:259 | `CREATE POLICY "Camarim documents viewable by authenticated" ON storage.objects FOR SELECT TO authenticated USING ( bucket_id = 'camarim-documents' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)) );` |
| S248:268 | `CREATE POLICY "Camarim documents insertable by admin or manager" ON storage.objects FOR INSERT TO authenticated WITH CHECK ( bucket_id = 'camarim-documents' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)) );` |
| S248:277 | `CREATE POLICY "Camarim documents updatable by admin or manager" ON storage.objects FOR UPDATE TO authenticated USING ( bucket_id = 'camarim-documents' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)) ) WITH CHECK ( bucket_id = 'camarim-documents' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)) );` |
| S248:290 | `CREATE POLICY "Camarim documents deletable by admin or manager" ON storage.objects FOR DELETE TO authenticated USING ( bucket_id = 'camarim-documents' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)) );` |
| S265:193 | `GRANT EXECUTE ON FUNCTION public.analyze_formalidade_bulk(uuid[]) TO authenticated;` |
| S267:63 | `GRANT EXECUTE ON FUNCTION public.formalidade_audit_stats(uuid[]) TO authenticated;` |
| S273:87 | `DROP POLICY IF EXISTS "Users see their own company" ON public.companies;` |
| S273:88 | `CREATE POLICY "Users see their own company" ON public.companies FOR SELECT TO authenticated USING ( id = public.current_company_id() OR public.is_platform_admin() );` |
| S273:96 | `DROP POLICY IF EXISTS "Platform admin manages companies" ON public.companies;` |
| S273:97 | `CREATE POLICY "Platform admin manages companies" ON public.companies FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());` |
| S273:105 | `CREATE POLICY "Read invitations" ON public.company_invitations FOR SELECT TO authenticated USING ( public.is_platform_admin() OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role)) );` |
| S273:114 | `CREATE POLICY "Write invitations" ON public.company_invitations FOR ALL TO authenticated USING ( public.is_platform_admin() OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role)) ) WITH CHECK ( public.is_platform_admin() OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role)) );` |
| S273:164 | `CREATE POLICY "Platform admin manages company branding" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'company-branding' AND public.is_platform_admin()) WITH CHECK (bucket_id = 'company-branding' AND public.is_platform_admin());` |
| S274:85 | `CREATE POLICY "company_isolation_events" ON public.events AS RESTRICTIVE FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));` |
| S274:93 | `CREATE POLICY "company_isolation_event_dates" ON public.event_dates AS RESTRICTIVE FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));` |
| S274:100 | `DROP POLICY IF EXISTS "company_isolation_event_sessions" ON public.event_sessions;` |
| S274:101 | `CREATE POLICY "company_isolation_event_sessions" ON public.event_sessions AS RESTRICTIVE FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));` |
| S274:109 | `CREATE POLICY "company_isolation_event_partners" ON public.event_partners AS RESTRICTIVE FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));` |
| S274:116 | `DROP POLICY IF EXISTS "company_isolation_event_forecasts" ON public.event_forecasts;` |
| S274:117 | `CREATE POLICY "company_isolation_event_forecasts" ON public.event_forecasts AS RESTRICTIVE FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));` |
| S274:125 | `CREATE POLICY "company_isolation_event_forecast_partners" ON public.event_forecast_partners AS RESTRICTIVE FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));` |
| S274:133 | `CREATE POLICY "company_isolation_event_implementations" ON public.event_implementations AS RESTRICTIVE FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));` |
| S274:141 | `CREATE POLICY "company_isolation_event_closing_costs" ON public.event_closing_costs AS RESTRICTIVE FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));` |
| S274:149 | `CREATE POLICY "company_isolation_event_partner_extras" ON public.event_partner_extras AS RESTRICTIVE FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));` |
| S274:156 | `DROP POLICY IF EXISTS "company_isolation_bp_versions" ON public.bp_versions;` |
| S274:157 | `CREATE POLICY "company_isolation_bp_versions" ON public.bp_versions AS RESTRICTIVE FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));` |
| S274:164 | `DROP POLICY IF EXISTS "company_isolation_bp_version_audit_log" ON public.bp_version_audit_log;` |
| S274:165 | `CREATE POLICY "company_isolation_bp_version_audit_log" ON public.bp_version_audit_log AS RESTRICTIVE FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));` |
| S274:173 | `CREATE POLICY "company_isolation_bp_orphan_attachments" ON public.bp_orphan_attachments AS RESTRICTIVE FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));` |
| S274:181 | `CREATE POLICY "company_isolation_event_forecast_formalidade_log" ON public.event_forecast_formalidade_log AS RESTRICTIVE FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));` |
| S274:188 | `DROP POLICY IF EXISTS "company_isolation_forecast_audit_log" ON public.forecast_audit_log;` |
| S274:189 | `CREATE POLICY "company_isolation_forecast_audit_log" ON public.forecast_audit_log AS RESTRICTIVE FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));` |
| S275:55 | `CREATE POLICY "company_isolation_%I" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id))', t, t );` |
| S276:63 | `CREATE POLICY "company_isolation_%I" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id))', t, t );` |
| S277:24 | `GRANT EXECUTE ON FUNCTION public.storage_path_belongs_to_current_company(text) TO anon, authenticated;` |
| S277:56 | `CREATE POLICY %I ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ( bucket_id <> %L OR public.storage_path_belongs_to_current_company(name) ) $f$, pol_name, b);` |
| S277:67 | `CREATE POLICY %I ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING ( bucket_id <> %L OR public.storage_path_belongs_to_current_company(name) ) WITH CHECK ( bucket_id <> %L OR public.storage_path_belongs_to_current_company(name) ) $f$, pol_name, b, b);` |
| S277:82 | `CREATE POLICY %I ON storage.objects AS RESTRICTIVE FOR %s TO authenticated USING ( bucket_id <> %L OR public.storage_path_belongs_to_current_company(name) ) $f$, pol_name, cmd, b);` |
| S278:66 | `DROP POLICY IF EXISTS "Users see their own company" ON public.companies;` |
| S278:67 | `CREATE POLICY "Users see their own company" ON public.companies FOR SELECT TO authenticated USING (id = public.current_company_id() OR public.is_platform_admin());` |
| S278:70 | `DROP POLICY IF EXISTS "Platform admin manages companies" ON public.companies;` |
| S278:71 | `CREATE POLICY "Platform admin manages companies" ON public.companies FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());` |
| S278:75 | `CREATE POLICY "Read invitations" ON public.company_invitations FOR SELECT TO authenticated USING (public.is_platform_admin() OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role)));` |
| S278:79 | `CREATE POLICY "Write invitations" ON public.company_invitations FOR ALL TO authenticated USING (public.is_platform_admin() OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role))) WITH CHECK (public.is_platform_admin() OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role)));` |
| S278:106 | `CREATE POLICY "Platform admin manages company branding" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'company-branding' AND public.is_platform_admin()) WITH CHECK (bucket_id = 'company-branding' AND public.is_platform_admin());` |
| S280:152 | `REVOKE EXECUTE ON FUNCTION public.run_rls_isolation_test() FROM PUBLIC;` |
| S280:153 | `REVOKE EXECUTE ON FUNCTION public.run_rls_isolation_test() FROM authenticated;` |
| S280:154 | `REVOKE EXECUTE ON FUNCTION public.run_rls_isolation_test() FROM anon;` |
| S281:149 | `REVOKE EXECUTE ON FUNCTION public.run_rls_isolation_test() FROM PUBLIC, anon, authenticated;` |
| S282:169 | `REVOKE EXECUTE ON FUNCTION public.run_rls_isolation_test() FROM PUBLIC, anon, authenticated;` |
| S282:170 | `GRANT EXECUTE ON FUNCTION public.run_rls_isolation_test() TO postgres, service_role;` |
| S283:51 | `REVOKE EXECUTE ON FUNCTION public.current_company_id() FROM PUBLIC;` |
| S283:52 | `GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated, service_role;` |
| S283:103 | `CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());` |
| S284:117 | `REVOKE EXECUTE ON FUNCTION public.run_rls_isolation_test() FROM PUBLIC, anon, authenticated;` |
| S284:118 | `GRANT EXECUTE ON FUNCTION public.run_rls_isolation_test() TO service_role;` |
| S287:55 | `CREATE POLICY company_isolation_%s ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (company_id = public.current_company_id()) WITH CHECK (company_id = public.current_company_id())', tname, tname );` |
| S291:32 | `CREATE POLICY "Sim curve view" ON public.event_simulator_sales_curve_buckets FOR SELECT TO authenticated USING ( EXISTS ( SELECT 1 FROM public.events e WHERE e.id = event_id AND (e.company_id = public.current_company_id() OR public.is_platform_admin(auth.uid())) ) );` |
| S291:43 | `CREATE POLICY "Sim curve insert" ON public.event_simulator_sales_curve_buckets FOR INSERT TO authenticated WITH CHECK ( (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_permission(auth.uid(),'forecast.write')) AND EXISTS ( SELECT 1 FROM public.events e WHERE e.id = event_id AND (e.company_id = public.current_company_id() OR public.is_platform_admin(auth.uid())) ) );` |
| S291:57 | `CREATE POLICY "Sim curve update" ON public.event_simulator_sales_curve_buckets FOR UPDATE TO authenticated USING ( (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_permission(auth.uid(),'forecast.write')) AND EXISTS ( SELECT 1 FROM public.events e WHERE e.id = event_id AND (e.company_id = public.current_company_id() OR public.is_platform_admin(auth.uid())) ) );` |
| S291:71 | `CREATE POLICY "Sim curve delete" ON public.event_simulator_sales_curve_buckets FOR DELETE TO authenticated USING ( (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_permission(auth.uid(),'forecast.write')) AND EXISTS ( SELECT 1 FROM public.events e WHERE e.id = event_id AND (e.company_id = public.current_company_id() OR public.is_platform_admin(auth.uid())) ) );` |
| S291:108 | `CREATE POLICY "Bench view tenant" ON public.event_simulator_pax_benchmarks FOR SELECT TO authenticated USING (company_id = public.current_company_id() OR public.is_platform_admin(auth.uid()));` |
| S291:163 | `GRANT EXECUTE ON FUNCTION public.recalculate_pax_benchmarks(uuid) TO authenticated;` |
| S292:127 | `CREATE POLICY "sponsorship_pipeline_select" ON public.sponsorship_pipeline FOR SELECT TO authenticated USING ( company_id = public.current_company_id() AND ( public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'editor') OR public.has_role(auth.uid(), 'viewer') OR owner_user_id = auth.uid() ) );` |
| S292:142 | `CREATE POLICY "sponsorship_pipeline_insert" ON public.sponsorship_pipeline FOR INSERT TO authenticated WITH CHECK ( company_id = public.current_company_id() AND ( public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'editor') ) );` |
| S292:155 | `CREATE POLICY "sponsorship_pipeline_update" ON public.sponsorship_pipeline FOR UPDATE TO authenticated USING ( company_id = public.current_company_id() AND ( public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'editor') OR owner_user_id = auth.uid() ) ) WITH CHECK (company_id = public.current_company_id());` |
| S292:170 | `CREATE POLICY "sponsorship_pipeline_delete" ON public.sponsorship_pipeline FOR DELETE TO authenticated USING ( company_id = public.current_company_id() AND ( public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin') OR public.has_role(auth.uid(), 'manager') ) );` |
| S292:182 | `CREATE POLICY "sponsorship_activities_select" ON public.sponsorship_pipeline_activities FOR SELECT TO authenticated USING ( company_id = public.current_company_id() AND ( public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'editor') OR public.has_role(auth.uid(), 'viewer') ) );` |
| S292:196 | `CREATE POLICY "sponsorship_activities_insert" ON public.sponsorship_pipeline_activities FOR INSERT TO authenticated WITH CHECK ( company_id = public.current_company_id() AND ( public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'editor') ) );` |
| S292:209 | `CREATE POLICY "sponsorship_activities_delete" ON public.sponsorship_pipeline_activities FOR DELETE TO authenticated USING ( company_id = public.current_company_id() AND ( public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin') ) );` |
| S300:63 | `CREATE POLICY tenant_isolation_select ON crm.meta_creatives FOR SELECT TO authenticated USING (company_id = current_company_id());` |
| S300:67 | `CREATE POLICY tenant_isolation_insert ON crm.meta_creatives FOR INSERT TO authenticated WITH CHECK (company_id = current_company_id());` |
| S300:71 | `CREATE POLICY tenant_isolation_update ON crm.meta_creatives FOR UPDATE TO authenticated USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());` |
| S300:77 | `CREATE POLICY tenant_isolation_delete ON crm.meta_creatives FOR DELETE TO authenticated USING (company_id = current_company_id());` |
| S301:187 | `DROP POLICY IF EXISTS "Users see their own company" ON public.companies;` |
| S301:188 | `CREATE POLICY "Users see their member companies" ON public.companies FOR SELECT USING ( is_platform_admin() OR id = current_company_id() OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.company_id = companies.id) );` |
| S303:19 | `CREATE POLICY coala_sync_deletes_select ON public.coala_sync_deletes FOR SELECT USING ( public.is_platform_admin() OR EXISTS ( SELECT 1 FROM public.coala_sync_config c WHERE c.id = coala_sync_deletes.config_id AND c.company_id = public.current_company_id() ) );` |
| S303:40 | `CREATE POLICY coala_sync_value_changes_select ON public.coala_sync_value_changes FOR SELECT USING ( public.is_platform_admin() OR EXISTS ( SELECT 1 FROM public.coala_sync_config c WHERE c.id = coala_sync_value_changes.config_id AND c.company_id = public.current_company_id() ) );` |
| S305:85 | `CREATE POLICY coala_scm_select ON public.coala_supplier_category_map FOR SELECT TO authenticated USING ( company_id = current_company_id() OR has_role(auth.uid(), 'platform_admin'::app_role) );` |
| S305:92 | `CREATE POLICY coala_scm_insert ON public.coala_supplier_category_map FOR INSERT TO authenticated WITH CHECK ( company_id = current_company_id() OR has_role(auth.uid(), 'platform_admin'::app_role) );` |
| S305:99 | `CREATE POLICY coala_scm_update ON public.coala_supplier_category_map FOR UPDATE TO authenticated USING ( company_id = current_company_id() OR has_role(auth.uid(), 'platform_admin'::app_role) ) WITH CHECK ( company_id = current_company_id() OR has_role(auth.uid(), 'platform_admin'::app_role) );` |
| S305:110 | `CREATE POLICY coala_scm_delete ON public.coala_supplier_category_map FOR DELETE TO authenticated USING ( ( company_id = current_company_id() AND ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) ) ) OR has_role(auth.uid(), 'platform_admin'::app_role) );` |
| S307:96 | `CREATE POLICY "bp_tx_recon_ignored_select_company" ON public.bp_tx_reconciliation_ignored FOR SELECT TO authenticated USING ( company_id = public.current_company_id() OR public.has_role(auth.uid(), 'platform_admin'::app_role) );` |
| S307:105 | `CREATE POLICY "bp_tx_recon_ignored_modify_admin_manager" ON public.bp_tx_reconciliation_ignored FOR ALL TO authenticated USING ( (company_id = public.current_company_id() AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role))) OR public.has_role(auth.uid(), 'platform_admin'::app_role) ) WITH CHECK ( (company_id = public.current_company_id() AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role))) OR public.has_role(auth.uid(), 'platform_admin'::app_role) );` |
| S308:31 | `CREATE POLICY coala_ai_sug_select ON public.coala_ai_classification_suggestions FOR SELECT TO authenticated USING ( company_id = public.current_company_id() OR public.has_role(auth.uid(), 'platform_admin'::app_role) );` |
| S308:39 | `CREATE POLICY coala_ai_sug_insert ON public.coala_ai_classification_suggestions FOR INSERT TO authenticated WITH CHECK ( company_id = public.current_company_id() AND ( public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'editor'::app_role) OR public.has_role(auth.uid(), 'platform_admin'::app_role) ) );` |
| S308:51 | `CREATE POLICY coala_ai_sug_update ON public.coala_ai_classification_suggestions FOR UPDATE TO authenticated USING ( company_id = public.current_company_id() AND ( public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'editor'::app_role) OR public.has_role(auth.uid(), 'platform_admin'::app_role) ) );` |
| S318:228 | `GRANT EXECUTE ON FUNCTION public.get_event_cash_position(uuid, date, date) TO authenticated;` |
| S318:229 | `GRANT EXECUTE ON FUNCTION public.get_event_cash_position_invariant(uuid) TO authenticated;` |
| S319:30 | `REVOKE ALL ON FUNCTION public.user_has_event_access(uuid, uuid) FROM PUBLIC;` |
| S319:31 | `GRANT EXECUTE ON FUNCTION public.user_has_event_access(uuid, uuid) TO authenticated;` |
| S319:55 | `REVOKE ALL ON FUNCTION public.user_supplier_id(uuid) FROM PUBLIC;` |
| S319:56 | `GRANT EXECUTE ON FUNCTION public.user_supplier_id(uuid) TO authenticated;` |
| S320:16 | `CREATE POLICY events_select_partner ON public.events FOR SELECT TO authenticated USING ( public.user_has_event_access(auth.uid(), id) OR (parent_event_id IS NOT NULL AND public.user_has_event_access(auth.uid(), parent_event_id)) );` |
| S320:24 | `DROP POLICY IF EXISTS event_sessions_select_partner ON public.event_sessions;` |
| S320:25 | `CREATE POLICY event_sessions_select_partner ON public.event_sessions FOR SELECT TO authenticated USING (public.user_has_event_access(auth.uid(), event_id));` |
| S320:30 | `DROP POLICY IF EXISTS event_ticket_zones_select_partner ON public.event_ticket_zones;` |
| S320:31 | `CREATE POLICY event_ticket_zones_select_partner ON public.event_ticket_zones FOR SELECT TO authenticated USING (public.user_has_event_access(auth.uid(), event_id));` |
| S320:36 | `DROP POLICY IF EXISTS event_ticket_lots_select_partner ON public.event_ticket_lots;` |
| S320:37 | `CREATE POLICY event_ticket_lots_select_partner ON public.event_ticket_lots FOR SELECT TO authenticated USING (EXISTS ( SELECT 1 FROM public.event_ticket_zones z WHERE z.id = event_ticket_lots.zone_id AND public.user_has_event_access(auth.uid(), z.event_id) ));` |
| S320:47 | `CREATE POLICY ticket_sales_select_partner ON public.ticket_sales FOR SELECT TO authenticated USING (EXISTS ( SELECT 1 FROM public.event_ticket_zones z WHERE z.id = ticket_sales.zone_id AND public.user_has_event_access(auth.uid(), z.event_id) ));` |
| S320:56 | `DROP POLICY IF EXISTS event_forecasts_select_partner ON public.event_forecasts;` |
| S320:57 | `CREATE POLICY event_forecasts_select_partner ON public.event_forecasts FOR SELECT TO authenticated USING (public.user_has_event_access(auth.uid(), event_id));` |
| S320:62 | `DROP POLICY IF EXISTS transactions_select_partner ON public.transactions;` |
| S320:63 | `CREATE POLICY transactions_select_partner ON public.transactions FOR SELECT TO authenticated USING (event_id IS NOT NULL AND public.user_has_event_access(auth.uid(), event_id));` |
| S320:68 | `DROP POLICY IF EXISTS transaction_documents_select_partner ON public.transaction_documents;` |
| S320:69 | `CREATE POLICY transaction_documents_select_partner ON public.transaction_documents FOR SELECT TO authenticated USING (EXISTS ( SELECT 1 FROM public.transactions t WHERE t.id = transaction_documents.transaction_id AND t.event_id IS NOT NULL AND public.user_has_event_access(auth.uid(), t.event_id) ));` |
| S320:80 | `CREATE POLICY event_partners_select_partner ON public.event_partners FOR SELECT TO authenticated USING ( public.user_has_event_access(auth.uid(), event_id) AND supplier_id IS NOT NULL AND supplier_id = public.user_supplier_id(auth.uid()) );` |
| S320:90 | `CREATE POLICY event_partner_extras_select_partner ON public.event_partner_extras FOR SELECT TO authenticated USING ( public.user_has_event_access(auth.uid(), event_id) AND EXISTS ( SELECT 1 FROM public.event_partners ep WHERE ep.id = event_partner_extras.partner_id AND ep.supplier_id = public.user_supplier_id(auth.uid()) ) );` |
| S320:102 | `DROP POLICY IF EXISTS partner_paid_expenses_select_partner ON public.partner_paid_expenses;` |
| S320:103 | `CREATE POLICY partner_paid_expenses_select_partner ON public.partner_paid_expenses FOR SELECT TO authenticated USING ( public.user_has_event_access(auth.uid(), event_id) AND EXISTS ( SELECT 1 FROM public.event_partners ep WHERE ep.id = partner_paid_expenses.partner_id AND ep.supplier_id = public.user_supplier_id(auth.uid()) ) );` |
| S320:115 | `DROP POLICY IF EXISTS partner_advance_expenses_select_partner ON public.partner_advance_expenses;` |
| S320:116 | `CREATE POLICY partner_advance_expenses_select_partner ON public.partner_advance_expenses FOR SELECT TO authenticated USING ( public.user_has_event_access(auth.uid(), event_id) AND EXISTS ( SELECT 1 FROM public.event_partners ep WHERE ep.id = partner_advance_expenses.partner_id AND ep.supplier_id = public.user_supplier_id(auth.uid()) ) );` |
| S320:130 | `DROP POLICY IF EXISTS event_forecasts_update_partner ON public.event_forecasts;` |
| S320:131 | `CREATE POLICY event_forecasts_update_partner ON public.event_forecasts FOR UPDATE TO authenticated USING ( EXISTS ( SELECT 1 FROM public.partner_event_access pea WHERE pea.user_id = auth.uid() AND pea.event_id = event_forecasts.event_id AND pea.is_active = true AND pea.can_edit_bp = true ) ) WITH CHECK ( EXISTS ( SELECT 1 FROM public.partner_event_access pea WHERE pea.user_id = auth.uid() AND pea.event_id = event_forecasts.event_id AND pea.is_active = true AND pea.can_edit_bp = true ) AND company_id = public.current_company_id() );` |
| S321:13 | `DROP POLICY IF EXISTS transactions_select_partner ON public.transactions;` |
| S321:14 | `CREATE POLICY transactions_select_partner ON public.transactions FOR SELECT TO authenticated USING ( event_id IS NOT NULL AND user_has_event_access(auth.uid(), event_id) AND public.has_permission(auth.uid(), 'view_partner_transactions') );` |
| S321:23 | `DROP POLICY IF EXISTS transaction_documents_select_partner ON public.transaction_documents;` |
| S321:24 | `CREATE POLICY transaction_documents_select_partner ON public.transaction_documents FOR SELECT TO authenticated USING ( EXISTS ( SELECT 1 FROM public.transactions t WHERE t.id = transaction_documents.transaction_id AND t.event_id IS NOT NULL AND user_has_event_access(auth.uid(), t.event_id) ) AND public.has_permission(auth.uid(), 'view_partner_documents') );` |
| S321:37 | `DROP POLICY IF EXISTS event_forecasts_update_partner ON public.event_forecasts;` |
| S321:38 | `CREATE POLICY event_forecasts_update_partner ON public.event_forecasts FOR UPDATE TO authenticated USING ( public.has_permission(auth.uid(), 'edit_approved_bp') AND EXISTS ( SELECT 1 FROM public.partner_event_access pea WHERE pea.user_id = auth.uid() AND pea.event_id = event_forecasts.event_id AND pea.is_active = true AND pea.can_edit_bp = true ) ) WITH CHECK ( public.has_permission(auth.uid(), 'edit_approved_bp') AND EXISTS ( SELECT 1 FROM public.partner_event_access pea WHERE pea.user_id = auth.uid() AND pea.event_id = event_forecasts.event_id AND pea.is_active = true AND pea.can_edit_bp = true ) AND company_id = current_company_id() );` |
| S322:60 | `GRANT EXECUTE ON FUNCTION public.get_bp_line_attachments(uuid[]) TO authenticated;` |
| S322:61 | `REVOKE EXECUTE ON FUNCTION public.get_bp_line_attachments(uuid[]) FROM anon, PUBLIC;` |
| S323:62 | `REVOKE ALL ON FUNCTION public.get_bp_l3_attachments(uuid[]) FROM PUBLIC, anon;` |
| S323:63 | `GRANT EXECUTE ON FUNCTION public.get_bp_l3_attachments(uuid[]) TO authenticated;` |
| S325:94 | `GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_session_loads TO authenticated;` |
| S325:95 | `GRANT ALL ON public.card_session_loads TO service_role;` |
| S325:131 | `CREATE POLICY card_sessions_write ON public.card_sessions FOR ALL TO authenticated USING ( public.can_manage_cards(auth.uid()) AND (status <> 'closed' OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'platform_admin'::app_role)) ) WITH CHECK ( public.can_manage_cards(auth.uid()) AND (status <> 'closed' OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'platform_admin'::app_role)) );` |
| S325:142 | `CREATE POLICY card_sessions_company_isolation ON public.card_sessions AS RESTRICTIVE FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));` |
| S325:148 | `CREATE POLICY card_session_loads_select ON public.card_session_loads FOR SELECT TO authenticated USING (true);` |
| S325:151 | `CREATE POLICY card_session_loads_write ON public.card_session_loads FOR ALL TO authenticated USING ( public.can_manage_cards(auth.uid()) AND EXISTS ( SELECT 1 FROM public.card_sessions s WHERE s.id = card_session_loads.session_id AND (s.status <> 'closed' OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'platform_admin'::app_role)) ) ) WITH CHECK ( public.can_manage_cards(auth.uid()) AND EXISTS ( SELECT 1 FROM public.card_sessions s WHERE s.id = card_session_loads.session_id AND (s.status <> 'closed' OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'platform_admin'::app_role)) ) );` |
| S325:170 | `CREATE POLICY card_session_loads_company_isolation ON public.card_session_loads AS RESTRICTIVE FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));` |
| S325:179 | `CREATE POLICY card_session_items_write ON public.card_session_items FOR ALL TO authenticated USING ( public.can_manage_cards(auth.uid()) AND EXISTS ( SELECT 1 FROM public.card_sessions s WHERE s.id = card_session_items.session_id AND (s.status <> 'closed' OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'platform_admin'::app_role)) ) ) WITH CHECK ( public.can_manage_cards(auth.uid()) AND EXISTS ( SELECT 1 FROM public.card_sessions s WHERE s.id = card_session_items.session_id AND (s.status <> 'closed' OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'platform_admin'::app_role)) ) );` |
| S325:198 | `CREATE POLICY card_session_items_company_isolation ON public.card_session_items AS RESTRICTIVE FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));` |
| S330:115 | `REVOKE ALL ON FUNCTION public.get_partner_bp_realized(uuid) FROM PUBLIC;` |
| S330:116 | `GRANT EXECUTE ON FUNCTION public.get_partner_bp_realized(uuid) TO authenticated;` |
| S331:114 | `REVOKE ALL ON FUNCTION public.get_partner_bp_realized(uuid) FROM PUBLIC;` |
| S331:115 | `GRANT EXECUTE ON FUNCTION public.get_partner_bp_realized(uuid) TO authenticated;` |
| S334:274 | `GRANT EXECUTE ON FUNCTION public.apply_supplier_credit(uuid, uuid, numeric, uuid) TO authenticated;` |
| S335:24 | `CREATE POLICY "Reviews viewable by accountant and staff" ON public.accountant_transaction_reviews FOR SELECT TO authenticated USING ( public.has_role(auth.uid(), 'accountant') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'editor') );` |
| S335:34 | `CREATE POLICY "Reviews insertable by accountant and staff" ON public.accountant_transaction_reviews FOR INSERT TO authenticated WITH CHECK ( public.has_role(auth.uid(), 'accountant') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'editor') );` |
| S335:44 | `CREATE POLICY "Reviews updatable by accountant and staff" ON public.accountant_transaction_reviews FOR UPDATE TO authenticated USING ( public.has_role(auth.uid(), 'accountant') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'editor') ) WITH CHECK ( public.has_role(auth.uid(), 'accountant') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'editor') );` |
| S335:61 | `CREATE POLICY "Reviews deletable by admin" ON public.accountant_transaction_reviews FOR DELETE TO authenticated USING ( public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin') );` |
| S335:71 | `CREATE POLICY "company_isolation_accountant_transaction_reviews" ON public.accountant_transaction_reviews AS RESTRICTIVE FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));` |
| S337:11 | `DROP POLICY IF EXISTS "Admins and managers can insert partner paid expenses" ON public.partner_paid_expenses;` |
| S337:13 | `CREATE POLICY "ppe_insert_admin_manager" ON public.partner_paid_expenses FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S337:17 | `CREATE POLICY "ppe_insert_editor_pending" ON public.partner_paid_expenses FOR INSERT TO authenticated WITH CHECK ( has_role(auth.uid(), 'editor'::app_role) AND status = 'pending_approval' AND proposed_by = auth.uid() );` |
| S337:25 | `CREATE POLICY "ppe_update_admin_manager" ON public.partner_paid_expenses FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S337:30 | `CREATE POLICY "ppe_delete_editor_own_pending" ON public.partner_paid_expenses FOR DELETE TO authenticated USING ( has_role(auth.uid(), 'editor'::app_role) AND status = 'pending_approval' AND proposed_by = auth.uid() );` |
| S343:3 | `DROP POLICY IF EXISTS "Transactions are viewable by authenticated users" ON public.transactions;` |
| S343:5 | `CREATE POLICY "transactions_select_privileged_roles" ON public.transactions FOR SELECT TO authenticated USING ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'platform_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role) OR has_role(auth.uid(), 'viewer'::app_role) OR has_role(auth.uid(), 'accountant'::app_role) );` |
| S344:66 | `REVOKE ALL ON FUNCTION public.get_partner_event_tx_aggregates(uuid[]) FROM PUBLIC;` |
| S344:67 | `GRANT EXECUTE ON FUNCTION public.get_partner_event_tx_aggregates(uuid[]) TO authenticated;` |
| S344:131 | `REVOKE ALL ON FUNCTION public.get_partner_event_partner_expenses(uuid[]) FROM PUBLIC;` |
| S344:132 | `GRANT EXECUTE ON FUNCTION public.get_partner_event_partner_expenses(uuid[]) TO authenticated;` |
| S345:3 | `CREATE POLICY "Camarim fund moves viewable by privileged roles" ON public.camarim_fund_moves FOR SELECT TO authenticated USING ( public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'platform_admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'accountant'::app_role) OR public.has_permission(auth.uid(), 'camarim_manage'::text) );` |
| S345:14 | `DROP POLICY IF EXISTS "Authenticated users can view partner paid expenses" ON public.partner_paid_expenses;` |
| S345:15 | `CREATE POLICY "Partner paid expenses viewable by privileged roles" ON public.partner_paid_expenses FOR SELECT TO authenticated USING ( public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'platform_admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'accountant'::app_role) OR public.has_role(auth.uid(), 'editor'::app_role) OR public.has_role(auth.uid(), 'viewer'::app_role) );` |
| S345:27 | `REVOKE SELECT ON public.suppliers FROM authenticated;` |
| S345:28 | `GRANT SELECT ( id, name, nif, contact_name, email, phone, address, payment_terms, category, notes, is_active, created_at, updated_at, trade_name, is_partner, company_id ) ON public.suppliers TO authenticated;` |
| S346:1 | `DROP POLICY IF EXISTS "Transaction docs viewable by authenticated" ON public.transaction_documents;` |
| S346:3 | `CREATE POLICY "transaction_documents_select_privileged_roles" ON public.transaction_documents FOR SELECT TO authenticated USING ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'platform_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role) OR has_role(auth.uid(), 'viewer'::app_role) OR has_role(auth.uid(), 'accountant'::app_role) );` |
| S348:22 | `REVOKE ALL ON FUNCTION public.bp_tx_link_allowed(uuid, uuid, uuid, uuid) FROM PUBLIC;` |
| S348:23 | `GRANT EXECUTE ON FUNCTION public.bp_tx_link_allowed(uuid, uuid, uuid, uuid) TO authenticated, service_role;` |
| S349:87 | `REVOKE ALL ON FUNCTION public._test_bp_tx_guards() FROM PUBLIC;` |
| S354:18 | `CREATE POLICY "Partner capital moves viewable by privileged roles" ON public.partner_capital_moves FOR SELECT TO authenticated USING ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'platform_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'accountant'::app_role) OR has_role(auth.uid(), 'editor'::app_role) OR has_role(auth.uid(), 'viewer'::app_role) );` |
| S354:26 | `CREATE POLICY "partner_capital_moves_select_partner" ON public.partner_capital_moves FOR SELECT TO authenticated USING ( user_has_event_access(auth.uid(), event_id) AND EXISTS ( SELECT 1 FROM public.event_partners ep WHERE ep.id = partner_capital_moves.partner_id AND ep.supplier_id = user_supplier_id(auth.uid()) ) );` |
| S354:37 | `CREATE POLICY "pcm_insert_admin_manager" ON public.partner_capital_moves FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S354:41 | `CREATE POLICY "pcm_update_admin_manager" ON public.partner_capital_moves FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S354:46 | `CREATE POLICY "pcm_delete_admin_manager" ON public.partner_capital_moves FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S354:50 | `CREATE POLICY "company_isolation_partner_capital_moves" ON public.partner_capital_moves AS RESTRICTIVE FOR ALL TO authenticated USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());` |
| S355:1 | `CREATE POLICY "Transaction docs updatable by privileged roles" ON public.transaction_documents FOR UPDATE TO authenticated USING ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role) ) WITH CHECK ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role) );` |
| S357:90 | `GRANT EXECUTE ON FUNCTION public.list_orphan_transactions_for_event(uuid) TO authenticated;` |
| S357:91 | `GRANT EXECUTE ON FUNCTION public.list_orphan_transactions_for_event(uuid) TO service_role;` |
| S358:166 | `REVOKE EXECUTE ON FUNCTION public.check_system_invariants() FROM PUBLIC;` |
| S358:167 | `GRANT EXECUTE ON FUNCTION public.check_system_invariants() TO authenticated;` |
| S360:170 | `REVOKE EXECUTE ON FUNCTION public.check_system_invariants() FROM PUBLIC;` |
| S360:171 | `GRANT EXECUTE ON FUNCTION public.check_system_invariants() TO authenticated;` |
| S365:183 | `REVOKE ALL ON FUNCTION public.renegotiate_transaction_installments(uuid, jsonb, text) FROM PUBLIC;` |
| S365:184 | `GRANT EXECUTE ON FUNCTION public.renegotiate_transaction_installments(uuid, jsonb, text) TO authenticated;` |
| S367:2 | `DROP POLICY IF EXISTS "Transaction payments updatable by admin or manager" ON public.transaction_payments;` |
| S367:3 | `DROP POLICY IF EXISTS "Transaction payments deletable by admin or manager" ON public.transaction_payments;` |
| S367:5 | `CREATE POLICY "Transaction payments updatable by privileged roles" ON public.transaction_payments FOR UPDATE TO authenticated USING ( public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'editor'::app_role) ) WITH CHECK ( public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'editor'::app_role) );` |
| S367:20 | `CREATE POLICY "Transaction payments deletable by privileged roles" ON public.transaction_payments FOR DELETE TO authenticated USING ( public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'editor'::app_role) );` |
| S376:67 | `GRANT EXECUTE ON FUNCTION public.event_close_blockers(uuid) TO authenticated;` |
| S376:68 | `GRANT EXECUTE ON FUNCTION public.event_close_blockers(uuid) TO service_role;` |
| S378:24 | `REVOKE EXECUTE ON FUNCTION public.bp_capture_tx_links(uuid) FROM PUBLIC;` |
| S378:25 | `GRANT EXECUTE ON FUNCTION public.bp_capture_tx_links(uuid) TO authenticated;` |
| S378:26 | `GRANT EXECUTE ON FUNCTION public.bp_capture_tx_links(uuid) TO service_role;` |
| S378:105 | `REVOKE EXECUTE ON FUNCTION public.bp_restore_tx_links(uuid, jsonb) FROM PUBLIC;` |
| S378:106 | `GRANT EXECUTE ON FUNCTION public.bp_restore_tx_links(uuid, jsonb) TO authenticated;` |
| S378:107 | `GRANT EXECUTE ON FUNCTION public.bp_restore_tx_links(uuid, jsonb) TO service_role;` |
| S379:2 | `REVOKE EXECUTE ON FUNCTION public.bp_capture_tx_links(uuid) FROM authenticated;` |
| S379:3 | `REVOKE EXECUTE ON FUNCTION public.bp_capture_tx_links(uuid) FROM anon;` |
| S379:4 | `REVOKE EXECUTE ON FUNCTION public.bp_restore_tx_links(uuid, jsonb) FROM authenticated;` |
| S379:5 | `REVOKE EXECUTE ON FUNCTION public.bp_restore_tx_links(uuid, jsonb) FROM anon;` |
| S383:55 | `CREATE POLICY "company_isolation_bank_statements" ON public.bank_statements AS RESTRICTIVE FOR ALL TO authenticated USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());` |
| S383:60 | `CREATE POLICY "company_isolation_bank_statement_lines" ON public.bank_statement_lines AS RESTRICTIVE FOR ALL TO authenticated USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());` |
| S383:65 | `CREATE POLICY "Bank statements viewable by authorized users" ON public.bank_statements FOR SELECT TO authenticated USING ( is_platform_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR EXISTS ( SELECT 1 FROM public.financial_account_access faa WHERE faa.account_id = bank_statements.financial_account_id AND faa.user_id = auth.uid() ) );` |
| S383:77 | `CREATE POLICY "Bank statements manageable by admin and manager" ON public.bank_statements FOR ALL TO authenticated USING (is_platform_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)) WITH CHECK (is_platform_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S383:82 | `CREATE POLICY "Bank statement lines viewable by authorized users" ON public.bank_statement_lines FOR SELECT TO authenticated USING ( is_platform_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR EXISTS ( SELECT 1 FROM public.financial_account_access faa WHERE faa.account_id = bank_statement_lines.financial_account_id AND faa.user_id = auth.uid() ) );` |
| S383:94 | `CREATE POLICY "Bank statement lines manageable by admin and manager" ON public.bank_statement_lines FOR ALL TO authenticated USING (is_platform_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)) WITH CHECK (is_platform_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));` |
| S384:25 | `REVOKE EXECUTE ON FUNCTION public.can_see_confidential(uuid) FROM PUBLIC;` |
| S384:26 | `GRANT EXECUTE ON FUNCTION public.can_see_confidential(uuid) TO authenticated, service_role;` |
| S384:29 | `CREATE POLICY "Financial accounts viewable by authorized users" ON public.financial_accounts FOR SELECT TO authenticated USING ( public.is_platform_admin(auth.uid()) OR ( company_id = public.current_company_id() AND ( public.has_role(auth.uid(), 'admin'::app_role) OR public.can_see_confidential(auth.uid()) OR (COALESCE(is_restricted, false) = false AND public.has_role(auth.uid(), 'manager'::app_role)) OR EXISTS ( SELECT 1 FROM public.financial_account_access faa WHERE faa.account_id = financial_accounts.id AND faa.user_id = auth.uid() ) ) ) );` |
| S384:47 | `DROP POLICY IF EXISTS transactions_confidential_guard ON public.transactions;` |
| S384:48 | `CREATE POLICY transactions_confidential_guard ON public.transactions AS RESTRICTIVE FOR SELECT TO authenticated USING ( public.can_see_confidential(auth.uid()) OR ( COALESCE(is_confidential, false) = false AND (account_id IS NULL OR NOT EXISTS ( SELECT 1 FROM public.financial_accounts a WHERE a.id = transactions.account_id AND a.is_restricted )) ) );` |
| S385:47 | `REVOKE ALL ON FUNCTION public._account_true_balance_raw(uuid) FROM PUBLIC;` |
| S387:37 | `REVOKE ALL ON FUNCTION public._account_true_balance_asof_raw(uuid, date) FROM PUBLIC;` |
| S388:282 | `GRANT EXECUTE ON FUNCTION public.promote_scenario_to_active(uuid, text, uuid, text, boolean, jsonb) TO service_role;` |
| S388:284 | `GRANT EXECUTE ON FUNCTION public.create_bp_snapshot(uuid, text, boolean, text, jsonb, boolean, uuid, text) TO service_role;` |
| S388:287 | `GRANT EXECUTE ON FUNCTION public.discard_bp_version_draft(uuid, uuid, text) TO service_role;` |
| S388:290 | `GRANT EXECUTE ON FUNCTION public.event_close_blockers(uuid) TO service_role, authenticated;` |
| S390:16 | `grant select, insert, update, delete on public.bank_line_transactions to authenticated;` |
| S390:17 | `grant all on public.bank_line_transactions to service_role;` |
| S390:21 | `create policy "company_isolation_bank_line_transactions" on public.bank_line_transactions as restrictive for all to authenticated using (company_id = current_company_id()) with check (company_id = current_company_id());` |
| S390:29 | `create policy "Bank line transactions manageable by authorized users" on public.bank_line_transactions for all to authenticated using ( is_platform_admin(auth.uid()) or has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'manager'::app_role) or has_permission(auth.uid(), 'manage_bank_reconciliation'::text) ) with check ( is_platform_admin(auth.uid()) or has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'manager'::app_role) or has_permission(auth.uid(), 'manage_bank_reconciliation'::text) );` |
| S390:46 | `create policy "Bank line transactions viewable by authorized users" on public.bank_line_transactions for select to authenticated using ( is_platform_admin(auth.uid()) or has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'manager'::app_role) or has_permission(auth.uid(), 'manage_bank_reconciliation'::text) or exists ( select 1 from public.bank_statement_lines bsl join public.financial_account_access faa on faa.account_id = bsl.financial_account_id where bsl.id = bank_line_transactions.line_id and faa.user_id = auth.uid() ) );` |
| S391:3 | `DROP POLICY IF EXISTS transaction_documents_select_partner ON public.transaction_documents;` |
| S391:5 | `CREATE POLICY transaction_documents_select_partner ON public.transaction_documents FOR SELECT USING ( (EXISTS ( SELECT 1 FROM public.transactions t WHERE t.id = transaction_documents.transaction_id AND t.event_id IS NOT NULL AND user_has_event_access(auth.uid(), t.event_id) )) AND has_permission(auth.uid(), 'view_partner_documents'::text) AND transaction_documents.partner_visible = true );` |
| S396:72 | `REVOKE EXECUTE ON FUNCTION public.rename_operation_key(text, text) FROM PUBLIC;` |
| S396:73 | `REVOKE EXECUTE ON FUNCTION public.rename_operation_key(text, text) FROM anon;` |
| S396:74 | `GRANT EXECUTE ON FUNCTION public.rename_operation_key(text, text) TO authenticated;` |
| S396:75 | `GRANT EXECUTE ON FUNCTION public.rename_operation_key(text, text) TO service_role;` |
| S396:127 | `REVOKE EXECUTE ON FUNCTION public.clear_operation_key(text) FROM PUBLIC;` |
| S396:128 | `REVOKE EXECUTE ON FUNCTION public.clear_operation_key(text) FROM anon;` |
| S396:129 | `GRANT EXECUTE ON FUNCTION public.clear_operation_key(text) TO authenticated;` |
| S396:130 | `GRANT EXECUTE ON FUNCTION public.clear_operation_key(text) TO service_role;` |
| S397:80 | `REVOKE EXECUTE ON FUNCTION public._ticket_office_balance_raw(uuid) FROM PUBLIC;` |
| S397:81 | `REVOKE EXECUTE ON FUNCTION public._ticket_office_balance_raw(uuid) FROM anon, authenticated;` |
| S397:82 | `GRANT EXECUTE ON FUNCTION public._ticket_office_balance_raw(uuid) TO service_role;` |
| S397:84 | `REVOKE EXECUTE ON FUNCTION public.ticket_office_balances(uuid[]) FROM PUBLIC;` |
| S397:85 | `REVOKE EXECUTE ON FUNCTION public.ticket_office_balances(uuid[]) FROM anon;` |
| S397:86 | `GRANT EXECUTE ON FUNCTION public.ticket_office_balances(uuid[]) TO authenticated, service_role;` |
| S398:43 | `REVOKE EXECUTE ON FUNCTION public._ticket_office_balance_raw(uuid) FROM PUBLIC;` |
| S398:44 | `REVOKE EXECUTE ON FUNCTION public._ticket_office_balance_raw(uuid) FROM anon, authenticated;` |
| S398:45 | `GRANT EXECUTE ON FUNCTION public._ticket_office_balance_raw(uuid) TO service_role;` |
| S399:108 | `REVOKE EXECUTE ON FUNCTION public.create_settlement_transfer(uuid, uuid, uuid, numeric, date, boolean) FROM PUBLIC;` |
| S399:109 | `REVOKE EXECUTE ON FUNCTION public.create_settlement_transfer(uuid, uuid, uuid, numeric, date, boolean) FROM anon;` |
| S399:110 | `GRANT EXECUTE ON FUNCTION public.create_settlement_transfer(uuid, uuid, uuid, numeric, date, boolean) TO authenticated;` |
| S401:24 | `CREATE POLICY "mirror proof readable by admin" ON public.event_partners_mirror_inversion_proof FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'platform_admin'::app_role));` |
| S401:214 | `CREATE POLICY "esp_select_scoped" ON public.event_settlement_participants FOR SELECT TO authenticated USING ( public.is_settlement_staff(auth.uid()) OR (supplier_id IS NOT NULL AND supplier_id = public.user_supplier_id(auth.uid())) );` |
| S402:252 | `REVOKE ALL ON FUNCTION public.seal_event_settlement(uuid, jsonb, uuid, text) FROM PUBLIC;` |
| S402:253 | `GRANT EXECUTE ON FUNCTION public.seal_event_settlement(uuid, jsonb, uuid, text) TO authenticated;` |
| S402:294 | `REVOKE ALL ON FUNCTION public.unseal_event_settlement(uuid, text) FROM PUBLIC;` |
| S402:295 | `GRANT EXECUTE ON FUNCTION public.unseal_event_settlement(uuid, text) TO authenticated;` |
| S404:76 | `REVOKE ALL ON FUNCTION public.get_partner_event_tx_aggregates(uuid[]) FROM PUBLIC;` |
| S404:77 | `GRANT EXECUTE ON FUNCTION public.get_partner_event_tx_aggregates(uuid[]) TO authenticated;` |
| S405:126 | `REVOKE ALL ON FUNCTION public.get_partner_settlement_summary(uuid, uuid, numeric, boolean) FROM PUBLIC;` |
| S405:127 | `REVOKE ALL ON FUNCTION public.get_partner_settlement_summary(uuid, uuid, numeric, boolean) FROM anon;` |
| S405:128 | `GRANT EXECUTE ON FUNCTION public.get_partner_settlement_summary(uuid, uuid, numeric, boolean) TO authenticated;` |
| S407:27 | `REVOKE ALL ON FUNCTION public.has_staff_role(uuid) FROM public, anon;` |
| S407:28 | `GRANT EXECUTE ON FUNCTION public.has_staff_role(uuid) TO authenticated, service_role;` |
| S407:51 | `CREATE POLICY %I ON public.%I AS PERMISSIVE FOR SELECT TO authenticated USING (public.has_staff_role(auth.uid()))', v_new, r.tbl);` |
| S407:56 | `CREATE POLICY %I ON public.%I AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (public.has_staff_role(auth.uid()))', v_new, r.tbl);` |
| S407:72 | `CREATE POLICY account_categories_select_partner ON public.account_categories AS PERMISSIVE FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'partner'::app_role));` |
| S407:76 | `CREATE POLICY role_permissions_select_own_roles ON public.role_permissions AS PERMISSIVE FOR SELECT TO authenticated USING (EXISTS ( SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = role_permissions.role ));` |
| S409:18 | `CREATE POLICY "system_invariants_select_admins" ON public.system_invariants FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin'));` |
| S409:38 | `CREATE POLICY "invariant_runs_select_admins" ON public.invariant_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin'));` |
| S409:186 | `REVOKE ALL ON FUNCTION public.run_invariant_checks() FROM PUBLIC;` |
| S409:187 | `GRANT EXECUTE ON FUNCTION public.run_invariant_checks() TO authenticated, service_role;` |
| S410:273 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_raw() FROM PUBLIC;` |
| S410:274 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_raw() FROM anon;` |
| S410:275 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_raw() FROM authenticated;` |
| S410:297 | `GRANT EXECUTE ON FUNCTION public.run_invariant_checks() TO authenticated;` |
| S410:320 | `GRANT EXECUTE ON FUNCTION public.check_system_invariants() TO authenticated;` |
| S411:263 | `REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_raw() FROM anon, authenticated;` |
| S412:68 | `CREATE POLICY scm_select_privileged ON public.shared_cost_mirror FOR SELECT USING ( has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'platform_admin'::app_role) OR has_role((SELECT auth.uid()), 'manager'::app_role) OR has_role((SELECT auth.uid()), 'accountant'::app_role) OR has_role((SELECT auth.uid()), 'editor'::app_role) OR has_role((SELECT auth.uid()), 'viewer'::app_role) );` |
| S412:80 | `CREATE POLICY company_isolation_shared_cost_mirror ON public.shared_cost_mirror AS RESTRICTIVE FOR ALL USING (company_id = current_company_id());` |
| S412:211 | `REVOKE EXECUTE ON FUNCTION public.sync_shared_cost_mirror() FROM PUBLIC;` |
| S412:212 | `REVOKE EXECUTE ON FUNCTION public.sync_shared_cost_mirror() FROM anon, authenticated;` |
| S412:213 | `GRANT EXECUTE ON FUNCTION public.sync_shared_cost_mirror() TO service_role;` |
| S413:121 | `REVOKE EXECUTE ON FUNCTION public.event_close_blockers(uuid) FROM PUBLIC;` |
| S413:122 | `REVOKE EXECUTE ON FUNCTION public.event_close_blockers(uuid) FROM anon;` |
| S413:123 | `GRANT EXECUTE ON FUNCTION public.event_close_blockers(uuid) TO authenticated;` |
| S413:124 | `GRANT EXECUTE ON FUNCTION public.event_close_blockers(uuid) TO service_role;` |
| S414:128 | `REVOKE EXECUTE ON FUNCTION public.get_partner_bp_realized(uuid) FROM PUBLIC;` |
| S414:129 | `GRANT EXECUTE ON FUNCTION public.get_partner_bp_realized(uuid) TO anon, authenticated, service_role;` |
| S415:268 | `REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_raw() FROM PUBLIC;` |
| S415:269 | `REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_raw() FROM anon, authenticated;` |
| S415:270 | `GRANT EXECUTE ON FUNCTION public._run_invariant_checks_raw() TO service_role;` |
| S416:90 | `REVOKE EXECUTE ON FUNCTION public.enforce_transaction_approval_permission() FROM PUBLIC;` |
| S416:91 | `REVOKE EXECUTE ON FUNCTION public.enforce_transaction_approval_permission() FROM anon;` |
| S416:92 | `REVOKE EXECUTE ON FUNCTION public.enforce_transaction_approval_permission() FROM authenticated;` |
| S416:93 | `GRANT EXECUTE ON FUNCTION public.enforce_transaction_approval_permission() TO service_role;` |
| S420:81 | `GRANT EXECUTE ON FUNCTION public.create_card_session_load(uuid, numeric, date, uuid, text) TO authenticated;` |
| S420:82 | `GRANT EXECUTE ON FUNCTION public.create_card_session_load(uuid, numeric, date, uuid, text) TO service_role;` |
| S421:32 | `CREATE POLICY backup_runs_select_admin ON public.backup_runs FOR SELECT TO authenticated USING ( public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin') );` |
| S421:40 | `CREATE POLICY company_isolation_backup_runs ON public.backup_runs AS RESTRICTIVE FOR ALL TO authenticated USING ( (company_id IS NOT NULL AND public.row_belongs_to_current_company(company_id)) OR (company_id IS NULL AND public.has_role(auth.uid(), 'platform_admin')) );` |
| S421:109 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_extra() FROM PUBLIC;` |
| S421:110 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_extra() FROM anon;` |
| S421:111 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_extra() FROM authenticated;` |
| S421:126 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_all() FROM PUBLIC;` |
| S421:127 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_all() FROM anon;` |
| S421:128 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_all() FROM authenticated;` |
| S422:15 | `CREATE POLICY backup_excluded_tables_select_admin ON public.backup_excluded_tables FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin'));` |
| S423:73 | `GRANT EXECUTE ON FUNCTION public.create_card_session_load(uuid, numeric, date, uuid, text) TO authenticated;` |
| S423:74 | `GRANT EXECUTE ON FUNCTION public.create_card_session_load(uuid, numeric, date, uuid, text) TO service_role;` |
| S424:490 | `REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_extra() FROM PUBLIC;` |
| S424:491 | `REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_extra() FROM anon, authenticated;` |
| S424:492 | `GRANT EXECUTE ON FUNCTION public._run_invariant_checks_extra() TO service_role;` |
| S425:143 | `REVOKE EXECUTE ON FUNCTION public.launch_from_bank_lines(jsonb) FROM PUBLIC;` |
| S425:144 | `REVOKE EXECUTE ON FUNCTION public.launch_from_bank_lines(jsonb) FROM anon;` |
| S425:145 | `GRANT EXECUTE ON FUNCTION public.launch_from_bank_lines(jsonb) TO authenticated, service_role;` |
| S426:143 | `REVOKE ALL ON FUNCTION public.launch_from_bank_lines(jsonb) FROM PUBLIC;` |
| S426:144 | `REVOKE ALL ON FUNCTION public.launch_from_bank_lines(jsonb) FROM anon;` |
| S426:145 | `GRANT EXECUTE ON FUNCTION public.launch_from_bank_lines(jsonb) TO authenticated, service_role;` |
| S427:150 | `REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_extra() FROM PUBLIC;` |
| S427:151 | `REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_extra() FROM anon, authenticated;` |
| S427:152 | `GRANT EXECUTE ON FUNCTION public._run_invariant_checks_extra() TO service_role;` |
| S428:283 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_extra() FROM anon, authenticated;` |
| S428:284 | `GRANT EXECUTE ON FUNCTION public._run_invariant_checks_extra() TO service_role;` |
| S430:203 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_extra() FROM PUBLIC;` |
| S430:204 | `GRANT EXECUTE ON FUNCTION public._run_invariant_checks_extra() TO service_role;` |
| S431:247 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_extra() FROM PUBLIC;` |
| S431:248 | `GRANT EXECUTE ON FUNCTION public._run_invariant_checks_extra() TO service_role;` |
| S433:76 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_secrets() FROM PUBLIC;` |
| S433:77 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_secrets() FROM anon;` |
| S433:78 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_secrets() FROM authenticated;` |
| S433:79 | `GRANT EXECUTE ON FUNCTION public._run_invariant_checks_secrets() TO service_role;` |
| S433:96 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_all() FROM PUBLIC;` |
| S433:97 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_all() FROM anon;` |
| S433:98 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_all() FROM authenticated;` |
| S434:46 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_infra() FROM PUBLIC;` |
| S434:47 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_infra() FROM anon, authenticated;` |
| S435:23 | `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;` |
| S435:24 | `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;` |
| S435:25 | `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA crm REVOKE EXECUTE ON FUNCTIONS FROM anon;` |
| S435:26 | `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA crm REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;` |
| S435:71 | `REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_secdef() FROM PUBLIC;` |
| S435:72 | `REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_secdef() FROM anon, authenticated;` |
| S436:37 | `REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_secdef() FROM PUBLIC;` |
| S436:38 | `REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_secdef() FROM anon, authenticated;` |
| S437:64 | `REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_docs() FROM PUBLIC;` |
| S437:65 | `REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_docs() FROM anon, authenticated;` |
| S437:66 | `GRANT EXECUTE ON FUNCTION public._run_invariant_checks_docs() TO service_role;` |
| S441:150 | `REVOKE ALL ON FUNCTION public.reconcile_bank_line(uuid, jsonb) FROM PUBLIC;` |
| S441:151 | `REVOKE ALL ON FUNCTION public.reconcile_bank_line(uuid, jsonb) FROM anon;` |
| S441:152 | `GRANT EXECUTE ON FUNCTION public.reconcile_bank_line(uuid, jsonb) TO authenticated;` |
| S441:153 | `GRANT EXECUTE ON FUNCTION public.reconcile_bank_line(uuid, jsonb) TO service_role;` |
| S442:25 | `CREATE POLICY "event_bp_line_reviews_select_privileged_roles" ON public.event_bp_line_reviews FOR SELECT TO authenticated USING (public.has_staff_role((SELECT auth.uid())));` |
| S442:29 | `CREATE POLICY "manage_bp can insert bp line reviews" ON public.event_bp_line_reviews FOR INSERT TO authenticated WITH CHECK ( reviewed_by = (SELECT auth.uid()) AND public.has_permission_in((SELECT auth.uid()), 'manage_bp', company_id) );` |
| S442:36 | `CREATE POLICY "company_isolation_event_bp_line_reviews" ON public.event_bp_line_reviews AS RESTRICTIVE FOR ALL TO authenticated USING (company_id = public.current_company_id()) WITH CHECK (company_id = public.current_company_id());` |
| S442:140 | `REVOKE ALL ON FUNCTION public.reduce_forecast_budget(uuid, numeric, text) FROM PUBLIC;` |
| S442:141 | `GRANT EXECUTE ON FUNCTION public.reduce_forecast_budget(uuid, numeric, text) TO authenticated, service_role;` |
| S443:79 | `REVOKE EXECUTE ON FUNCTION public.enforce_tx_forecast_same_event() FROM PUBLIC;` |
| S443:80 | `REVOKE EXECUTE ON FUNCTION public.enforce_tx_forecast_same_event() FROM anon, authenticated;` |
| S443:81 | `GRANT EXECUTE ON FUNCTION public.enforce_tx_forecast_same_event() TO service_role;` |
| S443:139 | `REVOKE EXECUTE ON FUNCTION public.enforce_forecast_amount_floor() FROM PUBLIC;` |
| S443:140 | `REVOKE EXECUTE ON FUNCTION public.enforce_forecast_amount_floor() FROM anon, authenticated;` |
| S443:141 | `GRANT EXECUTE ON FUNCTION public.enforce_forecast_amount_floor() TO service_role;` |
| S445:48 | `REVOKE EXECUTE ON FUNCTION public._derive_paid_amount(uuid) FROM PUBLIC, anon, authenticated;` |
| S445:49 | `GRANT EXECUTE ON FUNCTION public._derive_paid_amount(uuid) TO service_role;` |
| S445:79 | `GRANT SELECT, INSERT, UPDATE, DELETE ON public.transaction_offsets TO authenticated;` |
| S445:80 | `GRANT ALL ON public.transaction_offsets TO service_role;` |
| S445:83 | `CREATE POLICY transaction_offsets_select_staff ON public.transaction_offsets FOR SELECT TO authenticated USING (public.has_staff_role((SELECT auth.uid())));` |
| S445:85 | `CREATE POLICY transaction_offsets_insert_privileged ON public.transaction_offsets FOR INSERT TO authenticated WITH CHECK ( public.has_role((SELECT auth.uid()), 'admin'::app_role) OR public.has_role((SELECT auth.uid()), 'manager'::app_role) OR public.has_role((SELECT auth.uid()), 'editor'::app_role));` |
| S445:88 | `CREATE POLICY transaction_offsets_update_privileged ON public.transaction_offsets FOR UPDATE TO authenticated USING ( public.has_role((SELECT auth.uid()), 'admin'::app_role) OR public.has_role((SELECT auth.uid()), 'manager'::app_role) OR public.has_role((SELECT auth.uid()), 'editor'::app_role)) WITH CHECK ( public.has_role((SELECT auth.uid()), 'admin'::app_role) OR public.has_role((SELECT auth.uid()), 'manager'::app_role) OR public.has_role((SELECT auth.uid()), 'editor'::app_role));` |
| S445:93 | `CREATE POLICY transaction_offsets_delete_privileged ON public.transaction_offsets FOR DELETE TO authenticated USING ( public.has_role((SELECT auth.uid()), 'admin'::app_role) OR public.has_role((SELECT auth.uid()), 'manager'::app_role) OR public.has_role((SELECT auth.uid()), 'editor'::app_role));` |
| S445:96 | `CREATE POLICY company_isolation_transaction_offsets ON public.transaction_offsets AS RESTRICTIVE FOR ALL TO authenticated USING (company_id = public.current_company_id()) WITH CHECK (company_id = public.current_company_id());` |
| S445:236 | `REVOKE EXECUTE ON FUNCTION public._apply_transaction_offset(uuid, uuid) FROM PUBLIC, anon;` |
| S445:237 | `GRANT EXECUTE ON FUNCTION public._apply_transaction_offset(uuid, uuid) TO authenticated, service_role;` |
| S445:269 | `REVOKE EXECUTE ON FUNCTION public._reverse_transaction_offsets_for(uuid) FROM PUBLIC, anon, authenticated;` |
| S445:270 | `GRANT EXECUTE ON FUNCTION public._reverse_transaction_offsets_for(uuid) TO service_role;` |
| S445:356 | `REVOKE EXECUTE ON FUNCTION public.transaction_offset_create(uuid, uuid, numeric, text) FROM PUBLIC, anon;` |
| S445:357 | `GRANT EXECUTE ON FUNCTION public.transaction_offset_create(uuid, uuid, numeric, text) TO authenticated, service_role;` |
| S445:358 | `REVOKE EXECUTE ON FUNCTION public.transaction_offset_remove(uuid) FROM PUBLIC, anon;` |
| S445:359 | `GRANT EXECUTE ON FUNCTION public.transaction_offset_remove(uuid) TO authenticated, service_role;` |
| S445:360 | `REVOKE EXECUTE ON FUNCTION public.validate_transaction_offset() FROM PUBLIC, anon, authenticated;` |
| S446:364 | `REVOKE EXECUTE ON FUNCTION public.admin_cost_override_write(text, jsonb, uuid) FROM PUBLIC;` |
| S446:365 | `REVOKE EXECUTE ON FUNCTION public.admin_cost_override_write(text, jsonb, uuid) FROM anon;` |
| S446:366 | `GRANT EXECUTE ON FUNCTION public.admin_cost_override_write(text, jsonb, uuid) TO authenticated, service_role;` |
| S447:20 | `CREATE POLICY storage_deletion_log_admin_select ON public.storage_deletion_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'platform_admin'::app_role));` |
| S447:23 | `CREATE POLICY company_isolation_storage_deletion_log ON public.storage_deletion_log AS RESTRICTIVE FOR SELECT TO authenticated USING (public.row_belongs_to_current_company(company_id));` |
| S447:71 | `DROP POLICY IF EXISTS "Transaction docs deletable by privileged roles" ON public.transaction_documents;` |
| S447:72 | `CREATE POLICY "Transaction docs deletable by privileged roles" ON public.transaction_documents FOR DELETE TO authenticated USING (has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'manager'::app_role));` |
| S448:49 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_docs() FROM PUBLIC, anon, authenticated;` |
| S448:50 | `GRANT EXECUTE ON FUNCTION public._run_invariant_checks_docs() TO service_role;` |
| S450:9 | `REVOKE ALL ON FUNCTION public._paid_guard_is_exempt(public.transactions) FROM PUBLIC, anon, authenticated;` |
| S450:301 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_paid() FROM PUBLIC, anon, authenticated;` |
| S450:302 | `GRANT EXECUTE ON FUNCTION public._run_invariant_checks_paid() TO service_role;` |
| S451:36 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_cash() FROM PUBLIC, anon, authenticated;` |
| S452:267 | `REVOKE ALL ON FUNCTION public.save_ticket_office_settlement(uuid, jsonb, boolean, jsonb, jsonb, text, text, text) FROM PUBLIC, anon;` |
| S452:268 | `GRANT EXECUTE ON FUNCTION public.save_ticket_office_settlement(uuid, jsonb, boolean, jsonb, jsonb, text, text, text) TO authenticated, service_role;` |
| S454:200 | `REVOKE ALL ON FUNCTION public.save_ticket_office_settlement(uuid, jsonb, boolean, jsonb, jsonb, text, text, text) FROM PUBLIC, anon;` |
| S454:201 | `GRANT EXECUTE ON FUNCTION public.save_ticket_office_settlement(uuid, jsonb, boolean, jsonb, jsonb, text, text, text) TO authenticated, service_role;` |
| S016:191 | `REVOKE EXECUTE ON FUNCTION public.approve_transactions_atomic(uuid[], jsonb, text) FROM PUBLIC;` |
| S016:192 | `REVOKE EXECUTE ON FUNCTION public.approve_transactions_atomic(uuid[], jsonb, text) FROM anon;` |
| S016:193 | `REVOKE EXECUTE ON FUNCTION public.approve_transactions_atomic(uuid[], jsonb, text) FROM authenticated;` |
| S016:194 | `GRANT EXECUTE ON FUNCTION public.approve_transactions_atomic(uuid[], jsonb, text) TO service_role;` |
| S017:42 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_cards() FROM PUBLIC, anon, authenticated;` |
| S017:43 | `GRANT EXECUTE ON FUNCTION public._run_invariant_checks_cards() TO service_role;` |
| S019:38 | `REVOKE ALL ON FUNCTION public._scope_event_ids_to_company(uuid[]) FROM PUBLIC, anon;` |
| S019:39 | `GRANT EXECUTE ON FUNCTION public._scope_event_ids_to_company(uuid[]) TO authenticated, service_role;` |
| S019:63 | `REVOKE ALL ON FUNCTION public.analyze_formalidade_bulk__impl(uuid[]) FROM PUBLIC, anon, authenticated;` |
| S019:64 | `REVOKE ALL ON FUNCTION public.formalidade_audit_stats__impl(uuid[]) FROM PUBLIC, anon, authenticated;` |
| S019:75 | `GRANT EXECUTE ON FUNCTION public.analyze_formalidade_bulk__impl(uuid[]) TO service_role;` |
| S019:76 | `GRANT EXECUTE ON FUNCTION public.formalidade_audit_stats__impl(uuid[]) TO service_role;` |
| S019:202 | `REVOKE ALL ON FUNCTION public.analyze_formalidade_bulk(uuid[]) FROM PUBLIC, anon;` |
| S019:203 | `REVOKE ALL ON FUNCTION public.formalidade_audit_stats(uuid[]) FROM PUBLIC, anon;` |
| S019:214 | `GRANT EXECUTE ON FUNCTION public.analyze_formalidade_bulk(uuid[]) TO authenticated, service_role;` |
| S019:215 | `GRANT EXECUTE ON FUNCTION public.formalidade_audit_stats(uuid[]) TO authenticated, service_role;` |
| S020:54 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_tenant() FROM PUBLIC, anon, authenticated;` |
| S020:55 | `GRANT EXECUTE ON FUNCTION public._run_invariant_checks_tenant() TO service_role;` |
| S022:41 | `REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_duplicate_invoices() FROM PUBLIC, anon, authenticated;` |
| S022:42 | `GRANT EXECUTE ON FUNCTION public._run_invariant_checks_duplicate_invoices() TO service_role;` |
| S024:115 | `REVOKE ALL ON FUNCTION public._camarim_fund_move_legs(uuid) FROM PUBLIC, anon, authenticated;` |
| S024:116 | `REVOKE ALL ON FUNCTION public.camarim_sync_session_leg_payment(uuid) FROM PUBLIC, anon, authenticated;` |
| S024:117 | `GRANT EXECUTE ON FUNCTION public._camarim_fund_move_legs(uuid) TO service_role;` |
| S024:118 | `GRANT EXECUTE ON FUNCTION public.camarim_sync_session_leg_payment(uuid) TO service_role;` |
| S024:151 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_camarim() FROM PUBLIC, anon, authenticated;` |
| S024:152 | `GRANT EXECUTE ON FUNCTION public._run_invariant_checks_camarim() TO service_role;` |
| S025:73 | `CREATE POLICY supplier_similarity_flags_select ON public.supplier_similarity_flags FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'platform_admin')) AND public.row_belongs_to_current_company(company_id));` |
| S025:77 | `CREATE POLICY supplier_similarity_flags_update ON public.supplier_similarity_flags FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'platform_admin')) AND public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));` |
| S025:152 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_suppliers() FROM PUBLIC, anon, authenticated;` |
| S025:153 | `GRANT EXECUTE ON FUNCTION public._run_invariant_checks_suppliers() TO service_role;` |
| S026:38 | `REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_paid_below_gross() FROM PUBLIC, anon, authenticated;` |
| S026:39 | `GRANT EXECUTE ON FUNCTION public._run_invariant_checks_paid_below_gross() TO service_role;` |
| S027:31 | `REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_raw() FROM PUBLIC, anon, authenticated;` |
| S027:32 | `GRANT EXECUTE ON FUNCTION public._run_invariant_checks_raw() TO service_role;` |
| S030:38 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_ticketline_series() FROM PUBLIC, anon, authenticated;` |
| S030:39 | `GRANT EXECUTE ON FUNCTION public._run_invariant_checks_ticketline_series() TO service_role;` |
| S031:25 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_unreachable_docs() FROM PUBLIC, anon, authenticated;` |
| S031:26 | `GRANT EXECUTE ON FUNCTION public._run_invariant_checks_unreachable_docs() TO service_role;` |
| S032:55 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_isolation() FROM PUBLIC, anon, authenticated;` |
| S032:56 | `GRANT EXECUTE ON FUNCTION public._run_invariant_checks_isolation() TO service_role;` |
| S033:136 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_storage() FROM PUBLIC, anon, authenticated;` |
| S033:137 | `GRANT EXECUTE ON FUNCTION public._run_invariant_checks_storage() TO service_role;` |
| S035:19 | `REVOKE ALL ON FUNCTION public._partner_extra_assert_can_write(uuid) FROM PUBLIC, anon, authenticated;` |
| S035:53 | `REVOKE ALL ON FUNCTION public.convert_transaction_to_partner_extra(uuid, uuid, uuid, text, boolean) FROM PUBLIC, anon;` |
| S035:54 | `GRANT EXECUTE ON FUNCTION public.convert_transaction_to_partner_extra(uuid, uuid, uuid, text, boolean) TO authenticated;` |
| S035:79 | `REVOKE ALL ON FUNCTION public.revert_partner_extra(uuid, boolean) FROM PUBLIC, anon;` |
| S035:80 | `GRANT EXECUTE ON FUNCTION public.revert_partner_extra(uuid, boolean) TO authenticated;` |
| S035:103 | `REVOKE ALL ON FUNCTION public.clear_reversal_on_repay() FROM PUBLIC, anon, authenticated;` |
| S035:138 | `REVOKE ALL ON FUNCTION public.audit_transactions_change() FROM PUBLIC, anon, authenticated;` |
| S036:103 | `REVOKE ALL ON FUNCTION public.delete_transaction_cascade(uuid, text, boolean, text) FROM PUBLIC, anon;` |
| S036:104 | `GRANT EXECUTE ON FUNCTION public.delete_transaction_cascade(uuid, text, boolean, text) TO authenticated, service_role;` |
| S036:165 | `REVOKE ALL ON FUNCTION public.reverse_ticket_office_settlement(uuid, text, text) FROM PUBLIC, anon;` |
| S036:166 | `GRANT EXECUTE ON FUNCTION public.reverse_ticket_office_settlement(uuid, text, text) TO authenticated, service_role;` |
| S036:214 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_rateio() FROM PUBLIC, anon, authenticated;` |
| S036:215 | `GRANT EXECUTE ON FUNCTION public._run_invariant_checks_rateio() TO service_role;` |
| S037:20 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_rateio() FROM PUBLIC, anon, authenticated;` |
| S037:21 | `GRANT EXECUTE ON FUNCTION public._run_invariant_checks_rateio() TO service_role;` |
| S038:80 | `REVOKE EXECUTE ON FUNCTION public.update_planned_installments(uuid, jsonb, text) FROM PUBLIC, anon;` |
| S038:81 | `GRANT EXECUTE ON FUNCTION public.update_planned_installments(uuid, jsonb, text) TO authenticated, service_role;` |
| S038:181 | `REVOKE EXECUTE ON FUNCTION public.split_transaction_by_bp_lines(uuid, jsonb, text) FROM PUBLIC, anon;` |
| S038:182 | `GRANT EXECUTE ON FUNCTION public.split_transaction_by_bp_lines(uuid, jsonb, text) TO authenticated, service_role;` |
| S039:62 | `REVOKE ALL ON FUNCTION public.collect_event_benchmarks(uuid) FROM PUBLIC, anon;` |
| S039:63 | `GRANT EXECUTE ON FUNCTION public.collect_event_benchmarks(uuid) TO authenticated, service_role;` |
| S041:17 | `REVOKE ALL ON FUNCTION public.bp_tx_link_allowed(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;` |
| S041:70 | `REVOKE ALL ON FUNCTION public.sync_tx_forecast_to_anchor() FROM PUBLIC, anon, authenticated;` |
| S042:54 | `REVOKE ALL ON FUNCTION public.enforce_payment_list_batch_channel() FROM PUBLIC, anon, authenticated;` |
| S043:58 | `CREATE POLICY tos_write ON public.ticket_office_statements FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'platform_admin')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'platform_admin'));` |
| S043:61 | `CREATE POLICY company_isolation_tos ON public.ticket_office_statements AS RESTRICTIVE FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));` |
| S043:65 | `CREATE POLICY tosl_write ON public.ticket_office_statement_lines FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'platform_admin')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'platform_admin'));` |
| S043:68 | `CREATE POLICY company_isolation_tosl ON public.ticket_office_statement_lines AS RESTRICTIVE FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));` |
| S045:36 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_cash() FROM PUBLIC, anon, authenticated;` |
| S046:267 | `REVOKE ALL ON FUNCTION public.save_ticket_office_settlement(uuid, jsonb, boolean, jsonb, jsonb, text, text, text) FROM PUBLIC, anon;` |
| S046:268 | `GRANT EXECUTE ON FUNCTION public.save_ticket_office_settlement(uuid, jsonb, boolean, jsonb, jsonb, text, text, text) TO authenticated, service_role;` |
| S048:200 | `REVOKE ALL ON FUNCTION public.save_ticket_office_settlement(uuid, jsonb, boolean, jsonb, jsonb, text, text, text) FROM PUBLIC, anon;` |
| S048:201 | `GRANT EXECUTE ON FUNCTION public.save_ticket_office_settlement(uuid, jsonb, boolean, jsonb, jsonb, text, text, text) TO authenticated, service_role;` |
| S049:46 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_dre_nature() FROM PUBLIC, anon, authenticated;` |
| S049:47 | `GRANT EXECUTE ON FUNCTION public._run_invariant_checks_dre_nature() TO service_role;` |
| S052:24 | `CREATE POLICY company_isolation_payment_list_bank_executions ON public.payment_list_bank_executions AS RESTRICTIVE FOR ALL TO authenticated USING (company_id = public.current_company_id()) WITH CHECK (company_id = public.current_company_id());` |
| S052:27 | `CREATE POLICY "Bank executions viewable by authorized users" ON public.payment_list_bank_executions FOR SELECT TO authenticated USING (public.is_platform_admin((SELECT auth.uid())) OR public.has_role((SELECT auth.uid()), 'admin'::app_role) OR public.has_role((SELECT auth.uid()), 'manager'::app_role) OR public.has_permission((SELECT auth.uid()), 'manage_bank_reconciliation'::text));` |
| S052:31 | `CREATE POLICY "Bank executions confirmable by authorized users" ON public.payment_list_bank_executions FOR INSERT TO authenticated WITH CHECK (confirmed_by = (SELECT auth.uid()) AND (public.is_platform_admin((SELECT auth.uid())) OR public.has_role((SELECT auth.uid()), 'admin'::app_role) OR public.has_role((SELECT auth.uid()), 'manager'::app_role) OR public.has_permission((SELECT auth.uid()), 'manage_bank_reconciliation'::text)));` |
| S052:35 | `CREATE POLICY "Bank executions removable by authorized users" ON public.payment_list_bank_executions FOR DELETE TO authenticated USING (public.is_platform_admin((SELECT auth.uid())) OR public.has_role((SELECT auth.uid()), 'admin'::app_role) OR public.has_role((SELECT auth.uid()), 'manager'::app_role) OR public.has_permission((SELECT auth.uid()), 'manage_bank_reconciliation'::text));` |
| S056:52 | `GRANT SELECT ON public.cache_payment_contracts TO authenticated;` |
| S056:53 | `GRANT ALL ON public.cache_payment_contracts TO service_role;` |
| S056:54 | `GRANT SELECT ON public.cache_payment_contract_cities TO authenticated;` |
| S056:55 | `GRANT ALL ON public.cache_payment_contract_cities TO service_role;` |
| S056:58 | `CREATE POLICY cache_contracts_select ON public.cache_payment_contracts FOR SELECT TO authenticated USING (company_id = public.current_company_id() OR public.is_platform_admin());` |
| S056:60 | `CREATE POLICY cache_contract_cities_select ON public.cache_payment_contract_cities FOR SELECT TO authenticated USING (company_id = public.current_company_id() OR public.is_platform_admin());` |
| S056:597 | `REVOKE ALL ON FUNCTION public._cache_alloc(numeric, numeric[], int) FROM PUBLIC, anon, authenticated;` |
| S056:598 | `REVOKE ALL ON FUNCTION public._cache_assert_actor() FROM PUBLIC, anon, authenticated;` |
| S056:599 | `REVOKE ALL ON FUNCTION public._cache_cities(uuid, uuid) FROM PUBLIC, anon, authenticated;` |
| S056:600 | `REVOKE ALL ON FUNCTION public._cache_category(uuid) FROM PUBLIC, anon, authenticated;` |
| S056:601 | `REVOKE ALL ON FUNCTION public._cache_free_advances(uuid, uuid) FROM PUBLIC, anon, authenticated;` |
| S056:602 | `REVOKE ALL ON FUNCTION public._cache_create_contract(uuid, uuid, uuid, uuid, numeric, boolean, numeric, date, date, uuid[], text, text) FROM PUBLIC, anon, authenticated;` |
| S056:603 | `REVOKE ALL ON FUNCTION public._cache_cancel_contract(uuid, uuid, text) FROM PUBLIC, anon, authenticated;` |
| S056:607 | `REVOKE ALL ON FUNCTION public.create_cache_advance(uuid, uuid, uuid, numeric, date, text, text) FROM PUBLIC, anon;` |
| S056:608 | `REVOKE ALL ON FUNCTION public.add_cache_contract_advance(uuid, numeric, date, text, text) FROM PUBLIC, anon;` |
| S056:609 | `REVOKE ALL ON FUNCTION public.cache_contract_context(uuid, uuid) FROM PUBLIC, anon;` |
| S056:613 | `GRANT EXECUTE ON FUNCTION public.create_cache_advance(uuid, uuid, uuid, numeric, date, text, text) TO authenticated;` |
| S056:614 | `GRANT EXECUTE ON FUNCTION public.add_cache_contract_advance(uuid, numeric, date, text, text) TO authenticated;` |
| S056:615 | `GRANT EXECUTE ON FUNCTION public.cache_contract_context(uuid, uuid) TO authenticated;` |
| S056:651 | `REVOKE ALL ON FUNCTION public._run_invariant_checks_cache_contracts() FROM PUBLIC, anon, authenticated;` |
| S057:274 | `REVOKE ALL ON FUNCTION public._cache_guc_choices() FROM PUBLIC, anon, authenticated;` |
| S057:275 | `REVOKE ALL ON FUNCTION public._cache_event_in_closing(uuid) FROM PUBLIC, anon, authenticated;` |
| S057:276 | `REVOKE ALL ON FUNCTION public._cache_resolve_lines(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;` |
| S057:277 | `REVOKE ALL ON FUNCTION public._cache_cities_x(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;` |
| S057:278 | `REVOKE ALL ON FUNCTION public._cache_cities(uuid, uuid) FROM PUBLIC, anon, authenticated;` |
| S057:279 | `REVOKE ALL ON FUNCTION public._cache_assert_lines(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;` |
| S057:280 | `REVOKE ALL ON FUNCTION public._cache_free_advances_x(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;` |
| S057:281 | `REVOKE ALL ON FUNCTION public._cache_free_advances(uuid, uuid) FROM PUBLIC, anon, authenticated;` |
| S057:283 | `REVOKE ALL ON FUNCTION public.create_cache_advance(uuid, uuid, uuid, numeric, date, text, text, jsonb) FROM PUBLIC, anon;` |
| S057:286 | `GRANT EXECUTE ON FUNCTION public.create_cache_advance(uuid, uuid, uuid, numeric, date, text, text, jsonb) TO authenticated;` |
| S058:86 | `REVOKE ALL ON FUNCTION public._cache_cancel_contract(uuid, uuid, text) FROM PUBLIC, anon, authenticated;` |
| S059:131 | `REVOKE ALL ON FUNCTION public.attach_cache_advance_to_contract(uuid, uuid, boolean) FROM PUBLIC, anon;` |
| S059:132 | `GRANT EXECUTE ON FUNCTION public.attach_cache_advance_to_contract(uuid, uuid, boolean) TO authenticated, service_role;` |
| S061:38 | `REVOKE ALL ON public.partner_payment_contracts FROM PUBLIC, anon, authenticated;` |
| S061:39 | `GRANT SELECT ON public.partner_payment_contracts TO authenticated;` |
| S061:40 | `GRANT ALL ON public.partner_payment_contracts TO service_role;` |
| S061:42 | `CREATE POLICY partner_contracts_select ON public.partner_payment_contracts FOR SELECT TO authenticated USING ((company_id = public.current_company_id()) OR public.is_platform_admin());` |
| S063:295 | `REVOKE ALL ON FUNCTION public._partner_contract_share(uuid) FROM PUBLIC, anon, authenticated, service_role;` |
| S063:296 | `REVOKE ALL ON FUNCTION public._partner_contract_assert_unpaid(uuid[]) FROM PUBLIC, anon, authenticated, service_role;` |
| S063:297 | `REVOKE ALL ON FUNCTION public._partner_contract_advance(uuid,uuid,uuid,boolean) FROM PUBLIC, anon, authenticated, service_role;` |
| S063:298 | `REVOKE ALL ON FUNCTION public.create_partner_payment_contract(uuid,uuid,numeric,boolean,numeric,date,date,uuid[],text,text) FROM PUBLIC, anon, authenticated, service_role;` |
| S063:299 | `REVOKE ALL ON FUNCTION public.cancel_partner_payment_contract(uuid,text) FROM PUBLIC, anon, authenticated, service_role;` |
| S063:301 | `REVOKE ALL ON FUNCTION public.attach_partner_advance_to_contract(uuid,uuid,boolean) FROM PUBLIC, anon, authenticated, service_role;` |
| S063:302 | `REVOKE ALL ON FUNCTION public.partner_contract_status(uuid) FROM PUBLIC, anon, authenticated, service_role;` |
| S063:303 | `GRANT EXECUTE ON FUNCTION public.create_partner_payment_contract(uuid,uuid,numeric,boolean,numeric,date,date,uuid[],text,text) TO authenticated, service_role;` |
| S063:304 | `GRANT EXECUTE ON FUNCTION public.cancel_partner_payment_contract(uuid,text) TO authenticated, service_role;` |
| S063:306 | `GRANT EXECUTE ON FUNCTION public.attach_partner_advance_to_contract(uuid,uuid,boolean) TO authenticated, service_role;` |
| S063:307 | `GRANT EXECUTE ON FUNCTION public.partner_contract_status(uuid) TO authenticated, service_role;` |
| S065:152 | `REVOKE EXECUTE ON FUNCTION public._event_stage_guard(),public._event_stage_legacy_reopen(),public._event_stage_access(uuid,text),public.event_stage(uuid),public.event_stage_list(),public.event_close_checklist(uuid),public.close_event(uuid,text),public.reopen_event_closure(uuid,text),public.mark_event_historical(uuid,text),public.unmark_event_historical(uuid) FROM PUBLIC;` |
| S065:153 | `REVOKE EXECUTE ON FUNCTION public._event_stage_guard(),public._event_stage_legacy_reopen(),public._event_stage_access(uuid,text),public.event_stage(uuid),public.event_stage_list(),public.event_close_checklist(uuid),public.close_event(uuid,text),public.reopen_event_closure(uuid,text),public.mark_event_historical(uuid,text),public.unmark_event_historical(uuid) FROM anon,authenticated,service_role;` |
| S065:154 | `GRANT EXECUTE ON FUNCTION public.event_stage(uuid),public.event_stage_list(),public.event_close_checklist(uuid) TO authenticated,service_role;` |
| S065:155 | `GRANT EXECUTE ON FUNCTION public.close_event(uuid,text),public.reopen_event_closure(uuid,text),public.mark_event_historical(uuid,text),public.unmark_event_historical(uuid) TO authenticated;` |
| S066:125 | `REVOKE EXECUTE ON FUNCTION public.event_stage(uuid),public.event_close_checklist(uuid),public.close_event(uuid,text),public.reopen_event_closure(uuid,text),public.mark_event_historical(uuid,text),public.unmark_event_historical(uuid) FROM PUBLIC;` |
| S066:126 | `REVOKE EXECUTE ON FUNCTION public.event_stage(uuid),public.event_close_checklist(uuid),public.close_event(uuid,text),public.reopen_event_closure(uuid,text),public.mark_event_historical(uuid,text),public.unmark_event_historical(uuid) FROM anon,authenticated,service_role;` |
| S066:127 | `GRANT EXECUTE ON FUNCTION public.event_stage(uuid),public.event_close_checklist(uuid) TO authenticated,service_role;` |
| S066:128 | `GRANT EXECUTE ON FUNCTION public.close_event(uuid,text),public.reopen_event_closure(uuid,text),public.mark_event_historical(uuid,text),public.unmark_event_historical(uuid) TO authenticated;` |
| S067:322 | `REVOKE ALL ON FUNCTION public.get_financial_position_base(uuid, integer) FROM PUBLIC;` |
| S067:323 | `REVOKE ALL ON FUNCTION public.get_financial_position_base(uuid, integer) FROM anon;` |
| S067:324 | `GRANT EXECUTE ON FUNCTION public.get_financial_position_base(uuid, integer) TO authenticated;` |
| S067:325 | `GRANT EXECUTE ON FUNCTION public.get_financial_position_base(uuid, integer) TO service_role;` |
| S068:324 | `REVOKE ALL ON FUNCTION public.get_financial_position_base(uuid, integer) FROM PUBLIC;` |
| S068:325 | `REVOKE ALL ON FUNCTION public.get_financial_position_base(uuid, integer) FROM anon;` |
| S068:326 | `GRANT EXECUTE ON FUNCTION public.get_financial_position_base(uuid, integer) TO authenticated;` |
| S068:327 | `GRANT EXECUTE ON FUNCTION public.get_financial_position_base(uuid, integer) TO service_role;` |
| S069:366 | `REVOKE ALL ON FUNCTION public.get_financial_position_base(uuid, integer) FROM PUBLIC;` |
| S069:367 | `REVOKE ALL ON FUNCTION public.get_financial_position_base(uuid, integer) FROM anon;` |
| S069:368 | `GRANT EXECUTE ON FUNCTION public.get_financial_position_base(uuid, integer) TO authenticated;` |
| S069:369 | `GRANT EXECUTE ON FUNCTION public.get_financial_position_base(uuid, integer) TO service_role;` |
| S070:406 | `REVOKE ALL ON FUNCTION public.get_financial_position_base(uuid, integer) FROM PUBLIC;` |
| S070:407 | `REVOKE ALL ON FUNCTION public.get_financial_position_base(uuid, integer) FROM anon;` |
| S070:408 | `GRANT EXECUTE ON FUNCTION public.get_financial_position_base(uuid, integer) TO authenticated;` |
| S070:409 | `GRANT EXECUTE ON FUNCTION public.get_financial_position_base(uuid, integer) TO service_role;` |
| S071:22 | `REVOKE ALL ON FUNCTION public.reimbursement_payment_force_exclude() FROM PUBLIC, anon, authenticated;` |
| S074:71 | `CREATE POLICY company_isolation_event_coverage_scenarios ON public.event_coverage_scenarios AS RESTRICTIVE FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));` |
| S074:75 | `CREATE POLICY event_coverage_scenarios_select ON public.event_coverage_scenarios FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()) OR public.has_permission(auth.uid(), 'view_financial_position'));` |
| S074:78 | `CREATE POLICY event_coverage_scenarios_write ON public.event_coverage_scenarios FOR ALL TO authenticated USING (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)) WITH CHECK (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role));` |
| S074:83 | `CREATE POLICY company_isolation_event_coverage_scenario_log ON public.event_coverage_scenario_log AS RESTRICTIVE FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));` |
| S074:87 | `CREATE POLICY event_coverage_scenario_log_select ON public.event_coverage_scenario_log FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()) OR public.has_permission(auth.uid(), 'view_financial_position'));` |
| S074:511 | `REVOKE ALL ON FUNCTION public.get_financial_position_base(uuid, integer) FROM PUBLIC;` |
| S074:512 | `REVOKE ALL ON FUNCTION public.get_financial_position_base(uuid, integer) FROM anon;` |
| S074:513 | `GRANT EXECUTE ON FUNCTION public.get_financial_position_base(uuid, integer) TO authenticated;` |
| S074:514 | `GRANT EXECUTE ON FUNCTION public.get_financial_position_base(uuid, integer) TO service_role;` |
| S075:27 | `GRANT EXECUTE ON FUNCTION public.storage_path_belongs_to_current_company(text) TO PUBLIC;` |
| S075:28 | `GRANT EXECUTE ON FUNCTION public.storage_path_belongs_to_current_company(text) TO anon;` |
| S075:29 | `GRANT EXECUTE ON FUNCTION public.storage_path_belongs_to_current_company(text) TO authenticated;` |
| S075:30 | `GRANT EXECUTE ON FUNCTION public.storage_path_belongs_to_current_company(text) TO service_role;` |
| S078:85 | `REVOKE ALL ON FUNCTION public.propagate_house_only_to_transactions() FROM PUBLIC;` |
| S078:86 | `REVOKE ALL ON FUNCTION public.propagate_house_only_to_transactions() FROM anon;` |
| S081:54 | `DROP POLICY IF EXISTS "Transaction docs deletable by privileged roles" ON public.transaction_documents;` |
| S081:55 | `CREATE POLICY "Transaction docs deletable by privileged roles" ON public.transaction_documents AS PERMISSIVE FOR DELETE TO authenticated USING ( public.is_platform_admin((SELECT auth.uid())) OR public.has_permission_in((SELECT auth.uid()), 'delete_transaction_documents', company_id) );` |


## Anexo D — geração dinâmica, limites de completude e catálogo pendente

Os anexos B/C são índices de instruções e assinaturas, não um parser completo PostgreSQL nem uma reprodução de instalação. Uma função que só aparece com ALTER FUNCTION RENAME, EXECUTE de texto, pg_get_functiondef/replace ou nome resolvido em runtime pode escapar à relação nominal. O catálogo completo precisa incluir pg_depend, triggers internos/FKs, rules, policies, defaults, overloaded signatures, owners, grants de roles e privilégios por omissão; dependências PL/pgSQL/dinâmicas requerem também leitura dos corpos e caminhos de execução.

| Fonte de inferência | Mecanismo observado / ordem histórica de fonte | Limite e contraprova pendente |
|---|---|---|
| S274:66/197 e S275:46–75 | row_belongs_to_current_company, set_company_id_on_insert e loops que criam policies restritivas/BEFORE INSERT em transactions, pagamentos, docs, auditoria, extras e outras tabelas | Trigger só preenche company_id NULL; não valida valor não nulo. Não protege por si só SECDEF. Conferir nomes efetivos/duplicados e RLS enabled/forced; não assumir que loop correu ou que lista se manteve. |
| S276:55–70; S361:1 | Isolamento e trigger de partner_paid_expenses; remoção dinâmica de trigger duplicado por tabela e remoção de helpers L2 sem trigger | Com nomes diferentes pode mudar disparo/ordem. Não contar os dois triggers de company_id como guarda dupla instalada. |
| S347:23–24/33/86/121 | Remove triggers L2; cria realinhamento BP→TX e TX→BP, com pg_trigger_depth; corpo em C1 | Memória L2 não prevalece. Confirmar substituições posteriores, alvo N:1/âncora e disparos sob INSERT de irmãs antes de definir preservação de categoria. |
| S435:1–28 | Revogação dinâmica de EXECUTE PUBLIC/anon em SECDEF não usadas nas policies e mudança de privilégios por omissão de postgres em public/crm | Não confirma ACL efetiva de uma RPC existente; grants nominais/herdados/owners de criação diferentes exigem has_function_privilege por ator. Um CREATE OR REPLACE não permite inferir a ACL final. |
| S182:42–60/121–214/231–267; S178:9/135; S188:13 | Contexto privado vinculado a backend/transação/trigger, guarda de documento gerido e geração dinâmica de triggers; variantes de approval/derive em ficheiros manuais | Não usar estes corpos como instalados, nem role/GUC como substituto do contexto. Reconciliar catálogo e comparar variantes INERTE/ROLLBACK separadamente; F registra os ficheiros. |
| S019:5–69 | Cria _assert_row_company e renomeia funções de outros fluxos para __impl, com invólucros/ACL | Não contém proteção explícita da renegociação por analogia. Só catálogo/texto completo pode excluir outro patch dinâmico; não declarar que “nenhum wrapper existe instalado”. |
| S018:4–17 e S024:1 | Patches pg_get_functiondef/replace em saldo; efeito indireto de pernas pagas/estornos | Não reimplementar saldo na RPC; preservar classificação/pernas. Patches dependem do corpo anterior real. |
| S056:150–203/331–398; S063:4–64/85–111/159–166 | Escritores especializados cache/contratos, locks/advisory e contexto transacional próprios | Não são autorizações para usar GUC/contextos privados na renegociação; recusar contexto especial até contrato demonstrado. Fontes preparadas não equivalem a catálogo aplicado. |
| Memória de rederivação + chamadas posteriores que usam campos não localizados em B | Evidência de incompletude do inventário declarativo reconstruível a partir dos dois históricos | Solicitar definição/catalogação autorizada; não montar “catálogo fiel” omitindo o corpo ausente. Arquivos manuais de watch são allowlists, não corpos dos triggers e não prova de prevenção. |
| Anexos A–C e chamadas em E | Pesquisa estática/seguimento local, sem executar SQL contra catálogo MP | Não prova ausência de callers externos, RPCs construídas em runtime, triggers adicionados fora do checkout ou objetos privados. Não se leu/reconstruiu dossier privado, replay ou bindings. A única entrega é esta matriz. |

## Anexo E — ligações reais da aplicação aos recursos

Esta tabela segue caminhos efetivos, não só ocorrências do nome da RPC. Cada fonte tem hash em A; a existência do caller não certifica execução no ambiente instalado. Chamadas cliente separadas não mantêm locks SQL entre requests.

| Fonte / linha | Cadeia real e efeito relevante |
|---|---|
| S110:165–190 | mutation → assertEuroInstallmentChange → validateInstallments → computeInstallmentNets → uma chamada renegotiate_transaction_installments com amount/due_date. Não envia original/FX arbitrários. |
| S107:245–281 | Preflight de todas as linhas → guarda moeda/pagas → UPDATE sequencial transactions → auditoria; datas estrangeiras isoladas preservam amount. Outro escritor de mesma linha, sem atomicidade de grupo. |
| S106:1295–1313/1590–1625/1814–1841 | Criação Modelo A usa installmentOriginals e grava forecast_id na primeira e nas irmãs, original repartido e FX/fonte. Marcação do grupo e INSERTs são chamadas separadas; não prova criação atómica. |
| S105:2069/2370/2398 | Edição e conversão/reversão de extra chamam convert_transaction_to_partner_extra / revert_partner_extra. Caminhos monetários/estruturais concorrentes precisam do mesmo contrato de contexto. |
| S108:290–324/520–529 | Vínculo sócio → UPDATE TX → auditoria em requests distintos; pagamento normal INSERT perna → UPDATE campos não derivados da TX; trigger deriva valor pago. |
| S083:447–484 | INSERT de perna → UPDATE TX; liquidação de filhas ocorre no fluxo especializado. Plano e valor lidos no cliente podem anteceder espera SQL. |
| S095:160–180/252/276 | Edição de pagamentos e ajuste direto legacy; RPC reverse_payment / reverse_transaction. Não supor que todas as operações começam pelo lock da TX. |
| S109:118–169 | Outro editor de pernas/ajuste legacy, sujeito a guards/triggers e calls de reversão; C registra os escritores SQL. A faixa integral em A permite revisar os ramos, não equivale a ensaio de concorrência. |
| S093:186/218–234/253/289 | UPDATE TX, INSERT vínculo, aprovação/rejeição e DELETE do vínculo; a proposta pode existir antes de paid_amount. |
| S099:52; S038:86–182 | Cliente → split_transaction_by_bp_lines; original sob lock, guardas estruturais, UPDATE/INSERT/auditoria na RPC. BP lines e grupo de fatura não são grupo de parcelas. |
| S119:54; S098:113/139 | close_event/reopen e seal/unseal são escritores distintos de evento/selos, com locks/guards próprios. Checklist lê fontes cuja estabilidade tem de ser provada. |
| S133:1 | Cliente → serviço existente de eliminação; não introduzir storage na RPC. UPDATE da original retém FK de documentos; nenhum anexo é copiado para irmãs por R5. |
| S122:43–78; S446:302 | makeTxInsert escolhe INSERT direto ou admin_cost_override_write conforme razão; o ramo RPC pode escrever evento/BP/categoria/data. O writer abstrato do formulário não é uma operação atómica de grupo. |
| S130:158/200 | Cliente chama transaction_offset_execute e transaction_offset_reverse com pedidos próprios; o contexto privado só nasce no servidor pelo command trigger das fontes manuais, nunca se injeta na renegociação. |
| S156:97–155/373–375 | Serviço lê TX, valida pertença do caller ao company_id da TX, remove company_id do payload e faz UPDATE por serviço; é um padrão de pertença, não prova de que a RPC tenha herdado a guarda. |
| S148:86/143–149 | Serviço consulta TX/autorização por empresa → approveAtomic → RPC approve_transactions_atomic; a RPC bloqueia TX/BP/filhas e o trigger de aprovação pode adquirir outros locks conforme versão. Deve participar na matriz de alteração de estado concorrente. |
| S146:1210–1227/1304–1332/1360–1378 | Importador pode INSERT TX/vínculo de sócio/âncora, UPDATE amount e DELETE TX. É escritor efetivo, não uma dependência excluída por não chamar renegotiate. Não executado nesta parcela. |
| S145:742–832 | Reversão consulta pernas/listas/reembolsos/revisões/exports, desvincula BP e apaga mãe; FK/cascades e estado de accounting_exports/reviews são dependentes a reconciliar, sem efeitos externos nesta sessão. |
| S152:1; S151:711–764/931–950 | Integrações especializadas criam TX, pernas e anexos; contexto de sessão/cartão não é despesa simples elegível. Não duplicar esse writer na renegociação. |
| S155:152–214/313–346; S154:47/89–120 | Ingestão resolve TX/grupo/empresa e grava anexos; eliminação resolve permissão pela empresa e apaga referências antes do storage. Preservar primeira TX, não alargar a RPC ao storage. |

O Anexo G registra os pontos literais de escrita/chamada adicionais de src/ e serviços, com hashes em A. Outros escritores SQL diretos, derivados e auxiliares estão em C1 (pagamentos, estorno/créditos/compensações, lançamentos bancários dinâmicos, reembolsos, cartões, contratos e mirrors). A possibilidade de writers de importação/serviço e tabelas escolhidas dinamicamente permanece G1/G4: procurar `.from` ou o nome de uma RPC não é prova de inventário do catálogo em execução. Nenhum desses writers foi alterado ou chamado nesta parcela.

## Anexo F — fontes manuais relacionadas (não aplicadas nesta execução)

São ficheiros de preparação, cópia, contraprova ou rollback; a ordem abaixo é apenas lexical. Nenhum é presumido instalado nem autoriza aplicação. Registo estrutural de símbolos e linhas para reconciliar com A e o catálogo; não se publicam corpos, papéis técnicos de ambiente ou dados de fixtures. Uma versão ROLLBACK não substitui a versão INERTE da mesma assinatura. Não executar em lote.

| Fonte | Definições e pontos de escrita/guarda localizados |
|---|---|
| S157 | ACL/policies/estrutura nas linhas 38,39,40,41,42,46 |
| S158 | ACL/policies/estrutura nas linhas 3,5 |
| S159 | `CREATE OR REPLACE FUNCTION public._partner_contract_share(_participant_id uuid)`:4 (locks: 14,18); `CREATE OR REPLACE FUNCTION public._partner_contract_assert_unpaid(_ids uuid[])`:35 (locks: 39); `CREATE OR REPLACE FUNCTION public._partner_contract_advance(_participant_id uuid, _tx_id uuid, _beneficiary uuid, _confirm boolean)`:58 (locks: 64); `CREATE OR REPLACE FUNCTION public.create_partner_payment_contract( _participant_id uuid, _beneficiary uuid, _gross numeric, _wh_applies boolean, _wh_rate numeric, _wh_due date, _due date, _advance_ids uuid[] DEFAULT '{}'::uuid[], _label text DEFAULT NULL, _key text DEFAULT NULL)`:85 (locks: 111); `CREATE OR REPLACE FUNCTION public.cancel_partner_payment_contract(_contract_id uuid, _reason text)`:159 (locks: 166); `CREATE OR REPLACE FUNCTION public.attach_partner_advance_to_contract(_contract_id uuid, _advance_tx_id uuid, _confirm_beneficiary boolean DEFAULT false)`:228 (locks: 235,237,241); `CREATE OR REPLACE FUNCTION public.partner_contract_status(_participant_id uuid)`:262; ACL/policies/estrutura nas linhas 295,296,297,298,299,300,301,302,303,304,305,306,307 |
| S160 | trigger `zzz_partner_contract_guard`:77; trigger `zzz_partner_payment_contracts_guard`:79; ACL/policies/estrutura nas linhas 73,74 |
| S162 | `CREATE FUNCTION public.get_financial_position_base(p_company_id uuid, p_year integer DEFAULT NULL)`:6; ACL/policies/estrutura nas linhas 322,323,324,325 |
| S163 | `CREATE OR REPLACE FUNCTION public.get_financial_position_base(p_company_id uuid, p_year integer DEFAULT NULL)`:12; ACL/policies/estrutura nas linhas 324,325,326,327 |
| S164 | `CREATE OR REPLACE FUNCTION public.get_financial_position_base(p_company_id uuid, p_year integer DEFAULT NULL)`:5; ACL/policies/estrutura nas linhas 366,367,368,369 |
| S165 | `CREATE OR REPLACE FUNCTION public.get_financial_position_base(p_company_id uuid, p_year integer DEFAULT NULL)`:5; ACL/policies/estrutura nas linhas 406,407,408,409 |
| S166 | `CREATE OR REPLACE FUNCTION public.reimbursement_payment_force_exclude()`:7; `CREATE OR REPLACE FUNCTION public._run_invariant_checks_extra()`:62; trigger `trg_reimbursement_payment_force_exclude`:27; trigger `trg_reimbursement_payment_guard_exclude`:50; ACL/policies/estrutura nas linhas 24,47 |
| S167 | `CREATE OR REPLACE FUNCTION public.get_financial_position_base(p_company_id uuid, p_year integer DEFAULT NULL)`:91; trigger `trg_event_coverage_scenarios_stamp`:65; trigger `trg_event_coverage_scenarios_log`:68; ACL/policies/estrutura nas linhas 17,18,19,32,33,34,61,62,71,75,78,83,87,511,512,513,514 |
| S168 | trigger `trg_guard_excluded_from_partner_settlement`:64; trigger `trg_guard_forecast_excluded_from_partner_settlement`:67; ACL/policies/estrutura nas linhas 8,10,19,25,61,62 |
| S169 | `CREATE OR REPLACE FUNCTION public.propagate_house_only_to_transactions()`:65; trigger `trg_inherit_house_only_from_forecast`:58; trigger `trg_propagate_house_only_to_transactions`:88; ACL/policies/estrutura nas linhas 55,56,85,86 |
| S170 | `CREATE OR REPLACE FUNCTION public.card_load_on_out_paid()`:64 |
| S171 | `CREATE OR REPLACE FUNCTION public.reconcile_bank_line(p_line_id uuid, p_items jsonb)`:253 (locks: 298,466) |
| S172 | ACL/policies/estrutura nas linhas 55 |
| S173 | `CREATE OR REPLACE FUNCTION public.get_event_cash_position(p_company_id uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date)`:9 |
| S174 | `CREATE OR REPLACE FUNCTION public.get_event_cash_position(p_company_id uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date)`:7 |
| S175 | `CREATE OR REPLACE FUNCTION public.get_event_cash_position_invariant(p_company_id uuid)`:6 |
| S176 | `CREATE FUNCTION public.issue335_cash_watch()`:13; `CREATE OR REPLACE FUNCTION public.issue335_balance_invariant_count()`:73; ACL/policies/estrutura nas linhas 71,72 |
| S177 | `CREATE OR REPLACE FUNCTION public.issue335_balance_invariant_count()`:5 |
| S178 | `CREATE OR REPLACE FUNCTION public.enforce_transaction_approval_permission()`:9 (locks: 135) |
| S179 | `CREATE OR REPLACE FUNCTION public.enforce_transaction_approval_permission()`:7 (locks: 107) |
| S180 | `CREATE OR REPLACE FUNCTION public._account_true_balance_raw(_account_id uuid)`:5; `CREATE OR REPLACE FUNCTION public._account_true_balance_asof_raw(_account_id uuid, _as_of date DEFAULT NULL::date)`:62; `CREATE FUNCTION public.issue335_balance_invariant_count()`:118; ACL/policies/estrutura nas linhas 125,126 |
| S181 | `CREATE OR REPLACE FUNCTION public._account_true_balance_raw(_account_id uuid)`:7; `CREATE OR REPLACE FUNCTION public._account_true_balance_asof_raw(_account_id uuid, _as_of date DEFAULT NULL::date)`:44 |
| S182 | `CREATE OR REPLACE FUNCTION public.issue335_matching_transactions(p_forecast uuid)`:16; `CREATE FUNCTION public.issue335_context_valid(p_operation text DEFAULT NULL)`:42; `CREATE FUNCTION public.issue335_uid()`:61; `CREATE FUNCTION public.issue335_payment_flow_blocked(p_tx uuid)`:77; `CREATE FUNCTION public.issue335_camarim_leg(p_tx uuid)`:97; `CREATE OR REPLACE FUNCTION public.issue335_guard()`:121 (locks: 159); `CREATE OR REPLACE FUNCTION public._issue335_execute( p_request_id uuid,p_supplier_id uuid,p_items jsonb,p_movement jsonb,p_date date,p_note text DEFAULT NULL )`:215 (locks: 231,234,244,252,264,267,268,343); `CREATE OR REPLACE FUNCTION public._issue335_reverse(p_group_id uuid,p_request_id uuid,p_reason text)`:376 (locks: 385,389,391,392,413,414); `CREATE OR REPLACE FUNCTION public._apply_transaction_offset(p_offset_id uuid, p_origin_payment_id uuid)`:432; `CREATE OR REPLACE FUNCTION public._reverse_transaction_offsets_for(p_tx_id uuid)`:494; `CREATE OR REPLACE FUNCTION public.reverse_payment(p_payment_id uuid, p_kind text, p_reason text, p_valid_until date DEFAULT NULL::date, p_amount numeric DEFAULT NULL::numeric)`:525 (locks: 552,565); `CREATE OR REPLACE FUNCTION public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date, p_release_for_repayment boolean)`:678 (locks: 707); `CREATE OR REPLACE FUNCTION public.reconcile_bank_line(p_line_id uuid, p_items jsonb)`:863 (locks: 903); trigger `issue335_guard`:212; trigger `issue335_dispatch`:1133; ACL/policies/estrutura nas linhas 24,32,33,39,40,41,49,50,59,60,62,63,66,67,68,69,70,71,92,93,105,106,110,111,112,113,114,208,1085,1086,1096,1097,1099,1100,1132,1137,1138,1140,1141,1150,1151,1162,1163 |
| S183 | `CREATE OR REPLACE FUNCTION public._apply_transaction_offset(p_offset_id uuid, p_origin_payment_id uuid)`:31; `CREATE OR REPLACE FUNCTION public._reverse_transaction_offsets_for(p_tx_id uuid)`:98; `CREATE OR REPLACE FUNCTION public.reconcile_bank_line(p_line_id uuid, p_items jsonb)`:133; `CREATE OR REPLACE FUNCTION public.reverse_payment(p_payment_id uuid, p_kind text, p_reason text, p_valid_until date DEFAULT NULL::date, p_amount numeric DEFAULT NULL::numeric)`:323 (locks: 348,361); `CREATE OR REPLACE FUNCTION public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date DEFAULT NULL::date)`:479; `CREATE OR REPLACE FUNCTION public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date, p_release_for_repayment boolean)`:493 (locks: 520); ACL/policies/estrutura nas linhas 9,93,94,95,96,97,129,130,131,132,318,319,320,321,322,474,475,476,477,478,488,489,490,491,492,676,677,678,679,680,682,704,705,706,707,708,709,710,713,714 |
| S184 | `CREATE OR REPLACE FUNCTION public.issue335_tx_visible(_tx uuid)`:69; ACL/policies/estrutura nas linhas 29,30,31,32,34,37,58,59,60,61,63,66,81,82,84,86,87,88,97,98,111,112,113 |
| S185 | ACL/policies/estrutura nas linhas 14,15,16 |
| S186 | `CREATE OR REPLACE FUNCTION public.issue335_invariant_counts()`:5; `CREATE OR REPLACE FUNCTION public._run_invariant_checks_extra()`:24; ACL/policies/estrutura nas linhas 18,19,286,287 |
| S187 | `CREATE OR REPLACE FUNCTION public._run_invariant_checks_extra()`:6; ACL/policies/estrutura nas linhas 262,263,264,265 |
| S188 | `CREATE OR REPLACE FUNCTION public._derive_paid_amount(p_tx_id uuid)`:13 |
| S189 | `CREATE OR REPLACE FUNCTION public._derive_paid_amount(p_tx_id uuid)`:6 |
| S190 | `CREATE FUNCTION public.issue335_trigger_watch()`:13; ACL/policies/estrutura nas linhas 105,106 |
| S191 | `CREATE OR REPLACE FUNCTION public.cache_contract_context(p_event_id uuid, p_artist_supplier_id uuid)`:5; `CREATE OR REPLACE FUNCTION public._run_invariant_checks_cache_contracts()`:63 |
| S192 | Referências/patches a reconciliar nas linhas 3, 4 |
| S193 | Referências/patches a reconciliar nas linhas 44, 46 |
| S194 | Referências/patches a reconciliar nas linhas 2 |
| S195 | Referências/patches a reconciliar nas linhas 65, 76, 84, 119, 152, 228 |
| S196 | Referências/patches a reconciliar nas linhas 66, 77, 85, 120, 153, 270 |
| S197 | Referências/patches a reconciliar nas linhas 4, 124, 144, 147, 154, 198, 218, 221, 225, 228 |
| S198 | Referências/patches a reconciliar nas linhas 3, 6, 9, 11 |
| S199 | Referências/patches a reconciliar nas linhas 6 |

## Anexo G — pontos literais de escrita e chamadas a writers SQL

Levantamento de `.from(tabela).insert/update/delete/upsert` nos seis recursos nucleares e de chamadas literais a RPCs cujo corpo versionado escreve esses recursos. Inclui src/ e funções de serviço; exclui testes/fixtures e material de replay/bindings. Cada ponto é linha de chamada, não prova de autorização/atomicidade; strings SQL dinâmicas, nomes de tabela/RPC em variáveis, wrappers e callers externos não ficam provados ausentes. As cadeias reais centrais e o wrapper makeTxInsert são seguidos em E. Não são novos writers nem código executado.

| Fonte | Pontos de escrita/chamada (linha:alvo) |
|---|---|
| S082 | 114:`transaction_documents.insert`; 143:`transaction_documents.delete`; 189:`transaction_documents.insert` |
| S083 | 440:`transaction_audit_log.insert`; 447:`transaction_payments.insert`; 475:`transactions.update`; 524:`transactions.update` |
| S084 | 542:`rpc add_cache_contract_advance`; 543:`rpc create_cache_advance`; 661:`rpc attach_cache_advance_to_contract` |
| S085 | 1265:`transactions.insert`; 1290:`transaction_audit_log.insert`; 1298:`transaction_audit_log.insert`; 1335:`transaction_documents.insert`; 1442:`transactions.insert`; 1468:`transaction_audit_log.insert`; 1476:`transaction_audit_log.insert`; 3730:`transaction_documents.insert` |
| S086 | 291:`transactions.update`; 319:`transactions.update` |
| S087 | 214:`transactions.insert`; 221:`transactions.insert`; 237:`transaction_audit_log.insert` |
| S088 | 97:`transactions.update` |
| S089 | 86:`transactions.update`; 130:`transactions.update`; 149:`transactions.update` |
| S090 | 79:`rpc rename_operation_key`; 98:`rpc clear_operation_key` |
| S091 | 226:`transaction_documents.insert` |
| S092 | 79:`transactions.insert` |
| S093 | 186:`transactions.update`; 189:`transaction_audit_log.insert`; 218:`partner_paid_expenses.insert`; 253:`partner_paid_expenses.delete`; 267:`partner_paid_expenses.update`; 289:`partner_paid_expenses.delete` |
| S094 | 137:`transaction_documents.insert` |
| S095 | 160:`transaction_payments.insert`; 173:`transactions.update`; 180:`transactions.update`; 229:`transaction_audit_log.insert`; 252:`rpc reverse_payment`; 276:`rpc reverse_transaction` |
| S096 | 87:`transactions.insert` |
| S097 | 221:`transactions.update`; 332:`transactions.insert`; 420:`transactions.delete`; 824:`transactions.update` |
| S099 | 52:`rpc split_transaction_by_bp_lines` |
| S100 | 286:`transactions.insert` |
| S101 | 163:`transactions.insert` |
| S102 | 583:`transaction_documents.insert`; 658:`rpc save_ticket_office_settlement` |
| S103 | 82:`transactions.update`; 88:`transaction_audit_log.insert`; 119:`rpc reverse_ticket_office_settlement` |
| S104 | 242:`transaction_documents.insert`; 247:`transaction_documents.delete`; 454:`transaction_documents.update` |
| S105 | 806:`transactions.update`; 859:`partner_paid_expenses.delete`; 869:`partner_paid_expenses.update`; 2009:`transactions.update`; 2017:`transactions.update`; 2020:`transactions.insert`; 2069:`rpc revert_partner_extra`; 2158:`transactions.update`; 2168:`rpc revert_partner_extra`; 2170:`transactions.update`; 2174:`transactions.delete`; 2323:`transactions.update`; 2330:`transactions.insert`; 2357:`transactions.update`; 2365:`transactions.delete`; 2370:`rpc convert_transaction_to_partner_extra`; 2374:`transactions.update`; 2375:`transactions.delete`; 2398:`rpc convert_transaction_to_partner_extra`; 2816:`rpc revert_partner_extra`; 2822:`transactions.update` |
| S106 | 1449:`transaction_audit_log.insert`; 1460:`transactions.insert`; 1674:`transaction_audit_log.insert`; 1722:`transaction_audit_log.insert`; 1732:`transaction_audit_log.insert`; 1794:`transactions.update`; 1853:`transaction_audit_log.insert`; 1864:`transaction_audit_log.insert`; 1938:`rpc convert_transaction_to_partner_extra`; 1945:`rpc convert_transaction_to_partner_extra`; 2081:`transaction_documents.insert` |
| S107 | 276:`transactions.update`; 302:`transaction_audit_log.insert` |
| S108 | 290:`partner_paid_expenses.insert`; 304:`transactions.update`; 315:`transaction_audit_log.insert`; 488:`transaction_audit_log.insert`; 520:`transaction_payments.insert`; 527:`transactions.update`; 594:`transactions.update`; 604:`transaction_audit_log.insert` |
| S109 | 149:`transaction_payments.update`; 162:`transactions.update`; 216:`transaction_audit_log.insert`; 236:`transaction_payments.delete`; 257:`transactions.update`; 265:`transaction_audit_log.insert`; 302:`transaction_payments.insert`; 315:`transactions.update`; 322:`transactions.update`; 339:`transaction_audit_log.insert` |
| S110 | 181:`rpc renegotiate_transaction_installments` |
| S111 | 88:`transactions.insert`; 108:`transactions.insert`; 143:`transaction_audit_log.insert` |
| S112 | 127:`transaction_documents.insert`; 175:`transaction_documents.delete` |
| S113 | 110:`rpc launch_from_bank_lines` |
| S114 | 243:`transactions.insert`; 263:`transactions.insert` |
| S115 | 355:`transaction_documents.insert`; 426:`transactions.update`; 454:`transaction_audit_log.insert` |
| S116 | 37:`rpc create_card_session_load` |
| S117 | 370:`transactions.update` |
| S118 | 343:`rpc relink_orphan_transactions` |
| S122 | 48:`rpc admin_cost_override_write`; 67:`transactions.insert` |
| S123 | 64:`transactions.update`; 86:`transactions.update` |
| S124 | 35:`rpc delete_transaction_cascade` |
| S125 | 920:`transaction_documents.insert`; 1109:`transaction_documents.insert` |
| S129 | 227:`transactions.update`; 312:`transactions.update`; 324:`transactions.update` |
| S130 | 120:`rpc reconcile_bank_line` |
| S131 | 85:`transactions.update`; 121:`transactions.insert`; 165:`transactions.delete` |
| S132 | 74:`rpc apply_supplier_credit` |
| S134 | 120:`rpc transaction_offset_remove` |
| S135 | 258:`transactions.update`; 279:`transactions.update` |
| S136 | 179:`transactions.update` |
| S137 | 1408:`rpc reconcile_bank_line` |
| S138 | 395:`transactions.delete`; 441:`transactions.delete` |
| S139 | 90:`transactions.insert` |
| S140 | 274:`transactions.update`; 560:`transactions.update` |
| S141 | 224:`transactions.insert` |
| S142 | 1197:`transactions.update` |
| S145 | 557:`transactions.insert`; 574:`transactions.insert`; 597:`transaction_documents.insert`; 628:`transaction_documents.insert`; 832:`transactions.delete` |
| S146 | 1212:`transactions.delete`; 1304:`transactions.insert`; 1332:`partner_paid_expenses.insert`; 1360:`transactions.update`; 1378:`transactions.delete`; 1764:`transactions.delete`; 2014:`transactions.insert`; 2026:`transactions.insert`; 2037:`transactions.insert`; 2283:`transactions.insert` |
| S147 | 21:`rpc approve_transactions_atomic` |
| S149 | 96:`transactions.update` |
| S150 | 335:`transactions.update` |
| S151 | 711:`transactions.insert`; 741:`transaction_payments.insert`; 764:`transaction_documents.insert`; 821:`transaction_documents.insert`; 931:`transactions.insert`; 936:`transaction_payments.insert`; 950:`transactions.insert`; 984:`transaction_audit_log.insert` |
| S152 | 611:`transactions.update`; 616:`transaction_audit_log.insert`; 690:`transactions.insert`; 720:`transaction_documents.insert`; 771:`transaction_documents.insert`; 853:`transactions.insert`; 889:`transaction_audit_log.insert` |
| S154 | 97:`transaction_documents.delete`; 120:`transaction_documents.delete` |
| S155 | 364:`transaction_documents.insert`; 396:`transactions.update` |
| S156 | 373:`transactions.update`; 474:`transaction_audit_log.insert`; 553:`transactions.update`; 613:`transactions.update`; 627:`transaction_audit_log.insert` |

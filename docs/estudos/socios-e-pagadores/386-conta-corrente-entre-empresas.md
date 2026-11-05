# #386 — Conta corrente entre empresas

Desenho de 04/11/2026, ligado à #85, D-ERP246 e D-ERP347. Entrega E2b R1, autorização [6621053352](https://github.com/pedrompropicio/mundopropicio/issues/386#issuecomment-6621053352): apenas documento e teste documental. **Proposta não aplicada**; implementar requer demanda R2 própria.

## Problema

A H&K pode pagar no Brasil obrigações da Mundo Propício que não pertencem a um evento. É preciso reconhecer quem deve a quem e acompanhar a liquidação numa conta corrente por par de empresas, através de transações próprias fora do evento. Colocar esses movimentos num evento alteraria o seu caixa, resultado ou acerto sem fundamento.

O exemplo inclui também contas pessoais do diretor pagas pela H&K. Uma obrigação pessoal não se transforma em obrigação da MP por ter o mesmo pagador: exige identificação do devedor e fica fora da conta corrente empresarial. Uma eventual assunção documentada pela empresa depende de decisão expressa; não se faz mistura nem compensação automática.

Há duas identidades distintas: a **empresa titular do ERP (tenant)**, em `companies`, e a **entidade contraparte**, identificada em `suppliers` desse tenant. A contraparte pode ser uma empresa externa sem conta no ERP. Ser sócia de um evento é um papel adicional dessa entidade; não determina a existência nem os movimentos desta conta.

## Decisões já tomadas

- **01/11/2026 — D-ERP347, Pedro, comentário [6562676341](https://github.com/pedrompropicio/mundopropicio/issues/386#issuecomment-6562676341):** «conta corrente por par de empresas, lançada como transação própria (fora de evento), não dentro do evento. Implementação é R2 (DDL) … Issue de desenho/migração própria». Registo local: [DECISIONS](../../DECISIONS.md), linhas 6557–6562.
- **03/11/2026 — Pedro, comentário [6611416333](https://github.com/pedrompropicio/mundopropicio/issues/386#issuecomment-6611416333):** «desenhar já» e «só documento de desenho»; ligar à #85, considerar confirmadas as regras D-ERP246 e usar H&K Madrid como exemplo. O título de D-ERP246 ainda diz «por confirmar» no ficheiro local; a confirmação posterior prevalece, sem editar esse registo nesta entrega.
- **04/11/2026 — Pedro, comentário [6620350886](https://github.com/pedrompropicio/mundopropicio/issues/386#issuecomment-6620350886), resposta reproduzida no despacho:** preservar D-ERP347; separar tenant de contraparte; aceitar empresa externa em `suppliers` sem ser tenant; não tornar `event_partners` obrigatório; distinguir obrigações da empresa de despesas pessoais do diretor. A identidade da contraparte está decidida e não volta como pergunta.

**Variantes A/B da pergunta 6619716657 — rejeitadas.** A resposta 6620350886 afasta exigir que ambos os lados sejam tenants e afasta fazer de um sócio de evento a contraparte obrigatória: a primeira restrição excluiria empresas externas; a segunda subordinaria uma relação empresarial permanente a um evento e contaminaria o acerto. O texto integral da pergunta A/B não foi incluído no despacho nem localizado nas fontes locais; não se reconstrói a sua redação nem se atribui cada restrição a uma letra. Estas variantes rejeitadas não são as opções técnicas A/B comparadas abaixo.

## O que já existe

**Origem do contexto técnico:** medição em `main` **0715f9793**, em **04/11/2026**, fornecida no despacho da #386. As referências abaixo foram conferidas por leitura local; não houve consulta a Live nem nova medição de dados. Os retratos de outubro têm as datas e fontes indicadas, não são saldos atuais.

| Peça existente | Origem local | Consequência para o desenho |
| --- | --- | --- |
| `transactions.paying_partner_id` referencia `event_partners`; comentário «Socio que desembolsa. NULL = empresa configurada no evento.» | [20260825124356](../../../supabase/migrations/20260825124356_f80c6ff3-4377-4271-88e9-ce4cc092fcfa.sql), linhas 2–5 | É o pagador do evento, não a identidade permanente da contraparte empresarial. |
| `transactions.ordering_partner_id` referencia `event_partners` | [20260818105438](../../../supabase/migrations/20260818105438_3bd734d5-0849-42b6-b59f-e0b110f552e5.sql), linha 5; [ordering-partner](../../../.lovable/memory/features/ordering-partner.md) | Ordenador e pagador são conceitos independentes; nenhum substitui a conta corrente. |
| `held_by_supplier_id` só em receita por compensação: `type='income'` e `payment_method='compensation'` | [partner-settlement](../../../.lovable/memory/features/partner-settlement.md), secção (g7), linha 235 | O campo não identifica o autor de aportes nem pagamentos de despesas. Estar vazio nos aportes não prova quem pagou. |
| `is_transitory` + `transitory_reason`, domínio original de sete motivos, incluindo `aporte_socio` e `emprestimo_socio` | D-ERP80, [DECISIONS](../../DECISIONS.md), linha 2509; [transitory-reason](../../../.lovable/memory/features/transitory-reason.md) | Sete é o domínio descrito por D-ERP80: `partner_advance`, `repasse`, `caucao`, `emprestimo_socio`, `carga_cartao`, `aporte_socio`, `entrada_a_repassar`. D-ERP246 documenta depois o motivo adicional `devolucao_socio`; não se afirma que o domínio atual só tem sete. |
| `financial_accounts.is_circuit_account`: «Conta corrente de circuito de terceiros (D-ERP69). O saldo» é a posição líquida, com zero no fim | [20260916024749](../../../supabase/migrations/20260916024749_0bc034ea-f069-45c8-ad0a-12c4427a7ab1.sql), linhas 1–49; [custo-partilhado-terceiros](../../../.lovable/memory/features/custo-partilhado-terceiros.md) | Precedente de posição por contraparte, não de saldo bancário. `transactions.shared_cost_account_id` e `shared_cost_counterparty_id` produzem espelho na 10.12.01. O espelho fica sem evento, mas a despesa de origem desse fluxo tem evento: não se reutiliza o automatismo sem revisão. |
| Conta-espelho do sócio: `financial_accounts.partner_id` + `mirror_partner_aporte`, função `sync_partner_aporte_mirror` | [partner-aporte-mirror](../../../.lovable/memory/features/partner-aporte-mirror.md); [0295](../../../drizzle/migrations/0295_partner_aporte_mirror_descricao_sem_prefixo.sql) | A despesa paga gera automaticamente aporte, ponte e movimento de capital. O evento vem do sócio; não serve para esta conta fora de evento e não se criam aportes manuais duplicados. |
| `partner_capital_moves`: `partner_id NOT NULL`, `transaction_id UNIQUE`, `kind` = `aporte`/`devolucao`/`distribuicao`, `event_id NOT NULL` | [20260827161600](../../../supabase/migrations/20260827161600_0e668b8b-f54e-4b2a-90e1-baea35802662.sql), linhas 1–11 | É capital de evento. Não se retiram as suas obrigatoriedades para acomodar a #386. |
| Devolução ao sócio transitória, `devolucao_socio`, `exclude_from_result`, rubrica 10.3, **com `event_id`**; fonte única `transactions.paying_partner_id` | D-ERP246, [DECISIONS](../../DECISIONS.md), linhas 5583–5590; confirmação de 03/11 em 6611416333 | Mantém-se no evento, com as regras da #85; `partner_paid_expenses` é legado e não é uma segunda fonte a somar. |

## Modelo proposto

As opções seguintes são propostas técnicas, não decisões de implementação. Ambas respeitam o par **tenant + entidade empresarial em `suppliers`** e nunca exigem `event_partners` nem um segundo tenant.

| Opção | Estrutura e ciclo | Prós | Contras |
| --- | --- | --- | --- |
| **A — conta em `financial_accounts` de tipo próprio por par** | Cabeçalho identifica tenant, contraparte e moeda; transações próprias em `transactions`, sempre com `event_id NULL`, alimentam a posição. O molde é `is_circuit_account`, com tipo distinto e sem ativar o espelho de aporte. Lançamentos de sinal contrário saldam; extrato da conta permite ver o par. | Reutiliza listagem, extrato e referências a transações; mantém proximidade com o circuito existente. | Exige rever todos os consumidores de contas para não tratar posição como caixa, além dos triggers e dos métodos de pagamento. O circuito atual pressupõe uma despesa de origem em evento; não basta ligar a flag. |
| **B — razão próprio por par, recomendada** | Cabeçalho de conta e tabela própria de lançamentos empresariais. Cada linha é uma transação própria fora de evento; reconhecimento, liquidação, compensação e estorno têm identidade e trilho. Referências opcionais a transações documentais/bancárias do tenant também só podem apontar para movimentos sem evento. | Torna explícitas a identidade, a posição e a proibição de evento; evita os automatismos de capital e a inclusão acidental em saldos bancários. | Exige extrato, agregação, permissões e ligação à conciliação próprios; a futura implementação tem de garantir atomicidade e evitar reconhecer a mesma obrigação duas vezes. |

Recomenda-se **B** porque os modelos financeiros atuais têm efeitos de caixa e de evento que não devem ser herdados implicitamente. O razão será a fonte única da posição entre as empresas; as transações bancárias continuarão a ser a fonte única dos movimentos de caixa. Uma ligação entre ambos não duplica uma saída de dinheiro nem cria uma segunda despesa. Esta recomendação fica para revisão; não é autorização R2.

### Como nasce e como se identifica

O utilizador autorizado escolhe a empresa titular e uma entidade empresarial já identificada no seu cadastro `suppliers`. A futura operação valida a pertença da entidade ao tenant e a natureza empresarial da obrigação. Cria uma conta única por `(company_id, counterparty_supplier_id)`, inicialmente a zero, com moeda resolvida pela configuração da empresa. Não se pede `counterparty_company_id` nem se cria `event_partners` para abrir a conta. Se a contraparte também usar o ERP, isso não concede acesso ao outro tenant nem gera espelho entre tenants.

Não há ramificação por país, designadamente `if (country...)`. A versão inicial proposta usa a moeda da empresa; documentos noutra moeda conservam montante/moeda de origem e referência da conversão validada. Sem conversão válida não se lança uma quantia presumida. Alterar a moeda da empresa com posição ou histórico existente exige tratamento próprio; nunca se reinterpretam números antigos.

### Como se lança e como se salda

- **Sinal da posição, na perspetiva do tenant:** positivo = contraparte deve à empresa; negativo = empresa deve à contraparte. Um pagamento empresarial da H&K por conta da MP reconhece dívida da MP; um pagamento da MP por conta da H&K reconhece crédito da MP.
- **Reconhecimento:** uma linha própria regista o montante devido, a data, a justificação empresarial, a entidade e a prova documental. Todos os lançamentos da conta corrente têm `event_id NULL`; não têm linha de BP, sócio pagador ou movimento em `partner_capital_moves`. A despesa empresarial subjacente é reconhecida uma única vez no fluxo adequado; a linha de posição não volta a afetar resultado.
- **Liquidação:** um pagamento entre as empresas reduz a dívida com uma linha de sinal contrário, ligada ao movimento bancário real fora de evento. Pagamentos parciais deixam saldo aberto. A marca de liquidação só nasce depois da confirmação do pagamento; a escrita futura deve gravar a ligação e o lançamento atomicamente, com chave de idempotência, para que uma repetição não liquide duas vezes.
- **Compensação documentada:** pode extinguir obrigações recíprocas do mesmo par sem inventar movimento bancário; exige documento, aprovação e associação às obrigações. Compensar crédito e dívida já reconhecidos tem efeito líquido zero no saldo; não se lança uma redução adicional que conte a compensação duas vezes. O contrato dessas associações precisa de ser completado na R2. Não compensa contas pessoais, outros pares ou acertos de eventos automaticamente.
- **Correção:** estorno por linha de sinal contrário, referindo a original e preservando o histórico. Uma linha estornada não pode ser estornada de novo. Cancelar o pagamento ligado exige reversão coerente da liquidação; não basta desligar uma referência.

Uma conta fica saldada quando a soma dos lançamentos válidos é zero. Pode manter-se aberta para novos movimentos; não se força zero no fecho de um evento, pois esta relação existe fora dele. Não há migração automática dos aportes históricos para o razão.

### Como se vê por par

Extrato por empresa titular e entidade contraparte: data, documento, natureza, variação, saldo acumulado e estado da prova/ligação bancária. A abertura mais os movimentos do período têm de reconciliar com o fecho, na moeda da conta. O resumo apresenta «a receber da contraparte» ou «a pagar à contraparte», sem classificar a posição como dinheiro disponível, receita ou resultado de evento. Somas e contagens serão agregadas no servidor sob isolamento do tenant; detalhe paginado. Estas leituras e o ecrã ainda não existem por efeito deste documento.

## Exemplo — H&K Madrid

Evento `bf9ce2d8-754e-4485-8427-e2d486c39919`. **Valores históricos em euros**, com datas distintas; não se volta a medir nem se atualiza o estado do evento nesta entrega.

| Data / origem | Facto documentado | Leitura correta |
| --- | --- | --- |
| Corpo da #386, originado a 27/10/2026; reproduzido no despacho | Aluguel do Teatro **154.275,00** e Plano de Mídia **53.720,00**, pagos por transferência sem conta nem pagador registados. | São despesas do evento com identificação do desembolso em falta. A #386 não permite atribuir-lhes pagador por suposição. |
| 27/10/2026 — corpo da #386 + [P5b-P2](../../testes/p5b-p2-cobertura-futuros-20261027.md), linha 20 | **25 aportes `aporte_socio`, 353.810,51**, sem `held_by_supplier_id`; **249.000,00** em conta líquida + **104.810,51** direto/automático. Aporte MP **24.775,57**. | A ausência de `held_by_supplier_id` não determina o autor do aporte. Aporte MP é a leitura de cobertura desse retrato, não uma nova dívida interempresas. |
| 31/10/2026, 19:58 UTC — [estado H&K Madrid](../../estado/estado-bp-hk-madrid-2026.md), linhas 50–52 | **61 aportes, 414.677,65** = **59 `partner_settlement`, 165.677,65** + **2 `event_cash`, 249.000,00**. Incluem **36 espelhados novos, 60.867,14**. | A conta-espelho gera o aporte pela despesa paga; não se lança outro aporte à mão. É um retrato posterior ao de 27/10. |

Reconciliação derivada dos retratos: **61 − 36 = 25** e **59 − 36 = 23**; logo os 25 de 27/10 correspondem a **23 + 2**, não a 25 movimentos de caixa. Também **414.677,65 − 60.867,14 = 353.810,51** e **165.677,65 − 60.867,14 = 104.810,51**. Esta conta explica os dois retratos, sem atribuir novos IDs ou autores aos movimentos.

**O que mudaria:** pagamentos comprovadamente relativos ao teatro, mídia e outras despesas de Madrid continuariam no evento, com o pagador tratado pela #85/#384 e a identificação dos aportes pela #385. Não passariam à conta corrente só por terem sido pagos pela H&K no Brasil. Uma conta da MP paga pela H&K sem relação com Madrid geraria, na proposta B, uma obrigação empresarial fora de evento; o posterior reembolso reduziria essa posição. Uma conta pessoal do diretor ficaria separada, sem criar dívida da MP automaticamente. Não há montante medido dessas obrigações fora de evento nas fontes fornecidas, pelo que não se calcula saldo inicial MP–H&K nem se inventa exemplo numérico.

## Ligação a #85 e D-ERP246

Na [#85](https://github.com/pedrompropicio/mundopropicio/issues/85), a despesa é do evento e o sócio desembolsa. A fonte única de pagador é `transactions.paying_partner_id`, resolvida para a entidade por `event_partners.supplier_id`. A devolução ao sócio mantém **`event_id` preenchido**, `is_transitory = true`, `transitory_reason = 'devolucao_socio'`, `exclude_from_result = true` e rubrica **10.3**, sem alterar o custo original. São as regras D-ERP246 confirmadas pelo Pedro a 03/11/2026; os leitores legados não passam a estar alinhados por este desenho.

A fronteira é a obrigação subjacente: se pertence ao evento, termina no circuito da #85, incluindo a devolução; se é empresarial e não pertence a evento, começa o razão da #386. A conta corrente tem **`event_id NULL`**, como exige D-ERP347. O mesmo fornecedor pode ocupar os dois papéis sem partilha automática de saldos ou movimentos.

Uma transferência para a H&K não é, por si só, devolução de Madrid nem liquidação da conta empresarial. A imputação tem de ser explícita e provada; se uma transferência cobrir obrigações diferentes, a futura implementação terá de desdobrar e reconciliar as parcelas antes de permitir essa operação. A proposta estrutural abaixo admite apenas uma ligação bancária integral por lançamento, não resolve pagamentos mistos.

Os desenhos irmãos **#385 — `385-aportes-partner-id.md`** e **#384 — `384-paid-by-pagamento.md`** estão por entregar. São citados como dependências de identificação; não se escrevem esses ficheiros nem se antecipam os seus contratos nesta #386.

## Proposta de DDL (texto, não aplicada)

**DDL apenas proposta em texto, não aplicada.** Os nomes são candidatos de desenho da opção B; o bloco não é uma migração pronta a executar. Não há SQL aplicado, DML, ficheiro SQL novo nem alteração dos históricos Supabase/Drizzle. Não se deve copiar este bloco para execução sem revisão e autorização R2.

```sql
-- PROPOSTA NÃO APLICADA — estrutura candidata, não executável como entrega R1.
CREATE TABLE public.company_current_accounts (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  counterparty_supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
  currency text NOT NULL, -- resolvida/validada pela empresa, nunca pelo país
  created_at timestamptz NOT NULL,
  UNIQUE (company_id, counterparty_supplier_id),
  UNIQUE (company_id, id)
);

CREATE TABLE public.company_current_account_entries (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  current_account_id uuid NOT NULL,
  event_id uuid CHECK (event_id IS NULL), -- nunca aceita evento
  entry_date date NOT NULL,
  kind text NOT NULL CHECK (
    kind IN ('obrigacao', 'liquidacao', 'compensacao', 'estorno')
  ),
  signed_amount numeric(20, 2) NOT NULL CHECK (signed_amount <> 0),
  -- Positivo: contraparte deve ao tenant; negativo: tenant deve à contraparte.
  evidence_reference text NOT NULL CHECK (length(trim(evidence_reference)) > 0),
  source_transaction_id uuid REFERENCES public.transactions(id),
  bank_transaction_id uuid UNIQUE REFERENCES public.transactions(id),
  reversal_of_id uuid UNIQUE REFERENCES public.company_current_account_entries(id),
  request_id uuid NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (company_id, request_id),
  FOREIGN KEY (company_id, current_account_id)
    REFERENCES public.company_current_accounts(company_id, id),
  CHECK ((kind = 'liquidacao') = (bank_transaction_id IS NOT NULL)),
  CHECK ((kind = 'estorno') = (reversal_of_id IS NOT NULL))
);

-- Faltam as garantias de escrita/RLS/ACL/auditoria descritas abaixo.
-- Não se concede acesso nem se cria função neste esboço.
```

`signed_amount` seria a fonte única da posição no razão B, na moeda do cabeçalho. `source_transaction_id` é referência documental opcional, não uma segunda parcela a somar; `bank_transaction_id` liga uma liquidação integral ao caixa existente. Não se altera `transactions` neste esboço nem se reutiliza `partner_capital_moves`.

**Condições obrigatórias da futura R2, não implementadas por este bloco:**

- Validar que `suppliers.company_id` coincide com o titular e que a entidade é empresarial; a FK simples não garante isso. Validar moeda contra a configuração da empresa e preservar moeda/valor de origem e conversão quando aplicável; os campos dessa prova ainda precisam do contrato monetário final.
- Validar que quaisquer transações documentais ou bancárias referidas pertencem ao mesmo tenant e têm `event_id NULL`. Recusar ligações a conta-espelho de aporte, BP, capital ou acerto de evento; o CHECK da linha não valida as linhas referidas.
- Ligar reconhecimento, documento, pagamento e estorno numa escrita autorizada e atómica. Impedir duplicação da mesma obrigação documental, para além da chave de idempotência. Validar valor, moeda, sinal e estado do pagamento, e exigir estorno do mesmo par, no montante oposto ao original. Definir bloqueios por conta e regras de concorrência antes de instalar.
- Preservar lançamentos efetivados: sem edição destrutiva ou apagamento em cascata; correções por estorno auditado. Manter autor, origem, prova e datas de servidor; o dia do lançamento não substitui a data do registo.
- Ativar RLS e isolamento por empresa, fechar escrita direta e definir ACLs dos comandos conforme os papéis aprovados. Nenhuma função `SECURITY DEFINER` pode nascer aberta a `PUBLIC`/`anon`; as regras do repositório aplicam-se na futura migração. O bloco não oferece acesso seguro por si só.
- Garantir que o razão não entra no caixa disponível, DRE, BP, cobertura ou fecho de evento; a despesa e o pagamento reais continuam nos respetivos fluxos. Preparar testes de isolamento, idempotência, liquidação parcial, estorno, exclusão de evento e reconciliação antes de autorizar implementação.

O plano de migração começa por rever o catálogo e os automatismos locais em demanda própria, preparar estrutura e permissões sob revisão e testar em ambiente isolado. Abertura de posições exige levantamento documental por par e aprovação dos saldos; não se infere abertura pelos 25 ou 61 aportes de Madrid. Homologação e eventual aplicação dependem de autorização separada. Nada foi instalado ou migrado aqui.

## Questões para o Pedro

- **Moeda:** confirmar a proposta inicial de uma conta por par na moeda da empresa; se for necessário manter posições independentes em moedas diferentes, decidir esse requisito antes da R2, incluindo tratamento de câmbio e mudança da moeda da empresa.
- **Permissões:** quem pode abrir a conta, reconhecer obrigações, aprovar compensações, liquidar e estornar? É necessária aprovação por pessoa diferente de quem lança?
- **Abertura:** qual a data de corte e quem valida os documentos/saldos iniciais empresariais por par? As despesas pessoais do diretor ficam segregadas; qualquer assunção pela empresa exige decisão própria e não está autorizada por este desenho.

## Fora de âmbito

- Implementação, UI, RPCs, instalação ou execução de DDL/DML, backfill, migrações e alterações em Live; o desenho não autoriza nenhuma destas ações.
- Código de produto e alterações em `.github/`, `supabase/`, `drizzle/`, `.lovable/`, `.env`, `docs/QUADRO.md`, `docs/DECISIONS.md` ou `docs/estado/*`; os caminhos existentes citados foram apenas lidos.
- Escrever os desenhos #384/#385, corrigir pagadores/aportes históricos, identificar autores sem prova, ou reinterpretar os retratos de Madrid como posição atual entre empresas.
- Conta corrente pessoal do diretor, assunção automática de despesas pessoais, compensações automáticas com eventos, consolidação ou espelhos entre tenants e regras fiscais novas por país.
- Teste funcional ou de segurança do modelo proposto: o teste desta entrega verifica o contrato documental; as garantias de persistência pertencem à futura implementação R2.

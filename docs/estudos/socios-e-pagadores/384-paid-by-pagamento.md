# #384 — Pagador estruturado por pagamento

Proposta de desenho para decisão do Pedro, preparada na E2b em 04/11/2026. Autorização 6621054253, classe R1, apenas documento e teste local. A proposta de DDL é texto, não aplicada; não constitui uma migração pronta para promoção.

Origem do contexto medido: despacho da #384, sobre `main` **0715f9793**, em **04/11/2026**; corpo da #384 e triagem 6610108069. As linhas indicadas abaixo são as referências dessa medição. A leitura local dos ficheiros fundamenta o desenho; não houve consulta a serviços da MP nem nova medição em Live. A autorização desta entrega não é o «Sim» para instalar estrutura previsto no `docs/procedimentos/PROC-promocao.md`.

## Problema

É necessário registar quem desembolsou o dinheiro de **cada pagamento**: a empresa, um sócio do evento ou um terceiro. A conta financeira ajuda a identificar o pagador, mas pode estar ausente. O método «Transferência» e os dados MB não identificam quem pagou. Uma transação pode ter vários pagamentos com pagadores distintos, pelo que um campo apenas na transação não resolve o problema.

No H&K Madrid (`bf9ce2d8-754e-4485-8427-e2d486c39919`), o corpo da #384 identifica Aluguel do Teatro **154.275,00** e Plano de Mídia **53.720,00** pagos por transferência sem conta nem pagador registado. Isto não prova que a MP os pagou. A cobertura apresenta um aporte MP estimado por resíduo, que não deve passar a desembolso comprovado por simples preenchimento automático.

O desenho separa identidade do pagador, origem do financiamento e efeito no acerto. Identificar alguém como pagador não autoriza criar um aporte, uma dívida, um reembolso ou outra transação.

## O que já existe

Contexto medido no `main` 0715f9793, 04/11/2026, fornecido no despacho:

- **Pagamentos:** `transaction_payments`, em `src/integrations/supabase/types.ts`, tem `account_id` (nulo possível), `amount`, `currency`, `fx_rate`, `original_amount`, `payment_date`, `payment_method`, `payment_entity`, `payment_reference`, `payment_list_id`, `outside_batch`, `offset_*`, `reversal_*` e `company_id`. Não tem campo de pagador. `company_id` identifica a empresa dona do registo, não prova quem pagou.
- **Entidade MB:** `payment_entity` é a entidade de Pagamento de Serviços, com 5 dígitos, e não o pagador. Origem: `.lovable/memory/features/payment-methods-domain.md`, l. 23. Não se reutiliza este campo.
- **Pagador por transação:** `transactions.paying_partner_id` referencia `event_partners`. O comentário é «Socio que desembolsa. NULL = empresa configurada no evento.». Origem: `supabase/migrations/20260825124356_f80c6ff3-4377-4271-88e9-ce4cc092fcfa.sql`, l. 2–5. É informação por transação, não por pagamento. D-ERP246 (d), `docs/DECISIONS.md`, l. 5583–5590, estabelece essa fonte única das despesas pagas por sócio e identifica `partner_paid_expenses` como legado; a entrada assinala os defaults como por confirmar pelo Pedro.
- **Fatura Avulsa:** `standalone_invoices.paid_by_partner_id` identifica um **utilizador**, `profiles.id`, com `user_roles` na empresa. Não identifica `event_partners`. Origem: `drizzle/migrations/0190_issue333_core_v2_closed_structure.sql`, l. 200–202. A semelhança dos nomes não autoriza copiar UUIDs entre estes domínios.
- **Porta de entrada:** D-ERP290, `docs/DECISIONS.md`, l. 6113–6122, mantém «Quem pagou decide o caminho: conta da empresa → transação com conta e pagamento; conta pessoal do sócio → Fatura Avulsa com `paid_by_partner_id`». Procedimento: `docs/procedimentos/PROC-entrada-de-dados.md`, l. 18–23.
- **Conta-espelho:** `financial_accounts.partner_id` referencia o sócio do evento; com `mirror_partner_aporte`, o pagamento já identifica esse sócio pela conta. O automatismo da 0295 cria o aporte, a ponte `partner_aporte_mirror` e o movimento de capital a partir da despesa paga. Origem complementar lida: `.lovable/memory/features/partner-aporte-mirror.md` e `.lovable/memory/features/data-entry-automatisms.md`. O valor espelhado é o `paid_amount`; não se cria outro aporte manual.
- **Cobertura atual:** `supabase/functions/_shared/financial-position/future-coverage.ts`, l. 20, avisa «Estimativa por resíduo; o pagador dos pagamentos sem conta é desconhecido (#384).». Na l. 144, `aporte_mp_estimativa = max(0, pagas − aportes)`.
- **Exemplo histórico:** os dois pagamentos de Madrid acima vêm do corpo da #384. O mesmo corpo refere 25 aportes `aporte_socio`, total 353.810,51, com `held_by_supplier_id` vazio. O aporte MP **24.775,57** é a referência de 27/10/2026 em `docs/testes/p5b-p2-cobertura-futuros-20261027.md`, l. 20, na secção de fixtures; não é uma nova comprovação do pagador.

Memórias adicionais consultadas: `.lovable/memory/features/payment-account-ownership.md`, `standalone-invoices.md` e `financial-position-base.md`. A primeira exige conta no fluxo normal e preserva a titularidade do pagamento na transação-mãe; os pagamentos históricos sem conta não autorizam abrir um novo caminho de liquidação sem conta. Esta proposta também não cria pagamentos nas filhas de rateio.

## Modelo proposto

**Alternativa A — recomendada:** acrescentar a `transaction_payments` um discriminador `paid_by_kind` com os valores técnicos `empresa`, `socio` e `terceiro` (rótulos empresa / sócio / terceiro), acompanhado de uma única referência preenchida, conforme o tipo.

| Tipo | Referência proposta | Significado e validação futura |
|---|---|---|
| `empresa` | `paid_by_company_id` → `companies.id` | Empresa que desembolsou. Pode ser a dona do pagamento ou outra empresa com relação expressamente autorizada no desenho #386. |
| `socio` | `paid_by_partner_id` → `event_partners.id` | Sócio do evento que desembolsou, validado contra a empresa e o contexto do evento da transação. Nunca um `profiles.id`. |
| `terceiro` | `paid_by_supplier_id` → `suppliers.id` | Entidade pagadora cadastrada no âmbito da empresa dona do pagamento. Não se confunde com o fornecedor beneficiário da despesa. |

`transaction_payments.company_id` continua a delimitar a titularidade e as permissões. `paid_by_company_id` não muda esse âmbito. Referenciar outra empresa requer uma relação permitida e resolução no servidor; não pode abrir leitura do cadastro, contas ou pagamentos de outro tenant. Sócios e terceiros são resolvidos e validados no servidor, dentro do âmbito autorizado, sem confiar no UUID enviado pelo cliente.

Cada pagamento tem um pagador. Se um desembolso for efetivamente repartido, registam-se as parcelas reais separadamente, mantendo a soma e as regras atuais de liquidação; não se duplica o valor integral para cada pagador. Retenções, créditos e compensações não se transformam em dinheiro desembolsado por se preencher este campo.

**Preenchimento por omissão, proposto para pagamentos de despesas com saída de dinheiro:**

- Com conta-espelho (`mirror_partner_aporte = true`): `socio` e o `partner_id` dessa conta. Esta regra tem precedência sobre a empresa proprietária da conta. Ausência de sócio ou incompatibilidade com empresa/evento bloqueia a atribuição; não se assume empresa.
- Com conta da própria empresa, que represente a saída efetiva e não seja conta-espelho: `empresa` e a empresa da conta. Uma conta de acerto, retenção ou outro mecanismo sem desembolso comprovado exige classificação específica; a mera existência de `account_id` não basta.
- Sem conta: **obrigatório escolher explicitamente o pagador** no eventual fluxo autorizado que admita essa situação. Esta escolha não dispensa a conta quando o fluxo atual a exige, nem converte uma Fatura Avulsa em transação.
- Divergência entre conta comprovada e pagador escolhido deve ser recusada ou submetida a revisão explícita antes de guardar. Não há substituição silenciosa de um pagador confirmado quando a conta muda; estornos preservam a identidade histórica e não geram novo financiamento.

Um recebimento pode ter a conta como destino, e não como origem do dinheiro. As omissões acima não se aplicam cegamente às receitas ou aos encontros sem dinheiro; a abrangência desses registos fica nas questões para decisão. O pagador também não se deduz de `created_by`, do método, de notas, do fornecedor beneficiário ou de `held_by_supplier_id` vazio.

**Desconhecido histórico:** todas as novas colunas nulas representam ausência de prova. Não se acrescenta um quarto pagador chamado «desconhecido» nem um default `empresa`. Recomenda-se exigir a identidade nos novos desembolsos abrangidos, mantendo os históricos incompletos reconhecíveis. A distinção entre legado e nova gravação terá de ser garantida no servidor numa implementação posterior, com corte aprovado, sem impor retroativamente uma escolha fictícia.

Alternativas consideradas:

| Alternativa | Prós | Contras / decisão proposta |
|---|---|---|
| **A — discriminador e referências por tipo (recomendada)** | Identidade explícita por pagamento; FKs reais; exclusividade verificável; separa os domínios existentes. | Colunas esparsas; exige validação de contexto e coordenação com os automatismos financeiros. |
| B — continuar só com conta e `transactions.paying_partner_id` | Menor alteração; mantém os consumidores atuais. | Não identifica pagamentos sem conta nem vários pagadores da mesma transação; conserva a estimativa. Não satisfaz a #384. |
| C — `paid_by_kind` e um UUID genérico ou JSON | Menos colunas e extensão fácil. | Sem FK inequívoca; permite confundir `profiles`, sócios e entidades; integridade e consultas mais frágeis. Não recomendada. |
| D — cadastro universal de pagadores e tabela de ligação | Centraliza identidades e permitiria repartir um pagamento. | Nova camada, reconciliação e DDL maiores; risco de duplicar cadastros e valores. Desnecessária para um pagador por parcela real. |

A moeda de referência vem da empresa dona do registo; preservam-se `currency`, `original_amount`, `fx_rate` e as regras canónicas de conversão. Identificar o pagador não reconverte valores. Não há ramo por país nem `if (country`.

## Coerência com D-ERP290, #385 e #386

**D-ERP290 mantém-se.** Fatura paga com conta pessoal do sócio continua a entrar em Fatura Avulsa, com o pagador do domínio `profiles`. O novo `paid_by_partner_id` proposto para pagamentos é do domínio `event_partners`, destinado a desembolsos de sócios de evento nos fluxos próprios já admitidos. Não se cria uma transação, um pagamento nem um aporte a partir de uma Fatura Avulsa; qualquer ligação entre utilizador e sócio exigiria prova e desenho separados.

**#385 — identidade do sócio nos aportes.** O desenho deve consumir a mesma identidade `event_partners` quando um sócio financia despesas do evento nos fluxos existentes. Uma despesa do evento efetivamente paga pelo sócio, abrangida pelo mecanismo de financiamento do evento, deve ficar ligada ao aporte correspondente, sem voltar a somar esse montante como novo dinheiro. Na conta-espelho reutiliza-se obrigatoriamente a ponte e o aporte já gerados; `paid_by_*` acrescenta identidade, não um segundo escritor. Fora desse automatismo, a eventual geração de aporte e a sua ligação idempotente ao pagamento ficam dependentes do desenho #385 e de autorização própria. Não se assume que todo `paid_by_kind = 'socio'` gera automaticamente uma receita.

Um aporte por transferência para a conta da empresa identifica o financiador no seu próprio registo; a despesa depois paga dessa conta tem a empresa como pagador. Ambos representam etapas do mesmo financiamento e não podem contar como dois aportes. O desenho #385 também terá de preservar a ligação e os estornos quando haja pagamentos parciais ou vários pagadores; o espelho atual trabalha por transação e `paid_amount`, pelo que não se promete suporte automático a essa repartição.

O ficheiro do desenho #385 não existe nesta cópia local e o despacho não fornece o seu nome. Esta dependência fica identificada pelo número e tema, sem inventar um nome de ficheiro ou afirmar revisão de conteúdo indisponível.

**#386 — `386-conta-corrente-entre-empresas.md`.** Cita-se apenas o nome fornecido; esse desenho também não está disponível nesta cópia. A referência já decidida é D-ERP347, em `docs/DECISIONS.md`: conta corrente por par de empresas, como transação própria, fora do evento, com implementação R2 separada. Se outra empresa paga por conta da empresa dona da despesa, `paid_by_company_id` identifica a pagadora e o eventual crédito/débito pertence a essa conta corrente entre empresas. Não se transforma a outra empresa num `event_partners` fictício, nem se cria uma despesa extra no evento. A obrigação recíproca e a ligação ao pagamento serão definidas na #386; o campo sozinho não as materializa. Uma entidade sem identidade empresarial comprovada continua como terceiro, pendente de classificação.

Se uma empresa também tiver o papel de sócio do evento, é necessário decidir e documentar a natureza do financiamento: aporte no evento (#385) ou adiantamento entre empresas (#386). A mesma quantia não pode gerar ambos os efeitos. Um terceiro sem acordo demonstrado não gera automaticamente aporte nem conta corrente entre empresas; o credor e a obrigação ficam por decidir.

**Relação com `transactions.paying_partner_id`:** o campo atual continua a fonte dos consumidores existentes, conforme D-ERP246 (d). Esta proposta acrescenta granularidade para desenho e futura reconciliação; não troca essa fonte nem modifica fechos. Em transações integralmente pagas pelo mesmo sócio, as identidades deverão concordar; conflitos exigem revisão. Em pagamentos mistos não se escolhe um sócio arbitrário para resumir a transação. O `NULL` atual, com significado de empresa configurada no evento, não prova quem pagou cada parcela sem conta. A futura precedência dos pagamentos estruturados e a adaptação dos consumidores exigem decisão explícita sobre D-ERP246; não há sincronização automática nem backfill por esse campo nesta entrega.

## Proposta de DDL (texto, não aplicada)

O bloco seguinte é exclusivamente uma ilustração textual da alternativa A. Não foi executado, não é ficheiro de migração e não contém backfill. Não se instala isoladamente: faltam as guardas e as decisões descritas a seguir, a rever antes de qualquer promoção pelo PROC-promocao.

```sql
-- PROPOSTA DE DESENHO #384 — NÃO APLICADA.
-- Sem DEFAULT: uma linha antiga não ganha um pagador fictício.
ALTER TABLE public.transaction_payments
  ADD COLUMN paid_by_kind text,
  ADD COLUMN paid_by_company_id uuid REFERENCES public.companies(id),
  ADD COLUMN paid_by_partner_id uuid REFERENCES public.event_partners(id),
  ADD COLUMN paid_by_supplier_id uuid REFERENCES public.suppliers(id),
  ADD CONSTRAINT transaction_payments_paid_by_shape CHECK (
    CASE
      WHEN paid_by_kind IS NULL THEN
        paid_by_company_id IS NULL
        AND paid_by_partner_id IS NULL
        AND paid_by_supplier_id IS NULL
      WHEN paid_by_kind = 'empresa' THEN
        paid_by_company_id IS NOT NULL
        AND paid_by_partner_id IS NULL
        AND paid_by_supplier_id IS NULL
      WHEN paid_by_kind = 'socio' THEN
        paid_by_company_id IS NULL
        AND paid_by_partner_id IS NOT NULL
        AND paid_by_supplier_id IS NULL
      WHEN paid_by_kind = 'terceiro' THEN
        paid_by_company_id IS NULL
        AND paid_by_partner_id IS NULL
        AND paid_by_supplier_id IS NOT NULL
      ELSE false
    END
  );
```

O `CASE` recusa tipos desconhecidos e combinações incompletas, sem depender de um `CHECK` que aceite inadvertidamente `NULL`. As FKs preservam as referências históricas; não se propõe `ON DELETE SET NULL`, que apagaria a identidade financeira, nem cascatas sobre pagamentos.

Este esboço só garante a forma e a existência das referências. A implementação futura precisará de validação no servidor para: titularidade do pagamento e da transação; âmbito do sócio no evento e na empresa, incluindo o contexto canónico master/cidades; âmbito do terceiro; par empresarial expressamente autorizado; coerência com a conta; identidade obrigatória nos novos desembolsos abrangidos; correções auditáveis e estornos. Não se alarga RLS para tornar uma FK resolúvel nem se confia apenas em validação no modal. Nenhuma dessas guardas está implementada aqui.

Também será necessária uma estratégia de instalação e reversão que preserve os dados de pagador entretanto recolhidos. Índices, permissões e contratos de escrita serão avaliados nesse trabalho; não se inventa numeração de migração, data de corte, IDs ou objetos já existentes. A exigência para novas gravações não é um `NOT NULL` global nesta fase, porque os históricos desconhecidos devem continuar representáveis.

## Backfill e efeito na cobertura

**Backfill proposto, sem execução:** preparar candidatos por pagamento, com origem e evidência auditável, para revisão separada. Uma conta de saída comprovadamente empresarial permite inferir empresa. Uma conta-espelho com vínculo válido permite inferir o sócio da conta. A inferência histórica exige que a titularidade e o vínculo fossem válidos na data do pagamento; a configuração atual, se alterada depois, não basta.

Sem conta ou prova suficiente, o pagador permanece **desconhecido**, com as colunas nulas. Não se preenche como MP por resíduo, como sócio por `paying_partner_id` da transação, por nome livre, por método, por utilizador que lançou ou por fornecedor beneficiário. Contas especiais, compensações e referências incompatíveis seguem para revisão. Corrigir identidade não deve disparar retroativamente um novo aporte nem reescrever fechos históricos sem decisão específica.

No exemplo de Madrid, Aluguel do Teatro 154.275,00 e Plano de Mídia 53.720,00 continuam sem pagador comprovado enquanto não houver evidência própria para cada pagamento. Os 25 aportes de 353.810,51 com `held_by_supplier_id` vazio também não identificam quem pagou essas despesas. A referência de **24.775,57**, em 27/10, continua uma estimativa por resíduo; não é um valor a distribuir por esses pagamentos nem uma prova de aporte MP.

Numa futura evolução da cobertura, os desembolsos empresariais comprovados, os desembolsos de sócios, os de terceiros e os desconhecidos terão apresentação separada, com reconciliação aos pagamentos efetivos e aos aportes já existentes. Aporte transferido para a empresa e despesa paga depois não se somam duas vezes. Uma parcela desconhecida impede apresentar o total como aporte MP exato. Os critérios de montante, retenções, compensações e estornos devem reutilizar as fontes canónicas, sem uma segunda fórmula financeira.

Nesta entrega, `aporte_mp_estimativa = max(0, pagas − aportes)` e a nota de incerteza mantêm-se exatamente como estão. Não se altera `future-coverage.ts`, a RPC base, o motor de fecho, os agregados nem a interface; o documento não torna o resíduo mais preciso por si só.

## Questões para o Pedro

- **Pagamento sem conta pode ficar sem pagador?** Recomenda-se permitir «desconhecido» apenas no legado ou em registos sem desembolso, exigindo escolha nos novos desembolsos dos fluxos que já admitam ausência de conta. Confirmar os casos admissíveis, sem reabrir a regra atual de conta obrigatória.
- **Um terceiro que paga gera dívida a quem?** À entidade que pagou, a um sócio representado, a outra empresa ou a ninguém? Que documento/acordo prova a obrigação e como se evita criar um reembolso automático?
- **Aprova a alternativa A e o domínio de terceiro em `suppliers`?** Confirmar também o mecanismo autorizado para identificar uma empresa distinta da dona do pagamento, sem exposição entre tenants.
- **Quando o pagador também é sócio e empresa, qual é a natureza do movimento?** Confirmar o critério exclusivo entre aporte do evento (#385) e conta corrente por par de empresas fora do evento (#386), incluindo pagamentos parciais e estornos.
- **Como transitar D-ERP246 (d)?** Confirmar em trabalho posterior a precedência da identidade por pagamento, o tratamento de pagamentos mistos e os conflitos com `transactions.paying_partner_id`, sem mudar já os consumidores existentes.
- **O campo abrange recebimentos e liquidações sem dinheiro?** Confirmar a semântica para não confundir conta de destino, retenções e compensações com o pagador de uma despesa.
- **Qual é o nome exato do ficheiro do desenho #385?** Falta essa referência no despacho e na cópia local; rever a coerência integral com os dois desenhos quando estiverem disponíveis, sem alterar os seus ficheiros nesta tarefa.

## Fora de âmbito

- Aplicar DDL/DML, executar SQL, criar migrações, backfill ou consultar Live e serviços da MP. Qualquer implementação estrutural depende de autorização separada e do PROC-promocao.
- Implementar pagador, automatismos de aporte, conta corrente, reembolsos, cálculo de cobertura ou alterações ao motor e aos ecrãs. `TransactionPaymentModal.tsx` e `BatchPaymentModal.tsx` ficam reservados à #498.
- Alterar D-ERP290 ou criar movimentos financeiros a partir de Faturas Avulsas; equiparar `profiles` a `event_partners`.
- Escrever os desenhos #385/#386 ou o README da pasta; alterar `.github/`, `supabase/`, `drizzle/`, `.lovable/`, ficheiros `.env`, `docs/QUADRO.md`, `docs/DECISIONS.md` ou `docs/estado/*`.
- Commits, push, PR, deploy ou Publish. A entrega limita-se a este documento, ao teste `src/test/issue384-desenho-doc.test.ts` e ao resumo exigido em `.executor/resumo.md`.

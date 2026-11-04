# #385 · E2b — identificação do sócio em cada aporte

Desenho de 04/11/2026, R1, autorização 6621053745; triagem 6610108450 e fila 6619510288 (1A). **Só planeamento: proposta não aplicada.** SQL neste documento é texto para revisão, não uma migração nem autorização de execução. Não houve consulta a Live, DDL, DML ou acesso a serviços da MP nesta tarefa.

## Problema

A cobertura de eventos futuros apresenta `aporte_socios` agregado porque o seu leitor consulta os aportes em `transactions` sem carregar a identificação já disponível em `partner_capital_moves`. O objetivo é atribuir cada aporte a exatamente um `event_partners.id` e permitir a discriminação por sócio, mantendo os totais e as regras financeiras existentes.

A hipótese inicial era: **se** `partner_settlement` e `event_cash` na fotografia de 31/10 forem valores de `partner_capital_moves.flow`, os 61 aportes já têm sócio e a lacuna é de leitura. **Pedro confirmou essa hipótese em 04/11/2026, resposta 6620122795:** os 61 já têm `partner_capital_moves.partner_id`. Assim, para Madrid, o desenho resolve um problema de leitura; backfill só se uma futura medição revelar lacunas efetivas. `held_by_supplier_id` vazio não demonstra ausência de sócio num aporte.

## O que já existe

Contexto técnico medido em **`main` 0715f9793, 04/11/2026**, transcrito do despacho da #385. As fotografias de dados abaixo têm as suas próprias datas; não são uma nova medição desta execução. A leitura local das fontes sustenta o desenho, sem substituir a futura revalidação por SELECT.

- **Aporte elegível na cobertura:** `transactions.type = 'income'`, `status = 'paid'`, `is_transitory = true`, `transitory_reason = 'aporte_socio'`; o leitor exclui `reversed_at` preenchido. `aporte_socio` integra a lista fechada da D-ERP80 ([DECISIONS](../../DECISIONS.md), linha 2509 na referência do despacho). A cobertura usa `paid_amount`, sem recalcular bruto a partir de `amount`.
- **Campos da transação:** não existe `transactions.partner_id`; existem `supplier_id` e `paying_partner_id`. Este último referencia `event_partners` e significa «Socio que desembolsa…», não identifica por definição o autor de um aporte ([migração 20260825124356](../../../supabase/migrations/20260825124356_f80c6ff3-4377-4271-88e9-ce4cc092fcfa.sql), linhas 2–5). Não o reutilizar com outro significado.
- **Vínculo canónico já existente:** `partner_capital_moves.partner_id uuid NOT NULL REFERENCES event_partners(id) ON DELETE CASCADE`; `transaction_id NOT NULL UNIQUE REFERENCES transactions(id)`, `event_id NOT NULL`, `kind IN ('aporte','devolucao','distribuicao')` ([migração 20260827161600](../../../supabase/migrations/20260827161600_0e668b8b-f54e-4b2a-90e1-baea35802662.sql), linhas 1–11). A coluna `flow` consta de [types.ts](../../../src/integrations/supabase/types.ts), em `partner_capital_moves`. A identidade é o registo do sócio **no próprio evento**: `partner_id → event_partners.id → event_partners.supplier_id`; não é um UUID de fornecedor.
- **Conta-espelho / 0295:** uma conta com `financial_accounts.mirror_partner_aporte = true` e `financial_accounts.partner_id` alimenta `sync_partner_aporte_mirror`. A função cria o aporte (fornecedor do sócio, rubrica 10.1.01), a ponte `partner_aporte_mirror` e o movimento `kind = 'aporte'`, `flow = 'partner_settlement'`. Um aporte manual não tem essa ponte. Origem: [memória partner-aporte-mirror](../../../.lovable/memory/features/partner-aporte-mirror.md) e [0295](../../../drizzle/migrations/0295_partner_aporte_mirror_descricao_sem_prefixo.sql). **Nunca lançar aporte à mão numa conta-espelho**: lançar a despesa pelo fluxo normal, que gera o aporte uma vez.
- **Leitura atual:** [future-coverage.ts](../../../supabase/functions/_shared/financial-position/future-coverage.ts), linha 19: «O sistema não regista que sócio aportou (#385).»; `AporteRowInput`, linhas 29–32, não transporta sócio; linhas 129–143 somam por evento. O leitor em [financial-position/index.ts](../../../supabase/functions/financial-position/index.ts), `loadFutureCoverage`, carrega transações sem a relação com `partner_capital_moves`.
- **H&K Madrid**, evento `bf9ce2d8-754e-4485-8427-e2d486c39919`, **27/10/2026:** 25 aportes, **353.810,51 € = 249.000,00 € por conta líquida + 104.810,51 € direto/automático**. Origem dos valores: [prova P5b](../../testes/p5b-p2-cobertura-futuros-20261027.md), linha 20; contagem de 25 e `held_by_supplier_id` vazio: corpo da #385 fornecido no despacho.
- **Mesmo evento, 31/10/2026, 19:58 UTC:** **61 aportes, 414.677,65 € = 59 `partner_settlement` (165.677,65 €) + 2 `event_cash` (249.000,00 €)**. Entraram 36 espelhados novos, **60.867,14 €**; logo os 25 anteriores correspondem a **23 + 2**, e 353.810,51 + 60.867,14 = 414.677,65. Origem: [estado do BP Madrid](../../estado/estado-bp-hk-madrid-2026.md), linhas 50–52 na referência do despacho. São duas fotografias temporais, não totais contraditórios nem uma lista de IDs reconstruível pela descrição.
- **Resposta do Pedro 6620122795, 04/11/2026:** os 2 `event_cash`, **27/08/2026: 99.000,00 €** e **18/09/2026: 150.000,00 €**, são da **HK TOURING, SOCIEDAD LIMITADA** e já apontam para o seu registo em `event_partners` de Madrid através de `partner_capital_moves.partner_id`; os 59 `partner_settlement` também já têm vínculo. Reutilizar esses vínculos, preservando-os; revalidar antes de qualquer eventual backfill.
- **Campo distinto:** `held_by_supplier_id` identifica quem recebeu uma receita por compensação (`type = 'income'`, `payment_method = 'compensation'`), conforme [partner-settlement.md, g7](../../../.lovable/memory/features/partner-settlement.md), linha 235 na referência do despacho. Não é o campo do aporte; nunca inferir o sócio pela descrição, pelo valor ou por `held_by_supplier_id` vazio.

## Opções

| Opção | Prós | Contras / condições |
| --- | --- | --- |
| **A — `transactions.partner_id` + CHECK/trigger para `aporte_socio`** | Identidade diretamente na transação; FK explícita para `event_partners.id`; CHECK pode exigir preenchimento no aporte elegível. | Duplica a fonte existente em `partner_capital_moves`; exige sincronização bidirecional e migração de todos os escritores, incluindo espelhos. CHECK não valida empresa/evento entre tabelas: precisa de trigger. Uma simples coluna não resolve divergências nem os leitores atuais. |
| **B — exigir linha em `partner_capital_moves` para todo `aporte_socio` elegível, por trigger de validação — RECOMENDADA** | Reutiliza `partner_id NOT NULL` e `transaction_id UNIQUE`; mantém uma fonte de identidade e os 61 vínculos já confirmados. A leitura passa a recuperar essa relação, sem backfill cego. | A FK atual só prova existência, não igualdade de empresa/evento. Exige validação entre tabelas, compatibilidade dos escritores e tratamento de concorrência/cascatas. A falta de relação deve aparecer como lacuna, não eliminar a transação do total. |
| **C — derivar de `financial_accounts.partner_id`** | Aproveita o vínculo explícito das contas-espelho e o caminho automático existente. | Nem todo aporte vem de conta-espelho; conta bancária partilhada, conta sem sócio ou ausência de conta não identifica quem aportou. Alterar a conta poderia reatribuir o histórico. Não é fonte universal; serve apenas como prova adicional num espelho íntegro. |

Recomenda-se **B**, com C apenas como evidência de recuperação para uma lacuna comprovada num espelho. Um aporte elegível é o predicado da cobertura descrito acima (pago e não estornado); um rascunho que ainda não cumpre esse predicado não é receita paga a atribuir. A identificação não distribui um aporte entre vários sócios: cada `transaction_id` tem um único movimento e um único `partner_id`. Conflitos exigem revisão explícita, nunca substituição automática do vínculo existente.

## Proposta de DDL (texto, não aplicada)

**Proposta não aplicada e sem ficheiro SQL.** A opção B não acrescenta `transactions.partner_id`, nem repete as FKs, o `NOT NULL` ou o `UNIQUE` já existentes. A implementação futura exige autorização R2 separada e inspeção do catálogo real (os históricos Supabase e Drizzle não são, isoladamente, prova do catálogo).

O contrato de validação proposto é:

1. No estado final da transação de base de dados, cada aporte elegível tem exatamente uma linha em `partner_capital_moves`, com `kind = 'aporte'` e `flow` válido (`event_cash` ou `partner_settlement`). O movimento e a transação têm a mesma empresa e o mesmo evento; o `event_partners` referenciado pertence a essa empresa e a esse evento. Uma FK isolada não prova estas igualdades.
2. Validar também alterações/remoções de movimentos e alterações de empresa/evento do sócio em `event_partners`. A cascata atual de `event_partners` para movimentos não pode deixar um aporte pago sem identidade. Remover o sócio conservando o aporte deve falhar; remover uma transação e os seus dependentes pelo fluxo autorizado continua possível.
3. Usar constraint triggers `DEFERRABLE INITIALLY DEFERRED` nos três lados. O espelho insere primeiro a transação e só depois a ponte e o movimento; exigir o vínculo imediatamente no INSERT da transação quebraria esse caminho. O validador relê o estado final, incluindo os IDs antigos e novos, em vez de confiar na imagem `NEW` de um evento diferido. Se o aporte foi removido na mesma operação, não exigir o movimento que caiu por cascata.
4. Serializar escritores concorrentes com locks dos pais afetados, por ordem determinística de UUID dentro de cada tipo e uma ordem fixa entre tipos, antes da validação final. O protocolo tem de abranger transações, movimentos e a mudança/remoção do sócio, evitando write skew. Revalidar evento/empresa depois dos locks. Não alargar permissões de UPDATE para obter locks.
5. Não mudar `flow`, `paid_amount`, conta, fornecedor, datas ou a transitoriedade para fazer passar a validação. Uma inconsistência existente bloqueia e é apresentada para revisão. Preservar as RLS/ACL existentes e não expor funções novas por RPC. Se o validador precisar de `SECURITY DEFINER`, usar proprietário controlado, `search_path` fixo, referências qualificadas, verificação explícita do contexto autorizado e revogação de EXECUTE a `PUBLIC`, `anon` e `authenticated`; eventual execução direta só para `service_role`, com prova de privilégios efetivos.

Esboço da estrutura das três guardas, **não é um script de instalação**: os nomes de funções abaixo são propostos; os corpos e o protocolo de locks especificados acima serão implementados e testados na fase autorizada para isso.

```sql
-- TEXTO DE DESENHO: NÃO APLICAR. Funções de trigger por implementar/rever.
CREATE CONSTRAINT TRIGGER issue385_aporte_requires_partner
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION public.issue385_validate_aporte_transaction();

CREATE CONSTRAINT TRIGGER issue385_capital_move_keeps_partner
AFTER INSERT OR UPDATE OR DELETE ON public.partner_capital_moves
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION public.issue385_validate_aporte_move();

CREATE CONSTRAINT TRIGGER issue385_partner_keeps_aportes_valid
AFTER UPDATE OR DELETE ON public.event_partners
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION public.issue385_validate_aporte_partner();
```

Antes da futura instalação: inventariar escritores manuais e automáticos; provar em ambiente isolado criação em duas etapas na mesma transação, espelho, edição, despagar/estornar/apagar a despesa, cascatas, transferência de evento/empresa, duas sessões concorrentes e recusa de acesso indevido. Escritores que hoje gravem o aporte e o movimento em chamadas separadas precisam de uma operação atómica antes da guarda. Medir lacunas no universo elegível de cada empresa antes de ativar a obrigação; não corrigir silenciosamente outros eventos. Não criar a guarda enquanto o legado e os escritores não estiverem preparados.

## Plano de backfill — H&K Madrid

### Medição anterior a qualquer escrita

**SELECT proposto, não executado.** Executar futuramente com autorização de leitura e visibilidade completa da empresa, sobre uma fotografia consistente. A consulta conserva os aportes sem movimento através de LEFT JOIN; não usa a ausência de `held_by_supplier_id` como filtro. Contagens e somas são feitas na base, não numa primeira página de cliente. Se o detalhe vier por API, paginar integralmente por ID; falha de permissão/paginação não equivale a zero lacunas.

```sql
-- Só proposta de leitura; nenhuma execução nesta tarefa.
WITH aportes AS (
  SELECT t.id, t.company_id, t.event_id, t.account_id,
         t.supplier_id, t.payment_date, t.paid_amount
  FROM public.transactions t
  WHERE t.company_id = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c'::uuid
    AND t.event_id = 'bf9ce2d8-754e-4485-8427-e2d486c39919'::uuid
    AND t.type = 'income' AND t.status = 'paid'
    AND t.is_transitory = true AND t.transitory_reason = 'aporte_socio'
    AND t.reversed_at IS NULL
), medicao AS (
  SELECT t.*, pcm.id AS move_id, pcm.partner_id, pcm.flow, pcm.kind,
         ep.supplier_id AS partner_supplier_id,
         fa.partner_id AS account_partner_id, fa.mirror_partner_aporte,
         pam.source_transaction_id,
         CASE
           WHEN pcm.id IS NULL THEN 'sem_movimento'
           WHEN pcm.kind IS DISTINCT FROM 'aporte'
             OR pcm.flow IS NULL
             OR pcm.flow NOT IN ('event_cash', 'partner_settlement')
             OR pcm.company_id IS DISTINCT FROM t.company_id
             OR pcm.event_id IS DISTINCT FROM t.event_id
             OR ep.id IS NULL
             OR ep.company_id IS DISTINCT FROM t.company_id
             OR ep.event_id IS DISTINCT FROM t.event_id
           THEN 'vinculo_invalido'
           ELSE 'vinculo_valido'
         END AS estado
  FROM aportes t
  LEFT JOIN public.partner_capital_moves pcm ON pcm.transaction_id = t.id
  LEFT JOIN public.event_partners ep ON ep.id = pcm.partner_id
  LEFT JOIN public.financial_accounts fa ON fa.id = t.account_id
  LEFT JOIN public.partner_aporte_mirror pam ON pam.aporte_transaction_id = t.id
)
SELECT medicao.*,
       count(*) OVER () AS quantidade,
       sum(paid_amount) OVER () AS total_pago,
       count(*) FILTER (WHERE estado <> 'vinculo_valido') OVER () AS lacunas,
       count(*) FILTER (WHERE paid_amount IS NULL) OVER () AS valores_ausentes,
       count(*) OVER (PARTITION BY flow) AS quantidade_flow,
       sum(paid_amount) OVER (PARTITION BY flow) AS total_pago_flow
FROM medicao
ORDER BY id;
```

Verificar no catálogo a unicidade de `pcm.transaction_id` e de `pam.aporte_transaction_id`, para a junção não multiplicar linhas. Conservar o resultado e os vínculos como prova anterior. A consulta mede todos os aportes elegíveis de Madrid para reconciliar as fotografias; não diagnostica movimentos bancários históricos nem inventa cortes de implantação de saldo. Uma futura investigação por conta teria de consultar o primeiro `bank_statements.period_from` dessa conta (D-ERP289), sem usar essa regra para apagar aportes desta medição.

### Regra de atribuição por aporte

1. **Vínculo válido existente:** reutilizar `partner_capital_moves.partner_id → event_partners.id`; obter o fornecedor por `event_partners.supplier_id`. Preservar integralmente o movimento e o seu `flow`. É o resultado esperado para os 61 segundo o Pedro. Se a conta-espelho discordar do vínculo, registar o conflito e rever, sem sobrepor a conta ao histórico.
2. **Sem movimento, com espelho comprovado:** verificar a ponte, a despesa de origem, a conta de ambos e o `financial_accounts.partner_id`, todos na mesma empresa e evento. Confirmar pela prova de origem/auditoria que a conta não foi reatribuída desde a geração do aporte; o estado atual isolado não identifica o sócio histórico. Só uma cadeia íntegra e inequívoca pode fundamentar um mapa explícito `transaction_id → event_partners.id`. O preenchimento eventual cria apenas o movimento ausente com `flow = 'partner_settlement'`; nunca cria outro aporte, outra ponte ou outra perna de pagamento.
3. **Sem movimento e sem espelho comprovado:** exigir prova documental e validação humana do sócio no evento, registadas por ID no mapa de atribuição. Não inferir pela descrição, valor, proximidade de datas, `supplier_id` isolado, `paying_partner_id` ou `held_by_supplier_id` vazio. Sem prova, manter lacuna explícita e não escrever.
4. **Movimento existente inválido ou contraditório:** não corrigir como se fosse ausência. Separar para revisão e autorização específica, preservando o vínculo existente; não usar UPSERT que possa reatribuir o sócio. `partner_id` já é NOT NULL: um movimento ausente exige INSERT, não um UPDATE impossível de um campo nulo.

Os **2 `event_cash` de 249.000,00 € ficam ligados à HK TOURING, SOCIEDAD LIMITADA**, pelos vínculos já existentes no próprio evento Madrid, com `flow = 'event_cash'`. As datas/valores 27/08 — 99.000,00 e 18/09 — 150.000,00 servem para conferir a resposta do Pedro, **não para escolher IDs ou inferir a identidade**. Revalidar os dois movimentos e o fornecedor do sócio por SELECT; não perguntar novamente quem aportou, não mudar para `partner_settlement` e não mover estes aportes para conta-espelho.

### Escrita apenas como proposta em texto

**Plano recomendado B:** se a medição confirmar os 61 vínculos, o backfill tem **zero escritas** e a correção necessária é a leitura. Se houver lacunas reais, preparar um manifesto fechado com IDs medidos de transação/empresa/evento/sócio, `flow`, prova e imagem anterior. Submeter contagem, total abrangido e diferenças ao Pedro com **«Corro?»**; só um novo Sim permite executar DML numa fase separada.

Na opção B, a proposta de INSERT para ausências é condicional à inexistência de movimento, com verificação sob lock e sem `ON CONFLICT DO UPDATE`. Conflito concorrente invalida a prévia e exige releitura, nunca substituição. Não há UPDATE dos vínculos existentes nem alterações de `transactions`, de valores ou de datas no plano recomendado.

**UPDATE proposto apenas para a alternativa A, não recomendada e não aplicada:** se o Pedro escolher explicitamente A numa fase futura, após criar a nova coluna e validar as guardas, o preenchimento da coluna nova seria exclusivamente a cópia do vínculo canónico já validado. O exemplo seguinte **não é executável no schema atual**, que não tem `transactions.partner_id`, e não integra o backfill recomendado B. `$1` representa a lista fechada de IDs efetivamente medidos e aprovada, não todos os aportes encontrados depois:

```sql
-- HIPÓTESE A, SÓ TEXTO: coluna partner_id ainda inexistente. NÃO EXECUTAR.
UPDATE public.transactions AS t
SET partner_id = pcm.partner_id
FROM public.partner_capital_moves AS pcm
JOIN public.event_partners AS ep ON ep.id = pcm.partner_id
WHERE t.id = ANY ($1::uuid[])
  AND pcm.transaction_id = t.id AND pcm.kind = 'aporte'
  AND pcm.flow IN ('event_cash', 'partner_settlement')
  AND pcm.company_id = t.company_id AND pcm.event_id = t.event_id
  AND ep.company_id = t.company_id AND ep.event_id = t.event_id
  AND t.company_id = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c'::uuid
  AND t.event_id = 'bf9ce2d8-754e-4485-8427-e2d486c39919'::uuid
  AND t.type = 'income' AND t.status = 'paid'
  AND t.is_transitory = true AND t.transitory_reason = 'aporte_socio'
  AND t.reversed_at IS NULL AND t.partner_id IS NULL;
```

### Prova antes/depois e rollback

- Repetir a mesma medição no mesmo universo de IDs, verificando também entradas/saídas desde a prévia. Conservar uma imagem ordenada por `transaction_id` dos valores (`amount`, `paid_amount`), conta, fornecedor, datas, estado, transitoriedade/estorno, ponte e movimento. Comparar campos e conjunto de IDs, não apenas um total que poderia esconder compensações.
- Exigir **totais de aportes iguais antes/depois** e contagem de transações inalterada; só a atribuição em falta pode mudar. Confrontar soma por sócio + sem atribuição com o total anterior, ao cêntimo, incluindo cada fluxo. Para a fotografia de 31/10: 61 / 414.677,65 €, 59 / 165.677,65 € e 2 / 249.000,00 €. Se a base tiver evoluído, conservar a nova fotografia e explicar a diferença temporal, sem forçar estes números históricos.
- Para o subconjunto histórico de 25, recuperar IDs de prova anterior ou auditoria; não selecionar arbitrariamente 25 dos 61. Com os IDs comprovados, verificar 25 / 353.810,51 € e a decomposição 23 + 2; se não se conseguir reconstruir o conjunto, declarar a prova histórica incompleta, mantendo a medição atual dos 61 separada.
- Exigir zero lacunas no conjunto que se pretenda declarar completo e zero alterações aos vínculos anteriormente válidos. Revalidar separadamente os dois `event_cash` da HK TOURING; verificar que o espelho continua com a mesma ponte e sem duplicação de aportes. Nenhuma soma de movimentos substitui a soma das transações pagas.
- Uma futura escrita autorizada decorre numa transação: bloquear e revalidar o manifesto antes de escrever, conferir a prova depois e só então COMMIT. Qualquer diferença de valores, identidade prévia, universo ou contagem esperada causa ROLLBACK integral, sem reparações automáticas adicionais.
- Após eventual COMMIT, um rollback compensatório exige nova autorização e o manifesto/imagens anterior e posterior. Em B, remover apenas os movimentos criados por esse lote, pelos IDs devolvidos e se ainda coincidirem com a imagem posterior; nunca apagar transações, pontes ou os 61 vínculos preexistentes. A guarda futura não pode permitir um aporte pago órfão: coordenar a reversão do lote com a reversão da instalação da guarda numa fase aprovada e atómica, ou recusar a reversão incompatível. Em A, restaurar apenas a coluna nova dos IDs do lote, com comparação da imagem posterior e coordenação da guarda; não alterar `paid_amount`. Com zero escritas, não há dados a reverter.

## Efeito na cobertura

Mudança futura proposta, **sem alteração de código nesta E2b**: carregar a identificação pela cadeia `transactions.id → partner_capital_moves.transaction_id → partner_capital_moves.partner_id → event_partners.id`, validando `kind`, `flow`, empresa e evento. Incluir `transaction_id` e `partner_id` no futuro contrato de entrada; nome/fornecedor vêm de `event_partners.supplier_id`. As leituras conservam o gate da base com JWT do chamador, os filtros de empresa/eventos já autorizados, paginação integral e o prazo independente da cobertura.

`aporte_socios` conserva `total`, `por_transferencia_conta_liquida`, `pago_direto_automatico` e as linhas originais. Acrescenta-se discriminação por sócio com a chave `event_partners.id`, o fornecedor para apresentação e os mesmos montantes de `paid_amount`. A consolidação de eventos numa raiz mantém o evento de origem de cada vínculo: um sócio de uma cidade não é trocado pelo registo de outra cidade por ter o mesmo fornecedor.

Invariante proposta: **soma dos grupos por sócio + montante sem atribuição = `aporte_socios.total`**, sem duplicar cada transação e sem somar movimentos como novo dinheiro. Até todas as lacunas serem resolvidas, linhas sem vínculo válido continuam no total, num grupo explícito sem atribuição e com identificação incompleta; um erro de leitura não se disfarça de zero lacunas. Join interno que elimine aportes sem movimento é proibido. A nota atual sobre desconhecer o sócio passa a refletir a identificação efetivamente disponível, em vez de afirmar ausência global.

Não mudar as fórmulas de cobertura, necessidade de financiamento, estimativa do aporte MP, classificação de conta líquida, bilheteira, saldo, resultado ou participação. Os 249.000,00 € continuam na componente por conta líquida quando assim classificados pelo leitor atual; `flow` identifica o circuito do capital, não substitui essa classificação. Os 165.677,65 € da fotografia de 31/10 continuam na componente direto/automático. O total dessa fotografia permanece 414.677,65 €; 353.810,51 € continua a referência da fotografia de 27/10.

A implementação futura terá contrato versionado e validação estrita de produtor/consumidor, com testes de paridade de todos os totais antes/depois, vínculos de outro evento/empresa, lacunas e espelhos. Este documento e o seu teste documental não afirmam que a cobertura já discrimina por sócio.

## Questões para o Pedro

- Aprova a **opção B** como fonte única de identificação e o avanço posterior, em demanda própria, da leitura e das guardas propostas? A aprovação deste desenho não constitui Sim para DDL/DML.

A identidade dos dois `event_cash` está respondida por 6620122795: **HK TOURING, SOCIEDAD LIMITADA**. Não resta pergunta sobre esse sócio. Eventuais lacunas ou conflitos encontrados numa futura medição terão prévia própria com prova, sem reabrir esta identificação por inferência.

## Fora de âmbito

- Aplicar SQL, criar migrações, executar SELECT em Live, backfill efetivo, alterar dados ou instalar triggers; o SQL acima permanece proposta em texto.
- Implementar a leitura ou editar `future-coverage.ts`, o seu leitor, contratos, interface, motores financeiros ou testes existentes.
- Desenhar o pagador dos pagamentos sem conta ou a conta corrente de sócios fora do evento; não se criam esses desenhos nem se presumem os seus ficheiros.
- Editar README da pasta, índices, QUADRO, DECISIONS, estados, memórias, `.github/`, `.env`, `supabase/` ou `drizzle/`; as referências locais acima são só fontes de leitura.
- Publish, deploy, commits, push, rede para serviços da MP ou qualquer alteração em Live.

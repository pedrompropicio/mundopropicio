# ESTADO — Ticketing & Receita

Atualizado: 2026-10-10 · #303 entregue parcialmente, permanece aberta · Issues: `agora` — · `a-seguir` #206 · `depois` #73, #78 · `bloqueada` #211 (transversal, plataforma-e-infra)

## Em vigor

- **Apuramento Ticketline (D-ERP231).** `ticket_office_statements` e `ticket_office_statement_lines` distinguem direitos de eventos, faturas, acertos de sala, repasses e transitados. `statement_id` liga o fecho ao apuramento. Apuramentos 2558 e 3163 registados; o 3163 continua em rascunho, com PDF anexado e posição do documento −49.050,59. A soma fecha no total, mas a reconciliação linha a linha com o corte do PDF ainda falta.
- **Fecho = DIREITO do evento (D-ERP232).** Bruto − deduções − retido pela sala − saldo de fatura pago pela bilheteira; nunca abate adiantamentos. Forma de liquidação derivada, com correcção manual justificada em campo próprio; ambas permanecem distinguíveis. Ajustes do bruto e do direito exigem justificação. Lista transversal e ficha do evento usam `get_ticket_office_settlements_overview`, isolada por empresa.
- **Página da bilheteira (D-ERP233).** Dados · Liquidez · Vendas/Bilhetes · Fechos · Apuramentos. Histórico de adiantamentos dentro de Apuramentos; fora do modal de fecho. Retido em destaque, sem heurística dos 15%. Apuramentos mostram três cartões, diferença de calendário discreta e clicável, subtotais por tipo e significado da posição.
- **Vigia de ticketing (D-ERP152/191/192/197).** Fonte do portal de Produtores = occupation.xlsx; PDF informativo. Crosscheck diário às 06:50 UTC: pelo menos 3 bilhetes E 1% da quantidade do portal, em duas leituras seguidas; evento não encontrado alerta logo. Série BOL valida pelo TOTAL do Mapa Diário ou pelo M2 da mesma corrida; se falhar, guarda `daily_debug`.
- **Canal único da vigia:** indicador por empresa no Dashboard, sem email/WhatsApp/lembrete. `ticketing_sync_conditions()` alimenta `get_ticketing_sync_status()`: vermelho (a) falha persistente, (b) parado >6h, (d) captura horária parada, (f) 6 corridas BOL sem sucesso; âmbar (e) divergência e (g) PDF parado com xlsx a mexer; (c) import desligado é informativo. Cron 217 desactivado em definitivo.

## A trabalhar agora

Nada em curso.

## Bloqueios

- **#303 — cadeia de apuramentos incompleta.** Quatro eventos acertados fora do sistema de apuramentos:
  - Ivete Clareou 2026: tem fecho, sem apuramento.
  - Henry&Klaus Porto: tem fecho, sem apuramento.
  - Maiara e Maraisa Lisboa: sem fecho e sem apuramento, saldo zero.
  - Maiara e Maraisa Porto: sem fecho e sem apuramento, saldo zero.
  O que já foi acertado depende do conhecimento do Pedro, não de uma cadeia completa no sistema. O transitado chega como valor opaco. Resolver exige os PDFs dos apuramentos anteriores ao 3163 (1158/2816 ainda não registados). Não inventar ligações, fechos ou valores.
- **#303 — reconciliação documental por fazer.** O 3163 fecha no total, mas as linhas do sistema não espelham o corte do PDF da Ticketline. Conferir linha a linha antes de concluir a issue; fechar a soma não prova equivalência documental.
- **#211 (plataforma-e-infra):** `notify_sync_action_needed()` aponta em Live para o Test antigo e é um no-op; bilheteira já não depende dele, mas Coala/Fever continuam sem aviso próprio.
- **#78:** import Ticketline não limpa a série antiga quando o formato muda.
- **#73:** corte por tipo de bilhete.
- **Prova de isolamento ainda por fazer:** chamadas das edge functions corrigidas com sessão válida de outra empresa; testes de chave pública/token forjado não substituem essa prova.
- **Noutras frentes, abertas:** #304 (rubrica 10.3) e #305 (invariante de caixa negativa). Fora do âmbito deste fecho documental.
- **Ligação «ver apuramento»:** abrir o separador Apuramentos antes de saltar para a âncora continua por resolver.

## Fechado a 10/10/2026

Entregas da #303, sem fechar a issue:

- **D-ERP231:** modelo de apuramento, ligação ao fecho e histórico só-leitura. 2558 e 3163 registados. Os 265,00 do Deive são bilheteira local do Forum Braga (`venue_settlement`), resolvidos pelo PDF, não por diferença.
- **D-ERP232:** quatro fechos migrados para direito do evento, três inalterados; formas derivada/manual separadas. Retido inalterado nas verificações antes/depois, transferências e resultados dos eventos preservados.
- **Deive Leonardo — Braga:** fecho em rascunho, ligado ao apuramento 3163/2026 e à dedução já paga da FT FA.2026/3411; linha `event_right` ligada ao fecho e descrição corrigida, sem alterar valores do apuramento. Origem: Mapa de Ocupação e FT 3411 da Ticketline (email da Paula Leitão de 09/10) e email da InvestBraga de 10/10 às 15:30. Retido pela sala sem fatura associada; nenhuma confirmação, transferência, comissão ou devolução criada. Travas preservadas. Aguarda confirmação do Pedro no ecrã. O Deive já tinha apuramento e não integra os quatro eventos fora da cadeia, que permanecem inalterados.
- **Repasses:** secção retirada do modal de fecho; 25 registos carimbados `[LEGADO #303]`, sem apagar nem desligar ligações. Protecção só-leitura e CHECK preservados.
- **FKs:** cinco chaves repostas em `event_ticket_office_advances`, ON DELETE RESTRICT; embed dos apuramentos desambiguado pela FK de `statement_id`. Leitura autenticada voltou a mostrar o histórico.
- **Página:** Apuramentos próprio, adiantamentos como histórico lá dentro, heurística dos 15% removida, três cartões e listas, resumos por tipo e explicação da posição. Nota do 3163 sem números móveis. Cartões verificados em desktop/mobile; testes focados passaram. Sem Publish nesta sessão.

## Fechado a 09/10/2026

- **#283:** auditoria de isolamento multiempresa (D-ERP194–205): políticas/funções com guarda da empresa, remoção de sondas esquecidas, validação do ramo de serviço e invariantes. A prova com sessão válida de outra empresa nas edge functions fica explicitamente em Bloqueios.
- **#267:** fechada por decisão do Pedro, não por resolução do fornecedor. O PDF do Mapa de Ocupação não reflecte o occupation.xlsx; nenhum cálculo nosso depende do PDF. Continua vigiado por (g); não reportar ao fornecedor.
- **#271:** fechos por evento e lista transversal entregues; a forma de liquidação passou depois ao modelo D-ERP232.
- **D-ERP197:** vigia no ecrã; isolamento do RPC provado por impersonação e sinal vermelho testado numa transacção anulada.

## Fechado a 08/10/2026

- **#282:** destinatários dos alertas isolados por empresa; função devolve plano e escreve lembrete em vez de enviar.
- **#272:** modal de fecho verificado pelo Pedro; fecho Plenitude refeito pelo fluxo.
- Série diária BOL reposta com validação alternativa pelo M2; sync Onebox reposto e incluído na vigia.
- Índice de memória gerado por `scripts/gen-memory-index.mjs`, protegido por teste.

## Factos que não se reinvestigam

- **Somas de `ticket_sales`: SEMPRE `coalesce(total_value, quantity * unit_price)`.** Mesma expressão de `_ticket_office_balance_raw`. Somar apenas `total_value` dá zero onde o campo é NULL. Caso de 10/10/2026: Maiara e Maraisa Lisboa e Porto, vendas históricas de 360.591,50 lidas como zero por esse erro. Nas leituras da app, usar `get_ticket_office_sales`; nunca somar uma resposta truncada do PostgREST.
- **Identidade dos cartões:** `valor por apurar − já adiantado + diferença de calendário = saldo retido` (posição do último apuramento negativa). «Valor por apurar» soma SALDOS dos eventos sem fecho E sem apuramento, não vendas brutas; liquidados em dinheiro entram a zero. «Já adiantado» = absoluto da posição do último apuramento. Se a posição for positiva, é valor a entregar à MP, não adiantamento.
- **Diferença de calendário:** custos apropriados nos fechos ainda não descontados pela bilheteira e eventos à espera do apuramento. Nunca pendência, tarefa, alerta ou desvio; sem cor/ícone de aviso. Notas e estado não congelam retido, valor por apurar nem diferença: consultam-se na hora.
- **O saldo RETIDO já É a posição actual:** dinheiro verdadeiro da MP, a favor da MP. A posição apurada já está dentro dele; NUNCA se abate novamente. A prova da posição apurada lê-se do apuramento, não inferindo-a do saldo retido. Só deduções ainda não reflectidas nos apuramentos futuros poderão reduzir o retido.
- **Fecho ≠ apuramento:** o primeiro mostra direito do evento; repasses/transitados vivem no segundo, sem imputação a evento. Posição negativa = crédito da bilheteira para o seguinte; positiva = valor a entregar à MP. A posição documental do 3163 é −49.050,59.
- **Repasses genéricos:** vendas quinzenais de todos os eventos à venda, sem saber de que evento vem cada repasse. A atribuição por evento no histórico é artefacto do modelo antigo, construído para o fecho dar zero, sem valor probatório. As 25 notas têm `[LEGADO #303]`.
- **Adiantamentos não se desligam nem apagam:** histórico só-leitura (INSERT/UPDATE/DELETE), CHECK `etoa_never_open_chk`. `_ticket_office_balance_raw` só subtrai os que têm `transaction_id` E `settlement_id` ambos NULL; os históricos ligados já entram pela transacção.
- **NÃO existe percentagem de referência da Ticketline:** acordo verbal em torno de 85% das vendas do período, nunca exacto, com arredondamentos e mutável. Sem valor de cálculo nem de alarme.
- **Ecrã vazio com dados na base: verificar FKs.** Tabela sem chave estrangeira quebra o embed do PostgREST (PGRST200); relação ambígua dá PGRST201. Se o erro for engolido, o ecrã fica vazio EM SILÊNCIO. Verificar chamada real, não apenas configuração, antes de atribuir a RLS.
- **Corte do PDF:** linha do evento = bilheteira bruta menos bilheteira local da sala, distinta do «ACERTO SALA». Os 265,00 do Forum Braga foram documentados assim. Esta regra não prova que as actuais linhas do sistema já espelhem todo o PDF: reconciliação em aberto.
- **Conferência de fecho:** sempre nos dois portais Ticketline; o portal do produtor é o mais assertivo. A Juliana confere directamente vendas e documentos.
- **Receita:** vive em `ticket_sales`, não em `transactions`. Série `vw_event_daily_sales` tem precedência por evento entre espelhos e `ticket_sales`; nunca somar as duas famílias no mesmo evento.
- **Transferência:** par expense+income na rubrica 10.3 via `create_settlement_transfer`, nunca `type='transfer'`; estorno das duas pernas pela `operation_key`. Perna do fecho não é dedução (`transfer_transaction_id`/`TRF-FECHO-%`); fecho com transferência não se reconfirma, estorna-se.
- Uma correcção é integral ou não começa. Verificar papel não substitui filtrar empresa (D-ERP194).
- **Funções públicas:** configuração sem bloco explícito não prova assinatura no portão; declaração só vale após reimplantação. Teste de configuração não prova comportamento: sonda real obrigatória. Comentário antigo não é prova do código, e helper de auth afecta todos os importadores.

## Onde ler mais

- `.lovable/memory/features/ticket-office-statements.md` — apuramentos, repasses e significado das posições.
- `.lovable/memory/features/ticket-office-sales-scope.md` e `ticket-office-reconciliation.md` — fonte das vendas, saldo e âmbitos.
- `.lovable/memory/features/settlement-transfer-pair.md` e `venue-retained-door-sales.md` — fluxo completo do fecho.
- `.lovable/memory/features/ticketing-sync-health.md` e `ticketline-crosscheck.md` — vigia e conferência do portal.
- `docs/DECISIONS.md` — D-ERP231/232/233 e adendas; GitHub #303 — cadeia e reconciliação ainda abertas.
- Handoff desta sessão: `docs/handoffs/2026-10-10-ticketing-e-receita.md` (arquivo, não fonte de estado).
- Antes de diagnosticar, nomear a memória lida (D-ERP162); índice gerado por `scripts/gen-memory-index.mjs`.

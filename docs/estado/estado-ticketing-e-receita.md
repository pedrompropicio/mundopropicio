# ESTADO — Ticketing & Receita

Atualizado: 2026-10-24 · prioridade P1 #358 (passos 1–3 R2 aplicados/verificados; ativação e marca de migração pendentes) · #348 separada, sondagem ainda não despachada. Últimas alterações operacionais anteriores: D-ERP239; mantidas.

## Em vigor

- **Apuramento Ticketline (D-ERP231).** `ticket_office_statements` e `ticket_office_statement_lines` distinguem direitos de eventos, faturas, acertos de sala, repasses e transitados. `statement_id` liga o fecho ao apuramento. Apuramentos 2558 e 3163 registados; o 3163 continua em rascunho, com PDF anexado e posição do documento −49.050,59. A soma fecha no total, mas a reconciliação linha a linha com o corte do PDF ainda falta.
- **Fecho = DIREITO do evento (D-ERP232).** Bruto − deduções − retido pela sala − saldo de fatura pago pela bilheteira; nunca abate adiantamentos. Forma de liquidação derivada, com correcção manual justificada em campo próprio; ambas permanecem distinguíveis. Ajustes do bruto e do direito exigem justificação. Lista transversal e ficha do evento usam `get_ticket_office_settlements_overview`, isolada por empresa.
- **Página da bilheteira (D-ERP233).** Dados · Liquidez · Vendas/Bilhetes · Fechos · Apuramentos. Histórico de adiantamentos dentro de Apuramentos; fora do modal de fecho. Retido em destaque, sem heurística dos 15%. Apuramentos mostram três cartões, diferença de calendário discreta e clicável apenas quando |diferença| >= 0,01, subtotais por tipo e significado da posição.
- **Bilheteira vive em ticket_sales, nunca em transações (D-ERP239).** A base do cachê (`computeTicketRevenueAndOccupancy`), a ocupação, o reparto e o simulador lêem `ticket_sales` diretamente e não veem transações de receita. Lançar bilheteira como transação não entra em nenhum desses cálculos — e, se a rubrica não for 1.1.01, escapa à anti-duplicação (`isBilheteiraCategoryCode`) e conta duas vezes.
- **Rubrica de bilheteira nos DRE é identificada pelo código 1.1.01 (D-ERP239).** Os quatro ecrãs de DRE usam `findTicketCategoryId` de `src/lib/ticket-category.ts` (código exato `1.1.01`, nunca o nome). O antigo `find` por nome podia escolher 2.6.07 "Comissão da ticketeira/bilheteiras" ou 2.6.13 "Controlo de acesso e staff de bilheteira" — ambas com "bilheteira" no nome e o select sem ORDER BY — e a receita de bilhetes contava duas vezes.
- **Vigia de ticketing (D-ERP152/191/192/197).** Fonte do portal de Produtores = occupation.xlsx; PDF informativo. Crosscheck diário às 06:50 UTC: pelo menos 3 bilhetes E 1% da quantidade do portal, em duas leituras seguidas; evento não encontrado alerta logo. Série BOL valida pelo TOTAL do Mapa Diário ou pelo M2 da mesma corrida; se falhar, guarda `daily_debug`.
- **Canal único da vigia:** indicador por empresa no Dashboard, sem email/WhatsApp/lembrete. `ticketing_sync_conditions()` alimenta `get_ticketing_sync_status()`: vermelho (a) falha persistente, (b) parado >6h, (d) captura horária parada, (f) 6 corridas BOL sem sucesso; âmbar (e) divergência e (g) PDF parado com xlsx a mexer; (c) import desligado é informativo. Cron 217 desactivado em definitivo.

## A trabalhar agora

- **#358 — vendas RG27 incompletas desde 21/10, diagnóstico confirmado.** Frente 3 / ChatGPT. Código v2.43 e SELECT Live lidos em 24/10, ~21:27–21:30 UTC; diagnóstico/proposta e predicados no [comentário 6389784666](https://github.com/pedrompropicio/mundopropicio/issues/358#issuecomment-6389784666). Causa anterior ao passo 1: Braga sem ticketline_report_codes fazia match por cidade com RG Braga e Deive Braga (ambos enabled), abortando o lote capture_day antes do UPSERT de todas as cidades. Com labels extensos, o texto antes do primeiro "|" não identifica Braga/Montijo; linhas com venda ficam sem match e são gravadas como zero em runs success. Braga/Montijo/Porto têm fallback=false, portanto o RPC continua a ler ticket_sales. O handler da landing só reclassifica em skipped quando a flag já está ligada; não liga fallback nem marca migração.
- **#358 — conferência direta concluída.** Pedro autenticou o portal; leitura em Vendas por Evento / Total Vendas, períodos 22/10, 23/10 e 24/10 parcial, ~21:50–21:55 UTC. Portal 101/89/72 bilhetes e 3.276,00/2.871,00/2.397,00 EUR; ERP get_daily_sales_series no SELECT 21:54:20 UTC 11/4/7 e 369,00/150,00/270,00 EUR. Diferença observada 240 bilhetes / 7.755,00 EUR. [Prova direta, por cidade/dia, predicado e códigos](https://github.com/pedrompropicio/mundopropicio/issues/358#issuecomment-6390017012). Não é fecho D+1 do dia 24 nem prova de instantes iguais. Códigos Braga 106155/127627 e Montijo 107086/128475 confirmados; restantes seis na Issue. Os cinco configs não RG mantêm sucessos no XLSX e não apresentam a mesma landing no universo consultado, mas têm 503 intermitentes; Deive participa no erro de Braga. Não assumir migração de outros eventos ou completude pela existência de linhas no espelho.
- **#358 — passo 1 R2 concluído, 24/10 22:16 UTC.** Pedro aprovou o SQL; dois códigos preenchidos em Live: RG Braga 5aba2c55 → 106155/127627, RG Montijo 99cee5e3 → 107086/128475. DML devolveu duas linhas e SELECT próprio às 22:16:13 confirmou códigos exclusivos, enabled=true, fallback=false e migração/cortes NULL, iguais ao antes. [Prova e autorização](https://github.com/pedrompropicio/mundopropicio/issues/358#issuecomment-6390221637). A captura de 22:15 falhou antes da alteração; ainda não há prova de captura automática posterior. Não houve captura manual, recuperação histórica, código, DDL, cron, deploy ou Publish.
- **#358 — passo 2 R2 concluído, 24/10 22:31 UTC.** Sim do Pedro ao SQL de 6390301104; 22 linhas existentes corrigidas em 21–24/10, 29 fontes conferidas por SELECT próprio, zero diferenças. Espelho=52/101/89/76 bilhetes; ERP=52/68/45/36 (24 parcial). Flags/cortes/códigos preservados; vista diária e RPC com zero divergências. [Prova por dia, valores e limites](https://github.com/pedrompropicio/mundopropicio/issues/358#issuecomment-6390371426). Sem INSERT/DELETE ou alteração fora dos quatro dias. Reserva do passo 2 libertada neste fecho.
- **#358 — passo 3 R2 concluído, 24/10 22:50 UTC.** Sim do Pedro ao SQL de 6390473595; 139 linhas novas +64 corrigidas antes de 21/10; SELECT próprio confirmou 243 dias e zero diferenças. Acumulados até 21/10: Braga 1.603 / 50.440,00; Montijo 412 / 13.519,00; Porto 2.223 / 73.897,00 EUR, iguais ao portal. Hash das 32 linhas de 21–24/10 nos oito eventos antes/depois igual; configs/cortes preservados. [Prova e proposta seguinte](https://github.com/pedrompropicio/mundopropicio/issues/358#issuecomment-6390560329). Reserva do passo 3 libertada no QUADRO.
- **#358 — passo 4 preparado, ainda não executado (R2).** Ativar fallback de Braga/Montijo/Porto e marcar migração no ERP nas sete configs ainda sem marca, com corte 21/10 inclusive no ticket_sales; now() é a data do registo no ERP, não a hora real da migração externa. Quatro já têm fallback=true mas precisam da marca para o acumulado; Lisboa fica fora do UPDATE e mantém corte 24/09. Portal, ticket_sales e espelho confirmados por cidade/cêntimo até 21/10; SELECT diário das sete sem diferenças. src/lib/ticketline-cutoff.ts lido: acumulado = ticket_sales <= corte + espelho > corte; flag só decide a série. [SQL exato e prévia](https://github.com/pedrompropicio/mundopropicio/issues/358#issuecomment-6390560329), aguarda Corro. Verificar depois por SELECT, vista/RPC, acumulados, captura automática posterior e fecho D+1 antes de encerrar #358. Sem código/DDL/crons/edge/deploy/Publish, sem alterar vendas ou fechos nesse passo.

- **#348 — canal online/balcão para Revenue Share.** Achado direto na conferência da #358, registo autorizado pelo Pedro: Vendas por Evento da nova área de Promotores expõe Postos TL / Internet / Bilheteira, com quantidade e valor por evento/período. [Prova e limites no comentário 6390061024](https://github.com/pedrompropicio/mundopropicio/issues/348#issuecomment-6390061024). Canal no HTML de RG27 confirmado; XLSX e cobertura SM/Anitta por verificar. Postos TL não equivale automaticamente a online. Sem despacho/implementação; Fever/BOL e resto da sondagem pendentes. BP 1.3.04 fica na frente 5.

- **Cadeia de apuramento incompleta (#303):** Ivete Clareou 2026 e Henry&Klaus Porto têm fecho sem apuramento; Maiara e Maraisa Lisboa e Porto não têm nenhum dos dois. Obter os PDFs anteriores ao 3163, sem inventar ligações ou valores.
- **Conciliação do 3163 contra o PDF (#303):** conferir linha a linha; a soma −49.050,59 já fecha, mas não prova equivalência documental.
- **Fecho Deive Leonardo Braga:** permanece em draft, direito 20.384,11, ligado ao 3163; aguarda a confirmação do Pedro no ecrã.
- **Par 10.3 do SM Porto (D-ERP239, em aberto):** os 2.315,00 retidos pela Super Bock Arena nunca saíram da conta da Ticketline, que fica inflacionada nesse valor (D-ERP237). Em Braga foi feito; no Porto não.

## Bloqueios

- **#358:** conferência direta e passos 1–3 concluídos; histórico dos três completo. Ativação e marca/corte das sete configs exigem a confirmação R2 do passo 4. Ligar só o fallback pode trocar todo o histórico da série por um espelho incompleto (#197); marcar migração não recupera linhas perdidas. O capture_day atual escreve todos os configs da empresa, mesmo recebendo configId de uma cidade — qualquer reprocessamento exige âmbito explícito.
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

## Fechado a 13/10/2026

- **D-ERP239 — Bilheteira local do SM Porto: 120,00 repostos em ticket_sales.** Em 10/10 foi inserida em `ticket_sales` uma linha manual de −3 bilhetes / −120,00 no lote Balcão 1 · Lote Promoc. do SM - Porto (id 1aeef96d), porque a Super Bock Arena reconhecia 2.195,00 de bilheteira local contra os 2.315,00 da Ticketline; a decisão de então foi valer o valor da sala. A 13/10 a sala reconheceu o erro e vai repassar os 120,00 à MP: a premissa da linha de acerto caiu e a linha foi apagada. A bilheteira do SM Porto volta a 5.213 bilhetes / 256.450,00, igual ao Mapa de Vendas do apuramento 3163. Fecho 1950c08e (confirmado): bruto 256.330,00 → 256.450,00, retido pela sala 2.195,00 → 2.315,00; direito inalterado em 226.454,85 — os 120,00 entram no bruto e saem no retido. Tentativa nesta sessão de criar a rubrica 1.1.05 "Bilheteira local (recebida da sala)" + transação de 120,00: revertida integralmente, ambas apagadas. Em aberto: o SM Porto não tem par 10.3 (ver "A trabalhar agora").
- **Rubrica de bilheteira por código nos DRE (D-ERP239):** `src/lib/ticket-category.ts` (`TICKET_CATEGORY_CODE = "1.1.01"`, `findTicketCategoryId`) aplicado em `ReportDRE.tsx`, `ReportDREEmpresarial.tsx`, `PartnerDREDialog.tsx` e `ReportDREBrasil.tsx`; sem fallback por nome. Testes em `src/lib/__tests__/ticket-category.test.ts`.

## Fechado a 10/10/2026

Entregas da #303, sem fechar a issue:

- **D-ERP231:** modelo de apuramento, ligação ao fecho e histórico só-leitura. 2558 e 3163 registados. Os 265,00 do Deive são bilheteira local do Forum Braga (`venue_settlement`), resolvidos pelo PDF, não por diferença.
- **D-ERP232:** quatro fechos migrados para direito do evento, três inalterados; formas derivada/manual separadas. Retido inalterado nas verificações antes/depois, transferências e resultados dos eventos preservados.
- **Deive Leonardo — Braga:** fecho em rascunho, ligado ao apuramento 3163/2026 e à dedução já paga da FT FA.2026/3411; linha `event_right` ligada ao fecho e descrição corrigida, sem alterar valores do apuramento. Origem: Mapa de Ocupação e FT 3411 da Ticketline (email da Paula Leitão de 09/10) e email da InvestBraga de 10/10 às 15:30. Retido pela sala sem fatura associada; sem confirmação do fecho ou devolução antecipada. Par 10.3 de 265,00 e comissão IB de 6,15 lançados em 10/10/2026 (D-ERP237); variações Ticketline −265,00 e Acerto +258,85, resultado −6,15, diferença dos cartões 0,00. Apuramento, fecho e adiantamentos preservados. Aguarda confirmação do Pedro no ecrã. O Deive já tinha apuramento e não integra os quatro eventos fora da cadeia, que permanecem inalterados.
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

- **Entrega de tarefas ao agente:** verificar com `list_messages`, NÃO com `get_project`. `agentFinished` é partilhado entre chats e pode reflectir trabalho de outra frente; não prova chegada nem execução desta tarefa. Caso 10/10/2026: despacho desta frente deu timeout e não chegou enquanto o agente terminava tarefas de audience.
- Trava com saldo de conta de bilheteira nunca usa valor absoluto. O RG está a vender ao minuto. Valida a VARIAÇÃO (`depois − antes = X`), lendo o saldo no momento da execução.
- Fecho de bilheteira tem vista de leitura e PDF desde 10/10/2026. Não é preciso abrir o modal de edição para ler um fecho.
- Texto que vai para PDF passa sempre pelo saneador de `src/lib/pdf-text.ts`. O jsPDF não aceita U+2212.
- Coluna `date` mostra-se com `formatDatePT`, nunca convertida para instante. O Pedro trabalha de Fortaleza e qualquer conversão recua um dia.
- Bilheteira local retida pela sala resolve-se com par 10.3 + comissão. Ver D-ERP237. Não é diferença de conciliação.
- A diferença do card é 0,00 desde 10/10/2026. Se voltar a aparecer, a causa provável é uma retenção da sala ainda não lançada, não um erro de cálculo.
- **Diferença condicional:** mostrar linha e detalhe só se |diferença| >=0,01; abaixo disso nada, sem sucesso/visto. Preservar componente. Implementado; fórmula, outros cartões e modal de fecho inalterados.
- **Somas de `ticket_sales`: SEMPRE `coalesce(total_value, quantity * unit_price)`.** Mesma expressão de `_ticket_office_balance_raw`. Somar apenas `total_value` dá zero onde o campo é NULL. Caso de 10/10/2026: Maiara e Maraisa Lisboa e Porto, vendas históricas de 360.591,50 lidas como zero por esse erro. Nas leituras da app, usar `get_ticket_office_sales`; nunca somar uma resposta truncada do PostgREST.
- **Identidade dos cartões:** `valor por apurar − já adiantado + diferença de calendário = saldo retido` (posição do último apuramento negativa). «Valor por apurar» soma SALDOS dos eventos sem fecho E sem apuramento, não vendas brutas; liquidados em dinheiro entram a zero. «Já adiantado» = absoluto da posição do último apuramento. Se a posição for positiva, é valor a entregar à MP, não adiantamento.
- **Diferença de calendário:** movimentos que a bilheteira já fez mas que o nosso registo ainda não reflecte, e eventos à espera do apuramento. Nunca descrever como «custos que a bilheteira ainda não descontou»: é o contrário. Nunca pendência, tarefa, alerta ou desvio; sem cor/ícone de aviso. Notas e estado não congelam retido, valor por apurar nem diferença: consultam-se na hora. A retenção do Fórum Braga (Deive) já foi lançada pelo par 10.3 e comissão; confirmação do fecho e devolução pela InvestBraga são independentes e não foram antecipadas.
- **Desconto no apuramento exige conta da bilheteira na despesa.** Uma despesa que a bilheteira descontou TEM de ficar lançada com a conta dessa bilheteira. Sem conta, o desconto existe no documento mas não no saldo, que fica inflacionado e indica mais dinheiro da MP do que a bilheteira realmente tem. Caso real: FT FA.2026/3159 (7.394,76) esteve sem conta e inflacionava o saldo da Ticketline nesse valor; Pedro autorizou a ligação das duas transacções à conta em 10/10/2026, já executada antes desta tarefa. A ligação foi executada e permanece resolvida.
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
- `docs/DECISIONS.md` — D-ERP231/232/233, D-ERP237 (bilheteira local retida pela sala) e D-ERP239 (SM Porto 120,00; rubrica por código 1.1.01); GitHub #303 — cadeia e reconciliação ainda abertas.
- Handoff de 10/10: `docs/handoffs/2026-10-10-ticketing-e-receita.md` (arquivo, não fonte de estado).
- Antes de diagnosticar, nomear a memória lida (D-ERP162); índice gerado por `scripts/gen-memory-index.mjs`.

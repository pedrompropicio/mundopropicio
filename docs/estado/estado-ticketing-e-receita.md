# ESTADO — Ticketing & Receita

Atualizado: 2026-10-09 · Issues: `agora` — · `a-seguir` #206 · `depois` #73, #78 · `bloqueada` #211 (transversal, plataforma-e-infra)

## Em vigor

- **Vigia ticketline-crosscheck (D-ERP152).** Corrida diária 06:50 UTC (cron `ticketline-crosscheck-daily`, jobid 1640), tabela `ticketline_crosscheck_runs`, alerta como condição **(e)** de `check_ticketing_sync_health()`. Limiar revisto a 02/10: alerta com **pelo menos 3 bilhetes E pelo menos 1% da quantidade do portal**, em duas leituras diárias seguidas; o valor em euros deixou de ser gatilho e é só informação; evento não encontrado no portal alerta logo à primeira leitura. Motivo da revisão: com o limiar absoluto de 100 €, o SM Porto alertava com 2 bilhetes de diferença em 4.921 (0,04%).
- **Série diária do BOL.** A validação deixou de depender só da linha TOTAL do Mapa Diário: passa a aceitar também a validação pelo total do M2 da mesma corrida (soma dos dias = M2 em quantidade e valor ao cêntimo; `validated_by = m2_total` + aviso) e recusa quando nenhum dos dois bate. Quando falha, grava `daily_debug` no `import_audit` com a janela de tokens à volta de cada ocorrência de TOTAL. Alerta novo: condição **(f)** — 6 corridas seguidas com status ≠ `success` na mesma config (warning conta), anti-spam 12h.
- **Conferência portal de Produtores (D-ERP191/192).** Fonte = variação do occupation.xlsx; o PDF é só informativo; sinal **(g)** = "PDF parado com xlsx a mexer".
- **A vigia não tem canal empurrado (D-ERP197, 09/10).** O único canal é o indicador do Dashboard (`TicketingDivergenceIndicator`, bloco "Por bilheteira"), por empresa activa. Mostra TODAS as condições: vermelho (a) falha persistente, (b) parado >6h, (d) captura horária parada, (f) 6 corridas sem sucesso; âmbar (e) e (g) — a (g) diz que é problema do fornecedor; (c) import desligado só informativo. Cálculo único em `ticketing_sync_conditions()`, usado pela vigia e pelo RPC do ecrã `get_ticketing_sync_status()` (filtro `row_belongs_to_current_company`). Sem email, sem WhatsApp, sem lembrete: a chave `ticketing_sync_stalled:*` deixou de existir. Cron 217 morto em definitivo.
- **Fechos de bilheteira por evento e transversais (#271, 09/10).** Bloco "Fecho de bilheteira" no separador Bilheteira da ficha do evento; lista "Todos os fechos de bilheteira" em /bilheteiras com filtro por bilheteira e por evento. Mostra bruto, deduções, líquido, data, estado, forma de liquidação derivada (transferência própria / encontro de contas na conta-corrente / compensado / por liquidar) e sempre as notas. RPC `get_ticket_office_settlements_overview`, isolada por empresa.

## A trabalhar agora

Nada em curso.

## Bloqueios

- **#211 (plataforma-e-infra)** — o `notify_sync_action_needed()` aponta em Live para o projeto de TEST antigo e é um no-op; bilheteira já não depende dele, mas Coala e Fever continuam sem aviso próprio.
- **#78** — o import da Ticketline não limpa a série antiga quando o formato muda.
- **#73** — corte por tipo de bilhete.

## Risco a vigiar

- **Mapa de Ocupação da Ticketline (#267, fechada por decisão).** Se algum apuramento da Ticketline vier a ser calculado sobre o Mapa de Ocupação em vez das vendas efectivas, os 9.680,00 € passam a ser dinheiro. Conferir no próximo fecho de Almada, Braga ou Estoril.

## Fechado a 09/10/2026

- **#283 — auditoria de isolamento multiempresa, RESOLVIDA (D-ERP194 a D-ERP205).** Seis partes. Base: 3 políticas e 12 funções SECURITY DEFINER com guarda da empresa da linha. Funções de servidor: 9 sondas e ficheiros temporários esquecidos apagados, ~20 funções com sessão e papel na empresa da linha, ramo service role validado no Auth em 10 funções e nos 4 helpers partilhados. Dados: 618 leads órfãos adoptados e a origem corrigida por gatilho. verify_jwt declarado explicitamente em todas as funções. Três invariantes diários.
- **#267 — Mapa de Ocupação da Ticketline parado. FECHADA POR DECISÃO DO PEDRO, não por resolução.** Não se reporta ao fornecedor. A 09/10: Almada 129 bilhetes / 4.300,00 €, Braga 138 / 4.470,00 €, Estoril 26 / 910,00 €; total 293 bilhetes / 9.680,00 € que o PDF do portal não reflecte, enquanto o occupation.xlsx do mesmo portal bate certo com as nossas vendas. Cinco outros eventos coincidem ao cêntimo na mesma leitura, logo não é do nosso lado. Nenhum número nosso depende do PDF. Continua vigiado pelo sinal (g) no indicador do Dashboard.
- **#271 — fechos de bilheteira por evento e lista única.** Forma de liquidação provada nos 5 fechos da Mundo Propício: Plenitude e H&K Lisboa = transferência própria; H&K Porto = encontro de contas; Anitta e Ivete = compensado.
- **Vigia toda no ecrã (D-ERP197).** Dry-run antes e depois: as mesmas 2 × (g), RG Almada e RG Braga. (a) forçada numa transacção anulada → vermelho. Isolamento provado por impersonação do michel (Coala) nos RPC do ecrã: 0 divergências, 0 condições de sync, 0 fechos; o Pedro vê 2, 2 e 5. **Por fazer:** a prova equivalente por impersonação nas edge functions — as que foram corrigidas recusam a chave pública e o token forjado, mas nunca foram testadas com uma sessão válida de outra empresa.

## Fechado a 08/10/2026

- **#282 (fuga de dados entre empresas nos alertas) — FECHADA.** `check_ticketing_sync_health` filtra destinatários por `ur.company_id = v_company`; platform_admin só entra com papel nessa empresa. A função deixou de enviar: devolve o plano por empresa e escreve o lembrete. Dry-run de 08/10: uma só empresa no plano, Mundo Propício.
- **#272 (modal de fecho de bilheteira) — fechada**, verificada em ecrã pelo Pedro.
- **Fecho da bilheteira do Plenitude refeito pelo fluxo:** bruto 112.842,00 €, deduções 33.342,96 €, líquido 79.499,04 €, par `TRF-FECHO-D7042A04`. Saldo BOL 72.950,00 €.
- **Série diária BOL reposta** com um segundo validador pelo total do M2, que apanhou o defeito real (906 vs 982).
- **Sync Onebox reposto** (2.917 / 164.029,25 €) e acrescentado à vigia de saúde.
- **Índice de memória** passa a ser gerado por `scripts/gen-memory-index.mjs`, com teste que falha se o ficheiro for editado à mão.

## Factos que não se reinvestigam

- **Fecho de bilheteira (fluxo completo):** ler `.lovable/memory/features/settlement-transfer-pair.md`, `venue-retained-door-sales.md`, `ticket-office-reconciliation.md` e `ticket-office-sales-scope.md` antes de diagnosticar.
- **Vigia de sync:** `.lovable/memory/features/ticketing-sync-health.md` (condições a–g, cálculo único `ticketing_sync_conditions()`, canal único o indicador — D-ERP197).
- **Crosscheck portal de Produtores:** `.lovable/memory/features/ticketline-crosscheck.md` (correspondência por data+recinto, limiar 3 bilhetes E 1%).
- **Série diária por evento:** `public.vw_event_daily_sales` — precedência por evento (espelhos vs `ticket_sales`), as duas famílias nunca se somam no mesmo evento.
- **Conta-corrente MP↔Ticketline:** o débito que transita decompõe-se em Ivete (−215.582,23) + H&K Porto (−55.834,14) = −271.416,37; a posição da conta é positiva para a MP (283.427,63 € a 13/09). Não voltar a confundir saldo de fecho com posição da conta.
- **Transferência entre contas** = par `expense`+`income` na rubrica 10.3 via `create_settlement_transfer`; nunca `type: 'transfer'`. Estorno apaga as duas pernas pela `operation_key`.
- **A perna da transferência do fecho nunca é dedução** — está excluída da lista de elegíveis do modal por `id = transfer_transaction_id` e por `operation_key TRF-FECHO-%`. Um fecho com transferência lançada não se reconfirma; estorna-se.
- **Uma correcção corre de ponta a ponta ou não começa.** Apagar metade e deixar o resto por fazer deixa dois saldos errados.
- **Verificar o papel não é filtrar a linha (D-ERP194).**
- **A receita de bilheteira vive em `ticket_sales`, não em `transactions`. É por desenho.**
- **Neste projecto, uma edge function sem bloco no config.toml corre SEM verificação de assinatura no portão.** O valor por omissão documentado pelo Supabase não se aplica aqui. Verificado em Live a 09/10 com o mesmo token forjado: função sem bloco devolve o erro dela; função com verify_jwt=true devolve UNAUTHORIZED_LEGACY_JWT do portão.
- **Declarar verify_jwt no config.toml não basta: a definição só vale depois de a função ser reimplantada.** Depois de um Publish, as declarações novas ainda estavam desarmadas.
- **Um teste que lê a configuração não prova o comportamento.** O invariante das edge functions leva por isso uma sonda real contra o portão.
- **Um comentário que mente esconde o defeito durante meses** (o cabeçalho da crm-meta-create-purchase-audience dizia "sem getUser()" depois de passar a ter).
- **Um helper partilhado de auth corrigido à pressa parte tudo o que o importa, e ninguém dá por isso enquanto ninguém usar a funcionalidade.**

## Onde ler mais

- `.lovable/memory/features/` — índice gerado por `node scripts/gen-memory-index.mjs` (D-ERP158); secção "Por onde começar" do índice.
- Regra do ritual: antes de diagnosticar um fluxo já implementado, nomear o ficheiro de `.lovable/memory/features/` que foi lido (D-ERP162).

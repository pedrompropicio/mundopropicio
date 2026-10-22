# #335 — quadro final da fase local/inerte (reescrito 22/10/2026, correcção inerte)

## Estado em Live (22/10/2026)
- A (storage): INSTALADO.
- B (core + approval + status): INSTALADO.
- C (invariants + balance + cash_position + cash_position_invariant + restore): INSTALADO num único BEGIN…COMMIT, com Sim do Pedro, após prova BEGIN…ROLLBACK verde, incluindo ROLLBACK e md5/dono/ACL iguais à baseline (zero deriva).
- Origem: query do 0·Cowork em Live, 22/10/2026, após COMMIT, comunicada pelo Pedro. Guarda A satisfeita pelos marcadores issue335-balance-v2l, issue335-cash-position-v2l e issue335-cash-position-invariant-v2l; transaction_offset_execute/reverse podem correr em Live (sem UI nova; 0 grupos; nenhum encontro real executado). Verificação completa na secção "Passo C instalado em Live (22/10/2026)" de `docs/testes/issue335-fases12-local.md`.
- kill_switch: EXECUTADO 22/10/2026 — encontros FECHADOS em N1 (enabled=false, reverse_enabled=true). emergency/reactivation: não executados (reactivation só com novo Sim; emergency só em incidente).
- trigger_watch + cash_watch: INSTALADOS 22/10/2026 com Sim do Pedro (commit 02fc1188af1c976eced2630f06cab110d8f2685f). **Instalação em Live concluída até trigger_watch/cash_watch — última etapa da ordem única.** Rollback só com 0 grupos: cash_watch primeiro, depois trigger_watch. Detalhe na secção "trigger_watch e cash_watch instalados em Live (22/10/2026)" de `docs/testes/issue335-fases12-local.md`.
- Leitura do controlo pelo ecrã (`transaction_offset_control_status()`): INSTALADA 22/10/2026 com Sim do Pedro; devolve N1 a authenticated; tabela continua negada a authenticated. Cliente ligado 22/10/2026 (readOffsetControl chama a RPC). Ficheiro de registo corrigido para o instalado (WHERE c.singleton; sem ALTER OWNER). Rollback: DROP FUNCTION. Detalhe em `docs/testes/issue335-fases12-local.md`.
- **PUBLICADO em Live 22/10/2026 (~14:57 UTC)**: deploy_project pelo 0·Cowork com "Faz Publish" do Pedro, sobre HEAD 6182c79cbb74f35d366ae0459b601f4a629de0f1 com CI verde (confirmado pelo Pedro por gh run list); deployment_id 5114ef47-2ffe-4183-806e-4a4124c53beb; URL https://mundopropicio.lovable.app. Conteúdo publicado (fase 3b + ligação do cliente): modal "Encontro de contas" na Conciliação Bancária, ficha da transação só leitura, estorno integral só admin, readOffsetControl via transaction_offset_control_status(). types.ts regenerado pelo Publish — não verificado por mim. CI remoto NÃO VERIFICADO; sem verificação visual autenticada ainda.
- Correcções de cliente publicadas 22/10/2026 (2.º Publish, CI verde confirmado pelo Pedro): platform_admin tratado como admin em canApplyOffset/canReverseOffset (commit a5e7e630; o ecrã resolvia o papel do Pedro como platform_admin e o botão ficava cinzento); prévia com tabela de largura fixa, 4 colunas visíveis (commit 306bd4c5).

### Prova do piloto real — Estoril (22/10/2026)
- Reactivation N1→N0 com Sim do Pedro (script integral). Encontro feito pelo Pedro no modal; verificação por consulta do 0·Cowork.
- Linha bancária a28f3424-db6a-4f42-ba26-91fe98d6d709 (Santander Totta, crédito 23.406,00 €, 13/10/2026). Fornecedor ESTORIL SOL III TURISMO ANIMAC JOGO SA, evento Ivete Clareou 2026.
- Documentos: receita b873559f-88a5-4a27-9b32-dc5193a266b2 (bruto 30.996,00 €); despesa 0368bca9-6519-4776-826e-0dc9c0d790f2 (bruto 7.590,00 €).
- Grupo 443a1d8e-6934-43a2-9d20-f5e78cb68302, estado applied. Itens: receita dinheiro 23.406,00 € + compensação 7.590,00 €; despesa compensação 7.590,00 €.
- Pagamentos: transferência 23.406,00 € na conta do banco; compensação 7.590,00 € em cada documento. Ambos os documentos paid, paid_amount igual ao livro-razão. Linha do banco matched, ligada ao grupo.
- Par antigo d2e1eaa3-2463-4755-9728-d5cbbaac335e (7.590) adotado e ligado ao grupo (predicados do núcleo: ambos os documentos no mesmo encontro, sem grupo nem pagamentos pagos associados, valor igual ao calculado).
- Vigias: 7 vigias de caixa a 0; vigia de triggers conforme; invariante de saldo a 0.
- Ecrã (leitura do Pedro, não conferida por consulta): saldo do sistema 642.707,88 € → 666.113,88 € (+23.406,00 €); diferença para o banco −22.900,85 € → 505,15 € (pendências anteriores: 500,00 € "resto sem explicação" e uma linha de 5,15 € Verde Pay por conciliar).
- Controlo devolvido a N1 após o piloto (kill_switch, Sim do Pedro). **Estado final: N1 (enabled=false, reverse_enabled=true), 1 grupo aplicado.**

- Pendentes: cada janela N0 exige novo Sim; Issue #341 (R2); #337 (encontro sem extracto); Bloco 8; lacunas abaixo; emergency (N2) só em incidente; ver o ecrã da prévia em N0 com um caso real. #322/#323 intocadas. A Issue #335 não é fechada por este documento.

## Pronto para pedir A–C: SIM (só localmente)
Todos os pontos A–G foram reproduzidos e corrigidos, excepto as partes de C não reproduzidas (ver abaixo). Todas as execuções pedidas passaram, com resultados reais.
Isto não autoriza instalação. Antes de qualquer instalação ficam a faltar: o CI remoto (NÃO VERIFICADO) e as lacunas abertas abaixo. A, B, C e a instalação exigem cada um um "Sim" separado.

## Ambiente
- PostgreSQL 17.6 + pgvector (nixos-25.05): `postgresql-and-plugins-17.6`; aceite por phase2h-run.sh:10.
- Baselines (catálogo fiel + refdata + fixtures, sem candidatos): `phase2o-baseline.sh`, portas 55447–55450.

## Execuções (estado final)
- phase2o-corr ANTES (ficheiros do commit 3a28ae85, extraídos para /tmp): 27 testes — 8 PASS, 19 FAIL, rc=1. Saída em `supabase/tests/issue335/local/phase2o-corr/antes.out`.
- phase2o-corr DEPOIS (supabase/manual): 27/27 PASS, rc=0. Saída em `.../depois.out`.
- Suite completa (baseline E com fixtures): 22/22 PASS, rc=0, incluindo o runner E (phase2n-columns).
- Rollback integral dos 14 pares, pela ordem única (phase2l-rollback.py): rc=0, `differences={}`.
  - SHA-256 before=after `474947e27e3cf0c0d328ccc6e76c2fbb6d915e781ddc9ccb43de36325a2af1a1`.
  - 4 recusas fora de ordem confirmadas com o catálogo intacto.
- Vitest: 222 ficheiros, 1986 PASS, 6 skip, 11 todo, rc=0. tsgo: rc=0.
- Não executados (alinhados só ao nível do texto): phase2f-run.sh, phase2j-rollback.sh, phase2k-rollback.py.

## Estado por achado
- A — REPRODUZIDO.
  - Antes: o execute é aceite sem balance/cash_position (obtido None).
  - Depois: recusa com `installation_order: balance_|cash_position_|cash_position_invariant_candidate_required`. O mesmo vale no reverse.
- B — REPRODUZIDO.
  - Antes: approval e cash_position instalavam-se sem storage; status dava `approval_before_status`.
  - Depois: `storage_required` / `core_required`.
- C — REPRODUZIDO para approval/status_first, cash_position/invariant_first, balance/cash_watch_first e storage com consumidores (rollback parcial).
  - Grupos vivos: REPRODUZIDO em approval, cash_position e cash_position_invariant.
  - NÃO REPRODUZIDO em status, balance, core e storage: estes já recusavam com `groups_exist_keep_guards` em antes.out. Não alterei estas guardas.
- D — ordem única no cabeçalho dos 28 SQL. Runners alinhados: phase2h-suite, phase2l-rollback, phase2f-run, phase2j-rollback e phase2k-rollback.
  - phase2g e phase2l usam o corpo Live como fixture: o rollback real passou a recusar, de forma legítima, quando há grupos ou o status instalado.
  - Nenhuma guarda foi enfraquecida.
- E — REPRODUZIDO.
  - Caso: cash_order 3 e 12, movimento −100, pagável com débito 150, par legado de 50.
  - Antes: `legacy_offset_amount_mismatch`.
  - Depois: par adoptado. Alocação (3: dinheiro 100, compensação 50) e (12: 0, 80).
- F — REPRODUZIDO.
  - Antes: um viewer lia o item confidencial e os grupos (incluindo o de conta restrita).
  - Depois: não lê. Admin lê tudo; o viewer continua a ler os itens não confidenciais.
  - Regra de origem: `transactions_confidential_guard`, supabase/migrations/20260911000848_829d57de-eff8-4584-96e2-db36cc0888fa.sql:48-60.
  - Ajudantes `issue335_tx_visible` e `issue335_group_visible`: SECURITY DEFINER, search_path fixo, REVOKE a PUBLIC/anon/sandbox_exec, DROP no storage.ROLLBACK.
- G — feito em phase2o-corr: rollback com grupos vivos (grupo real criado pelo core), rollback parcial e fora de ordem. O rollback integral está em phase2l-rollback.

## Assinaturas confirmadas por execução no catálogo local
_derive_paid_amount(uuid), get_event_cash_position(uuid,date,date), get_event_cash_position_invariant(uuid), issue335_cash_watch(), issue335_context_valid(text), restore_apply_from_shadow(text,uuid,text[],jsonb) (marcador transaction_offset_control): todas resolvidas sem erro nos testes B/C/G.

## Lacunas abertas (registadas, sem correcção)
- CREATE OR REPLACE sem comparar o hash do estado actual do Live com a baseline capturada.
- Estorno sem asserção do estado final (status/paid_amount/payment_date = prior_*).
- Lock NOWAIT do evento serializa encontros do mesmo evento.
- Kill-switch com lock exclusivo e timeout de 5s, sem caminho de emergência.
- Invariante de saldo tautológica.
- Replays recusados com encontro_desativado quando desligado.
- Trigger legado com NEW.supplier_id (por tratar).
- Anteriores: fronteira do trigger do dono (substituição de corpo não detectada); TRUNCATE de user_permissions; CI remoto.

## Manifesto (SHA-256 dos ficheiros alterados desde 3a28ae85)
| ficheiro | SHA-256 |
|---|---|
| supabase/manual/20261021_issue335_cash_position.INERTE.sql | acb5534ab3b739c8c6414a9012e6c3cc66842a65a7e1505267e0b77a7cb62ce4 |
| supabase/manual/20261021_issue335_cash_position.ROLLBACK-INERTE.sql | 6e13ca40c24d71b0ca93280c38631ecc04933f89f44278ab4045e475e5f2596b |
| supabase/manual/20261021_issue335_cash_position_invariant.INERTE.sql | c2c9d3c4ecdf1f1d4272c05001b6a56e094b33926db06630594ebc1ddd7a1117 |
| supabase/manual/20261021_issue335_cash_position_invariant.ROLLBACK-INERTE.sql | 94caeccd0dfdf8326faf02aef36052b41bb2fd96980f029e4ff0424964b6c175 |
| supabase/manual/20261021_issue335_cash_watch.INERTE.sql | b906804631d2d5da00b13b4e24aebb8030b5368d05b928015265720b380c9f08 |
| supabase/manual/20261021_issue335_cash_watch.ROLLBACK-INERTE.sql | 876f384e8eda70575b0af1106989d3eb10ba02577edf62fe51a46b2e2882bded |
| supabase/manual/20261021_issue335_emergency.INERTE.sql | b4a1f990294c25e76ccad878f208e3e95cb3133813471da0edbff8ccb785082e |
| supabase/manual/20261021_issue335_emergency.ROLLBACK-INERTE.sql | b3e3e48dd7a9f65d1f01ca9d680b0d4e8187386e7d4381d03047d1ce068498fb |
| supabase/manual/20261021_issue335_offset_approval.INERTE.sql | c2a7e14c204a0bd3eabdabc3dbf6d4d8224f7991f9d50c4b88692ffefdcdd67f |
| supabase/manual/20261021_issue335_offset_approval.ROLLBACK-INERTE.sql | 8e10af4b3db0a9e13b76d142f331c50b31450c1e80d9c7f29dd15e441981bc23 |
| supabase/manual/20261021_issue335_offset_balance.INERTE.sql | db667f07a1e4d4900e3d14712dd2bb4e1b38a6d1a6c5ad1d8378e43da5bd0b48 |
| supabase/manual/20261021_issue335_offset_balance.ROLLBACK-INERTE.sql | 9ca77d14d030453b1097c5999954d0432fa2e3345de57b363ddd7c86287b9eb0 |
| supabase/manual/20261021_issue335_offset_core.INERTE.sql | 4d0c673a2c7f89e07212786343cfb2a891218d42268acc9f7a79391d6038650c |
| supabase/manual/20261021_issue335_offset_core.ROLLBACK-INERTE.sql | 8d1d3d0588a4dbb68adaea65978e357182f6ef5f6d4f47e239fce61b425b5c99 |
| supabase/manual/20261021_issue335_offset_group_storage.INERTE.sql | 5817fca6c2d44f6b18dfaef7f0c49e4a66ee8ac34b87944b20f4b29c3772198f |
| supabase/manual/20261021_issue335_offset_group_storage.ROLLBACK-INERTE.sql | f00b02fdaecd472628b6074e0fb7bbc7b87083063cc15fbf7a70ed669d581509 |
| supabase/manual/20261021_issue335_offset_invariants.INERTE.sql | dd40e9200173cff04a40ccb54178e072b8a53bbc2566b464fb8c3097e3f605f3 |
| supabase/manual/20261021_issue335_offset_invariants.ROLLBACK-INERTE.sql | 3da1fc7e9ee3027338e8a27dd7d209087f16911a4b54a0b0831856e4e146ec9c |
| supabase/manual/20261021_issue335_offset_kill_switch.INERTE.sql | fe8696fcdeb0baf0dd588eecb9b359c40176478f1643e6465bb00c5ab226ef67 |
| supabase/manual/20261021_issue335_offset_kill_switch.ROLLBACK-INERTE.sql | 1ea973408cb485a4b2faef9b62ca9019f5d828e147900775e9f1568da46c67f9 |
| supabase/manual/20261021_issue335_reactivation.INERTE.sql | 0dfbc7f4b36956bd8f0c917809cb9eb3af787968ec40bc27ba3dcd2d8c08e318 |
| supabase/manual/20261021_issue335_reactivation.ROLLBACK-INERTE.sql | 0475c63d960933ecd4f32f56323555e74ef415cedfe458adc51af99ffa7c779e |
| supabase/manual/20261021_issue335_restore.INERTE.sql | 6e59cde20049a638d8028c3e59e045791af61cfda2b7ae1889e82c94731b0a9b |
| supabase/manual/20261021_issue335_restore.ROLLBACK-INERTE.sql | 1209c6c875d0ddfa2a55e7c24570a567df215ac56ccbfb09fa52dcececb24bac |
| supabase/manual/20261021_issue335_status.INERTE.sql | 2fc7cb619360a1c3185cf897dd5283eeef85155329e1da9b38243572b027d52c |
| supabase/manual/20261021_issue335_status.ROLLBACK-INERTE.sql | 386aa5008618e08798732ea366359cae060cfdd8cd3493eb6133d893260daab1 |
| supabase/manual/20261021_issue335_trigger_watch.INERTE.sql | 34a69e357ca4ddb90a4251bc391c3e3815a7e7e372e7ec8591c4965aaf7c8421 |
| supabase/manual/20261021_issue335_trigger_watch.ROLLBACK-INERTE.sql | dab48fae44b312a2b5e6b54d0b1d3835f05852a7dd53236970b3c32fe7cce580 |
| supabase/tests/issue335/local/phase2o-corr/antes.json | f2990dd29130e3175c461903490b6f597075f2f7154178b9b129e28e5a09ee05 |
| supabase/tests/issue335/local/phase2o-corr/antes.out | cb093849232661eca7017731339ce69f194dac6ca060782af81449360187375e |
| supabase/tests/issue335/local/phase2o-corr/depois.json | e462db175d22321e50b5b7bf061438f8eac1acda6805caf3345e3a1d94e27709 |
| supabase/tests/issue335/local/phase2o-corr/depois.out | 4e76e4a489f9bccedc3ce554c9ed8ecddaff2546bfc79304723590b4b63ba64d |
| supabase/tests/issue335/phase2f-run.sh | 4ccf0a30b0122a573fbea850b7c1309a10fcf3fbb83100e7c94b45c66ae734b0 |
| supabase/tests/issue335/phase2g-approval.sql | 30847ff1320f44bc2d8de1667a106c458ccb1542e784c7e40029a1423da0967b |
| supabase/tests/issue335/phase2h-suite.sh | fd58744cf8154332613700bfc81311e0fd62fce5d92e2315fef9974a6e64ab22 |
| supabase/tests/issue335/phase2j-rollback.sh | faa2208df8a9d62317fa37196e52a9d70e666c0ceaf4be0d8e8540ada6910bdf |
| supabase/tests/issue335/phase2k-rollback.py | e4fd670bb909bb173d7ee1d404b054a6577cb885f9ab6910b4e697c11fd492c1 |
| supabase/tests/issue335/phase2l-rollback.py | adb8ac41d2ed99942280c858d9213a2e5a0f9fd0d17653fc9bd35604d4064e89 |
| supabase/tests/issue335/phase2l.sql | a7f7ce356e94f7444df09c4d699b059150afe8053e7ff12b29cc64787186a305 |
| supabase/tests/issue335/phase2o-baseline.sh | b8acd63b454911beac8f64027fd4665646c626435b083a59d06916e53d9bac79 |
| supabase/tests/issue335/phase2o-corr.py | 8531286991e8fb2a9e2aac0bef7c3b4eb0ed5647eefb7a8fb4378a78bf7ef1cb |
| supabase/manual/20261022_issue335_control_status.INERTE.sql | 41a041e72c25ae25956a814df6a628fda84dc7086413b8dd3cf46d29922fa477 |
| supabase/manual/20261022_issue335_control_status.ROLLBACK-INERTE.sql | 661a1ede3c5a9b6e4c410290338dd6ec849ac59fd6d95484703b3a22231c05a5 |

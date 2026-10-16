# #327 — Núcleo de pontos do Clube (revisão 3: lacunas residuais da revisão rev2 de 16/10 15:34 fechadas)

Aprovação do núcleo: Pedro, 16/10/2026 14:45 Fortaleza. Partida rev2: 5240bf38a87b. Partida rev3: 3004c034561a822ddbcc74be59ce45cf95672f15 (local = remoto confirmado antes de editar). Commit final: ver o commit desta tarefa no histórico (HEAD local no fim: o último commit do agente sobre 8653b9bd).
Nada aplicado em Live: sem DDL/DML, deploy, Publish, compras ou envios. Única leitura de Live: `PROVA_LEGADO.sql` (agregados sem PII).

## Artefactos (sha256, 16 caracteres)
- `supabase/manual/20261016_issue327.PENDENTE.sql` bcf12704d0f491e5
- `supabase/manual/20261016_issue327.CUTOVER.sql` 546256db8c4a80a7
- `supabase/manual/20261016_issue327.ROLLBACK.sql` c7f18a0476747b79 (gerado: head + 6 funções do baseline, incl. `club_crew_pending` de 0176 verbatim + tail)
- `supabase/manual/20261016_issue327.PROVA_LEGADO.sql` 97b94c73f582b90b
- `patches/issue327/newgang-portal.patch` a730f286cbce0133 (gerado por `make_patch.py`), `club-canon.ts` fc9da19f02ba2f9b, `club_canon_test.ts`, `verify.sh`
- `patches/issue327/crm-crews-section.patch` f1050a2961596542 + `verify-crm.sh` (CRM, inerte)
- Bateria: `scripts/club-sql-it/run327.sh` + `50_legacy327.sql`, `60_after327.sql`, `65_rls327.sql`, `70_conc327.sh`, `75_epoch327.sh`, `77_pending327.sh`, `06_acl_parity_live.sql`, `rollback327_{head,tail}.sql`, `compare327.py`, `live-hashes-327.json`

## O ficheiro é inerte; aplicá-lo NÃO é
O ficheiro guardado não corre sozinho. Aplicar o PENDENTE muda o runtime antes do cutover:
- substitui 5 funções (`club_award`, `club_award_fixed`, `club_confirm_member`, `club_ranking`, `club_wallet_due`);
- cada crédito novo grava `event_id` (= evento do site nesse momento);
- a confirmação regista `club_referral_events` e pede bloqueio partilhado por site;
- cria 6 tabelas, 11 funções e a config `2027-v1` em draft.
Os valores pagos, os níveis e as regras visíveis ficam iguais. Testes pré-cutover: ranking, wallet_due, `club_point_rules` e `club_crew_cfg` com o mesmo resultado que antes do patch (md5); montra igual aos valores atuais; sem retrato legado.

## Defeitos fechados
1. **RLS**: as 6 tabelas novas têm `company_id` com FK. A política é `portal_can_write() AND row_belongs_to_current_company(company_id)`. Um trigger verifica a coerência membro/site/empresa/nível/config. Testado com `SET ROLE` real e GUCs: staff A vê só A (e todas as de A), staff B só B, sem permissão 0, anon sem acesso, escrita direta recusada. Controlo negativo: com a política antiga, staff A vê provas de B. RLS 28/28.
2. **Corrida do cutover**: o crédito pede o bloqueio partilhado do site **antes** de ler config/edição; o cutover pede-o exclusivo. Ordem: site → membro. A confirmação bloqueia o site antes da linha do membro (`FOR NO KEY UPDATE`), o que evita o ciclo com o FK do piso. Retirado o `LOCK TABLE club_points` global (risco de deadlock com `club_points_set`). Teste em 2 fases (`75_epoch327.sh`): T1 aberto, cutover e T3 ficam à espera (2 locks verificados), COMMIT, e a ordem fica T1 < cutover < T3.
   - A: sem config → config. T1 paga 150 e T3 paga 75. Piso = retrato com T1 (550 → Crew).
   - B: config antiga ativa → nova na mesma edição. T1 (75) recusado pelo teto, T3 (50) cabe: 750 exatos. Crew X 4×100 (antiga), Crew Y 4×90 (nova).
   - C (controlo negativo, bloqueio desligado só no teste): o cutover termina com T1 aberto e T1 grava o valor antigo depois da troca. A anomalia reproduz-se, por isso o bloqueio é necessário.
   - Epoch 18/18.
3. **Montra**: o cutover atualiza `club_point_rules` só nas 4 regras aprovadas (100/75/100/200). Guarda `rules_before`/`rules_after` no log; a reversão repõe. `club_crew_cfg` passa a 100. RPC nova `club_rules_public(site)` devolve, por regra, pontos pagos agora, `available`, `status` (ok | inativa | sem_integracao | edicao_sem_config), teto, âmbito, edição e versão. O patch da API usa-a nos payloads `site`/bundle: só as disponíveis aparecem como "ganha N"; as indisponíveis vêm em `rules_unavailable`, sem pontos. Testado: antes do cutover, depois, noutro site, com a config a zeros, e depois da reversão.
4. **Edição**: se o site mudar de evento e a config ativa for de outra edição, as regras controladas dão 0 (nada vai para a edição antiga). As outras regras vão para a edição corrente. O cutover recusa uma config de edição diferente da do site. Depois do cutover certo, funciona. **A inscrição é 1× por adesão ao site, não por edição** (a ref = membro). Testado: um membro da e1 não recebe um 2.º 100 na e2.
5. **Legado**: deixou de existir o "NULL global para sempre". No cutover (só com `legacy_counts` e o site a apontar para o evento da config) é tirado um retrato imutável `club_legacy_consumption` dos créditos NULL ativos das 4 regras, com datas. O ledger não muda. Indicados confirmados antes do patch entram na contagem (`source=legacy_snapshot`). Prova Live (só leitura): site → evento 2027 = sim, evento existe, 1 site no evento, 0 créditos anteriores ao site, 0 órfãos, `join_confirmed 17/1700`, `friend_joined 1/150`, 1 indicado confirmado (output em `claude-outputs/2026-10-16-1835-issue327-prova-legado-live.md`). Conquistas: conta a inscrição **ativa** do indicado (`club_points_active`). Anulada deixa de contar; reaprovada (ref#2) volta, sem duplicar. Anular uma indicação **não liberta o teto** por omissão (`referral_void_frees_cap=false`, proposta não aprovada; testada nos dois valores).
6. **Prova de compra**: o índice único `(source, event_id, lower(trim(order_ref)))` impede que a mesma encomenda com outro fingerprint sirva a outro membro (testado). A coerência membro/site/empresa é feita pelo trigger e pelo motor. `revoke` com estado NULL dá erro 22023 antes do UPDATE. A compra continua desligada; sem importador; `friend_bought` intacto (300), só marcado `sem_integracao` na montra (proposta).
7. **Reversão**: transação única com guardas. Aborta se o patch não estiver aplicado ou se algum membro descesse de nível: retrato do nível canónico antes vs fórmula antiga depois (controlo negativo: membro com −1400 → aborta e nada muda). Repõe as funções, os limiares e as 4 regras visíveis de antes do 1.º cutover. Remove triggers e funções novas. Não apaga dados. **Ordem substituída na rev3 (ver abaixo): SQL primeiro sob API compatível.**
8. **API**: módulo real `club-canon.ts`, injetado com `rpc`. Nível com erro explícito, vazio → 0/null, protegido + próximo nível coerente, cache por membro. Conquistas com `status:error` em vez de null silencioso. Montra com erro explícito. Ligado na Wallet (`walletMember`), em `me` (`level_protected`, `next_level`, `next_level_min`, `referrals`) e nos 2 payloads de site. Ranking/CRM/cron da Wallet já usam o nível canónico via SQL. `verify.sh`: worktree temporária do HEAD, aplica o patch, `deno check` sem erros novos (só os 2 do HEAD), **7/7 testes** sem rede/env, 0 cálculos de nível inline restantes na edge, originais inalterados. CRM: ver rev3 (patch inerte próprio).

## Rev3 — lacunas residuais fechadas
9. **Deadlock retry pendente × cutover**: `club_crew_pending` (0176) fazia `club_members FOR UPDATE` → `club_crew_join` → `club_crew_check` → motor pede o site PARTILHADO; o cutover segura o site EXCLUSIVO → INSERT em `club_level_floors` pede KEY SHARE da FK do mesmo membro = ciclo. Nova versão no PENDENTE: bloqueio partilhado do site **antes** da linha, e a linha passa a `FOR NO KEY UPDATE` (resto do corpo igual). `club_purchase_revoke` também pede o site antes da prova. Reversão repõe 0176 verbatim (md5 = Live `04185aa1…`). Teste `77_pending327.sh` (barreira determinística, 2 ligações, `deadlock_timeout=200ms`, X com 800 pts e vaga que completa a Crew):
   - NEG (corpo 0176 carregado só no teste): deadlock detetado; consequência visível (cutover abortado ou retry perdido em `error`).
   - POS (pendente): sem deadlock/erros; cutover ativo (1 só); piso de X 1× com retrato **antes** do retry (800 → Crew); retry concluído depois (convite limpo, Crew 4); `crew_complete` 4×80 (config nova), 1× por membro; 2.º retry não duplica crédito nem piso.
   - Auditoria: nenhuma função do Clube faz `club_members … FOR UPDATE`; confirm/crew_pending/award_purchase/purchase_revoke pedem o site antes da linha. `club_points_set`/`club_points_void`/missões não seguram linhas antes do motor; `club_from_lead_capture` só faz UPDATE sem chave (`NO KEY`, compatível com KEY SHARE); crew_join/create/leave seguram `club_crews`, que o cutover não toca. Pending 12/12.
10. **Reversão sem janela de rebaixamento**: API compatível (`club-canon.ts`): usa `club_member_level`/`club_rules_public` enquanto existirem; só faz fallback para a fórmula antiga (soma + `club_levels`) quando a RPC está **ausente** (`PGRST202`/`42883`). Erros genéricos (permissão, timeout, exceção) continuam erro explícito. **Ordem segura: API compat deployada → SQL ROLLBACK → API antiga opcional.** Não depende de pausar o cron Wallet. Provas: controlo negativo da ordem antiga (Goat protegido apareceria Crew); aborto da reversão (membro a cair de nível) mantém RPC e devolve `Goat/true`; após reversão, RPC ausente e **0 descidas em 137 membros** (nível canónico antes vs fórmula antiga depois, por nome); Goat 1500 continua Goat; membro com −150 fica sem nível antes e depois. Deno 13/13 (6 novos de compatibilidade).
11. **ACL `club_award_fixed`**: `06_acl_parity_live.sql` aplica ao baseline o GRANT service_role que Live tem; o PENDENTE inclui o mesmo GRANT (no-op em Live). anon/authenticated não mudam. ACL vs Live: 5/5 iguais.
12. **CRM CrewsSection** (patch inerte): com config ativa, "Pontos por membro" fica só leitura com a versão e data de origem; ao gravar não envia `points` (o motor ignora-os); mínimo/máximo/ativa continuam editáveis (o motor ainda os lê). `verify-crm.sh`: worktree temporária, `tsgo` exit 0, Vitest 4/4, original inalterado.

## Resultados rev3 (PostgreSQL 17.9 local, socket Unix, só plpgsql, egress bloqueado; 2 execuções com JSON idênticos, exit 0)
- A) baseline = Live pós-0176: 30/30 funções; ACL 5/5 iguais (com paridade).
- C) só mudam funções declaradas, verbatim, 41 funções; 2.ª aplicação idempotente.
- D) série 141/141 (incl. RLS 28); concorrência 9/9; epoch 18/18; retry pendente 12/12 (`pending-retry-results.json`).
- E) reversão: 30/30 = Live; créditos preservados (259/36739); ACL = baseline; regras A2/B2 = pré-patch; crew_cfg 200/4/6; níveis 500/1500; 0 configs ativas; pisos/provas/contagens/retrato mantidos.
- Edge `verify.sh` 13/13, sem erros novos de tipos; CRM `verify-crm.sh` exit 0.
- #326 `run.sh`: todos os asserts passaram (17 concorrentes).

## Ordem proposta (cada passo com autorização própria)
1. Migração versionada com o PENDENTE (muda runtime, não valores). Verificar hashes e ACL.
2. Deploy do patch da API.
3. Correr de novo PROVA_LEGADO + agregados, dar o "Sim" e correr o CUTOVER.
4. Publish do portal/CRM se o UI passar a mostrar `referrals`/`next_level`/`rules_unavailable` ou o patch do CRM.
Reversão: API compat já deployada no passo 2 → ROLLBACK SQL → (opcional) API antiga.

## Decisões de negócio pendentes (defaults no pacote são PROPOSTAS, não aprovadas)
1. Inscrição: 1× por adesão ao site (proposto) vs 1× por edição.
2. Indicação anulada: não liberta o teto (proposto, `referral_void_frees_cap=false`) vs liberta.
3. Compras: indisponíveis enquanto não houver prova verificável (proposto; `purchase_enabled=false`, sem importador).

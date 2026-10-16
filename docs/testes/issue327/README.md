# #327 — Núcleo de pontos do Clube (revisão 2: defeitos da revisão independente fechados)

Aprovação do núcleo: Pedro, 16/10/2026 14:45 Fortaleza. Partida desta revisão: 5240bf38a87b386e9bf03d728d47a724b69c367d.
Nada aplicado em Live: sem DDL/DML, deploy, Publish, compras ou envios. Única leitura de Live: `PROVA_LEGADO.sql` (agregados sem PII).

## Artefactos (sha256, 16 caracteres)
- `supabase/manual/20261016_issue327.PENDENTE.sql` 5f21e421738d82c5
- `supabase/manual/20261016_issue327.CUTOVER.sql` 546256db8c4a80a7
- `supabase/manual/20261016_issue327.ROLLBACK.sql` f96da052f6a3f631 (gerado: head + 5 funções do baseline + tail)
- `supabase/manual/20261016_issue327.PROVA_LEGADO.sql` 97b94c73f582b90b
- `patches/issue327/newgang-portal.patch` 7a78b3f130fc2f21 (gerado por `make_patch.py`), `club-canon.ts` 8ac37fef1adcd392, `club_canon_test.ts`, `verify.sh`
- Bateria: `scripts/club-sql-it/run327.sh` + `50_legacy327.sql`, `60_after327.sql`, `65_rls327.sql`, `70_conc327.sh`, `75_epoch327.sh`, `rollback327_{head,tail}.sql`, `compare327.py`, `live-hashes-327.json`

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
7. **Reversão**: transação única com guardas. Aborta se o patch não estiver aplicado ou se algum membro descesse de nível: retrato do nível canónico antes vs fórmula antiga depois (controlo negativo: membro com −1400 → aborta e nada muda). Repõe as funções, os limiares e as 4 regras visíveis de antes do 1.º cutover. Remove triggers e funções novas. Não apaga dados. **Ordem: API primeiro, SQL depois.** Simulado o consumidor sem RPC com o SQL ainda aplicado: funciona, mas mostra o nível só pelos pontos (ex.: 1500 pts → Crew em vez de Goat protegido) até o SQL ser revertido. A janela deve ser curta e não deve haver Wallet entretanto.
8. **API**: módulo real `club-canon.ts`, injetado com `rpc`. Nível com erro explícito, vazio → 0/null, protegido + próximo nível coerente, cache por membro. Conquistas com `status:error` em vez de null silencioso. Montra com erro explícito. Ligado na Wallet (`walletMember`), em `me` (`level_protected`, `next_level`, `next_level_min`, `referrals`) e nos 2 payloads de site. Ranking/CRM/cron da Wallet já usam o nível canónico via SQL. `verify.sh`: worktree temporária do HEAD, aplica o patch, `deno check` sem erros novos (só os 2 do HEAD), **7/7 testes** sem rede/env, 0 cálculos de nível inline restantes na edge, originais inalterados. Fora do patch: o CRM `CrewsSection` edita `club_point_rules.crew_complete`, mas após o cutover o motor usa a config (ver decisões).

## Resultados (PostgreSQL 17.9 local, socket Unix, só plpgsql, egress bloqueado; 2 execuções iguais)
- A) baseline = Live pós-0176: 30/30 funções. ACL vs Live: 4 iguais; **`club_award_fixed` DRIFT** (local sem service_role; Live com). Não é declarado igual.
- C) só mudam as funções declaradas, corpo verbatim, 41 funções; 2.ª aplicação idempotente.
- D) série 113/113 (+28 RLS = 141 no total); concorrência 9/9; epoch 18/18.
- E) reversão: 30/30 = Live; créditos preservados; regras A2/B2 = pré-patch; crew_cfg 200/4/6; níveis 500/1500; 0 configs ativas; pisos/provas/contagens/retrato mantidos.
- #326 `run.sh`: todos os asserts passaram (17 concorrentes).

## Ordem proposta (cada passo com autorização própria)
1. Migração versionada com o PENDENTE (muda runtime, não valores). Verificar hashes e ACL, incluindo o drift de `club_award_fixed`.
2. Deploy do patch da API.
3. Correr de novo PROVA_LEGADO + agregados, dar o "Sim" e correr o CUTOVER.
4. Publish do portal se o UI passar a mostrar `referrals`/`next_level`/`rules_unavailable`.

# #327 — Núcleo de pontos do Clube (preparação + testes locais; NADA aplicado em Live)

Aprovação do núcleo: Pedro, 16/10/2026 14:45 Fortaleza. HEAD de partida: 2aadbbdacb033cc945e0556b56d75011283bffe2.
Âmbito desta etapa: só artefactos inertes, scripts e testes locais. Sem DDL/DML em Live, sem deploy, sem Publish, sem envios.

## Artefactos (sha256, 16 primeiros caracteres)
- `supabase/manual/20261016_issue327.PENDENTE.sql` bc7b0f8e0a5f31f5: estrutura + funções + config `2027-v1` em **draft**. Aplicar isto não muda valores.
- `supabase/manual/20261016_issue327.CUTOVER.sql` e1989587345b51c9: ativa as regras novas numa só transação, com verificações antes e depois.
- `supabase/manual/20261016_issue327.ROLLBACK.sql` 75debecc8ef3e149: repõe as 5 funções originais tal e qual (geradas do baseline local, que tem o mesmo md5 que Live), remove as funções novas, repõe os limiares de antes do 1.º cutover e retira as configs. Não apaga créditos, pisos, provas, contagens nem colunas (ficam marcadas DEPRECATED).
- `patches/issue327/newgang-portal.patch` 051ee79a28a4358c (+ `level_test.ts`, `verify.sh`): a Wallet passa a usar `club_member_level`; `me` passa a devolver `referrals` (contagem e badges). A função publicada não foi alterada.
- Bateria: `scripts/club-sql-it/run327.sh`, `50_legacy327.sql`, `60_after327.sql`, `70_conc327.sh`, `compare327.py`, `rollback327_tail.sql`, `live-hashes-327.json` (snapshot de Live depois da 0176; `live-hashes.json` do #326 não foi alterado).

## Desenho
- **Edição** = `event_id` gravado em cada crédito, no momento em que é dado (coluna nova `club_points.event_id`). Os créditos antigos ficam com NULL: a edição não é deduzida. A edição de uma config fica fixa; se o site mudar de evento, os créditos já dados mantêm a edição que tinham.
- **Config versionada** `club_points_config` (draft|active|retired, no máximo 1 ativa por site). Antes do cutover o motor faz exatamente o mesmo que hoje (só passa a gravar a edição).
- **Um único ponto de escrita**: `_club_award_core`, por onde passam `club_award` e `club_award_fixed` e, por isso, todos os caminhos reais (confirmação, crews, palpites, presença, missões, `club_points_set`). Usa um bloqueio por membro e edição para o teto ser atómico.
  - inscrição 100, uma vez por membro e edição; indicação 75, só soma enquanto `usado + 75 ≤ 750`; Crew 100, uma vez por membro e edição, seja qual for o grupo (min 4 / max 6 continuam em `club_crew_cfg`).
  - compra própria 200 **só** através de `club_award_purchase(prova)`: a prova tem de estar `valid`, ser desta edição e deste membro, o lote tem de estar em `purchase_lots` e `purchase_enabled=true`. Sem isto não há crédito (por omissão a compra fica **desligada**). Um reembolso ou cancelamento anula com uma linha `void`; uma nova aprovação cria `ref#N`.
  - créditos anulados deixam de contar para o teto, por isso uma anulação liberta espaço.
  - restantes regras (palpite 50, presença 100, friend_bought 300, missões): valores **iguais aos de hoje**, não aprovados para mudar.
- **Indicação** só na **primeira** confirmação e só para quem fez a indicação original (reinscrever-se com outro código não muda nada).
- **Conquistas 3/5**: `club_referral_events` regista todos os amigos confirmados, mesmo depois de atingido o teto (fica `credited_points=0`). `club_referral_progress` devolve só a contagem e os badges, sem ids nem emails, e não dá pontos.
- **Nível canónico** `club_member_level` = nível pelos pontos, mas nunca abaixo do piso guardado no cutover (`club_level_floors`). Usado por `club_ranking` (API `ranking`/`me`, CRM) e `club_wallet_due` (cron da Wallet), e pela Wallet através do patch.
- **Cutover** `club_points_cutover`: verifica que os níveis atuais são os esperados e bloqueia novos créditos (`SHARE ROW EXCLUSIVE`) enquanto tira o retrato. Cria os pisos, troca os limiares, ativa a config e escreve o registo, tudo numa só transação.

## Matriz de créditos antigos (proposta conservadora; `legacy_counts=true` só na config 2027-v1)
| caso antigo | depois do cutover |
|---|---|
| indicação 150 × 1 | conta 150 para o teto: no máximo mais 8 × 75 (até 750) |
| 150 × 5 = 750 | nenhum crédito extra |
| 150 × 10 = 1500 | nenhum crédito extra e nada é removido |
| Crew 200 já ganho | já gastou o crédito único: nada extra se mudar de grupo |
| inscrição 100 antiga | não há segundo 100 |
| amigo indicado antes do patch que confirme no teto | conta para as conquistas, 0 pontos |
Os créditos antigos nunca contam numa edição seguinte (`legacy_counts=false`). Hoje em Live não há linhas antigas sem edição provada fora da 2027 (24 membros, 16 inscrições, 1 indicação de 150, 0 Crew; leitura sem PII; voltar a consultar antes do cutover).

## Compra: diagnóstico da integração Fever (só leitura)
- Hoje nenhum código dá `promo_lot_purchase` nem `friend_bought`: não há chamadas em edge, SQL ou CRM, e em Live existem 0 linhas destas regras.
- `fever_buyers` só tem email, edition_label, ticket_type e order_ref. Faltam lote canónico, estado (reembolso ou cancelamento) e ligação a um evento. **Não chega como prova.**
- Por isso a regra fica fechada: `purchase_enabled=false` e `purchase_lots` vazio. Para a ligar é preciso uma fonte que preencha `club_purchase_evidence` com encomenda, lote, evento e estado verificados. Não foi criada nenhuma integração.

## Resultados (PostgreSQL 17.9 local, socket Unix sem TCP, só plpgsql, sem rede)
- A) baseline (migrações até 0176) comparado com Live: **30/30 funções iguais** (`club_welcome_*` não carregadas, por serem do #321; ficam listadas como tal). ACL das 5 funções alteradas igual à de Live.
- Saída de rede bloqueada: net.http_post 3F000, dblink 0A000.
- C) só mudam as 5 funções do pendente, com o corpo igual ao do ficheiro; as outras ficam iguais a Live; 8 funções novas; aplicar uma 2.ª vez não muda nada. Hashes em `hashes-depois-esperado.json`.
- D) em série: **83/83**; em simultâneo (com barreira e várias ligações): **9/9**:
  - 9.º, 10.º e 11.º amigos confirmados ao mesmo tempo, mais retries: exatamente 750, com 10 créditos, e a contagem fica em 11.
  - 4 pessoas a entrar ao mesmo tempo numa crew de 3: fica com 6 membros e cada um recebe 100 uma vez.
  - 4 provas do mesmo membro ao mesmo tempo: 1 crédito de 200.
  - cutover ao mesmo tempo que 6 créditos: nenhum crédito perdido, e os pisos batem certo com o retrato.
- E) reversão: funções 30/30 iguais a Live, créditos preservados (202/29249), níveis de volta a 500/1500, 0 configs ativas, pisos/provas/contagens mantidos. Depois da reversão o motor volta a dar 150 por indicação e não dá segunda inscrição.
- Duas execuções seguidas: `serial-results.json` igual. Regressão #326 (`run.sh`): 14/14 iguais ao snapshot histórico, todos os asserts passaram.
- Patch da API (`verify.sh`): aplica sobre o HEAD, sem erros de tipos novos (só os 2 que o HEAD já tem), 3/3 testes sem rede, originais inalterados. Vitest Wallet: 14/14. O código da app não mudou.

## Ordem de aplicação proposta (cada passo precisa de autorização própria)
1. Migração versionada com o PENDENTE tal e qual. É inerte: a config fica em draft. Verificar os hashes esperados e a ACL.
2. Deploy do patch da API (só depois do passo 1, porque precisa de `club_member_level`). Fazer o smoke `me` e `ranking`.
3. Voltar a consultar os agregados (≥500 / ≥1500), dar o "Sim" e correr o CUTOVER.
4. Publish do portal, se o frontend passar a mostrar `referrals`; o portal ainda não foi alterado.
Reversão: ROLLBACK.sql, e depois disso a API antiga continua a funcionar porque o patch só lê funções. Antes de reverter, reverter primeiro o deploy da API, já que o patch chama `club_member_level`.

## Riscos
- Depois do cutover, quem tem entre 500 e 749 pontos sem piso (é Gang nesse momento) precisa de 750 para chegar a Crew. É o pretendido; ninguém que já era Crew/Goat desce.
- `friend_bought` 300 continua ativo na regra mas não há nada que o dê. Se alguém o ligar sem prova, o motor não o bloqueia (não estava aprovado mexer-lhe).
- A ACL de `club_award_fixed` no baseline local era só postgres; em Live inclui service_role. O pendente não mexe na ACL.

## Não validado
RLS e Auth reais (stubs), pedido HTTP completo à edge, emails, Google Wallet real, ingestão #321 e cron, Fever real, CI geral.

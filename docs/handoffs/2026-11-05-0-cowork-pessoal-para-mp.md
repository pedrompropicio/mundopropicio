# Handoff — 0 · Cowork: da conta pessoal para a organização Mundo Propício (05/11/2026)

**Decisão do Pedro (05/11/2026):** o «0 - Cowork (MP)» passa a comandar o dev (mplabs-dev / executor E2b). É o chat 0 do projeto «Sistema de Gestão de Eventos — espelho MP», na organização Mundo Propício do Claude.

Fica com todas as funções do 0: merge, Live, deploy, Publish e crons, sempre com «Sim» do Pedro por passo.

O 0 da conta pessoal deixa de executar. Motivo: fim dos créditos.

## 1. Primeiro passo do novo 0
1. **Conectores.** Confirmar que estão ligados na organização MP: GitHub (repo `pedrompropicio/mundopropicio`) e Lovable (projeto ERP `ab7cf7e3-a5fc-4737-9cc1-2ba7cf43887f`). Sem eles não há comando. O OAuth é feito pelo Pedro.
2. **Ritual de arranque.** Ler `docs/INDEX.md`, `docs/QUADRO.md`, `docs/estado/*` e as Issues abertas. Depois, este ficheiro e `docs/handoffs/licoes-0-cowork-para-operador.md`.
3. **Ponto de situação no comando.** Comentar na #473 (índice da fila): «0 · Cowork (MP) assume o comando».

## 2. Como o 0 comanda o dev
- O dev só lê Issues: Autorização → Reserva → Despacho → Fecho → «Reserva libertada».
- O 0 revê por leitura: CI `quality` verde, diff só na lista, testes antigos só com antigo → novo declarado. Depois faz o merge (squash).
- O PR #675 (647-d, SLE com consentimento) está **suspenso** até haver o 647-d-portal.
- **Delegação nocturna** (Pedro, 04/11). O 0 responde a «Perguntas ao Pedro» com a opção recomendada pelo dev, mas só se se cumprirem as três condições:
  - é preparação sem Live;
  - não contradiz uma decisão registada;
  - é reversível.

  **Nunca por delegação:** dinheiro, dados, envios, jurídico ou consentimento, mudança de números de relatórios, ou qualquer passo em Live.

## 3. Mecânica testada (janela de 05/11)
### Migrações em Live
1. `SELECT net.http_get('https://raw.githubusercontent.com/pedrompropicio/mundopropicio/<SHA>/supabase/manual/<ficheiro>.sql')` devolve o id do pedido.
2. Esperar alguns segundos e ler `md5(content)` em `net._http_response WHERE id=<id>`. Conferir com o md5 declarado no Fecho.
3. Aplicar: `DO $$ DECLARE v text; BEGIN SELECT content INTO v FROM net._http_response WHERE id=<id>; IF md5(v)<>'<md5>' THEN RAISE EXCEPTION 'md5'; END IF; SET LOCAL lock_timeout='8s'; EXECUTE v; END $$;`
4. **Ficheiros com PARTE 1/2** (ex.: 0335): executar só `left(v, position('-- PARTE 2' in v)-1)`.
5. **Lock timeout** (ex.: sessão Supavisor de dump `idle in transaction`): a transacção reverte-se. Ver os locks em `pg_locks` + `pg_stat_activity`, esperar que saiam e repetir.
6. Fazer sempre a prova antes e depois por query própria (há ficheiros `docs/testes/issueNNN/prova-*.sql`).

### Sync e deploy
- **Sync de código para o Lovable:** PR `main` → `lovable-fallback`, com merge commit.
- **Depois de DDL,** o Lovable regenera o `types.ts` e o HEAD do sandbox muda. Nas instruções ao agente, verificar `git diff --stat <sha do sync> HEAD -- supabase/functions/` vazio, em vez de exigir um HEAD exacto.
- **Deploy de edges:** feito pelo agente Lovable com «sem alterar ficheiros», só as funções nomeadas, e resposta curta com os hashes.
- **`send_message`:** quando dá timeout, confirmar com `list_messages` antes de reenviar.
- **Publish:** `deploy_project` do ERP.

### Backup offsite
- Cron 15668 `*/10 6-9 * * *` com `{"target":"offsite"}`.
- Se a cópia do dia não fechar dentro da janela, fazer chamadas manuais `{"target":"offsite","force":true,"date":"AAAA-MM-DD"}` com o mesmo `net.http_post` e Bearer do vault que o cron usa.
- Cada chamada demora cerca de 60 s e retoma a corrida.

## 4. Feito na janela de 05/11 (detalhe nas Issues)
- **#647**
  - 0333 e 0336 aplicadas.
  - 1.ª anonimização: 14.043 linhas da zona protegida.
  - Crons 15703 (`song-link-ident-daily-refresh`, 04:17 UTC) e 15704 (`song-link-events-retencao`, 04:53 UTC). A **primeira corrida é a 06/11**: verificar.
- **#664**
  - 0335 PARTE 1 aplicada.
  - Deploy do `apply-coala-bp`.
- **#666**
  - 0339 aplicada.
  - Linhas Social Eventos, Social Esporte e Administração criadas na Social Music.
- **#669, #666 e #646:** Publish do ERP (deployment `74c2d0a8`) com o 669-a/b, 666-a/b, D2-a Tesouraria, 664-a e #672. Prova no ecrã da DRE Empresarial registada na #669.
- **#202:** deploy da `database-backup` (202-h, por partes). Offsite de 05/11 fechado `ok` (1145/1145, 0 falhas).

## 5. Pendente para o novo 0
1. **#647:** confirmar a 1.ª corrida dos crons 15703/15704 (06/11 de manhã) em `cron.job_run_details`.
2. **Tesouraria (#646, D2):** a linha 1, «Resultado do evento», parece baixa face à DRE, e a disponibilidade dá muito negativa. Pedir ao dev que confira a linha 1 e o sinal da linha 3 contra a Posição Financeira antes de alguém usar os números. Seguir depois para o D2-b.
3. **#664**
   - A PARTE 2 da 0335 recria o CHECK do país, que já existe como `suppliers_country_iso2`. Pedir ao dev que tire esse ALTER.
   - A PARTE 2 só vai depois do 664-b (país na sincronização Coala, decisão 1A) e do Publish com todos os escritores.
4. **#669:** lote R1 próprio para o filtro de natureza na DRE Empresarial (decisão 1A do Pedro).
5. **#695** (nova): «Data de competência» (rótulo e aviso) e vencimento separado nas recorrentes.
6. **#677:** preparação da importação da Social Music de 2026 (respostas 1B/2A por delegação). Parte depois da #664.
7. **#405:** ritmo da fila e cron de envio de 06/11 às 11:00 Lisboa, **ainda sem autorização do Pedro**.
8. **#675 / 0334 / SLE:** suspensos até ao 647-d-portal.
9. **Cloudflare:** o Pedro apaga os tokens antigos `mp-backups-supabase` e `-v2`.
10. **«Fora da DRE»:** a DRE Empresarial mostra 79 transações com natureza divergente da rubrica. Apenas registado na #669.

## 6. Tarefas agendadas na conta pessoal
Deixam de correr quando os créditos acabarem. A do Coala (venda geral a 10/11: apagar `early_bird.general_sale_date` com «Corro?») tem de ser recriada no novo 0. Ver também, no projeto Claude pessoal, a lista de tarefas agendadas dos outros chats (Litto, NG27, Fever, vigilância diária de Live): o Pedro decide quais recria do lado MP.

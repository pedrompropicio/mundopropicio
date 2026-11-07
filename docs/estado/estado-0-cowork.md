# Diário do 0 · Cowork (Claude) — ponte entre a conta pessoal e a organização MP

> **Para que serve.** Os dois projetos Claude, «Sistema de Gestão de Eventos - Lovable» na conta pessoal e «… — espelho MP» na organização MP, não partilham memória nem documentos. Este ficheiro mantém os dois 0 sincronizados (regra em `CHATS.md` › «Claude em duas organizações»).
>
> **Leitura.** Qualquer 0 lê-o no arranque, antes de agir.
>
> **Escrita.** Depois de cada passo com efeito, quem o executou acrescenta **no topo** uma linha `data UTC · chat · Issue · o que foi feito · resultado`. Passo com efeito é: merge, migração, DML, deploy, Publish, cron, resposta por delegação ou decisão do Pedro. O detalhe fica na Issue.
>
> **Repo público.** Sem valores, contratos, dados pessoais nem segredos.

**Congelamento (#748): LEVANTADO a 07/11** (decisão do Pedro, 6704966257), depois do G2-748 verde e do passo 6 igual nos dois lados. A fila 0342–0348 e a 0335 PARTE 2 seguem pelo PROC: mp-homolog-3 primeiro, depois Live com «Corro?». Registo de migrações: 333 / `61025b4a…` (com a 0341).

**Comando actual:** «0 - Cowork (MP)», desde 05/11/2026 (decisão do Pedro). Handoff: `../handoffs/2026-11-05-0-cowork-pessoal-para-mp.md`.

**Despacho ao executor:** desde 05/11 16:51 o 0 (MP) escreve directamente Reserva e Despacho (PROC-despacho-executor), além do operador `mplabs-dev`. A fila do executor é **por Issue**: Issues diferentes correm em paralelo. Rondas do 0 de 20 em 20 min (tarefa agendada nesta conversa). **Travas:** antes de cada nova Reserva, libertar as anteriores na mesma Issue (6671112203).

## Pendentes abertos (o 0 de comando mantém esta lista)
1. #647: confirmar a 1.ª corrida dos crons 15703 e 15704 (06/11, 04:17 e 04:53 UTC) em `cron.job_run_details`.
2. #646 D2: D2-c, D2-d runs A (0341, com `seq`), B e C, e D2-f (0342) em `main`. A run D (P5c + Tesouraria) só depois da 0341 aplicada em Live, na janela. **Gate:** o Publish do ERP só sai depois de o 0 correr `docs/testes/issue646/conferencia-d2.sql` em Live (só SELECT) e fechar a conferência. Depois D2-e (6663213468, depois do #564 em `main`).
3. #664: código completo em `main`. Falta a janela: 0340 → deploys (`sync-coala-from-drive`, `test-multi-tenant-isolation`) → Publish → país nas configurações Coala → PARTE 2 da 0335 com provas → DML dos dados pela lista do chat 10.
4. #669: 669-c em `main` (`18db40a`); entra no Publish, com prova no ecrã.
5. #695: 695-a em `main` (`d8881d2`); entra no Publish, com prova no ecrã. Lacuna aceite pelo Pedro: sem aviso na edição.
6. #677: preparação da importação da Social Music de 2026 (1B/2A). Só depois da #664.
7. #405: Portal NG fechado (deploy `newgang-portal` + Publish do Portal pelo 0 pessoal, 19:44). Envio do reforço NG27 a 06/11 e cron `ng27-reforco-envio` são do 0 pessoal: o 0 MP não toca. 405-h: o executor não responde ao despacho (reenviado 23:47); a investigar com o Pedro. O mesmo com #585 ponto 4 e #498 P1p (despachados 03:45): nota 6677581426 na #473, não reenviar.
8. #675 / 0334 / SLE: suspensos até ao 647-d-portal.
9. Cloudflare: o Pedro apaga os tokens antigos `mp-backups-supabase` e `-v2`.
10. Coala, venda geral a 10/11: apagar `early_bird.general_sale_date` com «Corro?» (#359). A tarefa agendada estava na conta pessoal: recriar do lado MP.
11. #603: decidir onde corre o piloto, na conta Lovable actual ou numa conta nova, e registar a escolha e o motivo na #603. Decisão do Pedro com o 0 (MP).
12. Migrações preparadas, não aplicadas: 0341 D2-d (md5 novo `62c875ff…`, com `seq`), 0342 D2-f, 0343 339-r, 0344 644b B1, 0345–0348 (#303; 0348 com triggers a rever, 6679630325); 0335 PARTE 2 com md5 novo `739c2ea0…`. Próxima livre: 0349.
13. #314: 314-b em `main` (`549c8a7`). **Na janela, a 0323 aplica-se antes do Publish.** Nota para a #591: a lista de bancos do diálogo «Confirmar crédito» não filtra por empresa (depende de RLS).
14. QUADRO «Em execução agora»: higiene das linhas com mais de 24 h autorizada ao operador (R0).
15. Janela de Publish do ERP: plano do PR #702 em `main`. Gate: `conferencia-d2.sql` (#646). Publish com «Sim» do Pedro. Prioridade do Pedro (06/11) depois do Painel: ERP Brasil + implantação Social Music.
16. Painel v2 (#721): E2a ligada em produção (D1 «painel», Worker `painel-turno`, webhook, binding Pages). E2b (Conversa) em produção. Em curso: E2c (amplitude da Conversa, tarefa 6675915608), sem PR ainda. Depois: E3 (Agentes) e executor por Issue no mp-painel.
17. #303: R1–R9 em `main` (0345–0348 preparadas); R10 em curso; R11 coordena #333; R12 com o Pedro (PDFs). Lacuna da R6 para o Pedro: falta o verificador de ficheiros no servidor (`issue303_private.verified_files`), por isso o carregamento v2 e o «Juntar complemento» estão desactivados.

## Registo (mais recente primeiro)
- 07/11 ~09:23 · 0 MP · #748 · 0341 aplicada em Live com «Corre» do Pedro (envelope `ae890c20…`; registo 333 / `61025b4a…` = homolog; 66 objectos de aplicação iguais, ACL difere só por `sandbox_exec` da plataforma) (6705014315) · ok.
- 07/11 ~09:20 · 0 MP · #748 · 0341 aplicada no mp-homolog-3 (SQL Editor, sha256 conferido; 333 / `61025b4a…`) (6704983734) · ok.
- 07/11 ~09:18 · Pedro · #748 · congelamento de estrutura em Live levantado; rotação da password do homolog adiada, segredo mantém-se até ao fim da fila (6704966257) · decisão.
- 07/11 ~08:39 · 0 MP · #748 · passo 6 aplicado no mp-homolog-3 e em Live com «Sim» do Pedro (v2 `bb7adf74…`; 332 / `8ecc8317…` nos dois lados) (6704599681) · ok.
- 07/11 ~08:31 · 0 MP · #748 · G2-748 verde confirmado no artefacto (run 42338125170, 0 bloqueantes); passo 6 v1 corrigido para v2 (`;` dentro de comentário) (6704522066) · ok.
- 07/11 04:24 · 0 pessoal · #748 · vars do replay em `d977bcd` e G2 disparado: run 42338125170 verde (6702214277) · ok.
- 07/11 04:15 · 0 MP · #748 · merge do PR replay#12 (provas N9 e 8 alvos de plataforma; `d977bcd`) ao abrigo de 6701465293 (6702127132) · ok.
- 06–07/11 noite · 0 MP · #748 · merges replay#9 (`.env` fixado, «Sim» do Pedro), #10 (privilégios e registos, «Sim» do Pedro) e #11 (regra do registo supabase, ao abrigo de 6701465293) · ok.
- 06/11 23:20 · 0 MP · #748 · Fecho E2b do G2-748 (6697928746): entrega feita (commit `237b7d8`, 7 ficheiros, 24 testes OK), push recusado por falta de «Workflows: Read and write» no token `e2b-replay` · em correcção.
- 06/11 22:51 · 0 MP · #748 · `mplabs-dev` suspensa pelo GitHub (~22:29); G2-748 passa à frente 2 (Codex na E2b, decisão do Pedro 6697743052): Reserva 6697775481 e Despacho 6697780412 · despachado.
- 06/11 22:30 · 0 MP · #748 · merge do PR replay#6 (ferramentas G2 da R10 byte a byte, 53 ficheiros; árvores conferidas; main do replay `3c8416a`) · ok.
- 06/11 ~22:20 · Pedro · #748 · rotação da password do `mp_homolog_leitura` e do `MP_ISSUES_COMMENT_TOKEN` passa a 90 dias (altera D-ERP357; lembrete 04/02/2027) (6697229787) · decisão.
- 06/11 ~21:20 · 0 MP · #748 · passo 6 preparado (acerto do registo, 31 linhas, guarda na linha de base 301; 6695660167), por correr depois do G2 · preparado.
- 06/11 21:06 · 0 pessoal · #748 · acerto 4.4 aplicado no mp-homolog-3 com «Sim» (2 funções = Live, `ng27-reforco-envio` removido); baldes nos 5 tipos homolog = Live; 4.4 parte 1 fechada (6695586085) · ok.
- 06/11 ~20:05 · 0 pessoal · #748 · 4.3 aplicado no mp-homolog-3 pela via B v3 (SQL Editor, com «Sim»; v1 e v2 pararam em guardas, com rollback) · ok.
- 06/11 ~19:50 · Pedro · #748 · DML manual de 04/11 em Live (`reference_count` de `backup_tabelas_excluidas`) registado como desvio fora do repo · decisão.
- 06/11 ~18:15 · Pedro · #753 · E2b estendida ao replay (PR #754, `edccae4`); operador agendado de hora a hora · decisão.
- 06/11 ~13:00 · Pedro · #748 · retoma do mp-homolog-3 e do PROC-promocao (D-ERP357); congelamento de migrações de estrutura em Live até ao passo 5 · decisão.
- 06/11 08:55 · 0 MP · #303 · R10 sem entrega (6680832728: exportador PDF/Excel fora da lista); reserva libertada e R10 reenviada com `export-partner-statement-doc.ts` (Reserva 6681015057, Despacho 6681018042) · despachado.
- 06/11 08:32 · 0 MP · #303 · merge do PR #744 (R9 consumidores de posição; squash `b2b5baa`) pelo merge autónomo; Reserva 6679630883 libertada; R10 despachada (6680664401) · ok.
- 06/11 07:30 · 0 MP · #303 · merge do PR #743 (R8 direito do evento + 0348 PREPARADA, NÃO APLICADA, md5 `a3a9dfad…`; squash `0b0614b`) pelo merge autónomo; R9 despachada (6679635032). Para rever antes de aplicar: trigger da 0348 em `transactions` e locks por escrita de fecho (6679630325) · ok.
- 06/11 06:50 · 0 MP · #303 · merge do PR #742 (R7 confirmar UI; squash `f9c85d7`) pelo merge autónomo; R8 despachada (Reserva 6678942328, Despacho 6678947810) · ok.
- 06/11 05:58 · 0 MP · #646 · merge do PR #741 (D2-d run C, opção `ticketProjection` no motor, sem chamador; squash `17a9cdf`; quality verde) pelo merge autónomo; Reserva 6677573546 libertada; run D fica para depois da janela · ok.
- 06/11 05:45 · 0 MP · #303 · merge do PR #740 (R6 rascunho/abertura/anexos; squash `a54df3c`) pelo merge autónomo; Reserva 6677254027 libertada; Reserva 6677858505 e Despacho R7 6677862124 · despachado.
- 06/11 05:20 · 0 MP · #646 · o operador não pegou na run C: Reserva 6677573546 e Despacho 6677579200 pelo 0 (Autorização 6668858508) · despachado.
- 06/11 05:20 · 0 MP · #473 · nota ao Pedro: #585, #498 P1p e #405 sem resposta do executor, não reenviar (6677581426) · registado.
- 06/11 ~05:00 · 0 MP · #664/#303 · merges #738 (664-c, 0335 sem o CHECK duplicado; md5 `739c2ea0…`) e #739 (303 R5) pelo merge autónomo; reservas libertadas; R6 despachada (Reserva 6677254027, Despacho 6677257484) · ok.
- 06/11 ~04:40 · 0 MP · #646 · merge do PR #737 (0341 com `seq` na ordem do histórico; md5 `62c875ff…`) pelo merge autónomo; slot ao operador (6677093563) · ok.
- 06/11 ~04:10 · 0 MP · #646/#695/#664 · merges #734 (D2-d run B) e #735 (695-b) pelo merge autónomo; PR #736 (664-c) fechado sem merge por fixture fora de âmbito e reenviado (6676672880) · ok.
- 06/11 ~03:45 · 0 MP · #303/#585/#498 · merge #733 (303 R4, 0347); despachos #585 ponto 4 (6676166419) e #498 P1p (6676172295, Autorização 6676168632) · despachado.
- 06/11 ~03:25 · Pedro · #473 · merge autónomo de PRs do executor até 06/11 10:00 UTC, só com CI verde, diff na lista, migrações preparadas e nada em Live (6676035067); prioridade: Issues do ERP Brasil e MP, dev a noite inteira · decisão.
- 06/11 ~02:00 · 0 MP · #721 · E2b (Conversa com o 0 de turno, só leitura) autorizada pelo Pedro; tarefa 6674830701 para a sessão «Painel v2» · despachado.
- 06/11 01:51 · 0 MP · #721 · passo 5: binding D1 no Pages (mp-painel `a8f9145`), com «Sim» do Pedro; 1.ª passagem do Worker: 51 cartões redigidos, 31 abertos, ~1,6 USD em 54 chamadas · ok.
- 06/11 ~01:48 · Pedro (com o 0 pessoal) · #721 · passo 4: webhook 707990541 em mundopropicio → Worker, eventos issues/issue_comment/pull_request/check_suite, ping ok · ok.
- 06/11 ~01:45 · Pedro (com o 0 pessoal) · #721 · passo 3: segredos do Worker ANTHROPIC_API_KEY (espaço «painel»), GITHUB_TOKEN (leitura, só mundopropicio) e GITHUB_WEBHOOK_SECRET; valores nunca vistos pelo 0 MP · ok.
- 06/11 01:48 · 0 MP · #303 · merge do PR #731 (R3, 0346 PREPARADA, NÃO APLICADA; quality verde) com «Sim»; Reserva 6673808601 libertada; Reserva 6674604617 e Despacho R4 (0347, corte/fuso, cadeia, posição) 6674608597 · despachado.
- 06/11 ~01:20 · 0 MP · #721 · passos 1–2 com «Sim»: D1 «painel» (Western Europe, c721d5d3…) com as 8 tabelas da 0001 pela consola; Worker `painel-turno` por Workers Builds do main do mp-painel (`c7129c4`), /saude ok · ok.
- 06/11 01:05 · 0 MP · #303 · merge do PR #730 (R2, 0345 PREPARADA, NÃO APLICADA) com «Sim»; R3 (0346) despachado (6673813084) · ok.
- 06/11 ~00:58 · 0 MP · #644/#721 · merges PR #729 (644b B2, contrato puro) e mundopropicio/mp-painel#17 (E2a + adenda), com «Sim»; 644b B3 fica à espera da #415/#564 · ok.
- 06/11 ~00:40 · Pedro · #646/#647/#677 · respostas do Painel de 00:03–00:12 a perguntas antigas: valem as decisões anteriores; notas 6673230899, 6673231717, 6673232461 · decisão.
- 06/11 ~00:40 · Pedro · — · operador passa a publicar só como `mplabs-dev` (nova sessão do operador); nada como pedrompropicio · decisão.
- 06/11 00:35 · 0 MP · #721 · merge mundopropicio/mp-painel#16 (plano com a adenda: redactor, fila limpa, arquivo) com «Sim» · ok.
- 06/11 00:17–00:20 · 0 MP · #646/#303/#644 · merges #726 (D2-f, 0342), #727 (303 R1), #728 (644b B1, 0344), com «Sim» e CI verde; reservas libertadas; despachos 303 R2 (0345) e 644b B2 · ok.
- 06/11 00:10 · 0 MP · — · merge do PR #725 (diário) · ok.
- 05/11 23:47 · 0 MP · #405 · 405-h sem resposta >1 h: Reserva libertada e despacho reenviado (Reserva 6672527748, Despacho 6672530698); continua sem resposta · em aberto.
- 05/11 ~23:50–00:05 · 0 MP · #721 · consola Anthropic: espaço «painel» com limite 100 USD/mês e aviso por email aos 80 USD, com «Sim» do Pedro · ok.
- 05/11 23:45 · 0 MP · #721 · merge mundopropicio/mp-painel#14 (plano v2; `de89340`) e #15 (E1a tema dia/noite + E1b Decisões/Agora; `57f4ffe`), com «Sim» do Pedro · ok. Reparo para a E2a: comentários livres da conta do Pedro (que o 0 também usa) fecham cartões.
- 05/11 23:42 · 0 MP · #644 · Reserva 6671485158 libertada; Reserva 6672282283 (migração **0344** reservada) e Despacho 644b B1 «só estrutura `event_result_closures`» (6672285532) · despachado.
- 05/11 23:40 · 0 MP · #644 · merge do PR #724 (plano 644b com Q1–Q4; squash `f7d53de`; quality verde), com «Sim» do Pedro · ok.
- 05/11 23:37 · 0 MP · #303 · Reserva 6671432099 libertada; Reserva 6672227415 e Despacho R1 «configuração SaaS, contrato puro e fixture» (6672231285) · despachado.
- 05/11 23:35 · 0 MP · #303 · merge do PR #722 (plano 303-p2 com Q1–Q6 + SaaS; squash `a839fbd`; quality verde), com «Sim» do Pedro · ok.
- 05/11 23:31 · 0 MP · #646 · merge do PR #723 (D2-d run A, 0341 PREPARADA, NÃO APLICADA; squash `a5dcd7e`; quality verde), com «Sim» do Pedro; Reserva 6671432817 libertada e slot entregue ao operador para D2-f (0342) e run B (6672212229) · ok.
- 05/11 ~22:50 · 0 MP · #405/#303/#646/#644 · travas recusaram despachos por 2 reservas activas; reservas antigas libertadas, novas Reservas e Despachos (405-h 6671436418, 303-p2 6671439301, D2-d run A, 644b-p2 6671487978) · despachado. Lição: libertar sempre antes de reservar.
- 05/11 ~21:40 · Pedro · #303 · enquadramento SaaS (6670199047): a configuração por bilheteira é exclusiva da MP por agora, nada fixo no código · decisão.
- 05/11 ~22:30 · Pedro · #721 · Painel v2 aprovado (protótipo); P1 D1 só estado operacional, P2 limite 100 USD/mês, P3 manter Codex e medir, P4 só o Pedro no piloto; modo noite pedido · decisão.
- 05/11 ~22:20 · Pedro · #644 · Q1–Q4 = A (6671483519) e merge do plano #720 · decisão.
- 05/11 ~21:15 · Pedro · #303 · Q1–Q6 do plano 303-p (6669982231) · decisão.
- 05/11 19:44 · 0 pessoal · #405 · deploy `newgang-portal` + Publish do Portal (Portal NG fechado ponta a ponta) · ok.
- 05/11 19:00–21:50 · 0 MP · vários · merges com «Sim» do Pedro e CI verde: #715 (405-pc2), #716, #717 (339-r, 0343), #718 (plano 303-p), #719 (sync main), #720 (plano 644b), #711, #714, #702 (plano da janela de Publish), #713 (diário) · ok. Detalhe nas Issues.
- 05/11 ~19:30 · Pedro · #405 · B1 conferida contra a produção `4a7da40` (diff vazio) aceite como prova para o merge; deploy/Publish entregues ao 0 pessoal · decisão.
- 05/11 ~19:10 · Pedro · #303 «Sim aos 6» (D-ERP247), #339 «A — corrigir», #695 «aceitar sem aviso na edição», #702 «Sim, fundir» · decisão.
- 05/11 18:54 · 0 MP · #405 · Despacho 405-pc2 (6666481819): link de acesso na `auth_emails`, limites `presale_code` 120 IP / 20 sessão e `request_access` 40, prova B1 com os mesmos 5 hashes · despachado.
- 05/11 ~18:53 · 0 MP · #405 · Reserva do 405-pc libertada (6666472351); Autorização R2 (6666473859) e Reserva (6666475473) do 405-pc2 · emitidas.
- 05/11 ~18:50 · Pedro · #405 · aprova P1 (só o link de acesso, `kind = "access"`, passa à fila `auth_emails`), `presale_code` 120/10 min por IP + 20/10 min por sessão, `request_access` 40/10 min; P2 não se aplica; tudo no mesmo deploy antes de 06/11 10:25 UTC; se a B1 falhar, não há deploy · decisão.
- 05/11 18:53 · 0 MP · #405 · merge do PR #712 (405-pc, acção `presale_code`; squash `c604b9e`; quality verde; B1 com os 5 hashes iguais; 21 testes Deno corridos pelo 0 localmente), com «Sim» do Pedro · ok.
- 05/11 18:36 · 0 MP · — · merge do PR #710 (diário; squash `b7280d1`) · ok.
- 05/11 18:20 · 0 MP · #405 · Issue reaberta; Autorização R2 405-pc (6665744353), Reserva (6665746785) e Despacho · despachado.
- 05/11 ~18:15 · Pedro · #405 · respostas do chat do portal «A1 · B1 · C sim a tudo · D ok» e prioridade de urgência ao `presale_code`; deploy e Publish pedidos depois ao 0 · decisão.
- 05/11 18:16 · 0 MP · #646 · Reserva (6665654961) e Despacho D2-d tempo 1 «plano» (6665661392) · despachado.
- 05/11 18:05 · 0 MP · #314 · merge do PR #709 (314-b; squash `549c8a7`; quality verde), com «Sim» do Pedro · ok.
- 05/11 18:05 · 0 MP · #695 · merge do PR #707 (695-a; squash `d8881d2`; quality verde), com «Sim» do Pedro · ok.
- 05/11 17:58 · 0 MP · #314 · PR #708 (duplicado do 314-b, do despacho do 0) fechado sem merge; fica o #709 do despacho do operador · ok.
- 05/11 17:12 · 0 MP · #314 · Reserva (6664297143) e Despacho 314-b (6664309176) · despachado; o operador despachou também às 17:27 (6664655200), que prevaleceu.
- 05/11 16:51 · 0 MP · #695 · Despacho 695-a com o critério 3 corrigido (6663829765) · despachado.
- 05/11 16:56 · Pedro · — · rondas do 0 passam a 20 em 20 min; o 0 despacha directamente ao executor · decisão.
- 05/11 16:47 · 0 MP · — · merge do PR #706 (diário; squash `4c2d915`) · ok.
- 05/11 16:25 · 0 MP · #646 · Autorizações D2-d (R2, 6663210910), D2-f (R2, 6663212161) e D2-e (R1, 6663213468), com as decisões do Pedro confirmadas no chat do 0 · emitidas.
- 05/11 16:24 · 0 MP · #669 · merge do PR #705 (669-c; squash `18db40a`; quality verde), com «Sim» do Pedro · ok.
- 05/11 16:24 · 0 MP · #646 · merge do PR #704 (D2-c; squash `a54f3fe`; quality verde), com «Sim» do Pedro · ok.
- 05/11 16:23 · Pedro · #646 · confirma no chat do 0 as decisões «1B 2A», «1A 2A 3A» e «1A 1A 2A» registadas pelo operador · decisão.
- 05/11 16:15 · 0 MP · #695 · resposta por delegação: o OCR mantém a regra de hoje; ajusta-se o critério 3 do despacho · registada (6662955867).
- 05/11 15:44 · 0 MP · — · revisão do plano da janela (PR #702): 9 passos já feitos de manhã; pedida a correcção · comentário 6662181445.
- 05/11 15:27 · Pedro (via operador) · #646 · perguntas do Fecho D2-c: «1A 1A 2A» (D2-e selos com composição; famílias mistas mantêm o desconto; D2-f `partially_paid` no `committed`) · registadas (6661900951).
- 05/11 15:15 · Pedro (via operador) · #646 · D2-d detalhes: «1A 2A 3A» (% por data e sessão; tabela própria; sai Modo/Percentagem do modal) · registadas (6661615537).
- 05/11 14:55 · Pedro (via operador) · #646 · D2-d: «1B 2A» (% na configuração das bilheteiras; sem % = máximo; por data) · registadas (6661145692).
- 05/11 14:46 · 0 MP · — · merge do PR #703 (diário; squash `1345693`) · ok.
- 05/11 14:45 · Pedro · — · avançar o máximo hoje e fazer o Publish geral ao fim do dia; merges dos PRs do diário sem perguntar, com CI verde; higiene do QUADRO pelo operador · decisão.
- 05/11 14:37 · 0 MP · #314 · Autorização R1 do 314-b por delegação (resposta 1A às Perguntas 6660312365) · emitida (6660666301).
- 05/11 14:35 · 0 MP · — · merge do PR #701 (diário; squash `986f0fa`; quality verde no HEAD `21ee258`), com «Sim» do Pedro · ok.
- 05/11 14:15 · 0 MP · — · PR #700 fechado sem merge (conteúdo incorporado no #701), com «Sim» do Pedro · ok.
- 05/11 14:15 · 0 MP · #664 · merge do PR #699 (664-b2; squash `56a223d`; quality verde no HEAD `1dd870a`), com «Sim» do Pedro · ok.
- 05/11 14:11 · 0 MP · #473 · fila do operador: 3 lotes autorizados por despachar (#646 conferência D2, #669 669-c, #695), por esta ordem · comentário 6660138908.
- 05/11 13:57 · Pedro · #405 · executor do envio NG27 de 06/11 = 0 pessoal (tarefa 10:25 UTC); o 0 MP não toca no envio nem no cron `ng27-reforco-envio` · registado (6659824675).
- 05/11 ~13:50 · 0 pessoal · — · o «0 - Cowork (MP)» passa a tarefa Cowork no projeto «espelho MP», com tarefas agendadas, GitHub e Lovable confirmados · ok (do PR #700, fechado a favor deste).
- 05/11 13:44 · Pedro · #405 · plano de envio do reforço NG27 aprovado («SIM») · registado (6659536438).
- 05/11 ~13:45 · 0 MP · #405 · Publish do Portal Newgang (`fbf57f8`); link Fever 821990 verificado pelo Pedro no portal e no email de teste · ok.
- 05/11 13:38 · 0 MP · #405 · deploy só da `newgang-portal` (ERP `4a7da40`, SHA-256 `b71cb587…`), link Fever 826449 → 821990 · ok (6659428677).
- 05/11 13:25 · 0 MP · #473 · Autorização R0 ao dev: D-ERP355/356 no DECISIONS.md · emitida (6659145455).
- 05/11 12:31 · 0 MP · #473 · comentário «0 · Cowork (MP) assume o comando» (6658031538) · ok.
- 05/11 12:30 · 0 MP · — · merge do PR #696 (squash `b0dbb4e`; quality verde no HEAD `1fbd784`) · ok.
- 05/11 12:29 · 0 MP · — · conectores GitHub (pedrompropicio, MCP oficial) e Lovable confirmados na organização MP; comando efectivo no «0 - Cowork (MP)» · ok.
- 05/11 12:30 · 0 pessoal · — · instruções e descrição do projeto «espelho MP» actualizadas pelo Chrome (regra de comando + diário); arranque enviado ao «0 - Cowork (MP)» · ok.
- 05/11 12:20 · 0 pessoal · — · Pedro decide: o «0 - Cowork (MP)» passa a comandar o dev; o 0 pessoal passa a só consulta · handoff + este diário (PR #696).
- 05/11 11:55 · 0 pessoal · #695 · Issue aberta: «Data de competência» + recorrentes · aberta.
- 05/11 11:55 · 0 pessoal · #666 · linhas Social Eventos, Social Esporte e Administração criadas na Social Music (pelo ecrã) · ok, 3 linhas activas.
- 05/11 11:52 · 0 pessoal · #202 · offsite de 05/11 fechado com chamadas manuais force/date · ok, 1145/1145 ficheiros, 0 falhas.
- 05/11 11:45 · 0 pessoal · #669 #666 #646 #664 · Publish do ERP (deployment 74c2d0a8, commit 2d5188a) · ok; prova da DRE Empresarial na #669.
- 05/11 11:43 · 0 pessoal · #664 #202 · deploy de `apply-coala-bp` e `database-backup` (agente Lovable, sem alterar ficheiros) · ok.
- 05/11 11:36 · 0 pessoal · — · sync main → lovable-fallback (PR #693, a9b55a4) · ok.
- 05/11 11:25 · 0 pessoal · #666 · 0339 aplicada (2.ª tentativa, depois de um lock timeout) · ok.
- 05/11 11:20 · 0 pessoal · #664 · 0335 PARTE 1 aplicada · ok.
- 05/11 11:15 · 0 pessoal · #647 · crons 15703 e 15704 instalados · ok.
- 05/11 11:12 · 0 pessoal · #647 · 1.ª anonimização manual com «Corro?» · ok, 14.043 linhas.
- 05/11 11:10 · 0 pessoal · #647 · 0333 e 0336 aplicadas · ok.
- 05/11 ~10:45 · Pedro · #669 #647 #664 · respostas 1A 2A 3A 4A · registadas nas Issues.
- 05/11 ~10:40 · 0 pessoal · #677 #664 · respostas por delegação (#677 1B 2A; #664 1A 2A) · registadas.
- 05/11 06:15 · 0 pessoal · #690 #691 · merges (Tesouraria D2-a e 202-h); #689 fechado sem merge · ok.
- 05/11 01:40 · 0 pessoal · #687 #688 · merges (sync #405 com a 0337; 666-b) · ok.

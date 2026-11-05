# Diário do 0 · Cowork (Claude) — ponte entre a conta pessoal e a organização MP

> **Para que serve.** Os dois projetos Claude, «Sistema de Gestão de Eventos - Lovable» na conta pessoal e «… — espelho MP» na organização MP, não partilham memória nem documentos. Este ficheiro mantém os dois 0 sincronizados (regra em `CHATS.md` › «Claude em duas organizações»).
>
> **Leitura.** Qualquer 0 lê-o no arranque, antes de agir.
>
> **Escrita.** Depois de cada passo com efeito, quem o executou acrescenta **no topo** uma linha `data UTC · chat · Issue · o que foi feito · resultado`. Passo com efeito é: merge, migração, DML, deploy, Publish, cron, resposta por delegação ou decisão do Pedro. O detalhe fica na Issue.
>
> **Repo público.** Sem valores, contratos, dados pessoais nem segredos.

**Comando actual:** «0 - Cowork (MP)», desde 05/11/2026 (decisão do Pedro). Handoff: `../handoffs/2026-11-05-0-cowork-pessoal-para-mp.md`.

**Despacho ao executor:** desde 05/11 16:51 o 0 (MP) escreve directamente Reserva e Despacho (PROC-despacho-executor), além do operador `mplabs-dev`. A fila do executor é **por Issue**: Issues diferentes correm em paralelo. Rondas do 0 de 20 em 20 min (tarefa agendada nesta conversa). **Travas:** antes de cada nova Reserva, libertar as anteriores na mesma Issue (6671112203).

## Pendentes abertos (o 0 de comando mantém esta lista)
1. #647: confirmar a 1.ª corrida dos crons 15703 e 15704 (06/11, 04:17 e 04:53 UTC) em `cron.job_run_details`.
2. #646 D2: D2-c e D2-d run A (0341 preparada) em `main`; a seguir D2-f (0342) e run B pelo operador. **Gate:** o Publish do ERP só sai depois de o 0 correr `docs/testes/issue646/conferencia-d2.sql` em Live (só SELECT) e fechar a conferência. Depois D2-e (6663213468, depois do #564 em `main`).
3. #664: código completo em `main`. Falta a janela: 0340 → deploys (`sync-coala-from-drive`, `test-multi-tenant-isolation`) → Publish → país nas configurações Coala → PARTE 2 da 0335 com provas → DML dos dados pela lista do chat 10.
4. #669: 669-c em `main` (`18db40a`); entra no Publish, com prova no ecrã.
5. #695: 695-a em `main` (`d8881d2`); entra no Publish, com prova no ecrã. Lacuna aceite pelo Pedro: sem aviso na edição.
6. #677: preparação da importação da Social Music de 2026 (1B/2A). Só depois da #664.
7. #405: Portal NG fechado (deploy `newgang-portal` + Publish do Portal pelo 0 pessoal, 19:44). Envio do reforço NG27 a 06/11 e cron `ng27-reforco-envio` são do 0 pessoal: o 0 MP não toca. Em curso: 405-h (hashes B1 em `presale-code_test.ts`, Despacho 6671436418).
8. #675 / 0334 / SLE: suspensos até ao 647-d-portal.
9. Cloudflare: o Pedro apaga os tokens antigos `mp-backups-supabase` e `-v2`.
10. Coala, venda geral a 10/11: apagar `early_bird.general_sale_date` com «Corro?» (#359). A tarefa agendada estava na conta pessoal: recriar do lado MP.
11. #603: decidir onde corre o piloto, na conta Lovable actual ou numa conta nova, e registar a escolha e o motivo na #603. Decisão do Pedro com o 0 (MP).
12. Migrações reservadas: 0341 D2-d (#646, em `main`), 0342 D2-f (#646), 0343 339-r (#339, em `main`), 0344 644b B1 (#644). Próxima livre: 0345.
13. #314: 314-b em `main` (`549c8a7`). **Na janela, a 0323 aplica-se antes do Publish.** Nota para a #591: a lista de bancos do diálogo «Confirmar crédito» não filtra por empresa (depende de RLS).
14. QUADRO «Em execução agora»: higiene das linhas com mais de 24 h autorizada ao operador (R0).
15. Janela de Publish do ERP: plano do PR #702 em `main`. Gate: `conferencia-d2.sql` (#646). Publish com «Sim» do Pedro.
16. Painel v2 (#721): E1a+E1b em `main` do mp-painel. Seguinte: E2a (D1 + Worker `painel-turno` + triagem + Custos), com o reparo dos comentários livres. Contas de API (Anthropic Console, workspace `painel`, limite 100 USD/mês) com o Pedro pelo Chrome; chaves só nos segredos, nunca em chat.

## Registo (mais recente primeiro)
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

# Diário do 0 · Cowork (Claude) — ponte entre a conta pessoal e a organização MP

> **Para que serve.** Os dois projetos Claude, «Sistema de Gestão de Eventos - Lovable» na conta pessoal e «… — espelho MP» na organização MP, não partilham memória nem documentos. Este ficheiro mantém os dois 0 sincronizados (regra em `CHATS.md` › «Claude em duas organizações»).
>
> **Leitura.** Qualquer 0 lê-o no arranque, antes de agir.
>
> **Escrita.** Depois de cada passo com efeito, quem o executou acrescenta **no topo** uma linha `data UTC · chat · Issue · o que foi feito · resultado`. Passo com efeito é: merge, migração, DML, deploy, Publish, cron, resposta por delegação ou decisão do Pedro. O detalhe fica na Issue.
>
> **Repo público.** Sem valores, contratos, dados pessoais nem segredos.

**Comando actual:** «0 - Cowork (MP)», desde 05/11/2026 (decisão do Pedro). Handoff: `../handoffs/2026-11-05-0-cowork-pessoal-para-mp.md`.

**Despacho ao executor:** desde 05/11 16:51 o 0 (MP) escreve directamente Reserva e Despacho (PROC-despacho-executor), além do operador `mplabs-dev`. A fila do executor é **por Issue**: Issues diferentes correm em paralelo. Rondas do 0 de 20 em 20 min (tarefa agendada nesta conversa).

## Pendentes abertos (o 0 de comando mantém esta lista)
1. #647: confirmar a 1.ª corrida dos crons 15703 e 15704 (06/11, 04:17 e 04:53 UTC) em `cron.job_run_details`.
2. #646 D2: D2-c em `main`. **Gate:** o Publish do ERP só sai depois de o 0 correr `docs/testes/issue646/conferencia-d2.sql` em Live (só SELECT) e fechar a conferência. D2-d despachado em dois tempos (plano 6665661392); depois D2-f (6663212161) e D2-e (6663213468, depois do #564 em `main`).
3. #664: código completo em `main`. Falta a janela: 0340 → deploys (`sync-coala-from-drive`, `test-multi-tenant-isolation`) → Publish → país nas configurações Coala → PARTE 2 da 0335 com provas → DML dos dados pela lista do chat 10.
4. #669: 669-c em `main` (`18db40a`); entra no Publish, com prova no ecrã.
5. #695: 695-a em `main` (`d8881d2`); entra no Publish, com prova no ecrã. Lacuna: o aviso (a) não existe na edição (o modal não recebe a data lida).
6. #677: preparação da importação da Social Music de 2026 (1B/2A). Só depois da #664.
7. #405: envio do reforço NG27 a 06/11 — executor 0 pessoal (decisão do Pedro, 13:57). O 0 MP não actua.
8. #675 / 0334 / SLE: suspensos até ao 647-d-portal.
9. Cloudflare: o Pedro apaga os tokens antigos `mp-backups-supabase` e `-v2`.
10. Coala, venda geral a 10/11: apagar `early_bird.general_sale_date` com «Corro?» (#359). A tarefa agendada estava na conta pessoal: recriar do lado MP.
11. #603: decidir onde corre o piloto, na conta Lovable actual ou numa conta nova, e registar a escolha e o motivo na #603. Decisão do Pedro com o 0 (MP).
12. Sync lovable/dev → main com o `4a7da40` (link Fever), que ainda não passou pelo CI.
13. #314: 314-b em `main` (`549c8a7`). **Na janela, a 0323 aplica-se antes do Publish.** Nota para a #591: a lista de bancos do diálogo «Confirmar crédito» não filtra por empresa (depende de RLS).
14. QUADRO «Em execução agora»: higiene das linhas com mais de 24 h autorizada ao operador (R0), depois do merge do #702.
15. Janela de Publish de 05/11: o plano do PR #702 ainda lista como pendentes passos já feitos de manhã (revisão 6662181445); o 0 prepara a lista final. Publish geral ao fim do dia (decisão do Pedro, 14:45).

## Registo (mais recente primeiro)
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

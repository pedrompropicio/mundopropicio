# Diário do 0 · Cowork (Claude) — ponte entre a conta pessoal e a organização MP

> **Para que serve.** Os dois projetos Claude, «Sistema de Gestão de Eventos - Lovable» na conta pessoal e «… — espelho MP» na organização MP, não partilham memória nem documentos. Este ficheiro mantém os dois 0 sincronizados (regra em `CHATS.md` › «Claude em duas organizações»).
>
> **Leitura.** Qualquer 0 lê-o no arranque, antes de agir.
>
> **Escrita.** Depois de cada passo com efeito, quem o executou acrescenta **no topo** uma linha `data UTC · chat · Issue · o que foi feito · resultado`. Passo com efeito é: merge, migração, DML, deploy, Publish, cron, resposta por delegação ou decisão do Pedro. O detalhe fica na Issue.
>
> **Repo público.** Sem valores, contratos, dados pessoais nem segredos.

**Comando actual:** «0 - Cowork (MP)», desde 05/11/2026 (decisão do Pedro). Handoff: `../handoffs/2026-11-05-0-cowork-pessoal-para-mp.md`.

## Pendentes abertos (o 0 de comando mantém esta lista)
1. #647: confirmar a 1.ª corrida dos crons 15703 e 15704 (06/11, 04:17 e 04:53 UTC) em `cron.job_run_details`.
2. #646 D2: o dev tem de conferir a linha 1 e o sinal da linha 3 da Tesouraria contra a Posição Financeira. Depois vem o D2-b.
3. #664:
   - retirar da PARTE 2 da 0335 o CHECK duplicado do país;
   - a PARTE 2 só avança depois do 664-b e do Publish com todos os escritores.
4. #669: lote R1 para o filtro de natureza na DRE Empresarial (decisão 1A).
5. #695: «Data de competência» e vencimento separado nas recorrentes.
6. #677: preparação da importação da Social Music de 2026 (1B/2A). Só depois da #664.
7. #405: envio de reforço NG27 a 06/11, autorizado («SIM» a 05/11). **Executa o 0 pessoal** (decisão do Pedro); o 0 MP não mexe no envio nem no cron `ng27-reforco-envio`. Arranque às 10:25 UTC. Lote R1 pendente: alinhar o teste B1 (hash de `presale-reinforce-email.ts`) com o link 821990 em main.
8. #675 / 0334 / SLE: suspensos até ao 647-d-portal.
9. Cloudflare: o Pedro apaga os tokens antigos `mp-backups-supabase` e `-v2`.
10. Coala, venda geral a 10/11: apagar `early_bird.general_sale_date` com «Corro?» (#359). A tarefa agendada estava na conta pessoal: recriar do lado MP.
11. #603: decidir onde corre o piloto, na conta Lovable actual ou numa conta nova, e registar a escolha e o motivo na #603. Decisão do Pedro com o 0 (MP).

## Registo (mais recente primeiro)
- 05/11 19:43 · 0 pessoal · #405 · Publish do Portal Newgang (`80419da`, deployment f0fead77); /bilhetes com sessão de membro elegível mostra o código e a Fever 821990 · ok; caso não elegível por verificar no ecrã.
- 05/11 19:40 · 0 pessoal · #405 · verificação em Live da `presale_code` (401 `no_session` sem sessão; 400 com campo extra) e `request_access` de teste (enviado, fila `auth_emails`) · ok.
- 05/11 19:36 · 0 pessoal · #405 · deploy só da `newgang-portal` a partir de `1bf9b46` (B1 sem diff face a `4a7da40`), SHA-256 `581b2b85…08d9` · ok.
- 05/11 ~14:00 · Pedro · #405 · o envio de reforço NG27 de 06/11 fica com o 0 pessoal · comentário 6659824675.
- 05/11 ~13:50 · 0 pessoal · — · o «0 - Cowork (MP)» passa a tarefa Cowork no projeto «espelho MP», com tarefas agendadas, GitHub e Lovable confirmados · ok.
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

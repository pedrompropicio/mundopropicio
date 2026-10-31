# PROC — Promoção de mudanças: mp-homolog-3 → Live

Em vigor desde 31/10/2026 (D-ERP343). Procedimento fixo; corre sempre igual.

## Quem escreve o quê

| Tipo de mudança | Quem escreve | Como chega a Live |
|---|---|---|
| Documentação (`docs/`, Issues) — R0 | Qualquer chat: conector GitHub, tarefa Codex ou tarefa ao agente limitada a `docs/` | Não chega. É só repositório |
| Código sem DDL — R1 | Agente Lovable ou tarefa Codex (branch/PR), com vitest + tsc e CI verde | Publish pelo 0, na janela, com Sim do Pedro |
| Estrutura da base (migração, função, trigger, política, cron) — R2 | **Só como ficheiro** em `drizzle/migrations/NNNN_*.sql`, mais cópia em `supabase/manual/` e rollback comentado. Nunca pela ferramenta de migrações do Lovable | Os passos abaixo |
| Dados (DML) — R2 | Bloco SQL curto, «Corro?» e Sim do Pedro | Direto em Live. A homologação compara estrutura, não dados |

## Passos de uma mudança de estrutura

1. **Ficheiro.** A frente dona cria a migração como ficheiro de texto, sem a executar. Envia ao 0 o caminho e o sha256.
2. **Conferência prévia.** O 0 confirma o sha256 no main e verifica, por SELECT, que Live **não** tem a mudança.
3. **mp-homolog-3.** O 0 aplica no SQL Editor um script único em transação: os bytes exatos do ficheiro e uma linha em `drizzle.__drizzle_migrations` (hash = sha256 do ficheiro e `created_at` fixo, anotado). O 0 confirma no editor o sha256 do script antes de correr.
4. **Verificação no mp-homolog-3.** Por SELECT: colunas, constraints (md5 da definição), triggers, funções (md5 de `pg_get_functiondef`, owner, security definer, `proconfig`, ACL) e ledger (contagem e último hash).
5. **Live.** Com o Sim do Pedro, o 0 aplica **o mesmo script**, com o mesmo hash e o mesmo `created_at`, via `query_database`.
6. **Verificação em Live.** As mesmas consultas do passo 4. Os md5 têm de coincidir. Diferença esperada: o role de sandbox do Lovable aparece na ACL só em Live.
7. **Código.** Só depois de a estrutura estar em Live: a tarefa de código (R1), com o acerto de `drizzle/migrations/meta/_journal.json`.
8. **Publish e funções.** O 0 faz o Publish na janela e reimplanta as edge functions afetadas, com um único Sim.
9. **Dados.** DML associado (marcar linhas, backfill) só depois do Publish, com «Corro?».
10. **Registo.** Comentário na Issue com sha256, md5 e contagens; fecho documental pela frente dona.

## Até ao corte para a base UE

Enquanto a mp-producao-eu não for a produção, cada mudança de estrutura entra também na reconstrução seguinte da base UE. A recaptura de Live do dia apanha-a automaticamente; nunca se edita o binding à mão.

## Regras que não mudam

- O agente Lovable é um só: confirmar `agentFinished=true` antes de cada tarefa.
- Nenhum segredo, token ou password em chats, Issues ou ficheiros.
- Um desvio (estrutura em Live sem passar pelo mp-homolog-3) declara-se na Issue e corrige-se com um acerto no mp-homolog-3, como na 0295 (D-ERP341).

Origem: execução real de 31/10/2026 — 0295 (#352 6548839555) e 0296 (#404 6549360679).

# P9 — sessões independentes, preparado e não executado

Executar apenas com autorização própria, PostgreSQL descartável `issue486_synthetic`, catálogo fiel, roles/RLS/triggers reais e sem dados operacionais/egress/crons. Nenhum roteiro novo foi executado nesta entrega. Não substituir controlos por stubs, não usar skips e não desativar triggers.

O setup partilhado cria BP100/compromisso70 e duas faturas de 20, em períodos diferentes para não colidir com a proteção legada por referência mensal. `concorrencia-setup.sql` tem COMMIT exclusivamente para o futuro ensaio. Cada caso usa uma cópia nova. Sessões NOLOGIN usam SET SESSION AUTHORIZATION; recolher session_user/current_user/PID distintos.

| Par | Protocolo e assert |
|---|---|
| concorrencia-fatura-a/b.sql | A altera plano com CAS revisão1→2 e pausa; B pede revisão1. Após commit A, B recebe revision_conflict e revisão2. Variante rollback A exige B conseguir revisão2, com assert próprio no controlador. |
| concorrencia-financeira-a/b.sql | Iniciar B antes de A: B guarda/confirm a prévia e liberta a transação; A gera20 e pausa antes de commit; B envia pedido antigo. Controlador observa espera e liberta A; B recebe preview_stale, nova prévia requer10, sem aceite não escreve, com aceite sobe110/baseline100. |
| concorrencia-legado-a/b.sql | A lê estado anterior e pausa antes da primeira mutação; B gera/commit e fixa âncora legítima de filha; A retoma INSERT mãe, DELETE linhas, unlink BP, DELETE grupo, reopen/confirm. Cada primeira escrita é recusada; âncora e grupo permanecem. |

Os scripts de legado originais cobrem pedido iniciado antes da conversão cuja primeira escrita ocorre depois. Variantes de writer **já dentro** do UPDATE BP/DELETE linhas e de mãe v0 já gravada continuam sem scripts próprios; permanecem lacunas de aceitação, sem cobertura presumida. O setup usa o plano v1 já guardado para os casos financeiros; não prova sozinho a transição completa v0→v1.

Controlador independente observa antes de libertar cada barreira:

```sql
SELECT pid,application_name,session_user,wait_event_type,wait_event,pg_blocking_pids(pid)
FROM pg_stat_activity WHERE datname='issue486_synthetic';
SELECT pid,relation::regclass,mode,granted FROM pg_locks
WHERE database=(SELECT oid FROM pg_database WHERE datname='issue486_synthetic') ORDER BY pid,relation,mode;
```

`session_user` na consulta acima refere-se ao controlador; as transcrições de A/B registam a identidade própria. Conservar processos/PIDs, barrier events, bloqueadores, ordem de commit/rollback e asserts. O controlador deve alimentar stdin dos psql após observar o bloqueio, antes de 2s; não usar sleeps para alegar sobreposição. Timeout/deadlock é resultado de falha integral a verificar, sem retry financeiro automático; não o contar como sucesso do cenário preview_stale. Se não puder realizar a barreira dentro do limite, a prova permanece pendente.

A união conservadora de generate/revert ainda afeta temporariamente outras empresas. Operation/preview/list deixaram de adquirir esse cerco; save_plan/import/attest mantêm SHARE de conversão legado e os outros comandos curtos usam a união ROW EXCLUSIVE anterior às linhas. Preparar a medição de contenção entre empresas, duração/cancelamento e leitura concorrente sem alterações financeiras; não declarar não interferência universal. Os scripts atuais não cobrem toda a matriz: falta mesma rubrica/BPs distintos, criação concorrente, writer externo de compromisso já iniciado, commit e rollback do vencedor em todas as variantes e callback documental × revert em duas sessões. Esses casos continuam gates de aceitação, sem sucesso presumido.

Teste unitário sequencial/PGlite, contagem de testes TS ou mero advisory lock não prova concorrência PostgreSQL. D1 não ativa o fluxo: drenagem deve abranger também unlockCampaigns/Storage/HTTP antigos, além das guardas DB. Sem prova operacional manter enabled=false, conforme contrato e plano §5.

## Variantes C2 preparadas

Usar uma base nova por variante. Psql mantém opções apenas dentro do processo: passá-las a cada sessão indicada, sem inferir estado de execuções anteriores. Nenhuma opção é bypass do candidato.

| Caso | Setup e sessões | Asserts preparados |
|---|---|---|
| Vencedor financeiro em rollback | Setup normal; financeira A e B com `-v winner_rollback=true` | B pode usar a prévia original, gera uma vez sem raise; verba/baseline100. |
| Moeda empresarial entre confirm/generate | Setup normal; iniciar financeira B com `-v currency_race=true` até à barreira; financeira A com a mesma opção atualiza companies para BRL; soltar B e observar espera, depois A | Commit A → preview_stale/zero custos B e blocker currency_unrepresentable; repetir com winner_rollback=true nos dois → geração EUR possível. |
| Leituras sem bloquear writer de outra empresa | Setup normal; financeira A com `-v noninterference=true` mantém INSERT da empresa B; financeira B com a mesma opção | Operation e preview A terminam antes de libertar o writer B; B só mantém AccessShare nos objetos financeiros. O controlador confirma PIDs distintos e que A continua aberta. |
| Callback primeiro × revert | Setup com `-v callback_race=true`; legado A/B com a mesma opção | A conclui original e mantém transação; B reverte depois da espera; uma operação e nenhum grupo restante, cleanup preservado. Repetir winner_rollback=true em A/B. |
| Revert primeiro × callback | Setup/legado A/B com callback_race=true e revert_first=true | Commit A → callback recusa request_conflict; rollback A → callback conclui original. Nenhuma regeneração financeira. |

As variantes callback_first/revert_first exigem iniciar B quando A já parou após a primeira mutação; a leitura operation de B não deve bloquear. As variantes financeiras exigem B capturar/confirmar e fazer COMMIT antes de A começar. Não usar timeout como substituto dos asserts de espera/revalidação.

O modo fechado tem recusas por **cada RPC mutante**, com digests, em sintetico-writers.sql. O ensaio independente de não interferência com enabled=false ainda não está preparado; esses testes sequenciais não provam locks. Permanecem lacunas: mesma rubrica/BPs distintos, criação concorrente, writer externo já dentro de UPDATE/DELETE, mãe v0 pré-escrita e commit/rollback de todos os vencedores/ações. As combinações não implementadas não são skips nem sucessos. Não declarar P9 completo.

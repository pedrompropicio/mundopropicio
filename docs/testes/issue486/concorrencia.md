# P9 — sessões independentes, preparado e não executado

Executar apenas com autorização própria, PostgreSQL descartável `issue486_synthetic`, catálogo fiel, roles/RLS/triggers reais e sem dados operacionais/egress/crons. Nenhum roteiro novo foi executado nesta entrega. Não substituir controlos por stubs, não usar skips e não desativar triggers.

O setup partilhado cria BP100/compromisso70 e duas faturas de 20, em períodos diferentes para não colidir com a proteção legada por referência mensal. `concorrencia-setup.sql` tem COMMIT exclusivamente para o futuro ensaio. Cada caso usa uma cópia nova. Sessões NOLOGIN usam SET SESSION AUTHORIZATION; recolher session_user/current_user/PID distintos.

| Par | Protocolo e assert |
|---|---|
| concorrencia-fatura-a/b.sql | A altera plano com CAS revisão1→2 e pausa; B pede revisão1. Após commit A, B recebe revision_conflict e revisão2. Variante rollback A exige B conseguir revisão2, com assert próprio no controlador. |
| concorrencia-financeira-a/b.sql | Iniciar B antes de A: B guarda/confirm a prévia e liberta a transação; A gera20 e pausa antes de commit; B envia pedido antigo. Controlador observa espera e liberta A; B recebe preview_stale, nova prévia requer10, sem aceite não escreve, com aceite sobe110/baseline100. |
| concorrencia-legado-a/b.sql | A lê estado anterior e pausa antes da primeira mutação; B gera/commit e fixa âncora legítima de filha; A retoma INSERT mãe, DELETE linhas, unlink BP, DELETE grupo, reopen/confirm. Cada primeira escrita é recusada; âncora e grupo permanecem. |

Os scripts de legado cobrem pedido iniciado antes da conversão cuja primeira escrita ocorre depois. Variantes de writer **já dentro** do UPDATE BP/DELETE linhas e de mãe v0 já gravada ainda necessitam scripts próprios; constam das lacunas. O setup usa o plano v1 já guardado para os casos financeiros; não prova sozinho a transição completa v0→v1.

Controlador independente observa antes de libertar cada barreira:

```sql
SELECT pid,application_name,session_user,wait_event_type,wait_event,pg_blocking_pids(pid)
FROM pg_stat_activity WHERE datname='issue486_synthetic';
SELECT pid,relation::regclass,mode,granted FROM pg_locks
WHERE database=(SELECT oid FROM pg_database WHERE datname='issue486_synthetic') ORDER BY pid,relation,mode;
```

`session_user` na consulta acima refere-se ao controlador; as transcrições de A/B registam a identidade própria. Conservar processos/PIDs, barrier events, bloqueadores, ordem de commit/rollback e asserts. O controlador deve alimentar stdin dos psql após observar o bloqueio, antes de 2s; não usar sleeps para alegar sobreposição. Timeout/deadlock é resultado de falha integral a verificar, sem retry financeiro automático; não o contar como sucesso do cenário preview_stale. Se não puder realizar a barreira dentro do limite, a prova permanece pendente.

A união conservadora de locks afeta temporariamente outras empresas. Preparar a medição de contenção entre empresas, duração/cancelamento e leitura concorrente sem alterações financeiras; não declarar não interferência universal. Os scripts atuais não cobrem toda a matriz: falta mesma rubrica/BPs distintos, criação concorrente, writer externo de compromisso já iniciado, commit e rollback do vencedor em todas as variantes e callback documental × revert em duas sessões. Esses casos continuam gates de aceitação, sem sucesso presumido.

Teste unitário sequencial/PGlite, contagem de testes TS ou mero advisory lock não prova concorrência PostgreSQL. D1 não ativa o fluxo: drenagem deve abranger também unlockCampaigns/Storage/HTTP antigos, além das guardas DB. Sem prova operacional manter enabled=false, conforme contrato e plano §5.

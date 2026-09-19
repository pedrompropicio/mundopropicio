---
name: cron.job_run_details — consulta e retenção
description: Nunca consultar cron.job_run_details sem intervalo de runid (PK); retenção de 7 dias pelo job 262; tabela vive só em Live
type: constraint
---

# cron.job_run_details

**Nunca consultar `cron.job_run_details` sem um intervalo de `runid`** (a PK). Qualquer
filtro só por `jobid`, `status`, `start_time` ou `end_time` faz **seq scan** e lê a tabela
inteira. A 19/09/2026 a tabela tinha **3.549 MB / ~3,06 M linhas** e o varrimento
esgotou a instância Small: a base ficou indisponível (HTTP 522), sem FATAL no PostgreSQL.

Forma correcta:

```sql
SELECT runid, jobid, status, end_time
  FROM cron.job_run_details
 WHERE runid >= 3056000 AND runid < 3060000
 ORDER BY runid DESC;
```

**Retenção: 7 dias**, feita pelo cron `cron-purge-run-details` em Live (jobid **262**,
`15 3 * * *`, `DELETE ... WHERE end_time < now() - interval '7 days'`).

**A tabela e o job não estão no repositório.** O pg_cron vive só em Live (o Publish não
propaga crons) e o job entra no `infra.json` do backup global.

Vigiado pelo verificador de invariantes: `cron_run_details_sem_purga` (warn, global,
referência 0) conta linhas com `end_time` há mais de 8 dias. Se a purga morrer, sobe.

**Não confundir com `net._http_response`** (121 MB / 397 linhas): são corpos de resposta
grandes e o pg_net limpa-os ao fim de 6 h — não é problema.

**Excepção à regra do `runid`:** a própria verificação do invariante e o `DELETE` da purga
filtram por `end_time` por não haver alternativa; é aceitável porque a tabela passou a ser
pequena (2,3 MB / ~9 mil linhas). Se voltar a crescer, é sinal de que a purga parou.

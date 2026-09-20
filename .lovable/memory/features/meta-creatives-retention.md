---
name: Retenção de criativos Meta (#209)
description: Edge fn crm-meta-creatives-retention + cron semanal em dry-run; classes A (evento passado), B (órfãos/duplicados/única cópia), C (campanha sem evento, só lista)
type: feature
---

Bucket `crm-meta-creatives` (6.500 ficheiros / ~855 MB). Regra decidida a 20/09/2026.

## Edge function `crm-meta-creatives-retention`
`service_role` apenas. Body `{ dry_run: boolean, days?: 30, max_delete?: 500 }`.
`dry_run` só é falso se vier explicitamente `false` (default seguro = simulação).

- **A — ligados a evento**: data final = `max(events.date)` do evento e dos sub-eventos
  (`parent_event_id`). Candidato se `data_final < hoje − days` **e** nenhum anúncio do
  criativo com `effective_status='ACTIVE'` no espelho. Apaga o ficheiro pela API de
  storage (nunca `DELETE` em `storage.objects`) e limpa `storage_path` / `file_url` /
  `file_size_bytes`. **A linha e os metadados ficam** (`meta_creative_id`,
  `meta_image_hash`, `meta_video_id`, análise) — o histórico de anúncios não se perde.
- **B — ficheiro sem linha**: stem não é `meta_creative_id` de linha nenhuma → órfão,
  apagar. Stem é `meta_creative_id` de uma linha com outro `storage_path` que existe no
  bucket → duplicado, apagar. Se esse `storage_path` **não** existir → é a única cópia:
  aponta `storage_path`/`file_url` para este ficheiro, **nunca apaga**.
- **C — campanha sem `linked_event_id`**: nunca apaga. Devolve lista agrupada por
  empresa e campanha (nome, `stop_time`, último `updated_time`, nº criativos, bytes,
  anúncios activos) para expurgo manual.

Nunca apaga ficheiro de criativo com anúncio `ACTIVE`. Tecto `max_delete` por corrida
(o resto fica para a seguinte). Erros por ficheiro vão para `errors[]` e a corrida
continua — sem `EXCEPTION`/catch mudo.

## Persistência e cron
`crm.meta_creatives_retention_runs` — uma linha por corrida (contagens e bytes por
classe, `deleted`, `errors` jsonb, `sample` jsonb até 50 caminhos por classe).
RLS: `service_role_bypass` + `tenant_isolation_select` (`company_id IS NULL OR
current_company_id()`).
Cron `meta-creatives-retention`, `10 4 * * 0` (domingo 04:10 UTC), jobid 305,
**em `dry_run: true`**. Para passar a apagar: editar o `body` do `cron.job` (jobname
`meta-creatives-retention`) para `'dry_run', false` — via `cron.unschedule` +
`cron.schedule` directamente em Live (pg_cron não propaga por Publish).

## Primeira corrida (20/09/2026, dry-run, days=30)
6.500 ficheiros; A 146 / 37,4 MB; B órfãos 908 / 51,5 MB; B duplicados 1.798 / 158,8 MB;
B única cópia 402 (a repontar); C 2.117 / 208,6 MB só listados; 533 ignorados por
anúncio activo; 0 erros.

## Quem lê os ficheiros do bucket
- Pré-visualização/galeria (`src/pages/crm/CreativeView.tsx`, estúdio de campanhas).
- Análise IA (`crm-meta-creative-analyze`) e `crm-extract-video-dimensions` — fazem
  fetch aos bytes; depois de apagado o ficheiro, a análise já gravada mantém-se mas
  não pode ser refeita.
- **Publicação Meta** (`crm-meta-publish-execute`, reels) usa `meta_image_hash` /
  `meta_video_id` / `meta_creative_id` — metadados, não o ficheiro. Apagar o ficheiro
  não impede publicar nem perde histórico.

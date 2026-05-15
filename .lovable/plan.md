
# Sync Coala automatizado — plano de execução

Briefing recebido é exaustivo e prescritivo. Este plano confirma a sequência de execução e levanta 4 decisões que não consigo inferir do código sem te perguntar (vou parar antes de codar para não desperdiçar 48h em refazer).

## Sequência (1 commit, sem Publish)

1. **Leitura completa** dos 4 ficheiros core (`coalaParser.ts`, `apply-coala-bp/index.ts`, `sync-coala-from-drive/index.ts`, `CoalaSync.tsx`) + memórias coala-drive-readonly e ab-module-dual-mode + estrutura de `coala_sync_runs/config/decisions` e crons existentes.
2. **Mudança 1** — `norm()` NFKC-aware no parser.
3. **Mudança 2** — `apply-coala-bp`:
   - 2a/2b: `normTxt` NFKC + thresholds (renameOnly dice ≥ 0.55, bpCandidates ≥ 0.45)
   - 2c: detector split 1→N (`findSumCombination` k≤4, tol 2%, ≤50 candidatos)
   - 2d: separar `renameOnly` / `valueMismatches` / `splitPending` no JSON
   - 2e: `severity: auto|review` por item via `classifySeverity`
   - 2f: novo `phase=auto_apply` (snapshot BP via `create_bp_snapshot`, protected sponsorship IDs, processa só severity=auto, audit em 2 tabelas novas, suporta Pago BR via `partner_paid_expenses`)
4. **Mudança 3** — `sync-coala-from-drive`:
   - escala dry_run → auto_apply quando `reviewCount===0 && autoCount>0`
   - aceita `mode:"auto_apply"` no body
   - status novos: `auto_applied`, `needs_review`
5. **Mudança 4** — Migration: `coala_sync_deletes` + `coala_sync_value_changes` (RLS por config_id + platform_admin) + cron 15min seguindo padrão do projeto.
6. **Mudança 5** — `CoalaSync.tsx`: toggle "Auto-aplicar", tabs Tudo/Auto/Review, modo Revisão Express com atalhos 1/2/3 e gravação em `coala_sync_decisions`.
7. **Mudança 6** — `AppSidebar.tsx` + `useCoalaSyncBadge`: badge realtime quando `coala_sync_runs.status='needs_review'`.
8. **Testes** dos 6 cenários obrigatórios via `supabase--curl_edge_functions` + `supabase--read_query`.

## Decisões que preciso de fechar antes de codar

**D1 — Secret e padrão do cron.** Os outros crons do projeto (ex. `database-backup`, `cleanup-old-backups`) usam `apikey: anon` em `net.http_post` ou um `X-Cron-Secret` dedicado? E o `COALA_SYNC_CRON_SECRET` já está adicionado no Lovable Cloud, ou paro e peço-te para adicionar antes de aplicar a migration?

**D2 — TX/forecast tocados por sponsorship aparecem no diff?** O briefing diz "nunca são tocados em apply". Pergunta: também os escondemos do diff (não aparecem em `txExtra`/`extraInBp`), ou aparecem com `severity:'review'` e badge "protegido"? Recomendo **esconder do diff** — alinha com o teste 5 ("NÃO aparece em txExtra mesmo sem par no XLSX").

**D3 — Sócio Brasil para `partner_paid_expenses` em txMissing/Pago BR.** Como resolvo o sócio? Há um único `event_partners` marcado como BR no evento, ou tenho de usar convenção (ex. supplier `MANDO (COALA BR)` mapeia a um `partner_id` específico via setting do `coala_sync_config`)? Se não houver regra clara, marco esses items como `severity:'review'` e não auto-aplico.

**D4 — Onde vai o badge na sidebar?** No item "Admin" topo-nível, num sub-item "Coala Sync", ou ambos? Tenho um path tipo `/admin/coala-sync` para `CoalaSync.tsx`?

## Risco assumido

- `auto_apply` apaga forecasts/TX não-pagas sem confirmação humana quando severity=auto. Mitigação: snapshot BP obrigatório + audit tables + proteção sponsorship + nunca tocar em pagas (txExtra paid → review).
- Mudança nos thresholds e na normalização pode mudar contagens do diff de eventos antigos. Não é regressão funcional — só recalibração.

## Não-âmbito (confirmado)

Bilheteria, A&B, Simulador, pipeline patrocínios (UI), wizards manuais (`CoalaImportWizard`, `FeverImportModal`).

---

**Próximo passo se aprovares:** respondes às 4 perguntas (curto: D1: padrão X / secret OK ou não; D2: esconder/mostrar; D3: regra; D4: path) e eu executo tudo num único turno até aos 6 testes. Se preferires, respondo já D2 e D4 com a minha recomendação (esconder do diff; badge em "Admin" top-level até existir entry dedicada) e tu só fechas D1 + D3.

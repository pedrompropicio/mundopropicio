# Issue #320 — P1 validado e fecho documental autorizado

Data da autorização: 15/10/2026, 23:49 UTC. Executor: 0 Cowork ChatGPT via agente ERP. HEAD inicial confirmado no repositório: `7b151756ad8060019de571b9295a6a978e0fbb1e`.

## Origem da verificação
CI confirmada independentemente pelo Claude e ChatGPT via conector GitHub: https://github.com/pedrompropicio/mundopropicio/actions/runs/38824514063, job `quality` `116728694956`, conclusion `success`, SHA `7b151756ad8060019de571b9295a6a978e0fbb1e` (confirmado no checkout do log). Resultado comunicado pelo Pedro nesta demanda; não houve nova investigação CI nem repetição de testes.

- Etapas tsgo, vitest, canário runtime verify_jwt e build: verdes.
- 151 ficheiros aprovados +1 skipped; 1177 testes aprovados +1 skipped +11 todo.
- Canário: `crm-meta-create-purchase-audience` → `UNAUTHORIZED_LEGACY_JWT Invalid JWT [401]`; recusa esperada.
- Provas locais verificadas pelo ChatGPT no commit: `docs/testes/issue320/06-tsgo.md`, `docs/testes/issue320/06-vitest.md`, `docs/testes/issue320/06-build.md`.
- Diagnóstico sensível removido confirmado por leitura independente.
- 11 corpos de funções SQL repo × Live iguais; grants anon/authenticated false, service_role true.
- sent_n 29550 e sent_hash `b1738fd8ecdd96d7c54466ad7c81e112` preservados. Baseline e queries: `02-baseline.md` e `05-fecho-tecnico.md`.
- suspended=true; crons 33/34/44/45 ausentes.

## Rasto e correção documental
Relatos antigos de CI pendente ficam superados pela CI success acima. Os `.txt` em `logs/` eram ignorados pelo Git e não constituem prova versionada; anulada a afirmação de que já estavam disponíveis no commit. Mantêm-se o incidente e as provas Markdown, sem apagar resultados históricos.

## Limites do fecho
Fecha apenas P1 da #320, não todo o projeto CAPI. Reserva libertada no QUADRO no fim do fecho documental. Pedro fecha a Issue pelo conector após esta entrega. Publish automático continua DESLIGADO. Nenhuma alteração de código, migrações, SQL, dados, fila, consentimento, crons ou configurações; nenhum deploy, Publish, pedido Meta, envio ou retoma nesta sessão.

A ingestão lead_capture/redirect_log → contacts/leads continua suspensa, com dados guardados na origem. P2/P3 de consentimento por interação e separação da ingestão fora do âmbito. Retoma depende de autorização própria, não é automática; consent proof permanece false.

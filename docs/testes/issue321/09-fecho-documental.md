# 09 — Fecho documental #321
Data: 2026-10-16 ~01:00 UTC · HEAD de partida 2130204b6ef164434286a6c6dae636594d0b6c71

- CI final: https://github.com/pedrompropicio/mundopropicio/actions/runs/38831811638 success, SHA 2130204b6ef164434286a6c6dae636594d0b6c71 (confirmada pelo ChatGPT). Anterior: run 38831018147 success, SHA a45e9fb4….
- Publish feito pelo Pedro; version.json de mpgestaoeventos.com: commit 2130204b…, buildId 1792111923200, builtAt 2026-10-16T00:52:03.200Z.
- Live (leitura): captures_pending=0, último ciclo da ingestão succeeded, capi_suspended=true.
- Verificação independente: reserva SQL antes do envio; ON CONFLICT(member_id) DO NOTHING; unknown/error_pre_send só com recuperação manual; grants só service_role; provas 07 (19 testes, tsgo 0).
- Validado e publicado: ingestão de contactos + Clube contínuo + welcome único. NÃO concluído: consentimento P2/P3 e retoma CAPI.

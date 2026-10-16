# #326 — Correção do comparador de hashes (após revisão independente de c934f74)

Data: 2026-10-16 ~16:00 UTC · Âmbito: só scripts/testes locais. Sem Live, migrações, deploy ou Publish.

## Lacuna
`compare_hashes.py` imprimia `DIFERENCAS` mas terminava com exit 0 → `run.sh` continuava.

## Correção
- `compare_hashes.py`: imprime `in_scope_iguais: N/14` e termina com **exit 3** se alguma função do âmbito faltar ou divergir.
- `run.sh`: corre sob `set -euo pipefail`, por isso o exit 3 dentro de `| tee` **interrompe** a bateria antes do cenário. Novo `CLUB_IT_LIVE_HASHES` (opcional) só para apontar a um snapshot temporário em testes negativos; por omissão usa `live-hashes.json`.
- `run.sh`: verificação de pré-requisitos (postgres, initdb, pg_ctl, psql, python3, setpriv) com mensagem clara e **exit 4**; nada é instalado nem contactado.
- Novo `scripts/club-sql-it/neg_hash_test.sh` (determinístico, sem base de dados).

## Provas
`hash-guard-results.json` (neg_hash_test.sh):
- Positivo: exit 0, `in_scope_iguais: 14/14`.
- Negativo, hash de `club_crew_join` alterado num snapshot temporário: exit 3, `DIFERENCAS club_crew_join`.
- Negativo, `club_award_fixed` em falta: exit 3.
- Comparador falhado dentro de pipe sob pipefail: exit 3 (não continua).
- `live-hashes.json` canónico com sha256 igual antes/depois (6addb776…98abd): não editado.

Ponta a ponta com `run.sh`:
- Snapshot temporário com `club_crew_join` alterado → `equivalencia_scope: DIFERENCAS club_crew_join`, **exit 3**, 0 linhas `SERIAL_RESULT`/`RESULTADO` (cenário não correu).
- Sem binários no PATH → `pré-requisito em falta: postgres …`, **exit 4**.
- Snapshot canónico → exit 0: `in_scope_iguais: 14/14`, serial **64/64**, concorrência **17/17** (`run-log.txt`, `serial-results.json`, `concurrency-results.json` regravados nesta execução).

## Nota
Estes resultados caracterizam a regra ATUAL. As descobertas do README (inscrição concorrente com erro, bónus repetido ao mudar de Crew, código pendente apagado com crew cheia, junção por telefone) continuam por decidir: a bateria verde **não** significa que o Clube está pronto para lançamento.

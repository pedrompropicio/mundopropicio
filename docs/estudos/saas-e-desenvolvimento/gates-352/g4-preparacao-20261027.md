# #352 — preparação do G4 no replay — 27/10/2026

**Preparação G4 VERDE**, concluída às 20:55:29 de Fortaleza (23:55:29 UTC), no [run privado 40604469688](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40604469688). Commit `a3e5d9fb478a38351fe2a82a9bd26c79d50b9388`, branch `docs/352-g4-preparation-20261027`.

Âmbito: [6455841324](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6455841324) e [Sim ao corretivo 6456362091](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6456362091). Apenas replay privado, base descartável e CI específico. A reserva foi registada no QUADRO antes da publicação do corretivo, no commit `5bab0d2963570f08c5decdf92196b0346fee0179`, com skip ci.

## Provas verificadas

| Verificação | Resultado |
| --- | --- |
| Pacote autorizado | 7 ficheiros, 27885 bytes de fontes; 7/7 blobs publicados iguais ao ZIP |
| Testes das guardas no CI | 7 PASS |
| Scanner G4 | 0 ocorrências em 7 ficheiros e 12 comandos |
| Scanner da base reutilizada | 0 ocorrências e 0 erros JSON em 1534 ficheiros |
| Reconstrução descartável | G1 verde: 1547 entradas, 307 operações de baseline, 2 passagens de idempotência |
| Estado inicial de cron | 0 jobs, 0 ativos, 0 registos de execução |
| Conjunto final global em cron.job | Exatamente os 12 aprovados; 0 ativos |
| Definições nativas | 12/12 hashes iguais à fonte; horários, comandos, base e executor conferidos |
| Executor e destino guardados | postgres; destino local verificado |
| Comandos com referência ou host de Live | 0 |
| Segredos literais nos comandos | 0 |
| Execuções dos comandos dos jobs | 0 |
| cron.job_run_details | 0 durante a instalação, nas 61 amostras e na leitura final |
| Observação depois da instalação | 65,123 segundos; intervalo máximo entre amostras: 1,122 segundos |
| Cron e registo de histórico | Cron desligado e logging ligado em todas as leituras |
| Egress do contentor | REJECT comprovado antes e depois; 1 regra verificada |
| Execuções deste commit | 1, apenas o CI específico; conclusão success |
| Agenda periódica | Desligada |

O administrador já existente da base local registou os jobs inativos na mesma transação, com executor postgres. Papéis e privilégios não foram alterados. As consultas de prova foram administrativas, para que RLS não pudesse ocultar outros jobs ou execuções.

Fonte reutilizada: captura sanitizada de 27/10/2026 às 23:19:46 UTC, com 79 jobs em Live, 71 ativos e os 12 aprovados presentes. O job removido indicado no Sim tinha 0 ocorrências. A releitura do ciclo anterior confirmou os 12 metadados e hashes iguais. Esta repetição não fez novas consultas a Live. As definições capturadas não continham URLs, segredos literais nem referências ao vault; nenhum segredo foi lido ou resolvido. O marcador permitido pelas guardas continua a ser `homolog-project.supabase.invalid`.

## Achado para o G4 real: executor implícito

**A implementação nativa permite o caminho sem superutilizador quando se omite o executor**, sujeito às permissões de execução da função e de ligação à base. Esta conclusão resulta da leitura do código; esse caminho não foi ensaiado nativamente neste run.

Na [fonte primária do pg_cron, commit 5cedfa47](https://github.com/citusdata/pg_cron/blob/5cedfa472ccc83567aa23ec645925ed8489a7797/src/job_metadata.c), linhas 214–217, o papel inicial é o utilizador corrente. A exigência de superutilizador das linhas 281–286 só é aplicada quando se fornece explicitamente o executor. O [contrato da função](https://github.com/citusdata/pg_cron/blob/5cedfa472ccc83567aa23ec645925ed8489a7797/pg_cron--1.3--1.4.sql) dá ao executor o valor por omissão NULL e permite manter active=false explicitamente.

Para o G4 real, a prova própria deve usar a sessão postgres não superutilizadora, omitir o executor, manter os jobs inativos desde a criação e conferir as permissões e a versão instaladas. O run presente prova o pacote aprovado com administrador local. Conforme 6456362091, a prova no mp-homolog fica para o G4 real e não bloqueia esta preparação.

## Hashes SHA-256

| Artefacto | SHA-256 |
| --- | --- |
| g4-preparation-6455841324-v2.zip | `c123ac16ca6454b385c044640607a664dae313decb3d27014a9daa27ab2ecf27` |
| Definições | `ffd5b6c1acbe21a7fba1821f335efa1c694039a56d9cdb83f3c4c1c8d732523b` |
| Instalador | `4806aa058338fe76ab7a0c62dacf8dfc5d1f7e6a37da430c25c6acceaf7128e2` |
| ZIP privado das provas | `c8ef70de2b9c739acf2602a73b328031bf76d56d48b437a5e125dde4c4745452` |
| Resultado nativo | `96501fce7c9034fc5b27e94ebdf23c6d20c643d0071c609cb3c210c6bb07a7bb` |
| Amostras | `ceef34b9c7b1e21d138d29c18e97d10f2af44d3ca1f81dac4f36e58d076eeff0` |
| Hashes das 12 definições nativas | `11cbfb4a0c9182fbf5228da441934c96d8f715f86671991d9e1c4b378f2e8d1f` |
| Scanner G4 | `f5114b361592ae376092123ac2c2852ba42c9b753ba7becf613ce82b79a96a0b` |
| Isolamento | `78057c33b3edd7155ae201798068573bfa585e5ece9afba2521fcf0543b74e4e` |

O ZIP das provas foi conferido contra o digest do Actions. Os 12 pares de hashes de nome e comando foram comparados independentemente com o pacote; as 61 amostras e os estados inicial e final foram revistos.

O primeiro run falhou na exigência de superutilizador e ficou documentado em [6456287920](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6456287920). O novo Sim 6456362091 permitiu publicar exatamente o corretivo proposto; o hash não mudou novamente.

Comandos, SQL integral e provas completas ficam no replay privado. O main privado permaneceu em `9ed9941e95e7e626c0c5d8be15399fb13e3f2b59`. G3 permanece fechado e a agenda periódica desligada. Não houve ligação ao mp-homolog, escrita em Live, G5, ativação de jobs, deploy ou Publish. A prova de 24 horas e a instalação real em homologação ficam fora desta preparação.

# #352 — preparação do G4 no replay — 27/10/2026

Estado: **validação incompleta; G4 não está verde**. O bloqueio restante é a recusa automática de publicação do corretivo local, descrita abaixo. G3 permanece fechado.

Âmbito autorizado: [Sim 6455841324](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6455841324), classe R1, apenas replay privado e CI específico. A reserva foi registada no QUADRO antes da recolha, no commit `b5f6f512d5164ec409704ba74c20d4b008f14f33`, com skip ci.

## Medições e execução

| Verificação | Resultado |
| --- | --- |
| Catálogo de Live, apenas SELECT | 79 jobs; 71 ativos |
| Conjunto aprovado presente | 12; 11 ativos e 1 inativo em Live |
| Job removido referido no Sim | 0 ocorrências |
| Releitura de metadados após o run | 12/12 sem alteração de id, definição, horário, papel, base ou estado |
| Referências de produção, URLs ou segredos literais nas 12 definições | 0 |
| Referências ao vault nas definições capturadas | 0; nenhum segredo lido ou resolvido |
| Testes das guardas | 7 PASS |
| Scanner do pacote | 0 ocorrências; 7 ficheiros e 12 comandos verificados |
| Reconstrução da base descartável | PASS; 1547 entradas, 307 operações de baseline, 2 passagens de idempotência |
| Isolamento local | cron desligado; egress externo do contentor bloqueado por REJECT |
| Registo dos 12 jobs inativos | FALHOU na primeira chamada; transação não concluída |
| Amostra anterior ao registo | 0 jobs, 0 ativos, 0 registos de execução |
| Prova temporal final | Não obtida; a observação de 65 segundos não chegou a decorrer |
| Execuções de CI deste commit | 1, apenas o workflow específico da #352 |

[Run privado 40602196448](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40602196448), conclusão failure, commit `979b62b27a9fa1deb25756e6837786a4417c1cc4`, branch `docs/352-g4-preparation-20261027`. O main privado não foi alterado. O workflow específico não tem agenda periódica.

As definições e o SQL integral ficam exclusivamente no replay privado. A captura não exigiu substituições: os hashes dos comandos sanitizados coincidem com os da fonte. As guardas rejeitam destinos de produção; o marcador permitido é `homolog-project.supabase.invalid`.

## Causa e corretivo preparado, não publicado

A API nativa do pg_cron exige superutilizador quando o papel executor é indicado explicitamente. O primeiro run usou o papel local postgres para o registo. O hash do stderr coincide exatamente com o erro dessa exigência, confirmada também no código-fonte primário do pg_cron.

O corretivo usa o administrador já existente da base local descartável para efetuar o registo e verifica previamente que esse papel é superutilizador. Os jobs guardados continuam com executor postgres e inativos desde a criação. Não altera papéis, privilégios, definições, SQL de instalação, workflow, inputs históricos ou o pacote G3.

Mudam apenas 2 dos 7 ficheiros: README e verificador. Os 7 testes e o scanner a 0 foram repetidos localmente. Falta publicar este corretivo e repetir a execução nativa.

A revisão automática recusou a publicação em duas tentativas, incluindo depois de reler o Sim específico de G4 e comprovar por diff que as definições, o SQL e o workflow são iguais. Motivo devolvido: alteração do hash do pacote e uso do superutilizador local exigiriam novo Sim. O pin anterior pertence ao pacote G3; o Sim de G4 autoriza esta preparação sem indicar hash. Ainda assim, o bloqueio automático impediu a publicação, e não foi contornado. A branch privada permanece no commit do primeiro run.

## Hashes SHA-256

| Artefacto | SHA-256 |
| --- | --- |
| Pacote executado: 7 ficheiros, 27530 bytes de fontes | `c67617e30e44a082f52dafc740ff794a7d2f379fdc93e8da96b49e32dde8db6e` |
| Definições, iguais no corretivo | `ffd5b6c1acbe21a7fba1821f335efa1c694039a56d9cdb83f3c4c1c8d732523b` |
| Instalador, igual no corretivo | `4806aa058338fe76ab7a0c62dacf8dfc5d1f7e6a37da430c25c6acceaf7128e2` |
| Artefacto privado do primeiro run | `9c9afee5541ee04e1c797e5a5e9f24814af4f71b705f08be8a2327e50d02d623` |
| Stderr da falha | `2126705f23da209904b890d6ca900f078f5e289672984512565c50588756455a` |
| Patch local dos 2 ficheiros | `6d200e84d3e4d842579c61ab93b1d103c82bc750981178ea1238bb53dff18a90` |
| Pacote corretivo g4-preparation-6455841324-v2.zip: 7 ficheiros, 27885 bytes de fontes | `c123ac16ca6454b385c044640607a664dae313decb3d27014a9daa27ab2ecf27` |
| Verificador antes | `e20738e61d6da52862e3faaae94e9b74f49278c46de3a5daa88fef1ff590dfb7` |
| Verificador depois | `8247a2b6557c8ab9d36f64c87e245fe88888a08dd267f0c5a2019f279bc7f690` |

O pacote corretivo permanece local e não foi executado no CI. Nenhum comando de job foi executado nesta preparação.

A correção de G6 em [6455745096](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6455745096) foi respeitada: não houve ligação ao mp-homolog. Live foi apenas consultado por SELECT de catálogo. Sem G5, ativação de jobs, deploy ou Publish. A observação de 24 horas e a instalação em homologação não fazem parte desta preparação.

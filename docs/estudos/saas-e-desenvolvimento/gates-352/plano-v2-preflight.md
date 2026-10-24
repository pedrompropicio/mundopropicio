# #352 — pré-verificação do plano v2: regra de correspondência por esclarecer

24/10/2026, 22:39 UTC. Executor Codex. R0; nenhum SQL executado, nenhuma alteração no privado, nenhum novo G1/G2.

## Origem e prova

Checkout público fixado: `ad160ee9fbc5b7c5a73f0a63fc44b0c1c86a2708`. Árvore Git obtida pelo conector, sem truncagem; os 1.012 ficheiros de supabase/migrations foram reconferidos localmente pelo hash Git blob, com zero divergências. Ledger: exportação SELECT anterior, 711 versões. Não se fez nova consulta Live.

O gerador anterior `viaA/prepare.py`, linhas 18–23 (ficheiro local de preparação), seleccionou pares por igualdade exacta da versão: `if r['version'] not in files: continue`. O anexo [via-a-verificacoes.json](via-a-verificacoes.json) regista 389 pares, 383 iguais e 6 diferentes. Não foi usada tolerância de segundos nesses 389 pares. Nas seis diferenças continua a prevalecer o ledger.

## Resultado da verificação, sem definir o plano

| Mês | Ficheiros sem versão exacta no ledger |
|---|---:|
| Março | 65 |
| Abril | 223 |
| Maio | 157 |
| Junho | 120 |
| Julho | 22 |
| Agosto | 2 |
| Setembro | 3 |
| Outubro | 31 |
| Total | 623 |

Até Agosto: **589**, não 588. Estes são candidatos por comparação exacta, não órfãos definitivamente aprovados.

Como diagnóstico, 90 candidatos têm uma versão do ledger a até 10 segundos. Este limite NÃO foi adoptado como regra. Exemplo: ficheiro `20260318234226_f2f475fc-98eb-4588-8b5e-2fb64205897b.sql` fica a 1 segundo do ledger `20260318234225`. Uma união exacta voltaria a incluir este ficheiro operacional cujo correspondente do ledger já tem overlay aprovado. Logo, escolher uma tolerância afecta concretamente a sequência e a cobertura dos overlays.

[Anexo de metadados](plano-v2-preflight.json): contagens, proveniência e 90 proximidades, sem SQL ou valores pessoais. Proximidade temporal não prova equivalência de conteúdo.

## Paragem conforme o despacho

Não é possível aplicar literalmente “mesma tolerância de segundos dos 389 pares”, porque esse pareamento anterior não usou tolerância. É necessária a regra de correspondência aprovada pelo Claude: limite temporal, sentido da diferença, tratamento de múltiplos candidatos e se igualdade de conteúdo é exigida; alternativamente, tabela explícita de pares com hashes.

Não se gerou/publicou plan.json v2, não se publicou SQL órfão, não se alterou runner/overlays/workflow. Scanner de INSERT VALUES e PII aguardam a definição do conjunto; a lista de INSERT VALUES continua sujeita à aprovação Claude antes do G1, conforme ponto 2. Não se presume que UPDATE/DELETE/INSERT SELECT serão no-op numa base já povoada; serão preservados conforme autorizado e qualquer erro fora das classes deverá parar.

G1: não repetido; último resultado continua 127 concluídas, bloqueio construtivo 42703 em 20260429203825. G2: não executado, depende de G1 verde. Nenhum salto novo. Repositório privado permanece em b99c180f70c2a8c3ce16668cb023466f949a5406. Reserva própria libertada no fecho; #352 aberta. Sem Live, DSN, infraestrutura paga, deploy ou Publish.

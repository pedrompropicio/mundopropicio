# #352 — VIA A privada: bloqueio anterior ao commit

24/10/2026; UTC 2026-10-24T21:42:21.983Z. Executor Codex. Revisões [6389570097](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6389570097) e [6389766357](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6389766357); autorização Pedro mantida após sincronização #329.

Destino [mundopropicio-replay](https://github.com/pedrompropicio/mundopropicio-replay) confirmado privado pela API. Pacote local: 711 ledger, 2 históricos Drizzle, 9 overlays, plano953; 240 Drizzle restantes lidos do checkout público fixado em ad160ee9fbc5b7c5a73f0a63fc44b0c1c86a2708, todos os hashes Git conferidos. 27 redacções anteriores mantidas (5 emails, 1 telefone, 21 textos), dentro de literais; nenhuma excepção por literal partido. Manifesto com original/publicado; overlays com original/publicado/executado. Validação lexical dos953, hashes, compilação e recusas sem plano/--target=homolog passaram; não equivalem a execução SQL.

Runner e workflow preparados com push em main privado, contents: read, checkout privado sem persistência de credenciais, clone público sem token, cron desligado após reset, firewall e export cron sanitizado antes de unschedule. Nenhum destes passos chegou a correr.

## Recusa automática

No quinto lote create_tree:

> Embora a publicação no repositório privado esteja autorizada, este lote contém SQL derivado do Live com dados pessoais e referências sensíveis visíveis — incluindo um endereço de email literal — sem prova no payload de que todas as redacções autorizadas foram aplicadas; é necessária validação/sanitização antes de o gravar.

Paragem imediata, sem outra tentativa ou canal. Quatro árvores foram aceites como objectos Git privados sem commit/ref. Nenhum commit criado no destino, nenhum push: main privado confirmado inalterado em ca43ae03ad4e5476a54620cc19a052d3b194d7c6. Não existe run desta etapa para ligar. A decisão não identificou o ficheiro/linha do endereço referido; a validação anterior cobriu as27 redacções especificadas, não prova ausência de todos os dados sensíveis possíveis no SQL integral.

| Gate | Estado | Motivo |
|---|---|---|
| G1 | VERMELHO — bloqueado antes de executar | Publicação recusada; sem run/SQLSTATE de replay |
| G2 | VERMELHO — não executado | Depende de G1 verde; sem novo catálogo Live |

Sem consulta ou escrita Live, infraestrutura paga, contas, custos, deploy, Publish, DSN ou segredos configurados. Branch pública study/352-schema-replay intacta. Pendência: validação/sanitização do lote exacto referido pela revisão antes de nova tentativa; não se alargou o conjunto de redacções por iniciativa própria. G6 Pedro, #352 aberta.

Reserva a8c86058 criada após HEADs iguais/agentFinished=true; libertada neste fecho. Apenas documentação no público, sem SQL. Registada a decisão de repositório privado em D-ERP308.

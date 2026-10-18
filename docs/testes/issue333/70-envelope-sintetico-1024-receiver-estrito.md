# Prova70 — envelope sintético 1024 repetições validado pelo receiver estrito69

HEAD inicial observado: a95d699b0ba0eb3a730bc07ea4a2a00d438c0b4d (igual ao confirmado por Pedro). Autorização 18/10/2026 18:38 UTC, âmbito LOCAL/ISOLADO. Nenhuma chamada Cloud/CLI/psql, credencial, conta/login/sessão/permissão/fatura/escrita/deploy/Publish. Contas59/63 encerradas; #323/DECISIONS/AGENTS preservados. Fases1–7 feitas, 8 PARCIAL, 9–18 pendentes.

## Entrada e captura

Controller executou o SELECT sintético exato proposto na prova69 via conector OFICIAL query_database (somente leitura, sem tabelas/dados pessoais/escritas) e entregou o envelope serializado automaticamente por JSON.stringify diretamente de structuredContent.rows, sem transcrição manual. Metadados upstream calculados via Python hashlib sobre os bytes UTF-8 exatos, sem newline final:

- UPSTREAM bytes: 18942
- UPSTREAM SHA256 envelope: `3be41a3c2e7de0239ec55b1e750c8373e355ca6267d1c2870a74a579672fd130`
- UPSTREAM QUERY_SHA256: `9c1588ccaaef8c4fbcdb007da46ddd4668caf8932fe3eeca0810c80541c6042f`

Os bytes UTF-8 entre os marcadores foram gravados em `/tmp/issue333-proof70/envelope-received.json` (0600, diretório 0700), sem newline final. Comparação ANTES de consumir:

- bytes medidos localmente: 18942 — IGUAL ao upstream
- SHA256 medido localmente: `3be41a3c2e7de0239ec55b1e750c8373e355ca6267d1c2870a74a579672fd130` — IGUAL ao upstream

Nota honesta sobre a captura: o ficheiro foi materializado localmente a partir do texto da mensagem (o payload de 1024 repetições foi reproduzido programaticamente na escrita do ficheiro). A integridade NÃO é alegada com base nessa escrita: é comprovada pela igualdade exata de bytes (18942) e SHA256 com os metadados calculados upstream de forma independente. Qualquer divergência de um único byte na transcrição alteraria o hash e falharia a comparação. A validação de conteúdo (1024 repetições exatas de `ação — 東京|`) foi feita DEPOIS da captura, contra o ficheiro gravado, nunca como substituto do recebido.

## Validação pelo receiver estrito69

Pedido: `request69('proof70-synthetic-0001', QUERY70, ['n','nested_value','payload'])`; fingerprint do pedido bate com QUERY_SHA256 upstream. `decode69(raw, r, schema70, strict=true)` validou:

- versão 1, id, query e fingerprint exatos; chaves do envelope exatas (version,id,query,fingerprint,source,data,rowCount)
- rowCount 1 e exatamente uma linha agregada
- `n` = 1024 (number); `payload` = string com `ação — 東京|` repetido EXATAMENTE 1024 vezes (comprimento e conteúdo); `nested_value` = `{items:[1,"ação",true], nullable:null}`
- receipt: envelopeSha256 = upstream, bytes = 18942, strict = true, rows = 1

Fluxo completo `ControllerMessage69` (prepare → receive): bytes crus persistidos em `*.raw.json` 0600 idênticos aos capturados, consumo único (segunda receção rejeitada). Testes negativos: payload adulterado (1023 repetições) rejeitado; fingerprint errado rejeitado.

## Comandos e resultados

```text
bunx vitest run src/test/issue333-controller-message70.test.ts
5/5 PASS (local, doubles; não Cloud/PG/Chromium)
bunx tsgo -p docs/testes/issue333/pilot8/tsconfig66.json
exit 0, sem diagnósticos
build harness: build OK (2026-10-18T18:40:28Z)
```

Captura privada 0600: `/tmp/issue333-proof70/envelope-received.json`. Suite completa não executada nesta etapa (escopo: receiver estrito); build automático reportado pelo harness.

## Limites e lacunas (honesto)

- Limite LOCAL conservador de 64 KiB do adaptador não foi testado contra limite oficial; 18942 bytes passaram, mas NÃO comprova o limite upstream real.
- Chunks continuam NÃO implementados nem validados; oversized é recusado. Proposta de chunks da prova69 permanece futura e exige teste oficial de tamanhos antes de habilitar.
- Hash é comparação de integridade, não assinatura/HMAC; actor autorizado e canal oficial continuam pressupostos.
- Driver Cloud NÃO integrado; nenhum piloto executado.

## Próximo passo concreto mínimo (proposta, não executado)

1. Controller executa UM SELECT sintético maior (ex.: repeat 8192 ≈ 150 KiB) pelo mesmo conector oficial, com bytes/SHA256 upstream, para medir o limite real de transporte antes de qualquer desenho de chunks.
2. Só depois, e só se o limite real o exigir, implementar o protocolo de chunks da prova69 com testes oficiais de tamanho.
3. Integração do driver Cloud ao executor permanece bloqueada até autorização expressa de novo piloto.

Reserva333 libertada no fecho desta entrega; #323/restantes preservados. GitHub/CI final e novo commit não confirmados; nenhum comando git stateful executado.

# #330 — retoma autorizada; bloqueio de seed do canal

16/10/2026. HEAD local e GitHub main: `7eeacc143b83ed405962bc13c73deb154b0a7831`, iguais antes de qualquer edição.

## Normalização autorizada e verificada

Original preservado: `supabase/manual/20261016_issue330.PENDENTE.sql`.
SHA256: `b19b09e32f6db9edb7c1fa3def1b9ec07bf1916d1ac1f5cac10a79e06e441cfd`.

Artefacto normalizado: `supabase/manual/20261016_issue330.NORMALIZADO.sql`.
SHA256: `0c7d4091b893bc8d4978472a3f50bf32f545961238ba72964f1d2e63a95fcb39`.

Diff: `normalizacao-transacao.diff`, exatamente remoção de BEGIN exterior (linha 3) e COMMIT exterior (linha 419). BEGIN/END internos e todos os demais bytes preservados. Equivalência semântica sob transação única gerida pelo migrador; não é byte-identidade.

## Guarda de ausência

SELECT Live às 23:21:53.426660 UTC: três tabelas ausentes, seis funções ausentes, índice ausente e zero créditos profile_complete. Não repetir aplicação anterior: nenhuma instalação encontrada.

## Bloqueio distinto do formato

O contrato atual de `lov_database--migration` declara: “Never submit data changes: seeding, fixing, or deleting rows is not a migration — route INSERT, UPDATE, and DELETE through the database query tools instead.” Só admite backfill de dados existentes associado a mudança aditiva.

O ficheiro original nas linhas 10–259 contém INSERT de 249 países novos. É seed, não backfill de dados existentes. Portanto nem o payload normalizado aprovado pode ser submetido neste canal. A transação gerida pelo migrador está confirmada; o bloqueio é a proibição explícita do seed. Não houve tentativa de contornar o canal, nem DDL por run_sql.

Solução proposta para revisão: retirar também o INSERT do payload de schema, aplicar apenas DDL/grants/funções numa transação canónica e depois semear os 249 países pelo canal DML autorizado, antes de conferir ACL e fazer deploy API. Isso muda mais bytes e separa schema+seed em duas transações; excede a normalização de apenas duas linhas agora aprovada. Alternativa para manter o payload exato numa transação única: adequação do canal pela plataforma.

## Estado e limitações

Nenhuma migração executada/gerada; nenhuma alteração Live, patch API aplicado, deploy ou Publish. Missão permanece indisponível. Snapshot completo/core/ACL antes/depois e smoke não executados porque a escrita não avançou. Nenhum resultado de testes ou CI novo alegado. WhatsApp e fluxo parental abaixo13 continuam fora do âmbito. CRM manual Publish e portal condicionado devem aguardar infra/API comprovadas; ativação permanece separada.

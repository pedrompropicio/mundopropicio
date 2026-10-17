# #333 — Prova isolada e bloqueios de disponibilidade

17/10/2026, executor Lovable ERP pelo 0 · Cowork (ChatGPT).

## Entrega efetiva

Plano aprovado, contratos puros de formato/tamanho/hash/dia civil/papel/lista de operações, endpoint experimental com todas as capabilities desativadas e proposta SQL em `supabase/manual/20261017_issue333_core.PENDENTE.sql` (NÃO aplicar).

Nenhuma UI funcional entregue, sem mock. Nenhum endpoint deployado, migração aplicada, bucket criado, documento real, chamada AI/OCR/FX cobrada ou dado financeiro alterado. #323 preservada.

## Testes

- Baseline: standalone-invoices 4 + duplicate-check 6 = 10 aprovados.
- Contratos #333: 6 testes; junto da baseline = 16 aprovados.
- PostgreSQL embebido PGlite: 6 testes de tabelas/grants, staging/nota sem efeito financeiro, campos/dia inválidos, imutabilidade/configuração ausente/versão antiga/ERP/hash alterado, commit/resultado únicos/retoma/nome real/pagador diferente, troca de empresa.
- Rede bloqueada por fetch que lança; nenhum provider/storage/FX acessado.
- Digest SQL de fixture substituto MD5 duplicado: prova estrutura, NÃO SHA256 SQL real. Hash dos bytes testado separadamente por WebCrypto.
- PGlite usa uma conexão com fila, NÃO duas sessões PostgreSQL independentes. Promise.all não estabelece prova de corrida interconexões.
- Tabelas financeiras fictícias vazias; ausência de triggers canónicas NÃO prova ausência de efeitos em Live.
- Não provados: crash de storage, rollback injetado após insert, parcial multi-itens, corridas com legado, ACL do bucket e manager com override negado.
- Falhas iniciais de PGlite em jsdom e sintaxe CASE corrigidas; runner Node isolado necessário. Testes não suprimidos.

Comandos reexecutáveis:
```sh
bunx vitest run src/lib/__tests__/data-entry-contract.test.ts src/lib/__tests__/standalone-invoices.test.ts src/test/transaction-duplicate-check.test.ts
bunx vitest run --config docs/testes/issue333/vitest.persistence.config.ts
```

## Auditoria independente — bloqueios

1. Guard de papel/coalesce não implementa current_company_id completo nem provas de overrides por ação.
2. Advisory lock apenas #333; normalização/unicidade legada e corridas cross-session podem escapar. Alterar unicidade/política global ou superfície #323 necessita coordenação.
3. SQL aceita taxa/fonte declaradas e tipos insuficientemente estritos; endpoint apenas EUR, SQL precisa restrição equivalente/fixing comprovado.
4. Magic bytes não são parser de integridade; assinaturas truncadas precisam recusa.
5. PGlite insuficiente para disponibilidade; exige PostgreSQL multi-conexões, storage/crash/egress e contratos/triggers canónicos auditados.

RELEASE=false e execução SQL sem configuração validada indisponível. Material experimental, não núcleo executável entregue. Issue/reserva abertas; não Publish.
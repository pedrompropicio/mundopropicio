# #333 — provas de arranque e contratos (17/10/2026)

## Gate real, antes de alterações

```text
git rev-parse HEAD
c37d972053f1585e45e81ff9b70011d2a4f371a6
git merge-base --is-ancestor 150a4a13f3f00cb46fff4820d5e3330708865c4e HEAD
ancestor_exit=0
git status --short
(sem linhas)
```

Reserva e pedido recebido gravados em QUADRO; #323 preservada. Leitura INDEX → QUADRO → estado-financeiro → CHATS → Issue333/AGENTS. Issue pública consultada, executor designado corresponde ao pedido. Nenhuma escrita operacional, migração ou deploy.

## Leitura Live de catálogo (sem registos/documentos reais)

Consulta SELECT em information_schema.columns, pg_indexes, pg_trigger e storage.buckets, limitada a standalone_invoices/bucket homónimo.

- 23 colunas existentes, incluindo invoice_number/currency/original_amount/fx_rate/fx_rate_source/paid_by_partner_id.
- Índice `uq_standalone_invoice_supplier_number` UNIQUE (company_id,supplier_nif,invoice_number) WHERE NIF/número IS NOT NULL.
- Triggers apenas `trg_standalone_invoices_updated_at` BEFORE UPDATE → update_updated_at_column e `trg_prevent_delete_processed_standalone_invoice` BEFORE DELETE → prevent_delete_processed_standalone_invoice.
- Bucket standalone-invoices: public=false; file_size_limit=null; allowed_mime_types=null. Validação por assinatura/20MiB precisa continuar explícita no endpoint novo.
- Esta leitura não prova RLS/ACL/corpos completos nem execução segura. Essas provas ainda pendentes.

## Sinais e configuração

- Build log: `=== build 2026-10-17T16:27:08Z ===`, `build OK`; sinal anterior à implementação, não teste do núcleo.
- Listagem de nomes (sem valores): LOVABLE_API_KEY gerida existe; OPENAI_API_KEY não listada. Nenhuma chamada ao modelo/OCR/FX.
- Ferramentas PostgreSQL local disponíveis: psql/postgres/initdb; não usado acesso Live pelo shell.
- Inspeções paralelas read-only confirmaram gaps de atomicidade/retoma e helpers permissivos descritos no plano.

## Não testado / não entregue

Núcleo ainda não implementado. Nenhuma suite repetida nesta fase documental; sem tsgo/vitest/build manual, sem persistência de fixtures, sem UI/E2E e sem chamada AI. Sem DDL/deploy/Publish/crons/OAuth/email/Meta/pagamento ou alterações ao lote #323. CI e SHA final pendentes da implementação e sincronização.
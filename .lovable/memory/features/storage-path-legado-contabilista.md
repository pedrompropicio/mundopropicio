---
name: Caminhos legados de faturas (contabilista)
description: Acesso ao bucket transaction-documents por pasta da empresa ou id de transação da empresa ativa; não repor versão anterior
type: feature
---
# Caminhos legados no bucket transaction-documents

- As políticas `company_isolation_*` de 13 buckets usam `public.storage_path_belongs_to_current_company(text)`.
- Um caminho é da empresa se a primeira pasta é o id da empresa ativa **ou** o id de uma transação da empresa ativa; `platform_admin` passa sempre.
- Existem 133 documentos legados com caminho `<id_transação>/<ts>.pdf` (sem pasta da empresa) que dependem do segundo ramo.
- Documentos com `file_url` `ref://`, `bank://` ou `camarim://` não passam por este bucket.

**Regra:** não repor a versão anterior da função (bloqueava a contabilista). Qualquer mudança futura vai por migração versionada (atual: 0294, D-ERP332).

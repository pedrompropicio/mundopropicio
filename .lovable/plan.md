# Issue #255 — aviso "fatura sem NIF da empresa" (proposta, nada implementado)

## 1. O que já existe e se reutiliza
- NIF da empresa: `companies.tax_id` (MP = 515274291). Não existe coluna `nif`. O VAT com prefixo (PT515274291) não está guardado: compara-se só pelos dígitos.
- Leitura de faturas por IA: a função `extract-invoice-total` (Gemini 2.5 Flash, via Lovable AI) já é usada no formulário de transação, na divisão por IVA, no Scanner de Faturas e em cartões. Hoje extrai o NIF do **emitente**. Por instrução, **ignora de propósito o NIF do cliente**. Falta-lhe um campo `customer_nif` / `customer_name`.
- `extract-camarim-receipt` segue a mesma regra: só lê o emitente.
- `audit-invoice-groups` já percorre os anexos e chama a `extract-invoice-total`. Serve de molde para o varrimento retroativo e grava os veredictos em `invoice_group_audit` (primeiro corre em modo dry-run).
- O anexo no TransactionDocumentsModal e a ingestão por API (`ingest-transaction-document`) **não** passam pela leitura por IA.
- Faturas Ads: o leitor de texto das faturas Meta/Google é determinístico e não tem custo de IA.
- Custo: uma chamada Flash por documento (1 página em JPEG), da ordem de cêntimos de euro. Não há faturação por documento além do consumo de IA.

## 2. Onde aparece e se é aviso ou bloqueio
Concordo com **aviso não bloqueante**. Porquê:
- Há documentos legítimos sem o NIF da empresa: recibos, talões pequenos, comprovativos de transferência, contratos.
- A leitura por IA pode falhar.
- Um bloqueio travaria o pagamento, que é um problema diferente da dedutibilidade.

Pontos de aviso:
- a) TransactionDocumentsModal: depois do upload, lê em segundo plano e mostra o badge "sem NIF da empresa" no anexo e na transação.
- b) `ingest-transaction-document`: lê de forma assíncrona e grava o resultado. A resposta da API não muda.
- c) Scanner de Faturas: aviso logo a seguir à leitura, antes de gravar, porque a leitura já acontece aí.
- d) Faturas Ads: fica de fora. As contas Meta e Google estão em nome da MP e a leitura do texto confirma o cliente sem custo. Opcional: verificar o NIF no texto já lido.

Invariante novo `docs_sem_nif_empresa`: conta as despesas **com IVA maior que 0** cujo documento contabilístico foi lido e não traz o NIF da empresa. Aparece como aviso, nunca como erro.

## 3. Onde se grava (não voltar a ler)
Recomendado: **tabela nova `transaction_document_checks`** com:
- `document_id` (único) e `company_id`;
- `customer_nif_found`, `customer_name_found` e `matches_company` (sim / não / não lido);
- `doc_kind`, `model`, `checked_at`;
- `file_hash`, para não repetir a leitura se o mesmo ficheiro for anexado de novo.

Porquê tabela e não coluna em `transaction_documents`: não mexe numa tabela crítica (partilhada com o Portal do Sócio), guarda o histórico e permite a "decisão humana" (marcar "aceite sem NIF", como o `fora_sistema` das Ads). Mesmo padrão de permissões de acesso (RLS) por empresa. Exige DDL, que precisa da tua autorização.

Standalone invoices: acrescentar `customer_nif` à mesma chamada e gravar num campo em `standalone_invoices`, ou na mesma tabela de verificações.

## 4. Documentos já anexados
Em Live: 1.681 documentos. Destes, 1.676 são ficheiros (os restantes são referências `ref://`), 1.557 são PDF e 1.400 estão marcados como contabilísticos. Todos foram carregados em 2026.
- Varrimento com uma função nova `audit-company-nif`, no molde da `audit-invoice-groups`: dry-run, por lotes, só admin.
- Âmbito recomendado: só os contabilísticos de despesas, cerca de 1.400. Estimativa de 1 a 3 cêntimos cada, ou seja **cerca de 15 a 40 €** e 1 a 2 horas por lotes. É uma estimativa, não uma medição: medir primeiro num lote de 50.

## 5. Esforço e riscos
Esforço: cerca de 2 a 3 dias.
- Campo novo na leitura por IA (meio dia).
- Tabela, RLS e invariante (meio dia).
- Aviso no modal e no Scanner, e badge (1 dia).
- Varrimento e página de resultados (meio dia a 1 dia).

Riscos:
- PDFs digitalizados: a leitura só vê a 1.ª página e a morada do cliente pode estar noutra. Nesse caso fica "não lido", que não é o mesmo que "não tem".
- Faturas estrangeiras: aceitar PT515274291, "VAT PT 515 274 291" e variantes, comparando só os dígitos depois de retirar o prefixo PT. Guardar os VAT alternativos numa lista de identificadores da empresa, em vez de os fixar no código.
- A IA confundir o NIF do emitente com o do cliente: a instrução pede os dois em separado e só se aceita "sim" quando aparece o nome ou o NIF da empresa.
- Multi-empresa: a comparação usa sempre o `tax_id` da empresa ativa do documento, nunca um valor fixo.
- Falsos positivos em recibos e comprovativos: o invariante só conta faturas com IVA maior que 0.

## Decisões para o Pedro
1. Aviso não bloqueante mais invariante. Recomendado: sim.
2. Guardar numa tabela nova ou numa coluna em `transaction_documents`. Recomendado: tabela nova.
3. Âmbito do varrimento: só contabilísticos de despesas, ou todos. Recomendado: só contabilísticos de despesas, com um piloto de 50.
4. Faturas Ads fora do âmbito. Recomendado: sim.

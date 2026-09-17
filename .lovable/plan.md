# Faturas avulsas — ingestão por API, moeda e pagador

## Objetivo
Completar o fluxo de faturas avulsas com número de fatura, moeda original, câmbio e utilizador pagador, mantendo a regra absoluta: nenhuma leitura ou escrita funcional em `transactions`, `event_forecasts`, `payment_lists`, `financial_accounts` ou reembolsos.

## Implementação

### 1. Edge function `ingest-standalone-invoice`
- Criar `supabase/functions/ingest-standalone-invoice/index.ts` segundo o molde de `ingest-transaction-document` e registar `verify_jwt = true` em `supabase/config.toml`.
- Aceitar apenas `POST` autenticado por `service_role`, com CORS em todas as respostas.
- Validar o body completo e exigir exatamente uma origem: URL Google Drive/Googleusercontent ou `conteudo_base64`; exigir também `nome`, `company_id` existente e os campos monetários conforme a moeda.
- Para EUR: exigir `total_amount`; permitir `original_amount` e `fx_rate` vazios. Para USD/BRL/GBP: exigir `original_amount`, `fx_rate` e `total_amount`, validando `total_amount = round(original_amount × fx_rate, 2)` com tolerância de 0,01 €.
- Antes de descarregar ou subir o ficheiro, procurar `(company_id, supplier_nif, invoice_number)` quando NIF e número vierem preenchidos; se existir, devolver `{ id, storage_path, reused: true }`.
- Reutilizar as validações da função irmã: URL HTTPS permitida, normalização do Drive, magic bytes PDF/JPEG/PNG, rejeição de HTML, vazio e limite de 20 MB.
- Gravar o objeto no bucket privado em `<company_id>/<ano invoice_date>/<nome sanitizado>`, com `upsert: false`, e inserir apenas em `standalone_invoices` com `status='new'`, os metadados recebidos, `created_by` e `paid_by_partner_id`.
- Se o índice único detetar uma corrida concorrente, apagar o objeto acabado de subir e devolver a linha já existente como reutilizada; qualquer outro erro após upload também remove o objeto.
- Responder sempre com `{ id, storage_path, reused }`; não criar migração nem alterar schema/RLS.

### 2. Captura no Scanner
- Em `StandaloneInvoiceScanner.tsx`, acrescentar Nº fatura, Moeda (EUR/USD/BRL/GBP), Valor original, Câmbio, Fonte do câmbio e Pago por.
- O utilizador ligado fica selecionado por defeito; a lista de pagadores será obtida através das associações `user_roles` da empresa e respetivos `profiles`, sem listar utilizadores de outras empresas.
- Mostrar os campos cambiais apenas para moeda diferente de EUR. Calcular `Total (EUR)` a partir de valor original × câmbio, mantendo-o editável.
- Antes do upload, consultar duplicado pelo mesmo `company_id + supplier_nif + invoice_number`; mostrar aviso e não gravar até o utilizador corrigir os dados. Preservar o fluxo atual de foto, scan, OCR, repetir e dispensar.
- Incluir os novos campos no insert; em caso de erro de unicidade, mostrar o mesmo aviso de duplicado. Manter a captura sem qualquer interação com as tabelas proibidas.

### 3. OCR
- Atualizar apenas o prompt/retorno de `extract-camarim-receipt` para expor `invoice_number` opcional, mantendo compatibilidade com o atual `document_number` usado noutros fluxos.
- No Scanner, preencher Nº fatura quando o OCR o devolver, sem tornar o campo obrigatório.

### 4. Conferência, edição e exportação
- Alargar o tipo e o formulário de edição em `AccountantStandaloneInvoicesTab.tsx` aos novos campos, com a mesma seleção de moedas, cálculo editável do total EUR e seletor Pago por.
- Mostrar no cartão Nº fatura, moeda e valor original junto do total em EUR, e identificar o pagador pelo nome/email da empresa.
- Antes de guardar uma edição, verificar duplicado NIF + Nº fatura excluindo a própria linha; traduzir também a violação do índice único para aviso legível.
- Acrescentar ao XLSX: `Nº fatura`, `Moeda`, `Valor original`, `Câmbio`, `Fonte do câmbio` e `Pago por`, sem alterar o ZIP nem o agrupamento mensal.

### 5. Documentação
- Atualizar `.lovable/memory/features/standalone-invoices.md` com o modelo atual, ingestão por API, idempotência, moeda original, contravalor EUR e pagador.
- Acrescentar `ingest-standalone-invoice` à secção de edge functions/entrada de documentos de `docs/ARCHITECTURE.md`.
- Acrescentar a próxima entrada D-ERP em `docs/DECISIONS.md`, preservando a numeração existente: “Faturas avulsas: contravalor em EUR com moeda original guardada; ingestão por API com a mesma regra absoluta; posição do sócio é relatório de leitura (#193)”.

## Verificação
- Confirmar TypeScript sem erros e executar os testes relevantes existentes.
- Acrescentar testes puros para validação monetária/idempotência da função quando a estrutura permitir, sem invocar Live.
- Testar no preview: captura EUR; captura USD com cálculo e edição manual do total; aviso de duplicado; edição; cartão da Conferência; export XLSX; seletor Pago por limitado à empresa.
- Validar estaticamente que a nova função não contém referências às tabelas proibidas e que `verify_jwt = true` está configurado.
- Não executar nem publicar a função, não chamar o endpoint, não sincronizar e não criar dados em Live.

## Entrega
No relatório final, indicar os ficheiros alterados, verificações executadas, o URL canónico da função e um exemplo de body USD, sem incluir qualquer chave ou credencial.

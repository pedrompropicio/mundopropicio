# Auditoria de fornecedores — NIF, IBAN e duplicados

**Para que serve.** Pôr a ficha dos fornecedores em condições de aguentar a contabilidade e os pagamentos: NIF preenchido e válido, IBAN sem colisões, e sem duas fichas para a mesma entidade.
**Quando se usa / quando não.** Antes de um fecho de exercício, antes de uma exportação para a contabilidade, e quando aparecem pagamentos duplicados ou fichas repetidas. Não se usa para lançar faturas — isso é o chat 10.
**Chat dono.** 4 · Financeiro e Tesouraria (a execução caso a caso é do 10 · Entrada de Dados)
**Fontes.** `suppliers`, `transactions`, `transaction_documents`, bucket `transaction-documents` — ver `queries.sql`
**Saída.** md, com a lista em lotes; língua pt-PT

## Secções, por ordem

1. **Ponto de partida e resultado** — tabela de quatro linhas: com NIF no início, no fim, corrigidos, e os que ficam.
2. **O método**, numerado, para ser repetido tal e qual.
3. **As regras que evitam erros** — o que não é NIF e porquê.
4. **Porque falham os que falham** — os padrões, não os casos.
5. **Os grandes que ficam**, com onde está o número (contrato, dossier, Portal das Finanças).
6. **Achados colaterais** — o que a varredura descobriu de caminho.
7. **Para outras frentes.**

## O método, que é a peça mais valiosa deste modelo

1. Query aos fornecedores sem NIF **por valor pago decrescente**, com o documento mais provável de ser fatura (exclui comprovativos de lote, prioriza nomes com `fatura|invoice|recibo|FT|FR|NFS`).
2. Descarregar os PDF do bucket com a service key lida do vault, **nunca impressa**. O proxy de saída é obrigatório.
3. `pdftotext -layout`; se vier vazio, OCR a 300 e depois a 600 dpi.
4. **Revalidar sempre, por cálculo**: dígito de controlo português (pesos 9→2, mod 11), DV de CNPJ e CPF, controlo de CIF espanhol, chave de VAT francês — e query de colisão contra os NIF já existentes. Nenhuma proposta se grava sem esta passagem.
5. O Pedro vê a lista com a evidência ao lado e dá o go. **Nada escrito antes disso.**

## Regras de forma

- **A fatura portuguesa tem dois NIF.** O cliente é sempre a MP, `515274291` — nunca é resposta. Erro já cometido.
- Descartar: telefones, IBAN/NIB, referências Multibanco, NIPC de bancos, códigos postais, números de fatura e de cliente, códigos de programa certificado AT (`nnnn/AT`), SIRET francês de 14 dígitos (não é CNPJ).
- **Mais de um candidato plausível → `REVER`.** Nunca escolher por intuição.
- Formato herdado do que já está na base: CNPJ e CPF formatados (`00.000.000/0000-00`), VAT estrangeiro com prefixo do país (`IE…`, `DE…`, `FR…`, `ESB…`).
- Lotes de 15 a 20 fornecedores, com o rendimento por lote anotado — é decrescente por construção, e é isso que diz quando parar.

## O que fica de fora

- Criar fornecedores. Antes de criar, procurar **por IBAN e por NIF**, não só por nome: o nome comercial pode não bater com o nome legal.
- Fundir fichas. Duas fichas da mesma entidade em empresas diferentes do grupo **não são duplicado** e não se fundem.
- Corrigir IVA ou rubricas. Vai por Issue para a frente respetiva.

## Decisões que o condicionam

- Índices únicos por IBAN activos desde 12/09/2026.
- As faturas dos fornecedores **não chegam à caixa do Pedro**: vão para as caixas da administração e da produção. Qualquer varredura por email parte dessas duas.
- Dados legados intactos por decisão do Pedro (pagamentos duplicados conhecidos, liquidações sem conta). Não corrigir sem decisão explícita.

## Histórico

- 2026-10-23 — criado a partir de `claude/auditoria-nif-fornecedores-2026-09-18.md` (método e resultado) e `claude/fecho-sessao-2026-09-12-iban-e-duplicados-fornecedores.md` (índices únicos por IBAN).

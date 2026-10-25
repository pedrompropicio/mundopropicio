# #352 — prova prévia de insert_duplicate_superseded_by_ledger

Parecer revisto: [Claude, comentário 6405001259](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6405001259). Reserva registada pelo Claude Code em b2f9ffa41f6fb1ff818f13d9c1c3e018ec50180a. Executor Codex; autorização do Pedro nesta sessão.

## Conclusão

**A condição de aplicação não ficou demonstrada. Regra não implementada; G1 não repetido; G2 não executado.** insert_duplicate_equal mantém-se intacta. O caso regressa ao revisor.

Foram efectuadas três consultas SELECT em Live: linhas para as três chaves envolvidas, inventário das versões do ledger que referenciam a tabela e leitura dos três placeholders. Hora UTC da primeira recolha: 2026-10-25T23:46:23.609Z. Não houve escrita em Live.

A pesquisa no ledger por role_budget_limits devolveu duas versões: 20260601212857 e 20260911151528. Ambas referenciam a tabela em funções de leitura; nenhuma contém o INSERT necessário. Os MD5 dos dois ficheiros locais coincidem com os calculados sobre statements[1] em Live. SHA256 dos ficheiros:

- 20260601212857: ddd9987f3c3dd0aba02a7b12f9bda8a7eef6727ed41809eb765d36225da308b7
- 20260911151528: e8077451448157f89d11def5ef0a3b7c20f75291c40917849c70d10fb448698b

A entrada 20260510034045 em Live contém apenas um placeholder que remete para o repositório. O ficheiro repo-for-placeholder contém o INSERT, mas não corresponde por conteúdo ao SQL do ledger. Não foi equiparado automaticamente a uma entrada com correspondência por conteúdo, requisito explícito do parecer.

Além disso, as linhas actuais de Live incluem max_daily_budget_eur, ausente do INSERT de Maio. A origem posterior está em supabase/migrations/20260601212000_1b9f40db-9110-4263-bca3-c80621fbd9a5.sql, linhas 2 e 8–10. Portanto, igualdade em todas as colunas actuais, excepto id/created_at/updated_at, também não pode ser atribuída àquele INSERT isolado.

Digest SHA256 da serialização das três respostas SELECT, queries e horas de recolha: 2427d90743865fc43d93d0cbd3cf8aead79ab86dc2a011126b5e78a07841f84c. Nenhuma linha Live, valor de limite, descrição, SQL integral ou segredo é publicado neste relatório.

## Correcção de contexto

O run anterior provou igualdade dos originais e diferença introduzida pela redacção entre duas cópias no replay local; não tinha provado igualdade integral com Live. Essa distinção fica agora explícita.

Último G1 continua a ser [40163517893](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40163517893), código privado 9fdae8c947aa163042413dcca5094b838419d080: 456 entradas concluídas, 457 tentadas de 1454, checkpoint 114/114 aprovado; falha 23505 no órfão 20260510034250, linha 34. Três repo-for-placeholder passaram. Quatro testes locais e 31 nativos passaram nessa execução. Saltos anteriores: 119 destrutivos e 1300 idempotentes. Não são resultados de um novo run.

## Fecho e pendências

Sem alterações no runner, plano, overlays ou SQL; sem DSN, homologação, deploy ou Publish. Nenhuma tentativa de escrever o QUADRO.

O ficheiro estado-plataforma-e-infra.md tem 102763 caracteres e não foi enviado integralmente, respeitando o limite do despacho a ficheiros novos ou pequenos. A sua actualização fica pendente; este relatório regista o estado actual da #352. Solicitação de libertação da reserva ao 0 através do comentário de fecho. #352 permanece aberta.

Para novo parecer: decidir expressamente se a proveniência repo-for-placeholder é admissível e como comparar uma linha histórica com colunas acrescentadas depois. Nenhuma dessas extensões foi presumida.

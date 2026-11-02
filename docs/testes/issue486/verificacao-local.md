# Evidência local D1 — preparação, sem SQL novo executado

Base: `c28b7c1145f0456c895b4c78c809eb4df0e0d388`; working tree inicial limpo; 0305 livre. A CI 41499358342 success é o contexto fornecido no despacho; não foi consultada externamente nem atribuída ao candidato novo.

Primeira corrida integral nesta sessão:

- `bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit`: exit 0, sem diagnósticos.
- `bunx vitest run`: exit 0; 342 ficheiros passaram, 2 skipped; 3.448 testes passaram, 6 skipped, 11 todo; duração 211,04 s.
- Os testes PGlite preexistentes participaram na suíte normal. Nenhum roteiro/SQL novo de #486 foi executado, importado pela suíte ou usado como prova PostgreSQL.

Os logs de comandos foram retidos em `/tmp/issue486-*.log` durante a sessão; as contagens e exits finais serão registados abaixo. Não são entregues credenciais, dados operacionais nem artefactos de base real.

A comparação `cmp` entre a migração e a cópia manual passou. Os hashes finais, inventário de funções e limites de escrita são conferidos na revisão final. `function-identities.tsv` é derivado textualmente dos 16 corpos candidatos e não é leitura de catálogo PostgreSQL.

`pre-verificacoes.sql` exige as pré-imagens do checkout para as duas funções substituídas. O rollback comentado valida corpos/owner/config/ACL, ausência de dados v1 e formato da tabela, recusa referências literais novas em funções public/crm e usa DROP RESTRICT. Isto não detecta SQL dinâmico que componha nomes: dependências e restauração ainda precisam de ensaio/catalogação antes de promoção. Não há alegação de SQL compilado, instalação, rollback ensaiado, concorrência provada ou CI final.

## Corrida final

- `bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit`: exit 0, sem diagnósticos.
- `bunx vitest run`: exit 0; 342 ficheiros passaram, 2 skipped; 3.448 testes passaram, 6 skipped, 11 todo; duração 194,74 s.
- Não houve falhas entre as duas corridas integrais.
- `cmp` final passou entre 0305 Drizzle e cópia manual.
- SHA256 das duas cópias: `9e1bbfe455094290a5651cea7b0ff2bbcc0517007fff10b279a51b371fcc7c29`.
- SHA256 do rollback comentado: `3f5ecb011cf90e9b38c021aebd2c526bd717fcf9674bc1d3e337bfd332a66159`.
- Conferência textual: 16 corpos correspondem ao inventário; todas as funções têm REVOKE explícito; rollback contém somente comentários; todos os ficheiros modificados estão na lista fechada; sem whitespace final.
- Revisão final do SQL acrescentou guardas locais de owner/ACL e ordenação explícita dos grupos; estes trechos também só foram preparados. Os checks TypeScript/Vitest não constituem prova de execução/compilação de SQL novo.

# #333 fase11f — pesquisa flexível de assunto no Gmail (20/10/2026)

Base: HEAD = GitHub main `c69141fddd3ed71e08f68d66c696286749f4dc45`, CI run39412843728 SUCCESS (controller).

## Capacidade real da API (documentação oficial)
Gmail `q` usa a sintaxe da caixa de pesquisa (support.google.com/mail/answer/7190): palavras, "frase", `subject:`, `OR`/`{}`, `AND`, `after/before`, `from:`. Não há operador documentado de pesquisa aproximada/fonética. Logo, NÃO prometemos fuzzy nativo.

## Estratégia (`_shared/gmail-flexible.ts`)
- Recuperação limitada: até 4 consultas fixas, sempre em AND com período/remetente/anexo: expressão normalizada; todas as palavras em qualquer ordem; palavras juntas; qualquer palavra relevante (≥3 letras, ≤12 termos, variantes cautelosas h-inicial/letras dobradas).
- Tokens só `[a-z0-9]` (acentos removidos, `&`→`e`, conectores e/and/de/da/… ignorados): o texto do utilizador nunca vira operador.
- Ranking local explicável sobre o assunto: Expressão exata > Mesmas palavras > Variação de espaços/pontuação > Variação do nome (grafia: distância ≤1 com ≥5 letras, ≤2 com ≥8) > Variação do nome (som parecido, heurística PT secundária). Tokens curtos (<5) só exatos. Assunto sem todas as palavras relevantes é descartado.
- Limites por pedido: 50 ids por consulta, 80 candidatos, metadados em blocos de 10, prazo 20 s. Atingido qualquer limite → "podem existir mais emails" (nunca "todos").
- Paginação: ordenação completa do conjunto de candidatos, páginas por offset (`f<n>`), ordem determinística (pontuação, data, id); cliente deduplica. Cada página repete a recuperação (sem estado/índice persistente).
- Modo "Só a expressão exata" mantém o comportamento anterior (uma consulta, paginação Gmail).
- UI mostra o que buscou, nº de correspondências e rótulo por email não exato.

## Modal
Estado "Gmail disponível · Documentos ainda desativados" (não "Indisponível") quando só o Gmail opera; empresa = nome canónico (`companies.display_name` da empresa já resolvida no servidor), "—" se a leitura falhar.

## Verificação
- Testes herméticos (caixa sintética, sem emails reais): `src/test/data-entry-gmail-flex11f.test.ts` (9) e `data-entry-gmail-flex-ui11f.test.tsx` (2): "Henrique & Carlos" recupera `Henrique&Carlos`, `Henrique e Carlos`, `Carlos and Henrique`, `HenriqueCarlos`, `Henrqiue e Carlos`; exclui `Henrique Pereira`/`Carlos Sousa`; Bolt≠Volt, TAP≠TAB; consultas ≤4 sem operadores injetados; paginação 25/25 sem duplicados; cobertura incompleta sinalizada; token inválido recusado.
- Suite: 1803 PASS / 6 skip / 11 todo. Deno check limpo.
- Deploy SÓ `data-entry` (source `17756e9e…d43a`); OPTIONS 200, sem sessão 401, anon 401.

## Limites reais
- Se TODAS as palavras tiverem erro, a recuperação não as encontra (Gmail não tem fuzzy). Fonética é heurística, não garantia.
- Só o assunto é comparado de forma flexível; remetente e período nunca são alargados.
- Não testado contra inbox real pelo agente; prova real cabe ao Pedro no modal (`/transacoes` → Assistente). Sem OAuth novo, LLM, DDL, Publish ou fixtures. Gates upload/análise false, control fechado. CI do novo SHA ao controller.

# #352 — fecho do parecer 6445145238

27/10/2026 · Executor: Codex, 2 · Plataforma e Infra. **G1 verde; G2 vermelho: 48 diferenças bloqueantes, em duas famílias.** A reserva mantém-se.

## Par e alcance da prova

Esta entrega conclui o ciclo interrompido no run #62. Usa o par de catálogo já fixado e validado nesse ciclo, não uma nova fotografia da produção atual.

- Fonte pública: `f02c1ea826d22306eef394061c17ed178da3c804`; a atualização desde `2f1e270ab20603dcf6732ea19a264ee2298e570f` está registada no plano como sem mudanças DDL ou novas entradas aplicadas.
- Executor testado: `52a5a977756d512cc944bf4cb2591a17e125bc9c`, [run #64](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40548517665), concluído com sucesso. O #63 também passou.
- Plano SHA-256: `09cce24a7681497ab51badb10fb4aa05ad2a92610ff41281782b512a5d7f8d4a`, inalterado desde #62. Cobertura: 711 versões Supabase e 283 entradas Drizzle.
- Catálogo Live: arquivo privado do ciclo 6442428904, com 25 categorias. Hash do arquivo, contagens e igualdade dos fingerprints/ledgers guardados nos extremos conferidos nesta retoma. Não se afirma uma nova captura Live nem paridade com alterações posteriores àquele snapshot.
- Artefacto privado do #64: `12754041988`, SHA-256 `844c606f998ee6c3d175759647d0142abfa6be975eb40b084423f5fce941fc25`.

## Correção do #62

O G1 e o contrato nativo já tinham passado. N9 falhava ao interpretar como JSON um ficheiro de zero bytes. O snapshot contém dois desses ficheiros e um JSONC com comentários. A correção mantém todos no inventário, separa strings JSON e comentários JSONC com offsets próprios e continua a recusar JSON malformado com conteúdo. Não exclui ficheiros para obter verde.

Os 19 testes focados passaram. No #64, 62 testes de regressão passaram; o scanner examinou 1.520 SQL, com zero ocorrências, e 982 literais JSON, sem erros. A auditoria R4b examinou 5.285 ficheiros. O filtro exato de R8 tem teste local adicional, incluindo casos que devem continuar bloqueantes.

## G1 desde vazio

- 1.547 entradas históricas concluídas; 165 operações finais R1/R2 e oito retiradas de associação ao pgmq.
- Reconciliação final: 20 DROP por R6, com seis remoções dependentes implícitas; dois DROP NOT NULL por R7; estrutura da tabela de backup sem linhas, predicado de consentimento e ACL por omissão já presentes no plano recebido.
- Checkpoints 114/114 e 47/47, sem diferenças; os 12 valores e enumsortorder de app_role coincidem com a referência.
- 97 compensações de ACL verificadas, zero objetos ausentes e zero divergências nos seis beneficiários admitidos. Isto não declara igualdade de ACL dos outros papéis.
- Contrato #335: 286 objetos, zero diferenças, sem reaplicação dos scripts durante a verificação.
- R6 e R7 mantêm a deriva registada para G3. As regras de literais, enum, tail e definição de Live foram preservadas.

## G2 N1–N9

| Etapa | Diferenças restantes |
|---|---:|
| Antes de normalizar | 8.581 |
| N1 | 1.984 |
| N2 | 1.130 |
| N3 | 910 |
| N4 | 120 |
| N5 | 120 |
| N6 | 120 |
| N7 | 117 |
| N8 | 114 |
| N9 | 49 |
| Bloqueantes após R8 | **48** |

As substituições sanitizadas das duas funções de fila são aplicadas igualmente aos dois lados, com os hashes dos manifestos originais. N1 identifica triggers internos pela constraint que os gera; N4 segue a tabela dessa constraint, e não apenas a relação referenciada. Assim, as quatro diferenças dos triggers de FKs de auth.mfa_recovery_code_sets e auth.scim_users pertencem à linha-base da plataforma. As constraints/tabelas não têm referência no corpus admitido; não se excluem triggers de aplicação em auth.users.

R8 retira do bloqueio **apenas** a propriedade valid de storage.idx_objects_bucket_id_name_lower, válido no replay e inválido no snapshot Live. Nenhum estado inválido foi fabricado. A linha-base da plataforma e esta exceção estão separadas dos bloqueios.

N9 normalizou 65 diferenças de ordem em 13 tabelas com igualdade de todas as outras propriedades e sem acessos posicionais bloqueantes. As 20 tabelas candidatas estão em n9-tabelas.json. As sete restantes têm 34 INSERT sem lista de colunas em testes/stubs; há ainda uma captura textual com contexto SELECT-star não resolvido. Esta última não é necessária para manter o bloqueio de financial_accounts, que também tem INSERT posicionais. Os testes/stubs não foram excluídos: nenhuma regra aprovada permite essa exclusão.

## Apenas o que continua sem regra suficiente

| Família | Objeto | Diferenças |
|---|---|---:|
| Ordem com uso posicional | public.event_cache_configs | 6 |
| Ordem com uso posicional | public.event_forecasts | 11 |
| Ordem com uso posicional | public.events | 15 |
| Ordem com uso posicional | public.financial_accounts | 2 |
| Ordem com uso posicional | public.profiles | 5 |
| Ordem com uso posicional | public.song_links | 2 |
| Ordem com uso posicional | public.suppliers | 2 |
| Papéis/privilégios | ACL de storage.buckets e storage.objects | 2 |
| Papéis/privilégios | Memberships supabase_functions_admin → postgres e supabase_realtime_admin → postgres | 2 |
| Papéis/privilégios | Configuração de supabase_admin | 1 |

**Total: 43 diferenças de ordem e cinco de papéis/privilégios.** Classificação: (a) 0, (b) 46, (c) 2; zero sem classe.

As duas ACL diferem num beneficiário fora da lista fechada de acl_final_from_live. Os papéis envolvidos nas ACL/configuração são referidos nas fontes, pelo que N8 não os pode excluir automaticamente. As duas memberships envolvem postgres e continuam protegidas por N8; R6 não abrange memberships. Valores e detalhes de privilégios ficam apenas na evidência privada. Nenhum desses casos foi corrigido nem excluído por iniciativa própria.

## Registos e limites

- Achados não bloqueantes separados: [#373](https://github.com/pedrompropicio/mundopropicio/issues/373), nulidade de company_id; [#374](https://github.com/pedrompropicio/mundopropicio/issues/374), índice inválido. Não se inventou contagem de linhas: o parecer R7 não a fornece e a retoma está limitada a catálogo.
- Uma tentativa de SELECT de catálogo nesta sessão terminou em 504 e não foi usada como prova. Nenhum SELECT de dados operacionais.
- Sem alterações em Live, novos seeds, segredos, infra, deploy ou Publish. Os elementos sintéticos anteriormente autorizados do plano G1 foram preservados.
- #329 conferida antes dos pushes de código: GitHub e Lovable iguais a `745c612f7a17f33fc2b8ff6120f2395360c75c04`, agente livre; HEAD privado esperado, sem force.
- O sucesso do workflow certifica execução e captura; o comparador mantém **G2 vermelho** pelos 48 bloqueios. Os 71 provisórios ficam substituídos por esta medição reproduzível.

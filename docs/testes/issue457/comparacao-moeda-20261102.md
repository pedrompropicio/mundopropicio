# #467 — comparação e exibição de moeda nas versões BP

02/11/2026. Executor E2b/Codex, classe R1, cópia local sobre main
51a72a32179b1a043044cbce36584ee245acdcd3. HEAD conferido antes da edição e
permanece na base. Sem commit, push, PR, troca/sincronização de ramo ou acesso
a serviços MP. CI 41385904493/SUCCESS e estado Lovable são contexto do despacho,
não verificações remotas deste executor.

## Antes e depois

A prova anterior é o teste da #465 integrado pela #466 e o
[relatório BR1b](br1b-contrato-20261102.md), preservado. No código da base,
buildMultiDiff projetava apenas amount/ivaRate/description; hasDifferences só
considerava EUR e presença da linha. O caso amount=20 em ambas as versões,
original 110→120, taxa/fonte alteradas, esperava false. Modal e PDF filtravam
essa linha quando o filtro de diferenças estava ativo.

Agora o mesmo caso espera true, mantendo a asserção EUR [20, 20]. Nesse ficheiro
alteraram-se apenas essa expectativa e o título correspondente; os restantes
sete casos e as outras asserções foram preservados. Os textos e provas datados
anteriores não foram reescritos. Não foi corrida uma nova suíte integral antes
da edição; a comparação anterior é evidência do código/teste da base e da prova
BR1b, não uma alegada execução baseline deste executor.

## Percurso real e campos

O modal consulta id/snapshot_payload de bp_versions para os IDs selecionados.
O payload já chegava inteiro ao map por ID; a omissão estava na projeção do
engine, não nesse transporte. O mapper mapComparisonSnapshots, extraído do
useMemo real, seleciona forecasts de cada versão sem reconstruir nem descartar
metadados. É exercitado diretamente e pelo modal com QueryClient real e resposta
de transporte fictícia.

ForecastSnapshot recebe os quatro campos opcionais pela interface
OriginSnapshot. Valores brutos são unknown deliberadamente: o helper
bp-version-origin normaliza-os para união tipada missing/valid/invalid, sem
afirmar validade por cast. MultiDiffCell retém essa representação e cada linha
retém changedOriginFields. A normalização é apenas de comparação/exibição,
não escreve nem altera o snapshot.

| Campo | Igualdade e apresentação |
|---|---|
| currency | Texto literal, sem assumir EUR nem normalizar códigos por inferência; mostrado como Moeda |
| original_amount | Decimal exato informado, sem arredondamento ou reconversão; mostrado como Original |
| fx_rate | Decimal exato informado, sem tolerância EUR ou fixing inventado; mostrado como Taxa FX |
| fx_rate_source | Texto literal informado; mostrado como Fonte FX |

null e undefined significam Não informado e são equivalentes. Zero é presente.
Um lado informado e outro ausente altera o campo; ambos ausentes não inventam
diferença. Linha ausente tem amount=null e aparece como “Linha ausente”, distinta
de um campo ausente numa linha presente. Metadados são comparados entre as linhas
presentes; a ausência de linha continua a marcar hasDifferences por si.

Valores numéricos finitos e strings com sintaxe decimal/exponente são normalizados
em dígitos e expoente decimal, sem igualdade por Number/arredondamento: 20,
“20.00” e “2e1” são iguais; casas significativas adicionais em strings continuam
distintas. O teste de finitude não transforma o valor usado para igualdade.
NaN/Infinity, booleanos, objetos, arrays, vazio e texto malformado são inválidos,
sem conversão para zero; a apresentação identifica “Inválido”. Inválido e válido
nunca são iguais. A validade é sintática, não aprovação de taxa positiva,
fonte oficial, política contabilística ou moeda suportada.

O helper originDisplayLines é chamado pelo modal e pelo exportador real.
Cada coluna mostra EUR seguido dos metadados informados e dos campos ausentes
que diferem entre versões; “(alterado)” identifica o motivo. Assim dois EUR
iguais não ficam destacados sem explicação. Legados sem metadados continuam
apenas com EUR. O filtro continua a usar hasDifferences nos dois consumidores.

## Compatibilidade e regressões

Não se alteraram soma de amount, resumo de receita/despesa/resultado, subtotais,
ordenação, agrupamento, IVA ou tolerância EUR de 0,005. Os testes novos confrontam
resumos e grupos com/sem metadados em fixtures PT/ES (IVA 23/21); os dez testes
anteriores do engine continuam a cobrir grupos, totais, alinhamento e legados.

A fixture JSON é integralmente fictícia. Os 21 testes novos cobrem:
campos isolados em 2–4 versões; precisão inferior à tolerância EUR; decimais
equivalentes; zero/null/undefined; campos e linhas ausentes; inválidos/não finitos;
legados e paridade de totais; mapper real; filtro do modal real e exportação;
conteúdo por versão na tabela PDF. O engine não foi substituído por fake diffs.
Na UI só os transportes e a fronteira de exportação são stubs; no teste do
exportador só jsPDF/autoTable/save são stubs. Nenhum documento/dado real,
navegador autenticado, rede MP ou download externo foi utilizado.

## Verificações locais

| Verificação | Resultado |
|---|---|
| BP existente + BR1b — bunx vitest run src/lib/__tests__/bp-version-multi-diff.test.ts src/lib/__tests__/issue465-br1b-contract.test.ts | Exit 0; 18/18 |
| Novos testes — bunx vitest run src/lib/__tests__/issue467-modal.test.tsx src/lib/__tests__/issue467-comparison.test.ts | Exit 0; 21/21 |
| bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit | Exit 0; sem diagnósticos |
| bunx vitest run | Exit 0; 335 ficheiros passaram, 2 skipped; 3263 testes passaram, 6 skipped, 11 todo (3280 total); 222,47 s |
| bun run build | Exit 0; 9143 módulos, 1 min 48 s; PWA gerada |
| git diff --check | Limpo |

Delta face à suíte final documentada na #465: +2 ficheiros e +21 testes
passados; skips/todos inalterados. Nenhum teste excluído, skip adicionado,
configuração alterada ou expectativa financeira afrouxada. A suíte integral
inclui os testes SQL locais inertes já existentes (PGlite), sem ligação a bases
MP; isso não verifica catálogo Live/homolog nem executa promoção de estrutura.
Os avisos do build foram Browserslist desatualizado, import estático/dinâmico de
storage e chunks grandes; não motivaram alteração de dependências/configuração.
Logs locais: /tmp/467-focused.log, /tmp/467-ui.log, /tmp/467-tsgo.log,
/tmp/467-vitest.log e /tmp/467-build.log. CI remoto deste diff não foi executado
nem alegado. Nenhuma regressão própria ficou por resolver.

## Limites e próximo item

Esta entrega prepara a correção local; revisão, integração manual, CI no SHA
final e publicação ficam com o 0. Integrado não significa publicado. Não se
certifica layout visual/bytes de um PDF renderizado nem operação Live com estes
testes de conteúdo.

SQL histórico to_jsonb(f.*) permite extras no JSON, mas não prova catálogo
instalado, preservação efetiva por freeze/restore ou fixing. Nenhum writer,
freeze/restore, SQL, formulário, DRE Brasil ou documento de sócios foi alterado.
Não se inventam datas nem original por EUR/FX. A precisão já perdida ao receber
um número JSON não é recuperada; strings decimais mantêm a precisão recebida.
O tratamento financeiro legado de amount/IVA permanece intocado.

O contrato monetário continua proposta não aprovada. Apenas a linha desta lacuna
e a indicação correspondente na visão SaaS foram atualizadas. A #457, os seis
gates e o piloto SaaS não são dados como concluídos. Próximo item: revisão desta
correção pelo 0; a repartição de original nas parcelas e as provas de capacidade
freeze/restore continuam dependentes de despachos/decisões próprios conforme BR1b.
Sem TaxEngine, regras cambiais/fiscais, flags, schema, DDL/DML, homologação,
deploy, Publish, envios, dados reais ou alterações em caminhos proibidos.

# #465 / #457 — BR1b: contrato e próximo incremento

02/11/2026. R1, somente testes e documentação. Base autorizada e HEAD local conferidos: `6a58f5bf466f907eccc265ed1856a5ab4596f3d2`; cópia inicialmente limpa. HEAD foi revalidado durante o trabalho e não mudou. Sem commit/push/PR, sincronização Lovable ou consulta remota. CI quality `41383542878 completed/SUCCESS` é evidência fornecida pelo despacho sobre a base, não verificação remota desta entrega. Merge manual pelo 0; #457 permanece aberta.

## Antes → depois e evidência por caminho

| Caminho | Antes | Depois e limite |
|---|---|---|
| `docs/planejamento/contrato-monetario-multiempresa.md` | Não existia | Contrato proposto com decidido/observado/pendente, dimensões monetárias, tabela BP→TX→parcelas→pagamentos/estornos→snapshot→DRE/export, seis gates e inspeções SELECT textuais; pauta contábil/jurídica preparada, não enviada |
| `docs/planejamento/plataforma-saas-2027.md` | Inventário BR1 e proposta de investigar parcelas/snapshots | Oito etapas 0–7 com entrega, dependência, responsável proposto, critério e estado; sem prazo/custo fictício; nenhuma etapa de produção iniciada |
| `src/lib/__tests__/issue465-br1b-contract.test.ts` | Não existia | 8 regressões sintéticas importam `computeInstallmentNets`, `buildMultiDiff` e `computeAccountBalance`; cliente Supabase substituído por objeto vazio, sem chamada externa |
| Este relatório e `.executor/resumo.md` | Sem entrega BR1b | Achados, contraprovas, validações e próximo PR delimitado |

Fontes: INDEX → QUADRO/estados plataforma e financeiro → memórias dos fluxos → código, AGENTS raiz e nested `supabase/AGENTS.md`, D-ERP345–351, PROC-promocao e desenho histórico `.lovable/plan-fase-8-multi-pais.md`. O [contrato](../../planejamento/contrato-monetario-multiempresa.md#estatuto-e-fontes) nomeia as memórias e divergências com o código. BR1/18 testes anteriores foram apenas lidos. Sem base, credenciais, dados privados, documentos reais ou serviços MP. Leitura de SQL versionado é evidência histórica de código, não instalação atual.

## Regressões e contraprovas

| Caso novo | Resultado esperado e significado |
|---|---|
| Bases PT de quatro casas | Brutos 8.374,94 / 8.374,93 e base total 13.617,78 produzem 6.808,8943 / 6.808,8857, reproduzindo cada bruto. Prova do helper usado em criação/renegociação, sem gravar parcelas |
| Parcelas sem IVA | 33,35 / 33,34 / 33,33 preservam bases de total 100,02; nenhuma moeda/FX viaja no retorno numérico |
| LACUNA — totais incompatíveis | Brutos 50/50 com base declarada 90 retornam 50/50: fallback protege bruto individual e não garante soma da base. Contraprova da garantia universal do comentário do helper; chamadores precisam de validação dos dois totais |
| Zero/ausente no comparador | Linha zero presente versus linha ausente produz células 0/null e diferença; não equivale à semântica de campo nulo fiscal |
| LACUNA — snapshot com original/FX alterados | Amount 20 constante, original 110→120, taxa/fonte distintas: comparação real não marca diferença. Prova de projeção incompleta, sem afirmar perda na captura |
| Saldo de pagamento parcial | Saldo inicial 200, pagamento 17,03, ajuste 2,01 → 184,98. Não infere taxa nem reconstrói original |
| Estado pós cash_refund já derivado | `paid_amount=0` devolve saldo 200. Não testa se RPC efetivamente gravou esse zero |
| Saída preservada/crédito e perímetro | Pagamento 17,03 continua saída 182,97 quando fornecido ao helper; outra conta e histórico ao corte são excluídos, conta sem controlo retorna null. Não certifica política de crédito, saldo BRL ou reconciliação persistida |

Os testes marcados LACUNA caracterizam defeito/limite atual para orientar correção, não aceitam esse resultado como contrato futuro. Não há teste novo de câmbio de ida/volta, nem repetição dos estados de liquidação BR1. Nenhuma fórmula de produto foi copiada para um pipeline fictício. Asserções de bruto e soma nas parcelas verificam invariantes externas contra saídas literais do helper.

Contraprovas relevantes para o planeamento:

- D7 EUR + original exato não foi refutado: BR1 refuta reconstruir original a partir de EUR, não a capacidade de armazenar ambos. EUR canónico permanece.
- A memória antiga de linkage e Modelo B não descreve integralmente o formulário atual: este envia `forecast_id` e cria TXs irmãs. O novo mapa cita o código e não certifica catálogo.
- O SQL versionado de `create_bp_snapshot` usa `to_jsonb(f.*)` para forecasts master/split. Não afirmar que o writer omite moeda/FX por o tipo do comparador os omitir. Freeze instalado, clone/restore e permissões continuam por comprovar.
- `computeAccountBalance` consome `paid_amount` e não executa estorno; valores sintéticos pós-estorno não fecham a lacuna SQL/UI nem provam saldos da conta em moeda original.
- O original integral repetido nas irmãs é observado no payload de `TransactionFormModal.tsx:1611,1826`. Não se afirma persistência duplicada sem definição do writer/triggers e releitura autorizada.

## Próximo PR de produção mínimo proposto

**Objeto concreto:** preservar a soma exata do original documental ao criar um grupo de parcelas em moeda não EUR, começando pelo caminho manual de `TransactionFormModal`. Não iniciar agora. Não aproveitar esse PR para TaxEngine, mudança de EUR canónico, fiscal_meta, export ou correções históricas.

| Item | Delimitação para despacho posterior |
|---|---|
| Pré-condições | Pedro decide escala/arredondamento, semântica de original por parcela versus total do documento e tratamento de zero/ausente; 0 confirma se correção estrita de precisão pode ter despacho próprio durante quarentena. Evolução da fase 8 continua condicionada aos seis gates; BR1b não concede exceção |
| Caminhos candidatos | Novo helper puro em `src/lib/` para repartir original informado, teste em `src/lib/__tests__/`; `src/components/TransactionFormModal.tsx` usa o resultado na primeira parcela e nas irmãs. Rever `TransactionInstallmentGroupEditor.tsx` e `TransactionRenegotiateInstallmentsModal.tsx`: se permitirem desfazer a garantia, incluí-los no mesmo pacote autorizado ou impedir esses caminhos para o novo caso com requisito aprovado; não declarar ciclo pronto com edição insegura |
| Entrada/saída | Receber original exato, moeda e distribuição aprovada; devolver original por parcela e resíduo determinístico, sem reconversão EUR. Preservar taxa/fonte e total do documento separado conceitualmente; não inventar coluna nem reutilizar total integral como valor da parcela |
| Testes de aceitação | Writer mockado recebe originais por parcela cuja soma é o documento exato; 100,02 em três parcelas, 0,01 com mais parcelas que cêntimos, distribuição não uniforme, zero explícito/ausente, EUR inalterado, base de quatro casas intacta. Expectativas só após política aprovada. Falha de criação da irmã deve ser visível e não reportar sucesso integral |
| Risco | Dupla contagem de originais, drift com bruto/IVA, parcial criado antes da falha, edição/renegociação desfazendo a distribuição, atribuição incorreta de FX. Nem mock do payload nem tipos gerados provam persistência/atomicidade |
| Capacidade/inspeção prévia | Com Sim separado: definição instalada do writer/guards, colunas/escala e readback sob ator/tenant em ambiente autorizado, sem dados reais neste executor. Se atomicidade/escala exigirem SQL, parar a divisão R1 e preparar pacote R2 separado, com ficheiro/rollback e PROC-promocao; não camuflar alteração estrutural no PR |
| Autorizações/promoção | Despacho R1 novo com caminhos exatos, revisão 0, CI verde no SHA da entrega; homolog e Publish apenas pelo 0 com Sim. Para R2 eventual: aprovação própria por passo, sem instalação por este pacote |

A omissão de moeda/FX na geração `EventForecast.bulkCreateTxMutation` e na seleção manual da linha BP é outra borda identificada por leitura, com caminhos e menor correção no contrato. Não alargar o PR de parcelas para fingir cobertura da geração BP. Depois desse incremento, novos pacotes delimitados devem provar pagamento parcial original e estorno monetário (UI + RPC + saldo), freeze/restore e export original/fixing. Cada um depende do contrato aprovado e das provas de capacidade, sem criar um motor financeiro paralelo. Os SELECTs de catálogo mínimos estão no contrato como **PROPOSTA**, não executados. Janela de incidentes, aceite do segundo cliente e go formal exigem evidência do responsável; não há SELECT fictício que os substitua.

## Gates, assessoria e preservações

A [matriz dos seis gates](../../planejamento/contrato-monetario-multiempresa.md#seis-gates--matriz-de-evidência) informa datas, universos e limites, incluindo vistos históricos e evidência atual em falta. Baselines continuam parciais. Não se declara go/no-go, operação BR/SaaS pronta ou segundo cliente operacional pela indicação Social Music.

A pauta da assessoria contém incidência/vigência/regime/operações, contas/DRE, câmbio/diferenças e export/documentos. Não houve envio nem parecer. D-ERP347/#245 mantém apresentação aos sócios; PT→ES não muda empresa fiscal. Tributos novos/antigos exigem validação versionada, ausência não vira zero e IBS total não se duplica com componentes. Gestão alimenta contabilidade externa; sem apuração oficial/SPED/NF. #403/0302 é dependência existente a conferir, não trabalho duplicado.

## Verificação antes/depois

O antes foi iniciado com a cópia limpa, antes dos ficheiros BR1b. Vitest inclui a árvore `src` definida em `vitest.config.ts`; os testes existentes têm stubs, fixtures e testes locais inertes, não verificam serviços MP. A suíte não certifica toda a árvore de funções nem execução de SQL em ambientes de negócio.

| Verificação | Resultado local |
|---|---|
| Antes — `bunx vitest run` | Exit 1; 331 ficheiros passaram, 1 falhou, 2 skipped; 3.233 testes passaram, 1 falhou, 6 skipped, 11 todo (3.251 total); 196,69 s. Timeout de 5 s em `src/test/issue359-consent-guard-c.test.ts:35` |
| Repetição existente isolada — `bunx vitest run src/test/issue359-consent-guard-c.test.ts` | Exit 1; mesmo timeout, 11/12 passaram; 14,65 s. Execução concorrente com build e suíte final; não demonstra falha funcional determinística |
| Novo ficheiro — `bunx vitest run src/lib/__tests__/issue465-br1b-contract.test.ts` | Exit 0; 8/8, sem skip/todo; 1,66 s |
| Depois — `bunx vitest run` | Exit 0; 333 ficheiros passaram, 2 skipped; 3.242 testes passaram, 6 skipped, 11 todo (3.259 total); 216,28 s. O teste da #359 passou sem alteração, em 4,861 s |
| Tipos — `bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit` | Exit 0; sem diagnósticos |
| Build — `bun run build` | Exit 0; 9.142 módulos, 2 min 7 s; PWA gerada. Avisos de Browserslist antigo, imports estáticos/dinâmicos e tamanho de chunks; sem alteração de dependências/configuração |
| Revisão local | `git diff --check` limpo; destinos dos links relativos conferidos; HEAD permanece na base autorizada; somente os cinco caminhos da entrega, incluindo resumo |

Delta: +1 ficheiro de testes, +8 testes totais, skips/todos inalterados. O aumento de passados é +9 porque o timeout anterior passou na corrida final. Nenhum timeout, teste anterior ou configuração foi afrouxado. O timeout inicial fica como limite de estabilidade da suíte sob carga; não é correção desta entrega. Logs locais retidos em `/tmp/issue465-before.log`, `issue465-existing-recheck.log`, `issue465-focused.log`, `issue465-after.log`, `issue465-tsgo.log` e `issue465-build.log`. CI remoto do diff ainda depende de PR/revisão pelo 0; suite local verde não o substitui.

Nenhuma alteração em produção, dependências/CI, testes BR1 anteriores, INDEX/QUADRO/estados/DECISIONS, `.github/`, `supabase/`, `drizzle/`, `.lovable/` ou `.env`. Sem instalação de schema, SQL de negócio/inspeção executado, acesso a Live/homolog, modelo/Gmail/ERP reais, envios, deploy/Publish, commit/push ou encerramento da mãe. SELECTs são só texto. Testes anteriores e skips não foram alterados.

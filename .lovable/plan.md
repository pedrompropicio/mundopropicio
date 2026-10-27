# P5 — Posição Financeira: Saldo Geral e resultado MP por evento (R2, plano)

HEAD de arranque: c70235d5150056cd723571f54816646fb6e4cbe3. Sem código, DDL, DML nem deploy neste passo.

Nota sobre a reserva: em modo plano só posso escrever este plano. A linha «P5 — plano — R2 — agente Lovable» entra em docs/QUADRO.md › «Em execução agora» no primeiro passo depois da aprovação, e sai no fecho.

## 1. Ficheiros lidos
- docs/INDEX.md, docs/QUADRO.md (Em execução + secção do chat), docs/estado/estado-financeiro-e-tesouraria.md
- .lovable/memory/features/financial-position-base.md
- docs/testes/p4b-permissao-posicao-20261027.md, docs/testes/p6a-painel-posicao-20261027.md
- docs/DECISIONS.md: D-ERP320, D-ERP321, D-ERP322 (linhas 6361–6372)
- supabase/functions/partner-statement/index.ts (inteiro)
- supabase/functions/_shared/settlement/statement-service.ts (`loadStatementBundle` l.112, `buildPartnerStatement` l.429)
- supabase/functions/_shared/settlement/event-settlement-engine.ts (`computeSettlementEngine` l.352, `HouseResidual` l.279, `EngineCheck` l.298)
- Mockup: não há ficheiro «mockup» nem «posicao-financeira» em docs/. O único que menciona o tema é o estado financeiro. Ver Q21.
- Issues MP-ERP: não consigo ler as Issues do GitHub a partir daqui. Fico pelo QUADRO.

## 2. Medições em Live (só SELECT, 27/10 18:0x, MP)
- Transações de despesa sem evento, sem contar as mães de rateio: **350 linhas / 1.579.438,57 € brutos**, das quais 340 estão pagas. Predicado: `event_id IS NULL AND type='expense' AND NOT EXISTS (filhas)`, com o bruto em /100.0. Todas caem em 2026 pela data de vencimento ou de criação.
- Eventos com sócios (`event_partners`), em todas as datas: 12. A contagem do ano é feita no passo 1 da implementação, pelo conjunto de eventos que a RPC já devolve (`eventos_por_estagio`).

## 3. Desenho

### Fluxo da edge function `financial-position`
```text
POST {company_id, year|null}
 -> JWT obrigatório (401)
 -> RPC get_financial_position_base com o cliente do utilizador
    (o gate da RPC decide: not_authenticated / company_forbidden /
     financial_position_permission_denied -> 401/403 com o mesmo código)
 -> eventos do ano = eventos_por_estagio da RPC (o estágio vem da RPC, o sub-evento segue o master)
 -> por cada evento raiz não Histórico, até 4 em paralelo:
      loadStatementBundle(admin, eventId) -> resultado do motor (sem recálculo)
 -> Histórico: só pelo BP (bundle em modo BP; ver Q22)
 -> custos de estrutura: o novo bloco `sem_evento` (ver 5)
 -> monta o Saldo Geral a partir da RPC + motor
 -> system_audit_log {entity_type:'financial_position', action:'read'}
 -> JSON p5-v1
```
O cliente service-role só é usado depois de o gate da RPC passar, e apenas para o bundle, tal como no partner-statement.

### JSON p5-v1 (chaves e tipos)
```text
meta { version:"p5-v1", base_version:"p4-v1", company_id, year:int|null,
       data_referencia:"YYYY-MM-DD" (Lisboa), gerado_em, eventos_processados:int,
       eventos_com_erro:[{event_id, motivo}], saldos_visiveis:bool }
eventos[] { event_id, nome, estagio, historico:bool, so_bp:bool,
            resultado_evento:num, partes_socios:[{supplier_id,nome,valor:num}],
            partes_socios_total:num, creditos_mp:{ parte_casa:num, iva_devolvido:num,
            outros:num, total:num }, resultado_mp:num, checks_ok:bool, fonte:"motor"|"bp" }
estrutura { sem_evento_bruto:num, linhas:int, pagas:int, por_pagar:num, origem:"transactions" }
resultado_mp_ano { com_estrutura:num, sem_estrutura:num }
socios { a_receber:[{supplier_id,nome,valor}], a_receber_total,
         por_liquidar:[{supplier_id,nome,valor}], por_liquidar_total }
saldo_geral (null se !saldos_visiveis) {
  ativos { caixa, cartoes, retido_visivel, retido_ocultas, a_receber, a_receber_socios, total },
  passivos { a_pagar, bp_por_lancar, socios_por_liquidar, total },
  posicao_hoje, notas:[ "retido pode incluir parte de sócios" ],
  informativo { transitorias_pagar, transitorias_receber, acerto:[...] } }
```
Cada componente leva `{valor, origem}`, em que a origem pode ser `rpc.caixa`, `rpc.retido.total_ocultas`, `motor.house_residual`, etc.

### Onde nasce cada número
- Caixa, cartões, retido, a pagar, a receber, transitórias e acerto: RPC p4-v1, sem nova regra.
- BP por lançar: `alertas.bp_sem_transacao` da RPC, já contado no a pagar. Para evitar dupla contagem no passivo, ver Q23.
- Resultado do evento, partes dos sócios, parte da casa, IVA devolvido: motor (`EngineResult`, `HouseResidual`).
- A receber de sócios e sócios por liquidar: `buildPartnerStatement(bundle, supplier)` para cada sócio do evento, a partir dos campos de saldo final que o documento já calcula. Não há fórmula nova.

## 4. Divergência face ao Encontro de Contas
- Mesmo código: `loadStatementBundle` e `buildPartnerStatement` saem de `_shared`, sem cópia. O teste compara o JSON com o do partner-statement para o mesmo evento e sócio.
- Arredondamento: somo cêntimos inteiros só no fim, e mantenho os valores por evento como o motor os devolve.
- Snapshots congelados (P7): se a parte do sócio estiver congelada, usa-se a origem congelada que o bundle já expõe.
- `checks_ok=false` do motor: o evento aparece com alerta e entra nos totais (Q24).

## 5. Casos especiais
- Histórico: `so_bp=true`, fora do Saldo Geral, sem transações, marcado.
- Evento sem sócios: resultado MP = resultado do evento; partes = 0.
- Sub-eventos: só se chama o motor no master, que já consolida as filhas. As filhas nunca entram como linhas próprias.
- ab_module / operações de terceiros: o statement-service tem esta limitação, por isso entram como `outros` = 0 e a nota «operações de terceiros não incluídas (v1)». Fica coerente com Q9 = informativo.
- Custos sem evento: 1.579.438,57 € brutos (350 linhas) entram só em `estrutura` e em `resultado_mp_ano.com_estrutura`. O que está por pagar entre eles (10 linhas) não entra no a pagar do Saldo Geral, porque a RPC não o inclui. Ver Q25.

## 6. Riscos, carga, rollback, testes, verificação
- Carga: com cerca de 12 eventos com sócios e cada bundle em cerca de 1–2 s, a concorrência de 4 dá à volta de 5 s. Limite de 25 s, depois devolve `eventos_com_erro`. Não há cache na v1 (Q26).
- DDL: nenhuma, porque os dados chegam da RPC e do bundle.
- Rollback: apagar a edge function e reverter o commit. Não há estado persistente.
- Testes vitest: schema zod fail-closed (versão errada, chave em falta, números não finitos); fixtures de evento sem sócios, cidade-filha, Histórico só BP, resultado negativo com loss_pct, sócio pt-BR em bruto; a fórmula do Saldo Geral (ativos − passivos) sem transitórias; com saldos nulos, `saldo_geral` fica null; os erros de gate mapeiam para 401/403.
- Verificação em Live, depois do deploy autorizado: por evento, comparar o resultado MP e a parte de cada sócio com o partner-statement (diferença 0,00); comparar o Saldo Geral, componente a componente, com a RPC e com um SELECT independente; confirmar o total `estrutura` com a query da secção 2.
- Deploy: só pelo 0 - Cowork, em janela, com o «Sim» do Pedro e CI verde. Este plano não faz deploy.

## 7. Ficheiros
Criar: `supabase/functions/financial-position/index.ts`, `supabase/functions/_shared/financial-position/assemble.ts` (função pura, testável), `src/lib/financial-position-p5.ts` (zod e tipos), `src/hooks/useFinancialPositionP5.ts`, `src/test/financial-position-p5.test.ts`, `docs/testes/p5-posicao-saldo-geral-20261027.md`.
Alterar: QUADRO, estado financeiro, memória financial-position-base.md, D-ERP323, AGENTS.md (uma regra).

## 8. Perguntas
21. Mockup: não existe em docs/. A (recomendada) segue o contrato acima; B o Pedro anexa o mockup antes da implementação.
22. Histórico só BP: A (recomendada) usa o bundle com transações ignoradas; B resultado = receita BP − custo BP direto, sem motor.
23. BP por lançar no passivo: A (recomendada) mostrado como subcomponente do a pagar, sem somar duas vezes; B linha própria tirada ao a pagar.
24. Evento com checks do motor falhados: A (recomendada) entra com alerta; B fica fora dos totais.
25. Os 10 custos sem evento por pagar: A (recomendada) entram nos passivos como «estrutura por pagar»; B só em estrutura.
26. Cache: A (recomendada) nenhuma na v1; B cache de 60 s em memória.

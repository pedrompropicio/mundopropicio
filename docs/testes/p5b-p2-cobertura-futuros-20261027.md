# P5b passo 2 — cobertura_futuros (p5-v3) — R1 — 27/10/2026

Sim explícito do Pedro (20:45 UTC); 39–43 pelas recomendadas; 3 correções do 0 aplicadas. Sem DDL, sem DML, sem Publish.

## O que mudou
- Novo `supabase/functions/_shared/financial-position/future-coverage.ts` (puro).
- `assemble.ts`: versão p5-v3, campo `cobertura_futuros`, nota «Destinado a eventos futuros: X € dentro do caixa» no Saldo Geral (caixa e totais iguais).
- `financial-position/index.ts`: leituras do bloco em paralelo ao motor, deadline 6 s; ficheiro tocado para a função ser reconstruída (leva também o p5-v2).
- `src/lib/financial-position-p5.ts`: zod aceita só p5-v3; bloco strict; incompleto ⇔ eventos/bilheteiras/total null.
- `FutureCoverageCard` na página Posição Financeira (sempre "todos os anos"; duas leituras lado a lado).

## Fontes e chamadas
- a pagar/BP/pagas: `a_pagar.por_evento` (0284), sem réplica.
- vendas: `get_ticket_office_sales(p_account_id)` com o JWT do utilizador. É SECURITY INVOKER com EXECUTE para authenticated e service_role; usa-se o JWT para respeitar a RLS do utilizador. Falha → bloco incompleto.
- caixa: `get_event_cash_position(p_company_id)` com o JWT do utilizador (exige current_company_id/is_platform_admin); soma por event_id contra a árvore completa.
- movimento anterior ao corte: transações do evento em contas bank/cash/prepaid_card com skip_balance_check=false e payment_date ≤ initial_balance_date; income +, expense −; reversed_at nulo.
- aportes: income, paid, is_transitory, transitory_reason=aporte_socio.

## Fixtures (vitest, sem credenciais)
Madrid: aporte sócios 353.810,51 (249.000,00 conta líquida + 104.810,51 direto/automático); aporte MP 24.775,57; dinheiro parado desde corte −6.724,50 + anterior ao corte 99.000,00 = 92.275,50; necessidade com faturas sem linha 358.035,96, assumindo que cobrem BP 195.699,00. Ghanem: Ticketline mínimo 109.050,59, indeterminado; BOL retido = vendas → 0; ECI única. Newgang: sem vendas, caixa MP adiantado 18.444,20. Planeamento sem data marcado; em_curso já iniciado fora. Saldos invisíveis → null. Caixa negado → incompleto. Saldo Geral/sócios/resultado iguais com e sem bloco.

## Para o 0 verificar em Live
1. Chamada autenticada à função: `meta.version = "p5-v3"`.
2. p5-v2 no mesmo deploy: existe `projecao_em_curso`; Madrid fora de `socios.linhas`; `socios.a_receber_total` sem Madrid.
3. `cobertura_futuros.meta.incompleto = false`; Madrid: dinheiro_parado_bruto {desde_corte −6.724,50, anterior_ao_corte 99.000,00}; vendas ECI = valor do dia (ex. 297.462,25); aporte_socios.total 353.810,51.
4. Por conta: vendas futuras e retido contra SELECT independente; Ticketline saido_minimo = max(0, vendas futuras − retido).
5. `meta.duracao_ms` comparado com 6–8 s anteriores.

## Correção — cobertura independente do ano (Sim Pedro 21:08 UTC)

HEAD de arranque 0fc2e00c8d6bfe903a19b20d2456cbbc9097eb73, confirmado; commits externos preservados, sem rebase.
Falha medida pelo 0: year=2026 escondia Ghanem/Newgang 2027 por reutilizar a base filtrada. Segunda RPC get_financial_position_base com JWT e p_year=null agora alimenta só cobertura_futuros. Resto continua com base e motor do ano pedido; sem formato novo (p5-v3).

O carregador partilhado future-coverage-loader.ts inclui segunda RPC e leituras seguintes no mesmo deadline 6 s; erro, resposta de outra empresa/ano ou timeout dão bloco incompleto com eventos/bilheteiras/total null. Nenhuma réplica da regra SQL. Timer removido após conclusão. Nenhum segredo novo, DDL, DML ou Publish.

Testes focados: segunda RPC null inclui Madrid 2026 e Ghanem/Newgang 2027; motor/projeção mantêm só Madrid da fixture anual; totais e Saldo Geral numérico iguais; nota 92.275,50 igual em 2026/Todos. Falha RPC mantém resto intacto; deadline 5.999 ms ainda pendente / 6.000 ms timeout; resposta inválida falha fechado. Resultado: 64/64 verdes (6 ficheiros); tipos/build automático em validação.

### Verificação do 0 em Live após reconstrução automática
1. meta.version=p5-v3; year=2026 mantém ano, conjunto do motor, resultado_mp_ano, estrutura, sócios e totais numéricos do Saldo Geral.
2. projecao_em_curso preserva D-ERP324: Madrid fora de socios.linhas/totais.
3. cobertura_futuros.meta.incompleto=false; três eventos (Madrid/Ghanem/Newgang), comparável ao bloco com year=null no mesmo instante.
4. Referências medidas pelo 0 a 27/10: necessidade com_sem_linha 1.047.936,17; sem_linha_cobre_bp 881.399,21; vendas 622.440,25; BP por lançar 895.116,73; caixa MP adiantado 21.094,40; saído mínimo 109.050,59. Confirmar contra SELECT independente, aceitando mudanças de pagamentos/vendas.
5. Nos dois anos: dinheiro_de_eventos_em_conta e nota destinado a eventos = 92.275,50 (referência do dia); caixa não muda.
6. Medir duracao_ms: não enviar null ao motor (15 eventos anuais em vez dos 21 medidos com Todos); leitura adicional corre em paralelo e dentro de 6 s.

Validação final: 64/64 testes focados; suíte completa 302 ficheiros PASS/2 skipped, 2970 testes PASS/6 skipped/11 todo, duração325,87s. Tipos/build automático OK a21:11:07 UTC após correção do tipo do mock de timeout; nenhuma execução manual de tsc/build. CI público consultado: último run40583998993 success no SHA95c1bd93 anterior, não prova o SHA final. Reserva libertada após validações locais verdes. Live autenticado e CI final ainda não confirmados pelo agente; validação Live entregue ao 0 conforme despacho.

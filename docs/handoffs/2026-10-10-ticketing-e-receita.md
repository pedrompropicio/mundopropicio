# Handoff — Ticketing & Receita — 10/10/2026

Arquivo da sessão longa; NÃO é fonte de estado. Consultar `docs/estado/estado-ticketing-e-receita.md` e GitHub #303 para trabalho em aberto.

## Decidido e entregue

- D-ERP231: apuramento separado do fecho e do acerto dos sócios; repasses/transitados sem atribuição a evento. 2558 e 3163 registados. PDF do 3163 anexado; posição documental −49.050,59. Bilheteira local Forum Braga resolvida pelo documento, não por diferença.
- D-ERP232: fecho mostra direito, sem abater adiantamentos. Quatro fechos migrados, três inalterados; forma de liquidação derivada e correcção manual próprias. Repasses retirados do modal; 25 registos preservados e carimbados como legado.
- D-ERP233: cinco FKs dos adiantamentos repostas e embed de apuramentos desambiguado. Apuramentos tem separador próprio e histórico de adiantamentos; heurística dos 15% removida.
- Três cartões e subtotais por apuramento entregues. Valor por apurar soma SALDOS dos eventos sem fecho E sem apuramento; liquidados em dinheiro entram a zero. Identidade para posição negativa: valor por apurar − já adiantado + diferença de calendário = saldo retido. Diferença é calendário normal, nunca pendência/tarefa/alerta.

## Porquê

- Retido é dinheiro verdadeiro da MP e já inclui a posição apurada: nunca descontar essa posição de novo.
- Repasses quinzenais são genéricos; a atribuição por evento do modelo antigo foi feita para o fecho dar zero e não prova a origem do dinheiro.
- Acordo verbal de repasse em torno de 85% não tem valor de cálculo nem alarme.
- `coalesce(total_value, quantity * unit_price)` evita ler como zero vendas com `total_value` NULL; este foi o erro nos M&M. Usar a fonte agregada da base.
- Sem FK, embed PostgREST falha e erro engolido deixa ecrã vazio: conferir FKs e comportamento da API.

## Por fazer

- #303 fica aberta: reconstruir a cadeia com PDFs anteriores ao 3163. Ivete e H&K Porto têm fecho sem apuramento; M&M Lisboa/Porto, liquidados a zero, sem ambos. Não criar registos por inferência.
- Reconciliar linha a linha o apuramento com o PDF Ticketline: o total fecha, o corte do documento ainda não é espelhado.
- Resolver ligação «ver apuramento» que precisa de abrir o separador antes da âncora.
- Mantidos #211, #78, #73 e prova de isolamento com sessão válida de outra empresa. #304/#305 abertas noutras frentes.

## Limites e validação

- Retido/direitos/adiantamentos e protecção só-leitura ficaram inalterados nas verificações da implementação; testes focados e ecrã desktop/mobile verificados na sessão.
- Este ritual altera só documentação e comentário GitHub. Nenhum código ou dado financeiro alterado; sem Publish.
- Não escrever saldo retido, valor por apurar ou diferença: são móveis e consultam-se na hora. Esta passagem guarda só a posição do documento.

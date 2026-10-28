# Guia da Posição Financeira — como ler cada número

Versão de 28/10/2026 (Claude Doc do Pedro). Os exemplos são **valores de 28/10/2026**, MP, todos os anos; servem só para ler o guia — o ecrã mostra sempre os valores do dia.

## Regras {#regras}

- **Caixa e retido nunca se somam.** A caixa é dinheiro da MP; o retido está nas bilheteiras.
- **A pagar** = faturas lançadas + saldo de BP por lançar dos eventos já iniciados.
- Eventos ainda não iniciados só entram no a pagar pelas transações; o BP por lançar deles só aparece na cobertura de eventos futuros.
- Todos os valores incluem IVA.
- O BP é provisório: muda até ao fecho do evento.

## A pagar {#a-pagar}

- **O que é:** o que a empresa ainda vai pagar.
- **Fórmula:** compromisso em transações + saldo de BP por lançar.
- **Compromisso em transações:** Σ por estágio de lançado + sem BP + só transações.
- **Saldo de BP por lançar:** linhas de BP confirmadas, ajustadas ou por rever ainda sem fatura.
- **Fora do total:** transitórias (repasses, mostradas à parte) e cachês (informativo, já incluídos).
- **Origem:** função de leitura da posição financeira (a_pagar.por_estagio).
- **Exemplo (valores de 28/10/2026):** compromisso 594.081,75 + BP por lançar 405.583,36 = a pagar 999.665,12.

## Cobertura de eventos futuros {#cobertura}

- **Vendas futuras:** bilhetes já vendidos de eventos futuros (só para comparação).
- **Despesas pagas, a pagar lançado, BP por lançar:** custo do evento em cada estado.
- **Aporte de sócios:** o que os sócios já puseram no evento.
- **Aporte MP (estimativa):** despesas pagas − aporte de sócios.
- **Dinheiro de eventos em conta:** dinheiro do evento parado nas contas.
- **Caixa MP adiantado:** caixa da MP usada antes de entrar receita.
- **Saído mínimo das bilheteiras:** vendas − retido; é um mínimo.

## Necessidade de financiamento {#necessidade}

- **Fórmula:** a pagar lançado + BP por lançar − dinheiro do evento em conta, por evento, nunca negativa.
- **Leitura «faturas sem linha cobrem BP»:** retira do BP por lançar as faturas sem linha.
- **Bloco «com receita»:** potencial = max(0, receita considerada − saído mínimo); necessidade com receita = max(0, necessidade − potencial).
- **Exemplo (valores de 28/10/2026):** necessidade 1.047.936,17 / 881.399,21; com receita 532.756,01 / 366.219,05.

## Limites {#limites}

- O BP é provisório.
- O saído mínimo é um mínimo (bolsa Ticketline sem rateio).
- O retido não tem data de entrada.
- Eventos próximos ainda não iniciados: ver #389.
- Quem pagou cada despesa: ver #384/#385.
- Não há calendário de pagamentos.

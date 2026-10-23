# Auditoria de fornecedores — {{empresa}} · {{data}}

Todos os números consultados na base no momento da escrita ({{data_hora_utc}}).

## Ponto de partida e resultado

| | |
|---|---|
| Fornecedores com NIF, no início | {{n}} |
| Fornecedores com NIF, no fim | **{{n}}** |
| Corrigidos nesta sessão | **{{n}}** |
| Sem NIF, ainda com documento legível | {{n}} — {{valor}} de valor pago |

{{n_lotes}} lotes, {{n}} fornecedores analisados: **{{n}} acertos, {{n}} `REVER`, {{n}} falsos positivos.**

## O método

1. {{passo}}

## As regras que evitaram erros

- {{regra}}

## Porque falham os que falham

1. **{{padrao}}.** {{explicacao}}

## Os grandes que ficam

| Fornecedor | Pago | Onde está o NIF |
|---|---:|---|
| {{fornecedor}} | {{valor}} | {{onde}} |

## Validadores

| Verificação | Resultado |
|---|---|
| NIF português com dígito de controlo inválido | {{n}} |
| Colisões de NIF | {{n}} |
| Colisões de IBAN | {{n}} |
| Fichas candidatas a duplicado | {{n}} |

## Achados colaterais

{{achados}}

## Para outras frentes

- **{{frente}}** — {{o_que_vai}}

# DRE gerencial — {{empresa}} · {{periodo}}

Números consultados em Live a {{data_hora_utc}}.

> **Esta DRE é gerencial.** A DRE contabilística é emitida pela contabilidade; os dois números
> não têm de ser iguais. Por omissão, a receita de bilheteira vem de `ticket_sales` e o custo
> de evento vem do BP, não das transações.

## 1. Receita

| Origem | n | Valor s/IVA |
|---|---:|---:|
| Bilheteira | {{n}} | {{valor}} |
| {{rubrica}} | {{n}} | {{valor}} |
| **Total** | | **{{receita_total}}** |

## 2. Custo de evento (BP aprovado)

| Evento | Linhas | s/IVA |
|---|---:|---:|
| {{evento}} | {{n}} | {{valor}} |
| **Total** | | **{{custo_eventos}}** |

## 3. Custos corporativos

| Grupo | n | s/IVA |
|---|---:|---:|
| {{grupo}} — {{nome}} | {{n}} | {{valor}} |
| **Total** | | **{{custos_corporativos}}** |

## 4. Resultado

| | |
|---|---:|
| Receita | {{receita_total}} |
| − Custo de evento | {{custo_eventos}} |
| − Custos corporativos | {{custos_corporativos}} |
| **RESULTADO** | **{{resultado}}** |

## 5. O que ficou de fora, e porquê

| Conta ou marca | n | Total | Porquê |
|---|---:|---:|---|
| {{conta}} | {{n}} | {{valor}} | {{motivo}} |

## 6. Controlo — linhas que caem fora de todas as secções

| Rubrica | Tipo da rubrica | Tipo da transação | n | Total |
|---|---|---|---:|---:|
| {{rubrica}} | {{tipo_rubrica}} | {{tipo_tx}} | {{n}} | {{valor}} |

**{{zero_ou_o_que_fazer}}**

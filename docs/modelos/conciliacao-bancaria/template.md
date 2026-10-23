# Conciliação bancária — {{conta}} · {{periodo}}

Frente: `financeiro-e-tesouraria`. Números consultados em Live a {{data_hora_utc}}.

## 1. O extrato

{{n_linhas}} linhas · {{n_pre_corte}} pré-corte · {{n_conciliadas}} conciliadas · {{n_por_explicar}} por explicar.

## 2. A diferença

| | € |
|---|---:|
| Saldo do sistema a {{data}} | {{saldo_sistema}} |
| Saldo declarado pelo banco | {{saldo_banco}} |
| **Diferença** | **{{diferenca}}** |

## 3. A decomposição

| Parcela | € |
|---|---:|
| Linhas por explicar | {{valor}} |
| Transações sem movimento no banco | {{valor}} |
| Retenção identificada à parte | {{valor}} |
| **Resto sem explicação** | **{{valor}}** |

{{frase_sobre_o_resto}}

## 4. As linhas por explicar

{{n_entradas}} entradas ({{valor}}) e {{n_saidas}} saídas ({{valor}}).

- **{{grupo}}, {{valor}}** — {{o_que_e_e_onde_vai}}

## 5. Transações sem movimento no banco

| Data | Descrição | Valor | O que se descobriu |
|---|---|---:|---|
| {{data}} | {{descricao}} | {{valor}} | {{explicacao}} |

## 6. O que se corrigiu

{{correcoes}}

## 7. Por lançar

{{pendentes}}

# Conciliação do cartão pré-pago {{cartao}} — {{data}}

Chat: `financeiro-e-tesouraria`. Base Live `{{supabase_ref}}`, company `{{company_id}}`.
Números consultados a {{data_hora_utc}}.

## 1. Âncora

A {{data_ancora}}, cartão e sistema tinham ambos **{{saldo_ancora}}**. {{como_foi_estabelecida}}

## 2. Desde a âncora

| Desde {{data_ancora}} | Banco | Sistema |
|---|---|---|
| Débitos | {{debitos_banco}} ({{n}}) | {{debitos_sistema}} ({{n}}) |
| Créditos | {{creditos_banco}} ({{n}}) | {{creditos_sistema}} ({{n}}) |

## 3. A diferença, decomposta

Diferença {{diferenca}} = {{parcela_1}} de {{motivo_1}} + {{parcela_2}} de {{motivo_2}}.

## 4. Os achados

1. **{{fornecedor_ou_tipo}} {{data}}, {{valor}}** — no banco {{o_que_o_banco_tem}}; no sistema {{o_que_o_sistema_tem}}. {{qual_esta_certo}}
2. …

## 5. Correções executadas

- Transação `{{id}}` ({{valor}}): {{o_que_mudou}}, com `transaction_audit_log`.
- {{nova_entrada_ou_rejeicao}}
- Acerto de conciliação de {{valor}}, `exclude_from_result`, a {{data}}.

## 6. Resultado

**{{saldo_sistema}} no sistema = {{saldo_banco}} no banco.**

ou

```
Saldo contabilístico                     {{valor}}
− itens aprovados por integrar           {{valor}}
= Saldo real estimado                    {{valor}}
− despesas no cartão ainda não lançadas  {{valor}}
= {{valor}}  = saldo do banco
```

## 7. Armadilhas descobertas

- {{armadilha}}

## 8. Issues

- **#{{n}}** — {{uma_linha}}. {{estado}}

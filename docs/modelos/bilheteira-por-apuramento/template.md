# Posição da conta-corrente {{empresa}} ↔ {{bilheteira}} — {{data}}

Frente: `ticketing-e-receita`. Números consultados em Live a **{{data_hora_utc}}**, por
`query_database`.

## A posição

```
Vendas dos eventos em venda, ainda sem apuramento ....  {{vendas_em_aberto}}
  {{evento}} ......................... {{valor}}
  {{evento}} ......................... {{valor}}

− saldo transitado do apuramento {{n_apuramento}} .... {{saldo_transitado}}

                                                      ────────────
POSIÇÃO A FAVOR DE {{quem}} ..........................  {{posicao}}
```

**{{frase_em_uma_linha}}**

## O mesmo número pelo outro caminho

```
Vendas totais na bilheteira ......... {{vendas_totais}}
− despesas .............................. {{despesas}}
− transferências ..................... {{transferencias}}
                                      ─────────────
                                         {{posicao}}
```

Bate com `_ticket_office_balance_raw`: {{sim_ou_a_diferenca}}.

## O débito que transita, decomposto

```
{{evento}} .... {{bruto}} − {{faturas}} ({{ref}}) − {{repasses}} ({{n}} repasses) = {{saldo}}
{{evento}} .... {{bruto}} − {{despesas}}           − {{acerto}}                   = {{saldo}}
                                                                                  ───────────
Saldo do apuramento {{n_apuramento}} ............................................ {{saldo_transitado}}
```

## Porque a leitura de {{data_anterior}} já não serve

{{o_que_mudou}}

## Factos que não se reinvestigam

{{factos_provados_nesta_passagem}}

## O que fica por fazer nesta frente

{{pendentes}}

---

### Bloco para a equipa (WhatsApp), quando se justificar

```
*Posição {{bilheteira}} — {{data}}*

Vendas em aberto: {{vendas_em_aberto}}
Saldo transitado: {{saldo_transitado}}
*A favor de {{quem}}: {{posicao}}*

Fonte: Live, {{data_hora_utc}}
```

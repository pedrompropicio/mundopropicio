# Prestação de contas — {{evento}}

Documento para {{destinatario}}. Dados do ERP em {{data_leitura}} · valores em euros · evento `{{event_id}}`.
Fechamento selado a {{data_selo}} por {{quem}}.

## 0. Como ler este documento

Lê-se de cima a baixo. Cada número tem à direita a explicação de onde vem. Os valores marcados
como **sistema** vêm directamente do ERP e conferem-se no anexo. Os marcados como **acordo** são
parâmetros do contrato — não existem em sistema nenhum. Tudo o resto é conta feita a partir das
anteriores. No fim há duas conferências que têm de dar zero.

## 1. A pergunta a que este documento responde

{{uma_frase}}

## 2. Receitas do evento (s/IVA)

| Origem | Descrição | Onde está no sistema | Valor s/IVA |
|---|---|---|---:|
| {{origem}} | {{descricao}} | {{fonte}} | {{valor}} |
| | | **TOTAL** | **{{receitas}}** |

## 3. Despesas

| | |
|---|---:|
| Despesas s/IVA | {{desp_siva}} |
| IVA das despesas | {{iva}} |
| **Despesas c/IVA** | **{{desp_civa}}** |

É o valor c/IVA que entra na repartição. O IVA é recuperável e volta na secção 5.

## 4. Resultado e repartição

| | |
|---|---:|
| **RESULTADO DO EVENTO** | **{{resultado}}** |
| {{parte_1}} — {{quota}} | {{valor}} |
| {{parte_2}} — {{quota}} | {{valor}} |

## 5. O que fica fora da repartição

| Linha | Valor | Porquê |
|---|---:|---|
| {{linha}} | {{valor}} | {{explicacao}} |
| **Total** | **{{activos}}** | |

## 6. Conferências

| | |
|---|---:|
| CONFERÊNCIA 1 — tem de ser 0,00 | {{c1}} |
| CONFERÊNCIA 2 — tem de ser 0,00 | {{c2}} |

## 7. O que ainda não está fechado

{{pendencias}}

## 8. Anexo — bases do ERP

{{linhas_do_anexo}}

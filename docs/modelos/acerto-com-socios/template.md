# Acerto entre sócios — {{evento}}

Documento explicativo para {{destinatario}}. Dados do ERP em {{data_leitura}} · valores em euros · evento `{{event_id}}`.

## 0. Como ler este documento

Lê-se de cima a baixo. **Verde** vem do ERP e confere-se no anexo. **Amarelo** é parâmetro do
acordo — não existe em sistema nenhum, é o que foi negociado, e pode ser alterado aqui: tudo o
resto recalcula sozinho. Sem cor é conta feita. No fim, duas conferências que têm de dar zero.

## 1. A pergunta a que responde

Quanto é que {{A}} tem de transferir a {{B}}, e porquê. Em três movimentos: apura-se o resultado
e reparte-se pelo contrato; acrescenta-se o que fica fora dessa repartição; acerta-se quem já
pagou o quê e quem tem que dinheiro em mãos.

## 2. A negociação

| Parâmetro | Valor |
|---|---:| 
| {{quota}} | {{valor}} |

## 3. Receitas do evento (s/IVA)  ·  4. Despesas

| | |
|---|---:|
| Receitas (s/IVA) | {{receitas}} |
| Despesas s/IVA | {{desp_siva}} |
| IVA das despesas | {{iva}} |
| **Despesas c/IVA** | **{{desp_civa}}** |

## 5. Resultado e cascata

| | |
|---|---:|
| **RESULTADO DO EVENTO** | **{{resultado}}** |
| {{parte}} — {{quota}} | {{valor}} |

## 6. O que fica fora da repartição

| Linha | Valor | Porquê |
|---|---:|---|
| IVA das despesas devolvido à sociedade | {{iva}} | recuperável do Estado; a repartição foi feita c/IVA |
| {{activo_exclusivo}} | {{valor}} | {{porque}} |
| **Total** | **{{activos}}** | |

## 7. Quanto vale para cada uma

| | |
|---|---:|
| **TOTAL DA SOCIEDADE** | **{{total}}** |
| Direito de {{A}} | {{valor}} |
| Direito de {{B}} | {{valor}} |

## 8. O que {{B}} já pagou e já tem em mãos

| | |
|---|---:|
| Despesas pagas por {{B}} (s/IVA) | {{valor}} |
| {{ajustes}} | {{valor}} |
| **Desembolso efectivo** | **{{valor}}** |
| − receitas que {{B}} tem em mãos | {{valor}} |
| **FINANCIAMENTO a devolver a {{B}}** | **{{valor}}** |

## 9. Quanto {{A}} transfere a {{B}}

| | |
|---|---:|
| Financiamento a devolver | {{valor}} |
| Lucro de {{B}} | {{valor}} |
| **A TRANSFERIR** | **{{valor}}** |

## 10. As regras que não são óbvias

**{{titulo_da_regra}}** — {{explicacao_em_prosa_curta}}

## 11. Conferências

| | |
|---|---:|
| CONFERÊNCIA 1 — tem de ser 0,00 | {{c1}} |
| CONFERÊNCIA 2 — tem de ser 0,00 | {{c2}} |

## 12. O que ainda não está fechado

{{pendencias}}

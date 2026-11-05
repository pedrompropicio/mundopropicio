# Issue #419 — decisões para os passos seguintes

Estado: proposta D-ERP; numerar ao passar para DECISIONS.md depois do #594.
Origem: Pedro, 01/11/2026; autorização da preparação E2b 6621058216
(#419, corpo; 6552106170; 6552125838). O despacho prevalece sobre o corpo antigo.

## D1 — valor pago e pernas

Recusar perna paga manual em transação com pernas «base D-ERP157»:

> Já existe pagamento registado pelo valor pago; estorne-o antes.

Pagar só por pernas (~37 ficheiros): Issue própria.

## D2 — repagamento e estorno definitivo

Libertada para repagamento (`pending`) aceita pagamento; estorno definitivo
(`reversed`) recusa a perna paga:

> Transação estornada definitivamente: lance uma transação nova.

`clear_reversal_on_repay` deixa de limpar estornos definitivos.

## D3 — mudança de rubrica numa transação ligada ao BP

Mudar a rubrica de tx ligada ao BP = mudar de linha: destino viva, mesmo evento,
rubrica nova, saldo (verba − realizado ≥ valor) ou complemento no mesmo acto com
observação obrigatória; regista linhas, complemento e observação; sem destino recusa:

> A rubrica desta transação vem da linha de BP <código>. Para a mudar, escolha a linha de destino (ou reforce a verba dela, com observação).

## Sequência e limites desta entrega

1. G1–G4: 0318 preparada, sem aplicar, depois da 0298; prova local em PGlite.
2. G5a, G5b, D1, D2: fora desta entrega; articulação com #341.
3. D3: fora desta entrega.

As decisões acima ficam registadas, sem implementação dos passos 2–3 e sem alterar
`docs/DECISIONS.md` ou `.lovable/`. A prova da janela fica em `prova-janela.sql`;
as medições de 01/11 são referências fornecidas pelo despacho, não novas consultas Live.

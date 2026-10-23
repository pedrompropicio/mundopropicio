# Acerto com sócios — nível 2

**Para que serve.** Dizer quanto é que uma parte transfere à outra, depois de apurado o resultado do evento: o que cada uma tem direito, o que já desembolsou, e o que já tem em mãos.
**Quando se usa / quando não.** Quando há cascata entre sócios, activos exclusivos de um nível, ou encontro de contas — tudo o que **o ERP não faz**. O ERP para no nível 1; isto vive na planilha, anexada ao evento. Se o acerto é uma quota simples sobre o resultado, não é preciso este modelo: sai do próprio Fecho.
**Chat dono.** 7 · Fecho e Sócios
**Fontes.** `event_forecasts`, `event_partners`, `transactions`, ficheiros de operadores de A&B (fora do ERP) — ver `queries.sql`
**Saída.** xlsx (a planilha é o documento) com resumo em md; língua pt-PT

## Secções, por ordem

1. **Como ler** — o que é dado do sistema, o que é parâmetro do acordo, o que é conta feita.
2. **A pergunta** — quanto é que A transfere a B, e porquê, em três movimentos.
3. **A negociação** — as quotas, como parâmetros editáveis. Tudo o resto recalcula.
4. **Receitas** e **5. Despesas** — do ERP, com o anexo a sustentar.
6. **O resultado e a cascata.**
7. **O que fica fora da repartição** — IVA recuperável, activos exclusivos, créditos.
8. **Quanto vale para cada uma.**
9. **O que cada parte já pagou e já tem em mãos** — desembolso efectivo menos receitas retidas.
10. **Quanto se transfere.**
11. **As regras que não são óbvias** — uma por cada decisão que daqui a três meses ninguém se lembra.
12. **Conferências** — as duas a 0,00.
13. **O que ainda não está fechado.**

## Regras de forma

- **Células de três cores, e a legenda no topo:** verde = vem do ERP e confere-se no anexo; amarelo = parâmetro do acordo, não existe em sistema nenhum; sem cor = conta feita. É o que torna a planilha auditável por quem não a fez.
- **As duas conferências têm de dar 0,00**: a primeira prova que a soma do que cada um leva é igual ao dinheiro que existe; a segunda, que depois de pagar toda a gente sobra exactamente o direito de quem fica. **Zero prova coerência, não correcção.**
- **Um gerador por documento.** Dois scripts a produzir a mesma planilha divergem e as conferências fecham à mesma se o erro for simétrico. Encontrar um segundo é motivo para o apagar.
- Documentos que saem em par partem do **mesmo total de despesa do ERP**.
- **Responsabilidade, não caixa**: cada valor é atribuído a quem responde por ele, tenha ou não sido recebido.
- Não se escreve em prosa porque é que um sócio tem condição diferente de outro.
- Antes de gerar: confirmar que nenhuma linha tem mais de duas casas decimais, e recalcular o ficheiro (`recalc.py`) antes de o enviar.

## O que fica de fora

- A conferência do evento — `PROC-fecho-evento.md`.
- O documento de nível 1 — modelo `fecho-evento`.
- Qualquer alteração ao BP. Se um número do BP está errado, corrige-se no BP e **regera-se**; não se corrige na planilha.

## Decisões que o condicionam

- **O ERP para no nível 1.** Cascatas entre alguns sócios, activos exclusivos e encontros de contas vivem na planilha anexada ao evento.
- **IVA recuperável volta inteiro à sociedade** na secção 7: a repartição foi feita com despesas c/IVA, e esse IVA não é custo.
- **Overhead**: linhas de imputação interna entre duas empresas são custo num documento e saem no outro, de propósito. Quando sai, sai **pela base** — o IVA já regressa pela via normal, e somá-lo aqui conta duas vezes. E repete-se na conferência 2, porque quem figura como pagador não o desembolsa. **São as duas pontas da mesma linha; sem qualquer uma a conferência falha.**
- **Base de IVA por sócio pela sede fiscal**: PT → s/IVA, BR → c/IVA. Receitas sempre s/IVA.
- Receita de A&B operada por terceiros: a quota lançada no ERP já passou pela repartição; do ficheiro do operador abate-se essa quota antes de somar o resto, senão conta duas vezes. Usar o resultado **sem open bar** quando os custos de open bar já estão no BP.

## Histórico

- 2026-10-23 — criado a partir de `claude/fecho-socios-anitta-mp-ein-gerador.md` (v23, gerador único), com `claude/fecho-socios-anitta-mp-ein-especificacao.md`, `claude/ivete-2026-apuracao-por-socio-iva-2026-08-28.md` e `claude/encontro-de-contas-conta-de-acerto-socio-2026-09-03.md`.

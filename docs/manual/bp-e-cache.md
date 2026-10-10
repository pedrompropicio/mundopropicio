---
capitulo: bp-e-cache
titulo: BP e cachê
modulo: erp
atualizado: 2026-10-10
perfis: [manager, admin, editor]
rotas: [/eventos/:id]
fontes: [D1, D11, D-ERP3, D-ERP131, D-ERP149, D-ERP220, D-ERP242, D-ERP297, cache_module, real-cache-calc, cache-effective-amount, bp-governance-and-revision, bp-active-passive-bypass-logic]
---

# BP e cachê

O **Business Plan (BP)** é o orçamento do evento, linha a linha. O evento **fecha pelo BP** (D-ERP3): o custo de cada rubrica é o previsto aprovado, ou o realizado se passar dele. As transações confirmam o BP; não o substituem.

---

## Com BP ou sem BP

```ajuda
id: bp.modo
tooltip: "Com BP: cada despesa liga a uma linha do BP e não passa da verba. Sem BP: o BP é só referência. O padrão vem da empresa e pode mudar-se no evento (admin/gestor)."
ecras: [evento.criar, evento.editar]
perfis: [manager, admin]
fontes: [D-ERP220, D1]
termos: [com bp, sem bp, modo do bp, budget mode, bp ativo, bp passivo]
```

- **Com BP** — toda a despesa precisa de uma linha de BP do **mesmo evento** (D1, D-ERP224).
- **Sem BP** — lança-se em qualquer rubrica; o BP serve só para comparar.
- Na criação escolhe-se um dos dois; o padrão é o da empresa (Administração).

---

## Linhas, aprovação e versões

```ajuda
id: bp.linhas
tooltip: "Cada linha tem rubrica L3, valor líquido (sem IVA) e taxa de IVA. Só admin e gestor aprovam. Alterar uma linha aprovada exige justificação, que fica no histórico."
ecras: [evento.bp]
perfis: [manager, admin, editor]
fontes: [bp-governance-and-revision, D11]
termos: [linha do bp, aprovar bp, previsões, justificação, histórico do bp]
```

- O valor é sempre **líquido**; o IVA calcula-se pela taxa (D11).
- A primeira aprovação num evento em Planeamento ou Confirmado passa-o a **Ativo**.
- Versões congeladas (snapshots, cenários promovidos) **não se editam**: a base recusa escrever fora da versão de trabalho (D-ERP297).

```text
Rascunho ──aprovar──▶ Aprovada ──transação──▶ Realizado
                         │
                         └── editar valor ⇒ justificação + auditoria
```

---

## Linhas com fórmula

```ajuda
id: bp.formula
tooltip: "Uma linha pode valer uma % da receita de bilhetes ou um custo por pessoa. Antes do evento usa o previsto do simulador; depois, as vendas reais (líquidas)."
ecras: [evento.bp]
perfis: [manager, admin]
fontes: [D-ERP149]
termos: [fórmula, percentagem da receita, custo por pessoa, per head]
```

- **% da receita de bilhetes** — sobre a receita líquida de todas as fontes ligadas às zonas do evento.
- **Por pessoa** — valor × público.
- Antes do evento: previsto do simulador; com filtro de zonas, o real até hoje. Depois do evento: real.

---

## A verba da linha

```ajuda
id: bp.verba
tooltip: "Uma despesa aprovada não pode pôr a linha acima da verba. O formulário avisa e oferece elevar a verba no mesmo acto; sem elevar, a despesa fica pendente."
ecras: [transacao.form, evento.bp]
perfis: [manager, admin, editor]
fontes: [D-ERP242]
termos: [verba, ultrapassar o bp, elevar verba, acima do bp, excesso]
```

- Realizado da linha = despesas aprovadas/pagas, sem transitórias, excluídas, revertidas nem escondidas.
- Excesso → aviso com **Elevar verba**; a base recusa aprovar acima da verba sem elevação.
- Pagar uma despesa já aprovada não é bloqueado.

---

## Verba por usar no fecho

```ajuda
id: bp.verba-por-usar
tooltip: "Antes de selar, cada linha com saldo precisa de uma decisão: fatura por chegar, pago por sócio, ou ajustar o previsto. Senão o sócio recebe a menos."
ecras: [evento.fecho]
perfis: [manager, admin]
fontes: [D-ERP131]
termos: [verba por usar, saldo do bp, previsto que resta, fecho por linha]
```

O saldo de cada linha conta como custo no acerto. Por isso, por linha: **custo real (fatura por chegar)**, **pago por sócio** ou **ajustar**.

---

## Cachê das atrações

```ajuda
id: cache.config
tooltip: "Fixo, % da receita (bruta ou líquida) ou escalões por ocupação. Às deduções por rubrica e à dedução percentual segue-se a % do artista. As linhas de cachê do BP são geridas pelo módulo e não se editam à mão."
ecras: [evento.cache]
perfis: [manager, admin]
fontes: [cache_module, real-cache-calc, cache-effective-amount]
termos: [cachê, cache, artista, cachê variável, garantia mínima, escalões, deduções do cachê]
```

```text
(Receita − deduções por rubrica − dedução %) × % do artista = Cachê bruto
Cachê bruto − extras a descontar = Cachê líquido a pagar
```

- **Valor efectivo** (uma só fonte): acerto por cidade (turnê) > valor ajustado > real congelado > cálculo dinâmico.
- As linhas do BP com origem no cachê (`cache_module`) ficam trancadas; muda-se o cachê, não a linha.
- **Extras a descontar** (hotel, transfer…) não geram transação: só abatem no acerto do artista.

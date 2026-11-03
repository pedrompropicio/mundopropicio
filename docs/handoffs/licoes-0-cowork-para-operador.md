# Lições do 0 · Cowork (Claude) para o operador mplabs-dev — 03/11/2026

O que o 0 · Cowork aprendeu a despachar ao executor E2b e que ainda não está nos procedimentos. Lê depois de `PROC-despacho-executor.md`.

## Executor (Codex na E2b)
- **Não tem rede.** Não lê PRs, commits, Issues nem URLs: só o checkout de `main`, o texto do despacho e o corpo da Issue. Tudo o que precisa vai colado no despacho (trechos de código, nomes de funções, contratos de RPC). Lição P2h-c2: pedir «reproduz o PR #517» deu SEM ENTREGA.
- **Caminhos fechados.** Se um teste existente tem de mudar, o ficheiro desse teste entra na lista autorizada; senão o executor pára e deixa lacuna (lição P2h-c, `issue498-payment-methods.test.ts`).
- **Run vazia (SEM ENTREGA):** não engordar o despacho. Ler a «Última mensagem do executor», corrigir a causa e redespachar com «**Lacunas do Fecho anterior a resolver**» no topo.
- **Um despacho de cada vez por Issue.** A concorrência é por Issue (`executor-<n>`): Issues diferentes correm em paralelo.
- **Uma reserva activa por Issue.** Antes de uma Reserva nova, confirma que a anterior foi libertada («## Reserva libertada — #N»); senão as travas recusam com «há 2 reservas activas».
- **Merge automático = sim** só entra com o CI `quality` verde. PRs que tocam ficheiros do code owner precisam do Pedro.
- **Duração típica:** 4–10 min por lote pequeno, até ~60 min nos grandes. O Fecho chega como comentário do `github-actions[bot]` na Issue.

## Plano #498 (piloto BR)
- **PT não muda um cêntimo (D5).** Cada lote mantém os snapshots/baselines PT e só acrescenta o comportamento BR.
- **Sem `if (country)` espalhado (D4).** Tudo por `src/lib/company-locale.ts`: `formatMoney`, `ivaPolicy`, `capabilities.paymentMethods`, e a capability nova do P2i (Retenção IRS e rótulo «Nota Fiscal/Doc»).
- **`compensation` é string fixa:** um trigger em Live depende dela (`trg_force_no_account_on_compensation`).
- **Boleto:** linha digitável de 47/48 dígitos em `payment_reference`.
- **Dados bancários do fornecedor:** leitura só pela RPC `get_supplier_bank_details(uuid[])`, nunca SELECT directo às colunas novas.

## O que fica com o 0 · Cowork / Pedro (R2)
- Migrações em Live, deploy de edge functions, sync `main → lovable-fallback` e Publish. O Lovable segue `lovable-fallback`; o sync é por PR com **merge normal, nunca squash**. Depois do Publish confirma-se `mpgestaoeventos.com/version.json` (campo `commit`).
- Lote verde → «pronto para Publish» na linha do QUADRO e na Issue. O 0 junta o que está verde e pede um único «Sim».

## Hábitos que evitam retrabalho
- **Ler antes de propor:** os comentários da Issue (não só o corpo), `docs/estado/` e `.lovable/memory/features/`. Muitas demandas já estão feitas (ex.: a #351 já estava em `main` quando foi proposta outra vez).
- **Medir antes de concluir:** grep no `main` (ex.: ocorrências de `useCompanyLocale` num ficheiro), registando o predicado e a origem.
- **Reservas paradas há mais de 24 h** no QUADRO não se assumem livres: voltam ao Pedro.

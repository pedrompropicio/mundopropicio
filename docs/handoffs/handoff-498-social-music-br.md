# Handoff — #498 piloto Brasil/Real (Social Music) → operador mplabs-dev

Data: 03/11/2026, 04:20 UTC. Origem: 0 · Cowork (Claude). Decisão do Pedro: o operador `mplabs-dev` toca o piloto a partir daqui. O 0 · Cowork fica suspenso para poupar créditos e só volta para R2 (janela e Publish).

Antes de agir lê `docs/handoffs/licoes-0-cowork-para-operador.md` e o `plano.md`.

## 1. Objetivo e decisões fechadas (não reabrir)
- Objetivo: uma empresa com `companies.country='BR'` e `currency='BRL'` opera 100% em Real sem alterar nada em PT. Piloto: empresa **Social Music**, que usa o nome legal RF Comunicação no ERP.
- Moeda e locale vêm de `companies.currency/country`. Valores guardados na moeda da empresa, sem conversão. Consolidação entre moedas diferentes: bloquear com aviso, nunca somar nem converter.
- BR é gerencial: sem IVA obrigatório e sem cálculo fiscal. Impostos BR entram como linhas de dedução no BP/DRE.
- Tudo passa por `src/lib/company-locale.ts`, sem `if (country)` espalhado (D4). PT não muda um cêntimo (D5).
- Plano completo: `docs/testes/issue457/plano.md`.

## 2. O que já está em produção (Publish 1 e 2, 03/11/2026; produção no commit `237409270f`)
- P1a, P1b, P2a, P2b, P2c, P3a e P2h (até P2h-c3, PR #519).
- Migrações aplicadas em Live: cidades BR (30), 0302, 0303 (meios de pagamento `pix` e `boleto`; boleto exige linha digitável de 47/48 dígitos), 0304 (FX nativo em `transaction_payments`) e 0305 (colunas BR de fornecedor + RPC `get_supplier_bank_details`).
- Edge `update-transaction` deployada.
- Varredura no ERP como admin da Social Music: o selector de cidades mostra Brasil primeiro; Orçamento aparece em R$; transação em R$ sem IVA nem FX; métodos Pix, Boleto, TED e Débito automático; conta e fornecedor com Banco, Agência, Conta, Dígito, Pix e CNPJ. Comentário 6593754513.

## 3. Autorização e reservas
- Autorização vigente com `Operador: mplabs-dev`: comentário **6595115111** (R1, Codex, merge automático sim, validade **2026-11-10**). Cobre P1c–P1j, P2d–P2g, P2i e P3b–P3c.
- Reserva anterior libertada no comentário 6595036898. O PR #517 foi fechado.
- Antes de 2026-11-10, se ainda houver lotes, pede ao Pedro uma Autorização nova. É ele quem a publica (pelo 0 · Cowork ou à mão).

## 4. Fila de trabalho (por esta ordem)
1. **P2i** (decisão 6595055502): nas empresas BR ocultar o bloco «Retenção IRS declarada na fatura» e mudar o rótulo «Nº Fatura» para «Nota Fiscal/Doc». Faz-se com uma capability em `company-locale.ts`.
2. **P1c**: listas e relatórios. **Opção A: sem `ReportPartnerSettlement.tsx`**, porque a #404 tem uma reserva parada no QUADRO.
3. **P1j**: Contas (Saldo Inicial em €, KPI «Acertos em curso» em €, placeholder «Conta BPI»).
4. **P1e**: Posição Financeira (KPIs em €).
5. Depois P1d, P1f, P1g, P1h, P1i, P2d, P2e, P2f, P2g, P3b e P3c, pela ordem do plano.
6. **P2h-c4**: ao criar um fornecedor com um papel sem acesso bancário, os campos BR aparecem editáveis em vez de indisponíveis. Ver a revisão 6594471677.
7. **P4a–P4d** (edge functions): só como preparação R2, com Autorização R2 `ficheiros de migração` = sim. A aplicação é sempre do 0 · Cowork.

## 5. O que fica com o Pedro / 0 · Cowork (R2)
- Migrações e SQL em Live, deploy de edge functions, sync `main → lovable-fallback` (PR com merge normal) e Publish.
- Quando houver lotes verdes em `main`, escreve «pronto para Publish — #498: <lotes>» na Issue. O Pedro abre o 0 · Cowork e faz a janela.

## 6. Testes no ERP
- O operador não tem acesso ao Lovable, à base nem ao Supabase.
- Testes de ecrã: o Pedro cria para o operador um utilizador do ERP **só na empresa Social Music**. Esse utilizador tem papel admin, porque a Social Music é empresa de teste sem dados reais. Até lá, a validação visual é feita pelo Pedro.
- **Não usar o login pessoal do Pedro.** Cada pessoa usa o seu utilizador.
- O Claude Code web não controla o browser. A validação de ecrã com IA usa o Claude in Chrome no browser do operador, com o utilizador ERP dele.

## 7. Rotina por lote
Reserva → Despacho (contexto colado, caminhos fechados) → Fecho → revisão do PR contra os critérios → «Reserva libertada» → lote seguinte. Num SEM ENTREGA, redespacha com «Lacunas do Fecho anterior a resolver». Um despacho de cada vez nesta Issue.

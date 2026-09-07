# ESTADO — Fecho & Sócios

Atualizado: 2026-09-07 · Issues: #82, #65, #85, #68 · P0 aberto: nenhum

## Em que pé está
O apuramento da Anitta continua a fazer-se **fora do ERP**, em planilha (gerador v15), mas o ecrã de Fecho deixou de divergir do contrato: a base de cada sócio é a do respetivo contrato e o seletor de vista já não lhe toca. A Anitta está apurada e conferida, **não sacramentada**. A Ivete ainda não fechou.

## A trabalhar agora
- **#82** — fecho selado. É o que falta para um fecho entregue deixar de se recalcular sozinho quando alguém mexe num parâmetro. Precede o resto da frente.

## Feito em 31/08–01/09
- **#64 fechada.** `event_partners.expense_includes_iva` passou a anulável (NULL = herda o evento); os 6 registos existentes foram convertidos. A quota de cada sócio segue a base do contrato dele.
- **#67 fechada** — já estava construída e não tinha sido registada. `entity_documents` (polimórfica), bucket privado `entity-documents`, RLS completa e `EntityDocumentsSection` ligada ao separador Documentos do evento. Tipos: Fecho, Ata, Contrato, Acerto com sócio, Licença, Seguro, Outro. Zero registos — construída e ainda não usada.
- **Composição do custo visível.** Card "Custos" mostra a sublinha Overhead com +OH ligado; o Fecho rotula "Despesas operacionais (s/ overhead)" e mostra "Despesas totais" na Síntese Final. Totais inalterados.
- **Bloco interno "Posição da Mundo Propício"** no Encontro de Contas (nunca em PDF): reconcilia a posição real da empresa (s/IVA) contra a quota nominal apresentada. Ver D-ERP10.
- **Seletor de Apuramento** no Encontro de Contas: "por contrato de cada sócio" (default) ou "pela regra geral do evento". Estado local, nunca persistido, carimbado no PDF. No modo por contrato a casa apura s/IVA por convenção da empresa gestora.
- **Defeitos do PDF corrigidos:** rodapé "100%" falso com bases mistas passou a "TOTAL DISTRIBUÍDO"; linha "Retido na Mundo Propício" na folha de liquidez, que passou a fechar; numeração de secções sequencial; "-0,00 €" eliminado.
- **Relatórios individuais por sócio**, na base do destinatário, com coluna "A sua parte", nomes e percentagens de todos e valores só do próprio.

## Próximo passo concreto
Regerar a planilha da Anitta com o gerador v15 antes da apresentação. Corrigir as três linhas de hospedagem a 0% (#68) — 33.783,35 €, pagador EIN, que saem a 6% na fatura dela.

## Bloqueios
- **#65** é a mesma ferida da #64 vista do `EventFecho.tsx` — ainda por tratar.
- Congelados até depois da apresentação: `event_partners`, `event_forecasts` da Anitta, gerador da planilha.

## Factos que não se reinvestigam

**Regra da base de apuramento:** sede fiscal **PT** → s/IVA; sede **BR** → c/IVA. Receitas sempre s/IVA. O critério é a sede, não a origem. Falta `suppliers.tax_country` — migração preparada, nunca corrida.

**A Mundo Propício não é um `event_partner`.** É injetada no Encontro de Contas como "casa", com percentagem = 100 − Σ dos sócios. Não existe na tabela.

**Base de apresentação uniforme é decisão de negócio, não erro** (D-ERP10). A casa segue a base contratual do evento no documento apresentado aos sócios; a sua posição real é s/IVA. A diferença é IVA dedutível que fica na empresa. Acertos de IVA entre a MP e sócios portugueses tratam-se **fora do sistema** e arquivam-se no separador Documentos do evento, tipo "Acerto com sócio".

**Com bases mistas não existe resultado único** e a soma das quotas não fecha contra nenhum total. É propriedade do contrato, não defeito. Sinalizado no ecrã e no PDF.

**O evento fecha pelo BP** (D-ERP3). Em co-produção, a ausência de transações nas linhas pagas pelo sócio é o comportamento correto. Na Anitta são 80 linhas e 970.107,35 €, 77 com pagador sócio.

**Decisões de 30/08:** a última versão do BP contém só linhas com custo real; o snapshot faz-se **antes** da limpeza. O guarda-chuva de rubrica para despesas de equipa nasce a zero. O sistema não decide tratamento fiscal — produz a composição por taxa e uma pessoa decide `redebito` ou `reembolso`.

**Anitta, três linhas sem transação e sem pagador sócio** (Estrutura WC CNA 9.745, Copos 9.120, Assessoria de Imprensa 2.500): confirmado que aconteceram, à espera de fatura. Não zerar.

**Δ de método por reconciliar:** a query canónica de excedido dá 61.464,91 na Anitta contra os 63.544,11 do ecrã — 2.079,20 na rubrica 2.2.01 Aéreo. Número de fecho sai do ecrã ou da planilha, nunca de SQL ad-hoc.

**Nível 2 vive na planilha:** cascata MP/EIN, ativos exclusivos (bares 93.969,63 · Bengaleiro 138,82 · Oeiras 50.000), encontros de contas. `event_partners` não ganha conceito de ativo por sócio.

**Despesa com pagador sócio: a fatura é dele, o documento fiscal da MP é a refaturação.** Confirmado pelo Pedro em 07/09 para a EIN na Anitta: as faturas dos fornecedores saem em nome da EIN e ela emite depois uma fatura à MP a lastrear reembolso das despesas mais lucro. Consequências: (a) `paying_partner_id` diz quem desembolsa, nunca de quem é o custo fiscal; (b) essas linhas de BP **nunca podem virar transações com fatura de fornecedor no ERP** — seria contar o custo duas vezes quando a fatura da EIN chegar; (c) as 124 linhas da EIN, 1.170.562,18 € de base, que vivem só no BP, estão corretas assim e não são um buraco; (d) a linha do BP é a verdade de gestão e a fatura do sócio é a verdade fiscal, e reconciliam pelo total, nunca linha a linha.

**Risco de IVA na refaturação, por confirmar com a EIN.** Das 124 linhas da EIN, 16 estão a 0% e somam 236.899,69 € (PSP, bombeiros, marinha, licenças). Se a EIN refaturar tudo a 23%, cria ~54.487 € de IVA que hoje não existe. E a secção 5 da planilha de fecho devolve à sociedade o IVA total das despesas, do qual 214.742,43 € são das linhas da EIN — se essas faturas são dela, é ela que o recupera, e quando a fatura da EIN chegar com IVA próprio a MP recupera outra vez. Rever antes de regerar o fecho.

**O recurso do evento que está com a EIN tem origem documental.** Por instrução da MP, a Ticketline transferiu 905.000,00 € diretamente para a EIN em 04/09/2026, ficando 402.836,17 € por liquidar para a MP. Os documentos de fecho da Ticketline são todos em nome da Mundo Propício — a bilhética é da MP, os 905.000 são uma instrução de pagamento e não uma venda da EIN. Revenue share: 5% sobre 2.211.170,00 de vendas web = 110.558,50 + IVA = 135.986,96, faturado pela MP à Ticketline em 07/09 (FT 2026 101). Bate com o fecho: 4% entram como receita do evento, 1% fica como ativo exclusivo MP+EIN.

**A conta "Pgto Mágicos Acerto Madrid" é o veículo de devolução do H&K, não financiamento de eventos.** A MP financiou o evento de Madrid acima dos seus 30%; o H&K devolve esse excesso pagando, em reais, contas que a MP tinha no Brasil. As despesas de outros eventos pagas por ali são contas da MP e o H&K é só o canal — não existe dívida entre eventos. Por isso o aporte tem `flow = partner_settlement` e não `event_cash`: nunca entrou no caixa de Madrid.

## Onde ler mais
- `docs/procedimentos/PROC-fecho-evento.md`
- `.lovable/memory/features/fecho-filter-parity.md`, `partner-settlement.md`, `event-cost-basis.md`
- `docs/DECISIONS.md` — D-ERP3, D-ERP4, D-ERP9, D-ERP10
- Issues #82, #65, #85, #68
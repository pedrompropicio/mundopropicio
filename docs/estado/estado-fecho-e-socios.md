# ESTADO — Fecho & Sócios

Atualizado: 2026-09-01 · Issues: #82, #65, #85, #68 · P0 aberto: nenhum

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

## Onde ler mais
- `docs/procedimentos/PROC-fecho-evento.md`
- `.lovable/memory/features/fecho-filter-parity.md`, `partner-settlement.md`, `event-cost-basis.md`
- `docs/DECISIONS.md` — D-ERP3, D-ERP4, D-ERP9, D-ERP10
- Issues #82, #65, #85, #68
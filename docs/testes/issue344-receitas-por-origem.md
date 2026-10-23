# #344 — Receitas por origem no documento do sócio

23/10/2026 · executor 7 · Fecho e Sócios (Claude), agente Lovable.
R1 autorizado por Pedro. HEAD de partida conferido: `32b29d4288337746d1417479cb3ce07343049281`.
Pacote funcional e testes presentes no commit local `b76f1504c57f0224976c6af915963d13189e2c3c` (antes deste fecho documental).

## Leituras

- `docs/QUADRO.md`, incluindo Em execução agora; reserva criada às 11:15 UTC antes da implementação.
- Issue #344 na íntegra por `github-issues`, `action=get`, `number=344`, HTTP 200 às 11:18 UTC; permanece aberta. Primeira tentativa sem Authorization devolveu 401; leitura repetida com chave pública, sem login.
- `.lovable/memory/features/partner-settlement.md`, em especial g4, g5 e g18; memória `mem://features/partner-settlement`.
- `supabase/functions/_shared/settlement/partner-statement-doc.ts` e `src/lib/export-partner-statement-doc.ts`, completos.
- `AGENTS.md`, `supabase/AGENTS.md`, `reconcileDisplayField` e testes existentes do documento e das colunas das despesas.

## Plano executado

1. Manter `revenues` e `revenueNet` intactos; acrescentar `revenueGroups` ao documento partilhado.
2. Agrupar pela origem exata, por ordem de primeira aparição, a partir das linhas já arredondadas. Arredondar cada soma com `roundCents`; reconciliar com `reconcileDisplayField` contra o total existente.
3. Trocar apenas as duas leituras da secção 2 nos exportadores PDF/Excel; detalhe A mantém `doc.revenues`.
4. Testar regressões antes/depois e suite completa; documentar e libertar a reserva sem fechar a Issue.

## Resultado e âmbito

O resumo mostra uma linha por origem, sem alterar descrições, linhas de detalhe, despesas, resultado, acerto, línguas ou rótulos. Grupos com soma zero mantêm-se; sem receitas, os grupos são vazios. Extras e comportamento de cascata permanecem como antes, incluindo os totais existentes. Não se alterou o relatório completo de gestão, PartnerSettlementTab ou PartnerEventDetail.

O agrupamento está no gerador partilhado consumido pela equipa e pelo serviço do Portal. Não houve deploy: para receber o campo novo no Portal, a versão futura de `partner-statement` deve incluir este pacote partilhado antes de disponibilizar o novo exportador. Esse deploy exige autorização própria; não está realizado nem incluído implicitamente nesta R1. Enquanto o serviço antigo estiver ativo, o exportador conserva a lista antiga como fallback, sem erro e sem implementar outro agrupamento no browser; o resumo por origem no Portal só fica ativo após a atualização do serviço.

## Provas antes/depois

| Prova | Antes | Depois |
|---|---|---|
| Suite completa `bunx vitest run` | 239 ficheiros PASS / 2 skip; 2.197 PASS / 6 skip / 11 todo, 141,27 s | 240 ficheiros PASS / 2 skip; 2.210 PASS / 6 skip / 11 todo, 251,65 s (corrida final com `--maxWorkers=4`) |
| Regressões iniciais da #344 | 11/11 falham no código anterior | 13/13 PASS, incluindo referência sintética e compatibilidade do Portal acrescentadas depois |
| Tipos `bunx --package @typescript/native-preview tsgo --noEmit` | Não medido separadamente | exit 0 |
| Aplicação, observabilidade | build OK inicial | último registo 11:33:28 UTC: build OK |

A corrida final sem limite de workers teve um timeout de 10 s no beforeAll PGlite de newgang-crm-profile-fields (13 testes da #344 PASS); não se alterou esse teste nem o timeout. A repetição integral com 4 workers passou 2.210 testes, incluindo os 10 do Newgang. A corrida intermédia também passou 2.209 antes da última regressão de compatibilidade.

Os testes novos verificam origens e ordem, somas ao cêntimo (incluindo meias frações e valores negativos), detalhe e input intactos, grupo zero/lista vazia e referência 20 linhas/575.355,39. PDF e Excel são efetivamente gerados nos dois modos de despesas e nas duas línguas; as secções de resumo e detalhe são inspecionadas, incluindo valores e ordem. Os testes existentes da #342 passam. A inspeção do PDF precisou de normalizar o símbolo euro codificado em WinAnsi; isto é só extração de teste, não alteração do documento.

Também foram gerados PDF/XLSX sintéticos em `/tmp/issue344/`; a primeira página PDF foi renderizada e inspecionada visualmente: três origens, total 575.355,39, sem repetição. Valores de grupos sintéticos: Bilheteira 70.000,00; F&B 90.000,00; Apoios 415.355,39. Não são os valores privados reais da Ivete.

Logs locais desta execução: `/tmp/issue344-suite-before.log`, `/tmp/issue344-regression-before.log`, `/tmp/issue344-suite-after.log`, `/tmp/issue344-suite-final.log`, `/tmp/issue344-suite-final-retry.log`, `/tmp/issue344-tsgo-final.log`. CI remoto do commit funcional ou documental não foi verificado; testes locais não substituem esse gate.

## Ficheiros alterados

- `supabase/functions/_shared/settlement/partner-statement-doc.ts`
- `src/lib/export-partner-statement-doc.ts`
- `src/lib/__tests__/partner-statement-revenue-groups.test.ts` (13 testes)
- `.lovable/memory/features/partner-settlement.md` (g19)
- `AGENTS.md` (agrupamento no gerador único)
- `roadmap.md` (demanda própria)
- `docs/QUADRO.md` (reserva e pronto para Publish)
- Este relatório e `docs/questoes-issue344-receitas-por-origem.md`.

## Verificação pelo Pedro

Após CI remoto verde e disponibilização autorizada do pacote: Ivete Clareou 2026 · SUPERSOUNDS · prestação de contas PDF e Excel. Secção 2: uma linha por origem; total 575.355,39. Detalhe A: as mesmas 20 linhas, mesma ordem. Repetir nos dois modos de despesas e no Portal depois da atualização autorizada do serviço. Não foi alegada aceitação real no ecrã ou com sessão autenticada.

Sem DDL, DML, dados financeiros, Publish ou deploy. Issue não fechada. Reserva própria libertada; pronto para Publish sujeito a CI e à coordenação do pacote do Portal pelo 0.
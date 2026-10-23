# #333 — Corretivo R1: escolher outro email na conversa (23/10/2026)

Base comum confirmada: 0ea14177d65f03e046468224ad1fca82eaf86276 (diferença local = só ficheiros desta tarefa). Sem deploy, Publish, DDL, DML, flags, janela, login ou chamadas reais de IA/Gmail/scanner. Só dados sintéticos.

## Causa (confirmada no código)
- Ecrã: após uma revisão, todo o texto livre seguia com a continuação antiga.
- Servidor: `chosen = selection ?? resume.message ?? texto` → a escolha anterior ganhava sempre ao texto novo e o contrato `chosen_message` forçava novo `gmail_read` do mesmo email.

## Correção
- Botão **Escolher outro email** (só enquanto a continuação assinada está em memória) envia `intent: "list"`. Servidor: verifica assinatura (user/empresa/expiração/hash do pedido ORIGINAL), revalida a pesquisa e devolve os cartões. Zero chamadas de IA, zero leituras.
- Pedidos claros de listar/trocar ("mostra as mensagens encontradas", "outro email", "email errado") seguem o mesmo caminho determinístico.
- Nova escolha inequívoca (cartão, número, assunto, ou só hora quando um único candidato a tem) prevalece sobre a anterior. Só IDs da lista assinada ∩ pesquisa revalidada; IDs novos na caixa que não estavam assinados não entram na próxima assinatura.
- Texto livre sem escolha: a revisão anterior mantém-se, o modelo recebe `previous_message` (não `chosen_message`) e um pedido de `gmail_read` termina sem ler. Assunto novo → pesquisa nova; a próxima assinatura liga-se ao texto atual (`continuation_rebound`).
- Trocar de email retira logo a revisão/proposta/candidato anterior do ecrã; respostas tardias são descartadas pela geração.
- Cartões: "Anexos: N PDF, M imagens / Sem anexos" a partir dos metadados do servidor.

## Contagens no percurso "pedir a lista depois de A" (mocks locais)
- Antes: 1 revalidação + ≥2 chamadas de IA + 1 leitura Gmail de A (e mostrava de novo os anexos de A).
- Depois: 1 revalidação + 0 IA + 0 leituras.
- Tempo medido no teste local com mocks: < 1 s (inclui só código local). Não é medição de produção; a latência real depende do Gmail e não foi medida.

## Provas
- 12 testes novos: `src/test/data-entry-assistant333-trocar-email.test.ts` (8) e `...-ui.test.tsx` (4): lista sem IA/leitura, contagens 14 imagens vs 4 PDF, B com anexos reais, texto por assunto/hora supera A, texto novo não relê A, assunto novo reassina, IDs forjados/expirados/outra empresa/token adulterado/pedido trocado recusados (409), resposta tardia de A descartada, nada sensível no armazenamento local.
- Suite COMPLETA final: 2405 PASS, 6 skipped, 11 todo (antes 2393). tsgo OK; deno check data-entry OK; build automático OK.

## Limites
- Depois de atualizar a página o botão desaparece (a continuação só vive em memória, de propósito).
- A correção do servidor só vale após deploy da função `data-entry` (precisa de novo Sim). Até lá, o botão novo no ecrã é recusado pelo servidor antigo com erro 400; o resto do fluxo não muda.
- CI do SHA final por conferir pelo controller.

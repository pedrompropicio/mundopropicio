# #333 12j — correção de contexto, limite e leitura (R1, 23/10/2026)

Base confirmada: `619c2cea60c82c5cb4cb69411ee318371c74c376`. Autorização Pedro nesta sessão: implementação + testes locais, sem ativação/deploy. Relatório único desta demanda. #322/#323 e outras frentes intactas.

## Lido
`docs/INDEX.md`; QUADRO regras/reserva própria e secção 0 · ChatGPT (sem intervenção nas restantes linhas); estado financeiro; memória `document-entry-assistant.md` e memória persistente equivalente; os três relatórios `fase12j-conversa-nominal.md`, `fase12j-correcao-conversa.md`, `fase12j-deploy-correcao.md`; AGENTS raiz, supabase e data-entry; modelo/orquestrador/continuação/handler, leitor Gmail, cliente/UI/revisão existente e testes pertinentes. Investigação paralela só leitura de orçamento/contexto e apresentação.

## Evidência oficial segura
Gateway: lista entre 00:20–00:32 UTC, cinco pedidos, todos success/HTTP200. Último `01a1662a-f548-716e-b421-c19a04737caa`, run `01a1662a-f548-7174-9010-550082d82d4a`, 00:30:56Z: HTTP200/upstream200, streaming completo, 2541ms, 3006 tokens de entrada/39 de saída. Envelope: tool/gmail_read. Não é prova de defeito provider/Gmail. Logs data-entry: só shutdown às 00:33:45/46, sem causa interna.

Do pedido oficial extraíram-se só metadados: 12 entradas de contexto; a entrada de retoma gmail_search tinha 6944 bytes (envelope incluído); orçamento conservador local reproduzido a partir da serialização: 15923 unidades, saída reservada 6000. Conteúdo privado, identificadores da caixa, anexos e credenciais NÃO copiados para o repositório. Fixtures exclusivamente sintéticas com domínio example.invalid e IDs locais. Readback de fecho é o informado pelo controller no despacho, não uma consulta nova: executor=false, review=false, control closed/idle/sem claim/enabled=false/reviewed=false, scope_active0.

## Causa exata e correção
1. O adaptador usa bytes UTF8 +2048 como limite conservador de entrada e reserva entrada+saída antes de cada chamada. A reserva de 21923 da primeira chamada não era reconciliada após utilização real de 3045. A próxima chamada ficava com apenas 18077 para entrada+saída; entrada acima de 17565 já recusava a saída mínima512 ANTES de HTTP. O orquestrador acabara de acrescentar corpo de até4000 caracteres (mais UTF8/envelopes), mantendo histórico e resultados completos/anexos da retoma. Isso explica o sucesso200 da leitura pedida seguido de limite local sem nova chamada.
2. Não se aumenta teto nem se declara que repetição de contexto é gratuita: cada input continua a ser orçamentado e cada usage real entra no acumulado. Só depois de resposta completa, envelope válido e usage inteiro não negativo/dentro da reserva, liberta-se o headroom não utilizado. Falha/unknown mantém reserva; controlo durável e classificação de transporte intactos.
3. Retoma envia apenas metadados do email escolhido e revalidado, sem anexos nem histórico cliente completo. Pedidos novos usam últimas4 entradas,600 caracteres cada, sempre não confiáveis. Nenhum corpo armazenado em continuação. Mantém-se revalidação Gmail e pertença aos IDs assinados.
4. Corpo truncado termina imediatamente com limitação concreta (4000 caracteres/200KB), sem nova chamada de modelo/ERP, sem candidato/proposta financeira. A UI oferece o TicketlineReviewPanel já existente, onde a pessoa escolhe anexo/revisão; não há scanner novo ou abertura automática de ferramentas.
5. Texto específico após seletor transporta token e texto original para verificar o mesmo hash assinado. Texto atual só resolve candidatos atuais assinados por assunto/hora ou mais recente inequívoco. Ambiguidade devolve seletor, não pesquisa nova; tentativa do modelo de repetir pesquisa após seleção também termina no seletor sem loop. Estado selectedMessage é limpo ao voltar ao seletor para não fixar uma escolha anterior.
6. UI renderiza Markdown/GFM sem HTML cru, imagens remotas ou links ativos; tabelas contidas com scroll horizontal, parágrafos/listas legíveis. Cartões mostram assunto, remetente e data/hora Lisboa em linhas separadas. Data sem hora declara hora indisponível, não inventa meia-noite. Nova conversa limpa a continuação.

## Testes antes/depois
- Suite ANTES: 2172 PASS /6 skip /11 todo (235 ficheiros PASS,2 skip).
- Quatro regressões iniciais ANTES: 4 FAIL (reserva esgotada, anexos/contexto completos, corpo cortado termina em limit, repetição de pesquisa). DEPOIS:4 PASS.
- Novos testes finais:10 contexto/servidor +3 UI =13 PASS. Incluem SDK/HTTP sintético, pesquisa→seleção textual→leitura completa4000/truncada4000→resposta, histórico+anexos, teto40000 negativo semHTTP, pertença/hash/expiração, handler com continuation_text novo e scope fechado503, render seguro e seletor/texto→revisão existente.
- Suite FINAL:2185 PASS /6 skip /11 todo,237 ficheiros PASS/2 skip,91.84s. Corrida intermédia2184 PASS antes do teste handler adicional; ajustes de testes: regex de nome acessível multiline e fronteira real13×3045 (39585), não falhas de produção.
- Deno: `nix run nixpkgs#deno -- check --no-lock supabase/functions/data-entry/index.ts` →0 erros. Sem execução do endpoint.
- Typecheck/build automático da plataforma: build OK às00:52:37Z (nenhum erro atual); não foi executado tsgo manual adicional por restrição da plataforma. Não confundir este sinal com CI remoto.
- Playwright local com adaptador sintético, rede externa bloqueada:390×844 e1280×1800. Tabela renderizada, emails16:28/16:22 distinguíveis, sem overflow de página, continuação por texto conserva pedido original, revisão existente acessível. Screenshots inspecionadas em `/tmp/browser/333-context/1_mobile.png`, `2_mobile.png`, `3_desktop.png`. Não é aceitação de fluxo autenticado hospedado: login/IA/Gmail reais proibidos nesta demanda.
- CI remoto NÃO VERIFICADO, incluindo commit documental posterior. Nenhum deploy/Publish realizado.

## Pacote concreto para deploy futuro (não autorizado nesta tarefa)
Somente data-entry incorpora três fontes servidor:
- `_shared/issue333-ai/assistant-model.ts` sha256 `7c32622131855ca5d75c4a37e96129a5e8a3d87857cc0ea78c14d04633bc7d51`.
- `_shared/assistant-orchestrator.ts` sha256 `c88ad7f05e647ec272a4e23f229c83f56cc93e348b862e5c6c84fa039761c2b4`.
- `data-entry/handler.ts` sha256 `9470b7559b610dc310ebf4782e1b1b522fb1d4537f1be8453af8bad1c7175308`.
UI no Publish próprio futuro:
- `src/components/data-entry/AssistantConversation.tsx` sha256 `84678526839874df0a86dd33d00b273b1cad72059f0143d326ae10ab63dce8c7`.
- `src/lib/data-entry-client.ts` sha256 `83d241693b407c2eeea1bf07fcd47251cd244806f7008f82cb7bd6de68c6237b`.
Testes novos: `src/test/data-entry-assistant12j-context.test.ts`, `src/test/data-entry-assistant12j-mobile.test.tsx`. Regra técnica em AGENTS; roadmap desta demanda concluído; reserva própria eliminada no fecho. Estado financeiro/DECISIONS/memórias/SQL não alterados.

Preservados sem alteração: index/gates/flags/SQL/âmbito expirado/OAuth/Gmail reader/scanner/controlo durável/executor. Limites8 passos/6 ferramentas/2 pesquisas/2 leituras/40000 tokens/60s/saída6000 e mínimo512 mantidos. Só ferramentas fechadas; nenhuma escrita financeira nem acesso delegado. Não há deployment ID por não ter havido deploy.

## Questões/decisões em aberto
Não há decisão funcional nova pendente. Aplicar este pacote requer etapa própria: controller confirmar CI no SHA final, autorização de deploy APENAS data-entry e Publish da UI em janela; teste nominal só com Pedro presente e novo Sim. Recomendado manter a janela fechada até essa etapa. Este dispatch corretivo com CI em curso não autoriza deploy. #333 não foi fechada.
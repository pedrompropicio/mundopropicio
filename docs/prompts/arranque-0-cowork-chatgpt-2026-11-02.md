# Arranque — 0 · Cowork (ChatGPT), 02/11/2026

Lê primeiro docs/INDEX.md, docs/QUADRO.md ("Em execução agora"), docs/DECISIONS.md (D-ERP345 a D-ERP350) e docs/procedimentos/PROC-promocao.md. Executor por defeito: **Codex** via executor E2b (`.github/workflows/executor.yml`): um comentário "## Despacho — #N" do Pedro numa Issue aberta, precedido de "## Autorização" (Executor atual: Codex; R1, ou R2 com `ficheiros de migração` = sim para preparação sem aplicar) e "## Reserva" do mesmo motor. Tudo o que o executor precisa vai dentro do despacho: ele só recebe o corpo da Issue e o despacho, não os comentários.

## Estado em 02/11/2026 (origem: Issues #435, #338, #450, #417)
- Lote A publicado em 01/11 (deployment 04260ec5, HEAD 8e8bdedc, build confirmado em mpgestaoeventos.com/version.json). 0303 (#338b) e 0304 (#450) em Live; edge functions delete-transaction-document, generate-accountant-zip, financial-position, partner-statement implantadas; cron 14730 clube-newgang-summary-refresh hora a hora.
- O Lovable segue o ramo `lovable-fallback` (o `lovable/dev` foi apagado por regra de repo, já desligada); decidir ramo oficial e actualizar D-ERP344.
- Verificações do Pedro no ecrã pendentes para fechar: #338, #391, #351, #298, #315, #450.
- Fechar por leitura (R0): as 9 «provavelmente já feitas» e as 14 R0 listadas na #435.
- Próxima janela de Publish (Claude): 0298–0302 com o R1 de cada uma (#418, #350, #389, #401, #403b); `_journal.json` com 0303/0304 (R1, Codex).

## Prioridades do Pedro (02/11/2026)
1. **Brasil / Real / CBS-IBS:** materializar o plano para o sistema correr no Brasil em BRL, já preparado para CBS/IBS. Base: `.lovable/memory/features/multi-country-roadmap.md` (Fase 8 multi-país, aprovada em quarentena, campo `fiscal_meta jsonb`) e #403 (fornecedor estrangeiro). Abrir Issue-mãe «Plataforma Brasil/Real + CBS/IBS» com fases, decisões a tomar e primeiras R1/R2 preparáveis pelo Codex.
2. **#333 Assistente de Entrada de Dados (LLM no ERP com ChatGPT):** retomar e concluir — o Lovable parou numa aprovação do plano (plan--show); rever o plano, decidir, e preparar o que for R1/R2 pelo Codex.
3. Painel mp-painel: «Despachar» com Codex por defeito e capacidade `ficheiros de migração` (repo mundopropicio/mp-painel; o executor E2b não cobre esse repo — usar Codex na nuvem ligado ao repo ou tarefa manual).

## Regras que não mudam
R0/R1/R2 (D-ERP291). Live só com Sim do Pedro; DML com «Corro?». Publish só pelo 0 (Claude) em janela. Nenhum segredo em chats, Issues ou ficheiros. Agente Lovable é um só: confirmar livre antes de enviar.

# Prova75 — preparação local existing-user

HEAD observado: 4a957044e7fda140446cf3e3865bec452b841c9b, igual ao comunicado por Pedro. Sem afirmar novo commit/CI remoto.

## SELECT oficial mínimo
Uma correspondência; email confirmado, não bloqueada, empresa MP e active_company_id nulo. **Único papel atual: accountant.** IDs/email omitidos do repositório. Consulta pontual não constitui baseline futuro nem prova de sessão autêntica.

## Adaptação concreta
`pilot8/existing75/driver75.ts`: modo explícito existing-user separado, sem importar AuthAdmin/new-account; prepare/bindSession/execute/cleanup com estado privado0600 e lock. Sem criação, promoção, senha, ban, logoutglobal ou exigência de identidade fresca. Papel/empresa/perfil/conta são invariantes. Autoridade insuficiente grava estado blocked e impede efeitos. PDF1517B/hash/regex/referência revisados; manifesto73 e PDF original intactos.

Cleanup aceita apenas dois IDs novos de permissões, escopados por owner/company/operation/note. TTL máximo600s; revogação após expiração permitida. Fecha só sessão comprovadamente nova aberta para teste via logout scope local; sessão reutilizada não fecha. Comparação de dados históricos inclui dados do próprio utilizador, excluindo apenas IDs novos explicitamente vinculados ao resultado canónico, nunca todos os dados do owner. Baseline anterior de sessões preservado, não sessions_total0. Mudanças concorrentes são divergência, não sucesso inventado. Falha de revogação não impede tentar encerrar sessão exclusiva.

## Prontidão honesta
**Bloqueado pelo papel accountant**, confirmado também na UI (`Transactions.tsx`: botão só admin/manager) e servidor (`data-entry-core.ts`: platform_admin/admin/manager). Autorização de uso da conta não autoriza ampliar papel. Portanto não foi preparado SQL de ativação para esta conta nem conectado executor Cloud/browser real. O driver é adaptação local testável, não E2E certificado. Não reutilizar baselineSQL(owner): esse filtro exclui histórico do owner e é inadequado neste cenário.

Sessão disponibilizada: signed_out. Não houve mint/restauração/login, probe getUser ou extração de credenciais. Acesso autêntico **não verificado**. Login normal documentado no código: `/login`, email/password via formulário, incluindo rate-limit/auditoria normais. Futuro checkpoint humano: login pela própria UI do preview, sem senha/token no chat; validar getUser e contexto canónico antes de efeitos. Não é útil pedir esse login enquanto o papel continua sem autoridade.

## Plano75 condicional e efeitos exatos
1. Resolver seleção de conta já autorizada ao Assistente, sem promover a escolhida nesta tarefa.
2. Após nova autorização: SELECTs oficiais atuais para baselines/histórico/sessões/ACL e referência ausente; conta59/63 excluída de reutilização. Recepção pelos checkpoints estritos71, sem transcrição de baseline.
3. Login humano normal em contexto exclusivo se não houver sessão autêntica permitida. Registrar só identidade técnica/sessão comprovada em artefactos privados; nunca copiar tokens de outros acessos. Login normal pode atualizar last_sign_in_at e auditoria de login; estes efeitos esperados não são mudanças de senha/perfil/role. Invariantes de conta devem separar esses campos voláteis.
4. Se ainda necessário, criar exatamente duas permissões novas preparation/assistant_create600s, sem flagsglobais/role/perfil; autorização específica futura e IDs exatos antes de teste.
5. `/transacoes` → botão Assistente → um PDF fictício EUR0/IVA0/referência exclusiva → uma prévia canónica/autorização UI → duas execuções da MESMA prévia → um resultado/uma fatura fictícia, downloadSHA e check. Nenhum financeiro/envio/documento real.
6. Revogar só essas duas permissões; check200 sem escrita; logout local somente sessão exclusiva nova; preservar sessão reutilizada e histórico/artifactos. SELECT independente compara baseline e ausência da sessão teste, não sessions_total0.

Nesta tarefa: um SELECT mínimo, mudanças só locais, zero login/Cloud writes/ativação/fatura/DDL/deploy/Publish. Fases1–7done/8PARCIAL/9–18pendentes. Root AGENTS/DECISIONS/#323 preservados. Testes locais não substituem acesso autêntico nem piloto.

## Validação
22 testes locais PASS: accountant recusado, sete drifts, histórico/sessões preexistentes, revogação exata/falha/expiração, repetição, sessão reutilizada, TTL600s, exclusão indevida de histórico, autorização nova e efeito incerto não repetido. PDF aprovado lido em teste sem Cloud. Um erro de compatibilidade Object.hasOwn foi identificado e corrigido para hasOwnProperty; validação final registada no fecho.

## Próximo passo único
Pedro indicar uma conta existente que já tenha admin/platform_admin/manager na MP. A conta escolhida permanece intacta; nenhum suporte/AuthAdmin necessário para este cenário, nenhuma promoção implícita.
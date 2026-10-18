# Piloto75 — conta existente, preparação local

## Condição já confirmada
SELECT oficial mínimo encontrou uma única conta, confirmada e não bloqueada, na empresa MP. O papel atual é **accountant**, não autorizado a executar o Assistente. Não alterar esse papel nem contornar a restrição. AuthAdmin/criação/ban do cenário anterior deixam de ser requisitos.

## Entrega
- Criar modo explícito `existing-user` separado do driver de contas novas, recusando criação, promoção, alteração de conta, ban e logout global.
- Vincular o PDF fictício validado e referência exclusiva ao utilizador/empresa atuais, sem reutilizar identidade das contas59/63 ou modificar manifesto73.
- Preparar checkpoints finitos de pré-verificação, sessão autêntica, prévia/execução e cleanup; autoridade insuficiente interrompe antes de qualquer efeito.
- Comparar histórico e sessões preexistentes com baseline atual; cleanup revoga apenas os dois IDs de permissões criados para o teste e encerra apenas sessão exclusiva comprovadamente nova. Sessão reutilizada permanece aberta.
- Testar localmente papel accountant recusado, troca de empresa/papel, sessões/histórico preexistentes, cleanup parcial e repetido, e proibição de operações administrativas.
- Entregar prova75 curta com caminho real de login/modal e único próximo passo. Não executar login, ativação, fatura, Cloud writes, DDL, deploy ou Publish.

## Detalhes técnicos
Artefactos isolados em docs/testes/issue333; integração com contratos finitos existentes sem repetir provas de transporte. Identificadores e dados da conta não vão para o repositório. A sessão disponível está signed_out; não será mintada nem restaurada nesta tarefa. Acesso autêntico permanece não verificado.

## Bloqueio do futuro piloto
A conta escolhida tem papel accountant. O modo preparado deve falhar fechado nessa condição; autorização para usar a conta não autoriza ampliar o papel. O relatório indicará esta limitação sem pedir senha nem voltar ao suporte AuthAdmin.
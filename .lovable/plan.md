

## O que está a acontecer

O Google aplica a política `iam.disableServiceAccountKeyCreation` herdada da organização ao projeto `mp-anexos-geral` (ou `Mundo Propicio`). Por isso falha o "Create Key" da service account. Estás na página correta para resolver — só falta filtrar e fazer o override.

## Passos detalhados (no ecrã onde estás agora)

1. Em **Políticas da organização** (estás aí), no campo **Filtro** no topo da lista (parte de baixo do ecrã), escreve: `disableServiceAccountKeyCreation`
2. Vai aparecer 1 linha: **"Desativar criação de chaves de conta de serviço"** (`iam.disableServiceAccountKeyCreation`). O estado provavelmente diz **"Aplicado herdado"** (Inherited).
3. Clica no nome da política para abrir o detalhe.
4. Topo direito: clica em **GERIR POLÍTICA** (Manage Policy / Editar).
5. No formulário:
   - **Origem da política**: seleciona **Substituir política do recurso pai** (Override parent's policy)
   - **Aplicação de regras** / **Enforcement**: marca **Desativada** (Off / Not enforced)
   - **Regras**: adiciona uma regra com **Aplicação: Desativada**
6. Clica **DEFINIR POLÍTICA** (Set Policy / Save).
7. Espera ~1 min para propagar.
8. Volta a **IAM e admin → Contas de serviço → mp-anexos-geral → Chaves → Adicionar chave → Criar nova chave → JSON → Criar**.
9. Descarrega o `.json` e avisa-me.

## Se o passo 4 não te deixar (botão a cinzento)

Significa que não tens o papel **roles/orgpolicy.policyAdmin** no projeto. Solução:
- IAM e admin → IAM → encontra o teu utilizador → Editar (lápis) → Adicionar outro papel → procura **Administrador de políticas da organização** → Guardar.
- Se o IAM também estiver bloqueado, então és Editor mas não Owner — precisas que o Owner da organização te dê esse papel.

## Próximos passos depois do JSON

1. Avisas-me que tens o `.json`.
2. Eu peço o secret `GOOGLE_SERVICE_ACCOUNT_JSON` e tu colas o conteúdo.
3. Crio a Edge Function `migrate-drive-attachments` que:
   - Lê `event_forecasts.attachment_refs` com URLs `drive.google.com`
   - Faz download via Drive API com a service account
   - Faz upload para bucket `transaction-documents`
   - Substitui a referência por `transaction-documents://...`
4. Adiciono o botão **"Migrar anexos do Drive"** no header do BP + disparo automático em novas importações.
5. Tu partilhas as pastas do Drive com o email da service account (Leitor) — podes adiantar isto agora.


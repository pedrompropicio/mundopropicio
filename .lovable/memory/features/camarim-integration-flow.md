---
name: Camarim - fluxo de integração (linha de BP e excesso no modal)
description: Modal "Integrar sessão" resolve linha de BP 2.6.04, excesso de verba (raise_budget) e erros da close-camarim-session no próprio ecrã, sem diálogos encadeados
type: feature
---
- Evento `with_bp`: o modal mostra o seletor da linha 2.6.04 do evento (CamarimIntegrateBpSection), já com a proposta = linha aprovada com mais verba disponível (ou a única). Mostra Previsto · Utilizado · Disponível · Esta sessão e se cabe ou excede.
- Mesma conta da edge fn: utilizado = TX approved/paid da linha sem transitórias/excluídas/estornadas/ocultas; esta sessão = soma das bases dos itens aprovados (+ parqueados "aprovar sem doc."); mínimo = utilizado + sessão.
- Excede → bloco "Elevar a verba da linha" com mínimo pré-preenchido e observação obrigatória; `budget_raise` segue na MESMA chamada. Sem `raise_budget`: bloco diz logo "Precisa de alguém com permissão para elevar verbas de BP — pede ao Pedro" e o botão fica desativado.
- Sem linha 2.6.04 no evento → botão desativado com a explicação.
- Qualquer erro da close-camarim-session (4xx/5xx, error, errors[], budget_excess) aparece em texto no modal; "A integrar…" termina sempre; console.error com prefixo [camarim-integrate]. Se o servidor devolver budget_excess com mínimo maior, o modal adopta esse mínimo.
- Selects dentro do modal: z vem da pilha de overlays (ver constraints/pilha-de-overlays); nunca z manual.
- Bug 01/10/2026 (sessão Ivete 89a93e14): LinkBpLineDialog/RaiseBudgetDialog (Dialog z-50) abriam atrás do AlertDialog z-[200]; a função nunca chegou a ser chamada.
- D-ERP156 (02/10/2026): conta-corrente da administradora. Itens do adiantamento E do bolso nascem pagos pela conta da sessão (transaction_payments, nunca paid_amount à mão); nada de is_reimbursement. Acerto único: saldo = recebido − pago; >0 ela devolve, <0 a MP paga-lhe; par 10.3 mesma data, perna da conta já liquidada, perna do banco por pagar/receber (sem conta obrigatória). Modal mostra "Conta-corrente da sessão": Recebido · Pago por ela · Saldo. buyer_profile_id vazio → só a administradora. Invariante camarim_sessao_integrada_com_saldo.
- D-ERP200 (09/10/2026, #287): movimentos de caixa (CamarimFundMoveModal) criam o par 10.3 pending; quando a perna do banco recebe linha paid, o trigger zz_camarim_session_leg_follows_bank cria a da sessão (created_by 'base #287') e estorna-a se a do banco for estornada. Vigia camarim_adiantamento_sem_entrada.

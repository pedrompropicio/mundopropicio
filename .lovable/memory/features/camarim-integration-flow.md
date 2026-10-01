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
- Selects dentro do modal usam z-[210] (AlertDialog é z-[200]). Nunca abrir Dialog z-50 por cima do AlertDialog.
- Bug 01/10/2026 (sessão Ivete 89a93e14): LinkBpLineDialog/RaiseBudgetDialog (Dialog z-50) abriam atrás do AlertDialog z-[200]; a função nunca chegou a ser chamada.

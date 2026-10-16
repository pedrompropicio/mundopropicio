# #327 — Contrato de conteúdo dos tooltips de regras (para o portal; não implementado aqui)

Fonte única: API `newgang-portal`.
- **site / bundle** → `club.rules[]` (`rule_key`, `label`, `points`, `cap`, `scope`) e `club.rules_unavailable[]` (`rule_key`, `label`, `status`).
- **me** → `points`, `level`, `level_protected`, `next_level`, `next_level_min`, `referrals{status, confirmed_friends, badges.friends_3/5}`.

Edição e versão vêm de `club_rules_public` (`event_id`, `config_version`), expostas como `edition`/`version` no módulo. O texto mostra **só o valor que a API devolve agora**. Nunca escrever valores futuros antes do cutover: o portal não tem valores no código.

## Estado por regra
| Regra | Agora (antes do cutover) | Depois do cutover (só quando a API o devolver) |
|---|---|---|
| Inscrição `join_confirmed` | 100, uma vez | 100, uma vez por adesão ao site (`scope=adesao`) |
| Indicação `friend_joined` | 150 por amigo confirmado | 75 por amigo, teto 750 por edição (`cap`, `scope=edicao`); créditos antigos contam para o teto e nunca são retirados |
| Crew completa `crew_complete` | 200 por grupo completo | 100, uma vez por edição (`scope=edicao`) |
| Compra própria `promo_lot_purchase` | indisponível (`sem_integracao`) | indisponível até haver prova verificável |
| Compra de amigo `friend_bought` | indisponível (`sem_integracao`) | indisponível até haver prova verificável |

## Textos-base (o valor vem sempre de `points`/`cap`)
- **Inscrição**: "Ganhas {points} pontos ao confirmar a inscrição. Conta uma só vez."
- **Indicação**: "Ganhas {points} por cada amigo que confirme com o teu código." Com `cap`: acrescentar "Até {cap} pontos por edição. Uma indicação anulada não volta a abrir espaço no limite." Também: "Quem já é membro, ou já foi indicado por alguém, não passa a contar como teu."
- **Crew**:
  - "Crew é o teu grupo, não o teu nível." Com `min`/`max` da configuração: "Completa com 4 a 6 membros (contigo incluído)."
  - Agora: "{points} pontos para cada membro quando o grupo fica completo."
  - Com `scope=edicao`: "{points} pontos uma vez por edição, mesmo que mudes de grupo."
- **Conquistas 3 e 5 amigos** (`referrals.badges`): "Marcos de amigos confirmados. Não dão pontos extra." Se `referrals.status=error`, esconder o bloco (nunca mostrar 0).
- **Indisponíveis** (`rules_unavailable`): mostrar o `label` com "Brevemente". Nunca mostrar pontos nem prometer crédito.
- **Níveis**:
  - "Nível: {level}." Com `level_protected=true`: "Nível garantido: mantém-se mesmo com as novas regras."
  - Próximo nível: "Faltam {next_level_min − points} pontos para {next_level}." Se `next_level` for null, "Nível máximo."

## UX
- Ícone "i" junto a cada regra. Painel acessível que abre com toque/clique e com Enter/Espaço; fecha com Esc ou toque fora; o foco volta ao ícone.
- Em mobile: painel inferior com scroll interno; não pode depender de hover.
- No cartão do membro: resumo de uma linha (nível + progresso ao próximo), com o tooltip para o detalhe.
- O frontend fica para tarefa própria no projeto do portal, quando o agente estiver livre.

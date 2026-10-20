# Convites pendentes no Clube Newgang

## Entrega
- Acrescentar a `me.referrals` até 50 amigos por confirmar e o total exato.
- Acrescentar a `me.crew`, apenas para membros dessa crew, até 20 convidados por confirmar e o total exato.
- Usar `shortName` de `history.ts`, com fallback `Convidado`, e devolver exclusivamente `{ short_name, at }`.
- Excluir dos amigos todos os pendentes da própria crew antes da contagem e do limite, incluindo os que ficam fora dos primeiros 20. Sem crew, não excluir convidados de uma crew que o membro não pode ver.
- Preservar todos os campos e comportamentos existentes; as novas consultas são apenas SELECT pelo cliente atual.

## Verificação e limites
- Testes locais sintéticos: limites 50/20, ordem decrescente, nome ausente, sobreposição, isolamento e ausência de email/telefone/id.
- SELECT agregado em Live para confirmar pessoas pendentes, crews correspondentes e sobreposição, sem divulgar identidades.
- Atualizar `API-CONTRACT.md` apenas se existir (não foi localizado), e documentar resultados e pendências.
- Sem deploy, Publish, DDL, DML, migrações ou alteração de pontos, regras, níveis e participação nas crews.

## Detalhes técnicos
- Novo módulo puro para projeção e exclusão; consultas limitadas com `count: exact`, filtros de site/empresa/sessão e ordenação determinística.
- Reutilizar a crew resolvida no servidor, sem aceitar código de crew enviado pelo cliente para estas leituras.
- Não executar a ação `me` em Live: o `pending_crew` existente pode limpar pendências, e permanece intocado.
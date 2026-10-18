# #333 — Prova45: investigação somente leitura da fixture43

Verificação UTC: 2026-10-18 02:44:16. Base local e GitHub main: `f55385511195eb82f00f2c917155299c2b1cefc4`; ancestralidade exit0, árvore inicialmente limpa. Issue333 aberta; reservas333/323 preservadas. Sem alteração de código, regras, AGENTS, DECISIONS, dados ou configurações.

## Resultado e limites

- CI39090966400: completed/success, SHA acima, updated_at2026-10-18T02:43:33Z. Job quality e tsgo/Vitest/canário/build success. Não executados novamente neste diagnóstico.
- Live: MD5 interno `b748a720b4cb1f988a927b5577e511dd`; EXECUTE authenticated/service_role false; wrapper authenticated true/service_role false. Sem mudanças.
- Prova43/44 continua válida: conta banida/sessions0, nenhum request negativo ou reserva. Não repetidos testes39/43; sem nova conta nem login.
- Causa da falha de fixture: runner43 chamou `psql -X -At -v ON_ERROR_STOP=1 -c` para UPDATE de user_roles e profiles. Usa o PGUSER do sandbox, não o cliente AuthAdmin nem a sessão de administrador da aplicação. A operação falhou por privilégio de tabela e abortou antes do perfil.
- O nome configurado do canal é `sandbox_exec.<project>` (identificador suprimido). Este nome não aparece como role no catálogo consultado por read_query: SELECT por padrão devolveu0 e a consulta nominal devolveu42704. Logo não demonstrada a identidade SQL efetiva do proxy na conexão anterior. Não foi aberta conexão psql nova para descobrir isso; o erro43 e a documentação oficial do canal restrito estabelecem a recusa, não autorizam inventar um role efetivo.
- read_query usa `supabase_read_only_user`: SELECT true, INSERT/UPDATE false em user_roles/profiles. AuthAdmin createUser não transmite autoridade DB a qualquer destes canais.

## Fontes lidas

INDEX, QUADRO, estado da frente, memória document-entry-assistant, user-auth-synchronization, multi-membership-model, active-company-switcher; provas43/44 e conhecimento39 existente; código UserManagement, create-user, handler/index de standalone-attempt-333 e SQL0191. Metadados Live de grants, policies, triggers e funções foram obtidos exclusivamente por SELECT.

## Canal existente e pré-condições

1. A administração de utilizadores já escreve user_roles pelo Data API com JWT authenticated de um administrador real da empresa ativa (UserManagement). Live concede UPDATE à role authenticated; policy permissiva exige has_role(auth.uid(),'admin') e a restritiva limita a empresa/owner/platform_admin. Não basta possuir uma chave pública nem ser a conta técnica.
2. Para uma FUTURA fixture nova autorizada: AuthAdmin createUser com email_confirm:true, senha só memória, full_name fictício e company_id da empresa existente explicitamente na metadata. O trigger handle_new_user, SECURITY DEFINER, cria profile nessa empresa e apenas role user. Nenhum papel privilegiado deriva de metadata.
3. Recomenda-se alterar somente essa role user para editor através de PATCH existente do Data API, com sessão administrativa existente autorizada. Editor é o mínimo permitido para scanner_create no SQL0191. Não usar DELETE+INSERT do seletor da UI: são duas chamadas e efeitos maiores. Não tocar profiles.

Fluxo exato INERTE para revisão (IDs reais ficam só em /tmp):

```text
Pré-leitura: confirmar uma única role user da NOVA conta na empresa esperada;
confirmar administrador autorizado e sua empresa ativa canónica.
PATCH /rest/v1/user_roles?id=eq.<role-id>&user_id=eq.<new-user-id>&company_id=eq.<company-id>&role=eq.user
Authorization: Bearer <sessão administrativa existente; nunca imprimir>
Prefer: return=representation
Body: {"role":"editor"}
Exigir exatamente1 linha e conferir id/user_id/company_id/role por leitura.
Zero linhas/erro/resposta incerta: parar, conferir somente leitura, sem retry.
```

4. current_company_id() já resolve profiles.company_id quando há membership nessa empresa. Portanto active_company_id não precisa ser escrito; set_active_company escreveria perfil e auditoria desnecessários. Conferir current_company_id e my_effective_permissions com a sessão futura da fixture, após login autorizado.
5. create-user NÃO é recomendado para criar esta fixture: o ramo de criação gera invite e enfileira email. O ramo attach não envia email, mas se o trigger já criou membership retorna already_member e não altera o papel; também não sobrescreve company_id do perfil existente.
6. Canal alternativo existente: ferramenta oficial run_sql para DML limitado, nunca psql/read_query/migração de grants. O schema da ferramenta autoriza INSERT/UPDATE/DELETE, com auth.uid NULL; não foi executada e sua identidade/privilégio runtime não foi comprovada nesta investigação. Não afirmar que resolverá por inferência. SQL de revisão para role seria somente `UPDATE public.user_roles SET role='editor' WHERE id='<role-id>'::uuid AND user_id='<new-user-id>'::uuid AND company_id='<company-id>'::uuid AND role='user'::public.app_role RETURNING id,user_id,company_id,role;` com os mesmos guardas/pré-leituras. Não executar ambos os canais.

## Reserva e efeitos mínimos posteriores

O RPC prepare continua bloqueado pelas flags; não é canal para semear a fixture com gates fechados. A prova39 já demonstrou inserção técnica service via Data API (201), e Live concede INSERT à service_role em standalone_attempts_333, não a authenticated. Isto é conhecimento existente, NÃO nova prova runtime. Segredo service não é acessível ao executor nem deve ser pedido ao Pedro.

Para retoma futura finita: preparar o INSERT único da reserva imutável pelo canal oficial DML run_sql, com o envelope/bytes fictícios já validados e todas as colunas/guardas do plano41. Rever o INSERT concreto antes da conta; identidade runtime deste canal continua não verificada aqui. Falha do canal: parar e preservar fixture, sem nova conta/GRANT/helper. Não tentar prepare funcional nem abrir flags.

Efeitos autorizáveis mínimos: uma conta futura com perfil/role user criados pelo trigger, uma atualização da própria role para editor, uma reserva prepare sem objeto/destino existente. O trigger audit_user_roles_changes grava system_audit_log: separar esta auditoria administrativa esperada dos zero efeitos em standalone_attempt_audit_333/receipts/faturas/financeiro. Não desligar auditoria. Não escrever profile/active_company_id.

Depois dos controlos capabilitiesfalse/false e check correto: exatamente um RPC hash errado e um endpoint hash errado, no final, sem retry e com timeout finito. Esperados403/42501 e409/pendente; medir latências. Finally logout global, ban somente nova conta, SELECT sessions0. Baselines iguais excluindo apenas a identidade/role/auditoria administrativa/reserva explicitamente previstas. Incerto: só conferir por leitura.

## Estado da autorização

Esta entrega executou apenas leituras Cloud/GitHub e documentação própria333. PATCH/DML/AuthAdmin/reserva/requests acima estão INERTES e NÃO autorizados por este pedido read-only. Controlador deve rever o canal e a preparação concreta antes de qualquer retoma de escrita. Nenhuma decisão de negócio nova; não recomendar outra rodada automática de contas. HTTP pendente, causa do timeout antigo não demonstrada, fase6 integral não concluída, produto desligado.

Limite adicional: conector GitHub sem conexão acessível; leituras e comentário documental usam a credencial GitHub já disponível, sem criar conexão ou expor credenciais. Sem deploy/Publish/crons/envios.
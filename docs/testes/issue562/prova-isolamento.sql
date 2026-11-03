-- Issue #562 — roteiro INERTE para uma janela com Sim próprio.
-- Preparado a 03/11/2026; NÃO EXECUTADO. Não é seed nem autorização de aplicação.
-- Pré-condições: revisão das lacunas de inventario.md, promoção aprovada da 0308,
-- empresa/evento sintéticos já autorizados e existentes; nenhum dado real copiado.
-- As escritas e chamadas com efeitos ficam COMENTADAS. Substituir placeholders
-- só na janela autorizada. Nunca desligar produtores/alertas das empresas reais.

-- 1. Capturar antes e depois das provas de TREINO, na mesma transação/snapshot.
-- BEGIN ISOLATION LEVEL REPEATABLE READ;
-- O nível de snapshot evita confundir commits concorrentes reais com a prova;
-- não pede locks globais nem interrompe a operação real.
SELECT jsonb_build_object(
  'real_notification_queue', (SELECT count(*) FROM public.notification_queue q
    WHERE q.company_id IS NULL OR NOT public.is_training_company(q.company_id)),
  'real_system_reminders', (SELECT count(*) FROM public.system_reminders r
    WHERE r.company_id IS NULL OR NOT public.is_training_company(r.company_id)),
  'real_invariant_runs', (SELECT count(*) FROM public.invariant_runs WHERE NOT scope_training),
  'training_invariant_runs', (SELECT count(*) FROM public.invariant_runs WHERE scope_training),
  'real_invariant_results', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.name)
    FROM (SELECT name, current_count, reference_count, conforme
          FROM public._run_invariant_checks_all()) r)
) AS snapshot_562;
-- Guardar os bytes do resultado antes/depois; contagens locais de ficheiros não
-- provam aplicação/entrega. Os resultados e a identidade da sessão são a prova.

-- 2. Catálogo e ACL (SELECT apenas).
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'companies'
  AND column_name = 'is_training';
SELECT has_function_privilege('anon', 'public.is_training_company(uuid)', 'EXECUTE') AS anon_deve_ser_false,
       has_function_privilege('authenticated', 'public.is_training_company(uuid)', 'EXECUTE') AS authenticated_deve_ser_true,
       has_function_privilege('service_role', 'public.is_training_company(uuid)', 'EXECUTE') AS service_deve_ser_true;
SELECT tgrelid::regclass AS tabela, tgname, tgenabled
FROM pg_trigger WHERE tgname LIKE 'issue562_%' AND NOT tgisinternal
ORDER BY 1, 2;

-- 3. Empresa/evento de treino são parâmetros já aprovados, nunca criados aqui.
-- Substituir <TRAINING_COMPANY_UUID> e <TRAINING_EVENT_UUID> na janela.
-- SELECT public.is_training_company('<TRAINING_COMPANY_UUID>'::uuid); -- true

-- 4. B1: tentativa de configuração deve lançar training_company_no_integrations.
-- SAVEPOINT issue562_b1;
-- INSERT INTO public.ticketline_sync_config(company_id, event_id, ticketline_event_id, vault_secret_name)
-- VALUES ('<TRAINING_COMPANY_UUID>', '<TRAINING_EVENT_UUID>', 'issue562_synthetic', 'issue562_never_resolve');
-- Esperado: SQLSTATE P0001 e mensagem training_company_no_integrations.
-- ROLLBACK TO SAVEPOINT issue562_b1;
-- Repetir INSERT/UPDATE nas outras oito tabelas com os campos obrigatórios do
-- catálogo da janela; não reutilizar qualquer configuração/credencial real.

-- 5. B2: usar template sintético existente e telefone de fixture sem entrega.
-- INSERT INTO public.notification_queue(company_id, template_id, recipient_phone, status)
-- VALUES ('<TRAINING_COMPANY_UUID>', '<SYNTHETIC_TEMPLATE_UUID>', '+00000000000', 'queued')
-- RETURNING id, status, last_error;
-- Esperado: skipped / suppressed_training; nenhuma execução do dispatcher.

-- INSERT INTO public.system_reminders(company_id, key, title, message, due_date, frequency, is_active)
-- VALUES ('<TRAINING_COMPANY_UUID>', 'issue562_window_synthetic', 'Fixture', 'Fixture', current_date, 'once', true)
-- RETURNING is_active, completed_at, message;
-- Esperado: false / timestamp não nulo / nota suppressed_training.

-- INSERT INTO public.email_send_log(company_id, template_name, recipient_email, status)
-- VALUES ('<TRAINING_COMPANY_UUID>', 'issue562_synthetic', 'fixture@example.invalid', 'pending')
-- RETURNING status, error_message;
-- Esperado: suppressed / suppressed_training; sem enqueue_email.

-- 6. Corrida só-treino: repetir snapshot_562 antes/depois.
-- SELECT public.run_training_invariant_checks_and_log() AS training_run_id;
-- SELECT scope_training, results FROM public.invariant_runs WHERE id = '<RETURNED_RUN_UUID>';
-- Esperado: scope_training=true, contagens só de treino nas famílias com âmbito;
-- real_invariant_runs e as contagens reais de filas/lembretes ficam iguais.
-- Callbacks #335 omitidos são LACUNA declarada, não uma prova de cobertura total.

-- 7. Corrida real: esta chamada escreve log/lembrete segundo a lógica existente.
-- Exige autorização explícita da janela, distinta de um SELECT puro.
-- SELECT public.run_invariant_checks_and_log() AS real_run_id;
-- Comparar results com real_invariant_results capturado antes das violações de
-- treino: mesmos names/current_count/reference_count/conforme. O run real novo
-- aumenta real_invariant_runs em 1 por desenho; não exigir contagem igual aqui.

-- 8. Exportações: tentar INSERT de treino com campos obrigatórios do catálogo,
-- em SAVEPOINT, esperando training_company_no_real_export; nenhum download
-- autoriza upload bancário. A UI deve descarregar TREINO sem histórico/callback.

-- ROLLBACK; -- todas as fixtures da janela ficam sem persistência.

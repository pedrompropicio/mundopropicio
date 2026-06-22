ALTER TABLE crm.meta_publish_plan DROP CONSTRAINT IF EXISTS meta_publish_plan_estado_check;
ALTER TABLE crm.meta_publish_plan ADD CONSTRAINT meta_publish_plan_estado_check
  CHECK (estado = ANY (ARRAY['rascunho','pronto_a_publicar','a_publicar','publicado','falhado','ativo','pausado','cancelado']));
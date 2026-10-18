-- CRM builder uses the same canonical eligibility as SQL audience evaluation.
CREATE VIEW public.crm_contacts_whatsapp_state WITH (security_invoker=true) AS
 SELECT c.*,public.crm_whatsapp_eligible(c.id) AS whatsapp_eligible FROM public.contacts c;
REVOKE ALL ON public.crm_contacts_whatsapp_state FROM PUBLIC,anon;
GRANT SELECT ON public.crm_contacts_whatsapp_state TO authenticated,service_role;

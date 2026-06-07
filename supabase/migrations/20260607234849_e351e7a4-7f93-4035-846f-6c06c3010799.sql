-- Fase 1 RBAC — concede escrita ao role content_manager
-- replicando o padrão das políticas existentes nas tabelas do MP CRM.
-- Tabelas afetadas (apenas conteúdo editorial): event_marketing, static_pages,
-- blog_posts, press_clippings. NÃO mexe em events, audiences, leads,
-- contacts, nem em nenhuma tabela financeira/operacional do ERP.
-- Idempotente: DROP POLICY IF EXISTS antes de CREATE.

-- 1) event_marketing
DROP POLICY IF EXISTS event_marketing_write ON public.event_marketing;
CREATE POLICY event_marketing_write ON public.event_marketing
  AS PERMISSIVE FOR ALL TO public
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'marketing_manager'::app_role)
    OR has_role(auth.uid(), 'editor'::app_role)
    OR has_role(auth.uid(), 'content_manager'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'marketing_manager'::app_role)
    OR has_role(auth.uid(), 'editor'::app_role)
    OR has_role(auth.uid(), 'content_manager'::app_role)
  );

-- 2) static_pages
DROP POLICY IF EXISTS static_pages_write ON public.static_pages;
CREATE POLICY static_pages_write ON public.static_pages
  AS PERMISSIVE FOR ALL TO public
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'marketing_manager'::app_role)
    OR has_role(auth.uid(), 'editor'::app_role)
    OR has_role(auth.uid(), 'content_manager'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'marketing_manager'::app_role)
    OR has_role(auth.uid(), 'editor'::app_role)
    OR has_role(auth.uid(), 'content_manager'::app_role)
  );

-- 3) blog_posts (padrão atual: admin/manager; DELETE só admin)
DROP POLICY IF EXISTS "Blog posts insertable by privileged roles" ON public.blog_posts;
CREATE POLICY "Blog posts insertable by privileged roles" ON public.blog_posts
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'content_manager'::app_role)
  );

DROP POLICY IF EXISTS "Blog posts updatable by privileged roles" ON public.blog_posts;
CREATE POLICY "Blog posts updatable by privileged roles" ON public.blog_posts
  AS PERMISSIVE FOR UPDATE TO public
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'content_manager'::app_role)
  );

DROP POLICY IF EXISTS "Blog posts deletable by admin only" ON public.blog_posts;
CREATE POLICY "Blog posts deletable by admin only" ON public.blog_posts
  AS PERMISSIVE FOR DELETE TO public
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'content_manager'::app_role)
  );

-- 4) press_clippings (padrão atual idêntico a blog_posts)
DROP POLICY IF EXISTS "Press clippings insertable by privileged roles" ON public.press_clippings;
CREATE POLICY "Press clippings insertable by privileged roles" ON public.press_clippings
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'content_manager'::app_role)
  );

DROP POLICY IF EXISTS "Press clippings updatable by privileged roles" ON public.press_clippings;
CREATE POLICY "Press clippings updatable by privileged roles" ON public.press_clippings
  AS PERMISSIVE FOR UPDATE TO public
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'content_manager'::app_role)
  );

DROP POLICY IF EXISTS "Press clippings deletable by admin only" ON public.press_clippings;
CREATE POLICY "Press clippings deletable by admin only" ON public.press_clippings
  AS PERMISSIVE FOR DELETE TO public
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'content_manager'::app_role)
  );
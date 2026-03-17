
-- Timestamp trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =====================
-- PLANO DE CONTAS (Chart of Accounts)
-- =====================
CREATE TABLE public.account_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  parent_id UUID REFERENCES public.account_categories(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.account_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Account categories are viewable by authenticated users" ON public.account_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Account categories can be managed by authenticated users" ON public.account_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_account_categories_updated_at BEFORE UPDATE ON public.account_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================
-- EVENTOS
-- =====================
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'completed', 'cancelled')),
  budget NUMERIC NOT NULL DEFAULT 0,
  tickets_sold INTEGER NOT NULL DEFAULT 0,
  tickets_total INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Events are viewable by authenticated users" ON public.events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Events can be managed by authenticated users" ON public.events FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================
-- TRANSAÇÕES
-- =====================
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category_id UUID REFERENCES public.account_categories(id),
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  iva_rate INTEGER NOT NULL DEFAULT 23 CHECK (iva_rate IN (23, 13, 6, 0)),
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('paid', 'pending', 'overdue')),
  supplier_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Transactions are viewable by authenticated users" ON public.transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Transactions can be managed by authenticated users" ON public.transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================
-- FORNECEDORES
-- =====================
CREATE TABLE public.suppliers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  nif TEXT,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  iban TEXT,
  payment_terms TEXT,
  category TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Suppliers are viewable by authenticated users" ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Suppliers can be managed by authenticated users" ON public.suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- FK on transactions
ALTER TABLE public.transactions ADD CONSTRAINT transactions_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);

-- =====================
-- DOCUMENTOS DE FORNECEDORES
-- =====================
CREATE TABLE public.supplier_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  doc_type TEXT NOT NULL DEFAULT 'other' CHECK (doc_type IN ('contract', 'invoice', 'proposal', 'certificate', 'other')),
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.supplier_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Supplier documents are viewable by authenticated users" ON public.supplier_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Supplier documents can be managed by authenticated users" ON public.supplier_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =====================
-- COTAÇÕES
-- =====================
CREATE TABLE public.quotations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  supplier_id UUID REFERENCES public.suppliers(id) NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  iva_rate INTEGER NOT NULL DEFAULT 23 CHECK (iva_rate IN (23, 13, 6, 0)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  valid_until DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Quotations are viewable by authenticated users" ON public.quotations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Quotations can be managed by authenticated users" ON public.quotations FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_quotations_updated_at BEFORE UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================
-- STORAGE BUCKET para documentos
-- =====================
INSERT INTO storage.buckets (id, name, public) VALUES ('supplier-documents', 'supplier-documents', false);

CREATE POLICY "Authenticated users can view supplier documents" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'supplier-documents');
CREATE POLICY "Authenticated users can upload supplier documents" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'supplier-documents');
CREATE POLICY "Authenticated users can delete supplier documents" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'supplier-documents');

-- =====================
-- SEED: Plano de contas padrão
-- =====================
INSERT INTO public.account_categories (code, name, type) VALUES
  ('R01', 'Bilheteira', 'income'),
  ('R02', 'Patrocínios', 'income'),
  ('R03', 'Bar & Alimentação', 'income'),
  ('R04', 'Merchandising', 'income'),
  ('R05', 'Direitos de imagem/transmissão', 'income'),
  ('R06', 'Outros (Receita)', 'income'),
  ('D01', 'Artistas / Cachês', 'expense'),
  ('D02', 'Produção', 'expense'),
  ('D03', 'Logística', 'expense'),
  ('D04', 'Marketing', 'expense'),
  ('D05', 'Staff', 'expense'),
  ('D06', 'Aluguer de Espaço', 'expense'),
  ('D07', 'Seguros', 'expense'),
  ('D08', 'Segurança', 'expense'),
  ('D09', 'Licenças e taxas', 'expense'),
  ('D10', 'Equipamento técnico', 'expense'),
  ('D11', 'Catering', 'expense'),
  ('D12', 'Outros (Despesa)', 'expense');

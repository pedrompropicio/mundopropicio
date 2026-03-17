
-- Allow anonymous (public) read/write access to all tables until auth is implemented

-- events
CREATE POLICY "Events are viewable by everyone" ON public.events FOR SELECT TO anon USING (true);
CREATE POLICY "Events can be managed by everyone" ON public.events FOR ALL TO anon USING (true) WITH CHECK (true);

-- transactions
CREATE POLICY "Transactions are viewable by everyone" ON public.transactions FOR SELECT TO anon USING (true);
CREATE POLICY "Transactions can be managed by everyone" ON public.transactions FOR ALL TO anon USING (true) WITH CHECK (true);

-- account_categories
CREATE POLICY "Account categories are viewable by everyone" ON public.account_categories FOR SELECT TO anon USING (true);

-- suppliers
CREATE POLICY "Suppliers are viewable by everyone" ON public.suppliers FOR SELECT TO anon USING (true);
CREATE POLICY "Suppliers can be managed by everyone" ON public.suppliers FOR ALL TO anon USING (true) WITH CHECK (true);

-- quotations
CREATE POLICY "Quotations are viewable by everyone" ON public.quotations FOR SELECT TO anon USING (true);
CREATE POLICY "Quotations can be managed by everyone" ON public.quotations FOR ALL TO anon USING (true) WITH CHECK (true);

-- supplier_documents
CREATE POLICY "Supplier documents are viewable by everyone" ON public.supplier_documents FOR SELECT TO anon USING (true);
CREATE POLICY "Supplier documents can be managed by everyone" ON public.supplier_documents FOR ALL TO anon USING (true) WITH CHECK (true);

-- Disposable only. Canonical reimbursement column names/types observed by official SELECT.
DROP TABLE public.reimbursements;
CREATE TABLE public.reimbursement_notes (
 id uuid NOT NULL, code text NOT NULL, employee_name text NOT NULL, status text NOT NULL,
 total_amount numeric NOT NULL, payment_transaction_id uuid, approved_by text, approved_at timestamptz,
 paid_at timestamptz, notes text, created_by text NOT NULL, created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL, supplier_id uuid, company_id uuid NOT NULL, payment_iban text
);
CREATE TABLE public.reimbursement_note_items (
 id uuid NOT NULL, reimbursement_note_id uuid NOT NULL, transaction_id uuid NOT NULL,
 created_at timestamptz NOT NULL, company_id uuid NOT NULL
);
CREATE TRIGGER reimbursement_notes_forbid BEFORE INSERT OR UPDATE OR DELETE ON public.reimbursement_notes FOR EACH ROW EXECUTE FUNCTION public.forbidden_write();
CREATE TRIGGER reimbursement_note_items_forbid BEFORE INSERT OR UPDATE OR DELETE ON public.reimbursement_note_items FOR EACH ROW EXECUTE FUNCTION public.forbidden_write();
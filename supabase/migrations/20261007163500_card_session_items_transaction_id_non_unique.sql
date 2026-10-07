-- #279 / D-ERP183 (07/10/2026): já aplicado em Live; regista o estado correto no histórico.
-- O modelo D17 consolida N itens numa transação, por isso transaction_id não pode ser único.
alter table public.card_session_items drop constraint if exists card_session_items_transaction_id_key;
create index if not exists idx_card_session_items_transaction_id on public.card_session_items (transaction_id);

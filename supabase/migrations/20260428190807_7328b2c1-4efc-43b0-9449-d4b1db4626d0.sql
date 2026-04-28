
DELETE FROM transactions WHERE id IN ('cb3fd172-2607-4c18-9355-7a01e4b53203','860c341b-a452-4527-9d31-04908b87b37e','0a17ca3e-9101-4c80-b2b7-3f0b31af6650');
UPDATE camarim_sessions SET status='closed', integrated_at=NULL, integration_summary=NULL, integration_transaction_ids='{}'::uuid[] WHERE id IN ('aaaaaaaa-bbbb-cccc-dddd-000000000001','aaaaaaaa-bbbb-cccc-dddd-000000000002');
DELETE FROM camarim_items WHERE session_id IN ('aaaaaaaa-bbbb-cccc-dddd-000000000001','aaaaaaaa-bbbb-cccc-dddd-000000000002');
DELETE FROM camarim_sessions WHERE id IN ('aaaaaaaa-bbbb-cccc-dddd-000000000001','aaaaaaaa-bbbb-cccc-dddd-000000000002');

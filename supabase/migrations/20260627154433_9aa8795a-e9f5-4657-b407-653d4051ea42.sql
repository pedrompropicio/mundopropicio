ALTER TABLE crm.audience_duel_runs
  ADD COLUMN IF NOT EXISTS gemini_finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS gpt_finished_at    timestamptz,
  ADD COLUMN IF NOT EXISTS gemini_candidate_id uuid,
  ADD COLUMN IF NOT EXISTS gpt_candidate_id    uuid;
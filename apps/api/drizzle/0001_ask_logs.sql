CREATE TABLE IF NOT EXISTS ask_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  question text NOT NULL,
  retrieved_chunks jsonb NOT NULL,
  answer text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ask_logs_repo_id_idx ON ask_logs (repo_id);

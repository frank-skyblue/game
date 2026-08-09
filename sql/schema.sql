-- Run against Neon once (SQL editor or psql).
CREATE TABLE IF NOT EXISTS maps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  author TEXT,
  width INT NOT NULL,
  height INT NOT NULL,
  walls JSONB NOT NULL,
  spawn_points JSONB NOT NULL,
  edit_token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS maps_created_at_idx ON maps (created_at DESC);

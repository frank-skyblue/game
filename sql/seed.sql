-- Optional seed of the classic default arena (edit token is not recoverable).
-- Replace EDIT_TOKEN_HASH with sha256 hex of a token you keep privately if you want to update this row.
INSERT INTO maps (
  id, name, author, width, height, walls, spawn_points, edit_token_hash
) VALUES (
  'classic',
  'Classic',
  'PvP Arena',
  960,
  640,
  '[
    {"x":280,"y":180,"width":120,"height":28},
    {"x":560,"y":180,"width":120,"height":28},
    {"x":280,"y":432,"width":120,"height":28},
    {"x":560,"y":432,"width":120,"height":28},
    {"x":440,"y":280,"width":80,"height":80}
  ]'::jsonb,
  '[
    {"x":120,"y":120},
    {"x":840,"y":120},
    {"x":120,"y":520},
    {"x":840,"y":520}
  ]'::jsonb,
  'seed-not-editable'
)
ON CONFLICT (id) DO NOTHING;

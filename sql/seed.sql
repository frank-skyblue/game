-- Seed built-in arenas. Safe to re-run: upserts by id.
-- edit_token_hash is a placeholder — these rows are not editable from the client.

INSERT INTO maps (
  id, name, author, width, height, walls, spawn_points, edit_token_hash, updated_at
) VALUES
(
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
  'seed-not-editable',
  now()
),
(
  'crossfire',
  'Crossfire',
  'PvP Arena',
  960,
  640,
  '[
    {"x":80,"y":200,"width":300,"height":28},
    {"x":580,"y":200,"width":300,"height":28},
    {"x":80,"y":412,"width":300,"height":28},
    {"x":580,"y":412,"width":300,"height":28},
    {"x":460,"y":240,"width":40,"height":160},
    {"x":200,"y":300,"width":100,"height":40},
    {"x":660,"y":300,"width":100,"height":40}
  ]'::jsonb,
  '[
    {"x":80,"y":80},
    {"x":880,"y":80},
    {"x":80,"y":560},
    {"x":880,"y":560}
  ]'::jsonb,
  'seed-not-editable',
  now()
),
(
  'pillboxes',
  'Pillboxes',
  'PvP Arena',
  960,
  640,
  '[
    {"x":140,"y":100,"width":100,"height":100},
    {"x":720,"y":100,"width":100,"height":100},
    {"x":140,"y":440,"width":100,"height":100},
    {"x":720,"y":440,"width":100,"height":100},
    {"x":420,"y":140,"width":40,"height":120},
    {"x":500,"y":380,"width":40,"height":120},
    {"x":280,"y":300,"width":120,"height":40},
    {"x":560,"y":300,"width":120,"height":40}
  ]'::jsonb,
  '[
    {"x":60,"y":60},
    {"x":900,"y":60},
    {"x":60,"y":580},
    {"x":900,"y":580},
    {"x":480,"y":60},
    {"x":480,"y":580}
  ]'::jsonb,
  'seed-not-editable',
  now()
),
(
  'fortress',
  'Fortress',
  'PvP Arena',
  960,
  640,
  '[
    {"x":60,"y":60,"width":180,"height":28},
    {"x":60,"y":60,"width":28,"height":160},
    {"x":720,"y":60,"width":180,"height":28},
    {"x":872,"y":60,"width":28,"height":160},
    {"x":60,"y":552,"width":180,"height":28},
    {"x":60,"y":420,"width":28,"height":160},
    {"x":720,"y":552,"width":180,"height":28},
    {"x":872,"y":420,"width":28,"height":160},
    {"x":400,"y":240,"width":160,"height":28},
    {"x":400,"y":372,"width":160,"height":28},
    {"x":400,"y":240,"width":28,"height":160},
    {"x":532,"y":240,"width":28,"height":160}
  ]'::jsonb,
  '[
    {"x":140,"y":160},
    {"x":820,"y":160},
    {"x":140,"y":480},
    {"x":820,"y":480}
  ]'::jsonb,
  'seed-not-editable',
  now()
),
(
  'gauntlet',
  'Gauntlet',
  'PvP Arena',
  960,
  640,
  '[
    {"x":220,"y":60,"width":28,"height":220},
    {"x":220,"y":360,"width":28,"height":220},
    {"x":712,"y":60,"width":28,"height":220},
    {"x":712,"y":360,"width":28,"height":220},
    {"x":340,"y":260,"width":100,"height":120},
    {"x":520,"y":260,"width":100,"height":120},
    {"x":60,"y":280,"width":80,"height":80},
    {"x":820,"y":280,"width":80,"height":80}
  ]'::jsonb,
  '[
    {"x":100,"y":100},
    {"x":860,"y":100},
    {"x":100,"y":540},
    {"x":860,"y":540},
    {"x":480,"y":80},
    {"x":480,"y":560}
  ]'::jsonb,
  'seed-not-editable',
  now()
),
(
  'serpentine',
  'Serpentine',
  'PvP Arena',
  960,
  640,
  '[
    {"x":140,"y":80,"width":680,"height":28},
    {"x":140,"y":80,"width":28,"height":200},
    {"x":140,"y":252,"width":560,"height":28},
    {"x":672,"y":252,"width":28,"height":160},
    {"x":140,"y":384,"width":560,"height":28},
    {"x":140,"y":384,"width":28,"height":160},
    {"x":140,"y":516,"width":680,"height":28}
  ]'::jsonb,
  '[
    {"x":80,"y":200},
    {"x":880,"y":200},
    {"x":80,"y":440},
    {"x":880,"y":440},
    {"x":400,"y":180},
    {"x":560,"y":460}
  ]'::jsonb,
  'seed-not-editable',
  now()
),
(
  'hourglass',
  'Hourglass',
  'PvP Arena',
  960,
  640,
  '[
    {"x":180,"y":60,"width":220,"height":28},
    {"x":560,"y":60,"width":220,"height":28},
    {"x":80,"y":180,"width":160,"height":28},
    {"x":720,"y":180,"width":160,"height":28},
    {"x":360,"y":260,"width":240,"height":120},
    {"x":80,"y":432,"width":160,"height":28},
    {"x":720,"y":432,"width":160,"height":28},
    {"x":180,"y":552,"width":220,"height":28},
    {"x":560,"y":552,"width":220,"height":28}
  ]'::jsonb,
  '[
    {"x":80,"y":80},
    {"x":880,"y":80},
    {"x":80,"y":560},
    {"x":880,"y":560},
    {"x":80,"y":320},
    {"x":880,"y":320}
  ]'::jsonb,
  'seed-not-editable',
  now()
),
(
  'islands',
  'Islands',
  'PvP Arena',
  960,
  640,
  '[
    {"x":200,"y":140,"width":140,"height":140},
    {"x":620,"y":140,"width":140,"height":140},
    {"x":200,"y":360,"width":140,"height":140},
    {"x":620,"y":360,"width":140,"height":140},
    {"x":440,"y":260,"width":80,"height":120}
  ]'::jsonb,
  '[
    {"x":80,"y":80},
    {"x":880,"y":80},
    {"x":80,"y":560},
    {"x":880,"y":560},
    {"x":480,"y":80},
    {"x":480,"y":560},
    {"x":80,"y":320},
    {"x":880,"y":320}
  ]'::jsonb,
  'seed-not-editable',
  now()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  author = EXCLUDED.author,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  walls = EXCLUDED.walls,
  spawn_points = EXCLUDED.spawn_points,
  edit_token_hash = EXCLUDED.edit_token_hash,
  updated_at = now();

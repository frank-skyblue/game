export type Wall = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SpawnPoint = { x: number; y: number };

export type ArenaDefinition = {
  width: number;
  height: number;
  walls: Wall[];
  spawnPoints: SpawnPoint[];
};

export const ARENA_GRID = 40;

export const MAX_ARENA_WIDTH = 1920;
export const MAX_ARENA_HEIGHT = 1280;
export const MAX_WALLS = 64;
export const MAX_SPAWNS = 8;
export const MIN_SPAWNS = 1;

/** Must match PLAYER_RADIUS in constants (kept here to avoid a circular import). */
const SPAWN_CLEARANCE = 16;

/** Classic built-in arena used when no custom map is selected. */
export const DEFAULT_ARENA: ArenaDefinition = {
  width: 960,
  height: 640,
  walls: [
    { x: 280, y: 180, width: 120, height: 28 },
    { x: 560, y: 180, width: 120, height: 28 },
    { x: 280, y: 432, width: 120, height: 28 },
    { x: 560, y: 432, width: 120, height: 28 },
    { x: 440, y: 280, width: 80, height: 80 },
  ],
  spawnPoints: [
    { x: 120, y: 120 },
    { x: 840, y: 120 },
    { x: 120, y: 520 },
    { x: 840, y: 520 },
  ],
};

export type ArenaValidationResult =
  | { ok: true; arena: ArenaDefinition }
  | { ok: false; error: string };

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const parseWall = (raw: unknown): Wall | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const wall = raw as Record<string, unknown>;
  if (
    !isFiniteNumber(wall.x) ||
    !isFiniteNumber(wall.y) ||
    !isFiniteNumber(wall.width) ||
    !isFiniteNumber(wall.height)
  ) {
    return null;
  }
  return {
    x: wall.x,
    y: wall.y,
    width: wall.width,
    height: wall.height,
  };
};

const parseSpawn = (raw: unknown): SpawnPoint | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const spawn = raw as Record<string, unknown>;
  if (!isFiniteNumber(spawn.x) || !isFiniteNumber(spawn.y)) {
    return null;
  }
  return { x: spawn.x, y: spawn.y };
};

const circleHitsWall = (
  x: number,
  y: number,
  radius: number,
  wall: Wall
): boolean => {
  const nearestX = Math.max(wall.x, Math.min(x, wall.x + wall.width));
  const nearestY = Math.max(wall.y, Math.min(y, wall.y + wall.height));
  const dx = x - nearestX;
  const dy = y - nearestY;
  return dx * dx + dy * dy < radius * radius;
};

/** Validate and normalize arena JSON from the editor or API. */
export const validateArena = (raw: unknown): ArenaValidationResult => {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Arena must be an object." };
  }

  const input = raw as Record<string, unknown>;
  if (!isFiniteNumber(input.width) || !isFiniteNumber(input.height)) {
    return { ok: false, error: "Arena width and height are required." };
  }

  const width = Math.floor(input.width);
  const height = Math.floor(input.height);

  if (width < 320 || height < 240) {
    return { ok: false, error: "Arena is too small (min 320×240)." };
  }
  if (width > MAX_ARENA_WIDTH || height > MAX_ARENA_HEIGHT) {
    return {
      ok: false,
      error: `Arena is too large (max ${MAX_ARENA_WIDTH}×${MAX_ARENA_HEIGHT}).`,
    };
  }

  if (!Array.isArray(input.walls)) {
    return { ok: false, error: "Arena walls must be an array." };
  }
  if (input.walls.length > MAX_WALLS) {
    return { ok: false, error: `Too many walls (max ${MAX_WALLS}).` };
  }

  const walls: Wall[] = [];
  for (const item of input.walls) {
    const wall = parseWall(item);
    if (!wall) {
      return { ok: false, error: "Each wall needs x, y, width, and height." };
    }
    if (wall.width < 8 || wall.height < 8) {
      return { ok: false, error: "Walls must be at least 8×8." };
    }
    if (
      wall.x < 0 ||
      wall.y < 0 ||
      wall.x + wall.width > width ||
      wall.y + wall.height > height
    ) {
      return { ok: false, error: "Walls must stay inside the arena." };
    }
    walls.push({
      x: Math.round(wall.x),
      y: Math.round(wall.y),
      width: Math.round(wall.width),
      height: Math.round(wall.height),
    });
  }

  const spawnRaw = input.spawnPoints ?? input.spawn_points;
  if (!Array.isArray(spawnRaw)) {
    return { ok: false, error: "Arena spawnPoints must be an array." };
  }
  if (spawnRaw.length < MIN_SPAWNS) {
    return { ok: false, error: `Need at least ${MIN_SPAWNS} spawn point.` };
  }
  if (spawnRaw.length > MAX_SPAWNS) {
    return { ok: false, error: `Too many spawn points (max ${MAX_SPAWNS}).` };
  }

  const spawnPoints: SpawnPoint[] = [];
  for (const item of spawnRaw) {
    const spawn = parseSpawn(item);
    if (!spawn) {
      return { ok: false, error: "Each spawn needs x and y." };
    }
    if (
      spawn.x < SPAWN_CLEARANCE ||
      spawn.y < SPAWN_CLEARANCE ||
      spawn.x > width - SPAWN_CLEARANCE ||
      spawn.y > height - SPAWN_CLEARANCE
    ) {
      return { ok: false, error: "Spawn points must be inside the arena." };
    }
    if (
      walls.some((wall) =>
        circleHitsWall(spawn.x, spawn.y, SPAWN_CLEARANCE, wall)
      )
    ) {
      return { ok: false, error: "Spawn points cannot overlap walls." };
    }
    spawnPoints.push({
      x: Math.round(spawn.x),
      y: Math.round(spawn.y),
    });
  }

  return {
    ok: true,
    arena: { width, height, walls, spawnPoints },
  };
};

export const cloneArena = (arena: ArenaDefinition): ArenaDefinition => ({
  width: arena.width,
  height: arena.height,
  walls: arena.walls.map((wall) => ({ ...wall })),
  spawnPoints: arena.spawnPoints.map((spawn) => ({ ...spawn })),
});

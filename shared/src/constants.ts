import { DEFAULT_ARENA, type Wall } from "./arena";

export type { Wall };

export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;

export const ARENA_WIDTH = DEFAULT_ARENA.width;
export const ARENA_HEIGHT = DEFAULT_ARENA.height;

export const PLAYER_RADIUS = 16;
export const RESPAWN_MS = 2500;

export const PICKUP_RADIUS = 14;
export const MAX_PICKUPS = 5;
export const INITIAL_PICKUP_COUNT = 3;
export const PICKUP_SPAWN_INTERVAL_MS = 7000;
/** Health restored by a health pack (capped at weapon maxHealth). */
export const HEALTH_PACK_HEAL = 40;
/** Magazines worth of ammo added to reserve by an ammo pack. */
export const AMMO_PACK_MAGAZINES = 1;

export const MAX_PLAYERS = 8;
export const DEFAULT_BOT_COUNT = 2;

export const PLAYER_COLORS = [
  0x3b82f6,
  0xef4444,
  0x22c55e,
  0xf59e0b,
  0xa855f7,
  0x14b8a6,
  0xf43f5e,
  0x84cc16,
] as const;

/** Axis-aligned obstacles in the default arena (top-left origin). */
export const WALLS: Wall[] = DEFAULT_ARENA.walls;

export const SPAWN_POINTS = DEFAULT_ARENA.spawnPoints;

export type PlayerInput = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  aimAngle: number;
  shooting: boolean;
  reload: boolean;
};

export const EMPTY_INPUT: PlayerInput = {
  up: false,
  down: false,
  left: false,
  right: false,
  aimAngle: 0,
  shooting: false,
  reload: false,
};

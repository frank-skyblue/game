export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;

export const ARENA_WIDTH = 960;
export const ARENA_HEIGHT = 640;

export const PLAYER_RADIUS = 16;
export const RESPAWN_MS = 2500;

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

export type Wall = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Axis-aligned obstacles in arena space (top-left origin). */
export const WALLS: Wall[] = [
  { x: 280, y: 180, width: 120, height: 28 },
  { x: 560, y: 180, width: 120, height: 28 },
  { x: 280, y: 432, width: 120, height: 28 },
  { x: 560, y: 432, width: 120, height: 28 },
  { x: 440, y: 280, width: 80, height: 80 },
];

export const SPAWN_POINTS = [
  { x: 120, y: 120 },
  { x: 840, y: 120 },
  { x: 120, y: 520 },
  { x: 840, y: 520 },
] as const;

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

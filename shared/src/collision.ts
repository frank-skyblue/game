import { PLAYER_RADIUS } from "./constants";
import {
  DEFAULT_ARENA,
  type ArenaDefinition,
  type Wall,
} from "./arena";

export const circleHitsWall = (
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

export const circleHitsAnyWall = (
  x: number,
  y: number,
  radius: number,
  arena: ArenaDefinition = DEFAULT_ARENA
): boolean => arena.walls.some((wall) => circleHitsWall(x, y, radius, wall));

export const clampPlayerPosition = (
  currentX: number,
  currentY: number,
  desiredX: number,
  desiredY: number,
  arena: ArenaDefinition = DEFAULT_ARENA
): { x: number; y: number } => {
  const nextX = Math.max(
    PLAYER_RADIUS,
    Math.min(arena.width - PLAYER_RADIUS, desiredX)
  );
  const nextY = Math.max(
    PLAYER_RADIUS,
    Math.min(arena.height - PLAYER_RADIUS, desiredY)
  );

  if (!circleHitsAnyWall(nextX, nextY, PLAYER_RADIUS, arena)) {
    return { x: nextX, y: nextY };
  }

  // Slide along walls by resolving one axis at a time from the current pose.
  if (!circleHitsAnyWall(nextX, currentY, PLAYER_RADIUS, arena)) {
    return { x: nextX, y: currentY };
  }

  if (!circleHitsAnyWall(currentX, nextY, PLAYER_RADIUS, arena)) {
    return { x: currentX, y: nextY };
  }

  return { x: currentX, y: currentY };
};

export const circlesOverlap = (
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number
): boolean => {
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy <= r * r;
};

/** Rejection-sample a spawn that clears walls (and optional occupied circles). */
export const findRandomFreeSpawn = (
  occupied: Array<{ x: number; y: number; radius?: number }> = [],
  radius = PLAYER_RADIUS,
  maxAttempts = 48,
  arena: ArenaDefinition = DEFAULT_ARENA
): { x: number; y: number } => {
  const margin = radius + 2;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const x = margin + Math.random() * (arena.width - margin * 2);
    const y = margin + Math.random() * (arena.height - margin * 2);

    if (circleHitsAnyWall(x, y, radius, arena)) {
      continue;
    }

    const blocked = occupied.some((other) =>
      circlesOverlap(x, y, radius, other.x, other.y, other.radius ?? PLAYER_RADIUS)
    );
    if (blocked) {
      continue;
    }

    return { x, y };
  }

  const fallback =
    arena.spawnPoints[Math.floor(Math.random() * arena.spawnPoints.length)] ??
    arena.spawnPoints[0] ??
    { x: arena.width / 2, y: arena.height / 2 };
  return { x: fallback.x, y: fallback.y };
};

export const bulletHitsWallOrBounds = (
  x: number,
  y: number,
  radius: number,
  arena: ArenaDefinition = DEFAULT_ARENA
): boolean => {
  if (
    x < radius ||
    y < radius ||
    x > arena.width - radius ||
    y > arena.height - radius
  ) {
    return true;
  }
  return circleHitsAnyWall(x, y, radius, arena);
};

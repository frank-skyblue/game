import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  PLAYER_RADIUS,
  SPAWN_POINTS,
  WALLS,
  type Wall,
} from "./constants";

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
  radius: number
): boolean => WALLS.some((wall) => circleHitsWall(x, y, radius, wall));

export const clampPlayerPosition = (
  currentX: number,
  currentY: number,
  desiredX: number,
  desiredY: number
): { x: number; y: number } => {
  const nextX = Math.max(
    PLAYER_RADIUS,
    Math.min(ARENA_WIDTH - PLAYER_RADIUS, desiredX)
  );
  const nextY = Math.max(
    PLAYER_RADIUS,
    Math.min(ARENA_HEIGHT - PLAYER_RADIUS, desiredY)
  );

  if (!circleHitsAnyWall(nextX, nextY, PLAYER_RADIUS)) {
    return { x: nextX, y: nextY };
  }

  // Slide along walls by resolving one axis at a time from the current pose.
  if (!circleHitsAnyWall(nextX, currentY, PLAYER_RADIUS)) {
    return { x: nextX, y: currentY };
  }

  if (!circleHitsAnyWall(currentX, nextY, PLAYER_RADIUS)) {
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
  maxAttempts = 48
): { x: number; y: number } => {
  const margin = radius + 2;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const x = margin + Math.random() * (ARENA_WIDTH - margin * 2);
    const y = margin + Math.random() * (ARENA_HEIGHT - margin * 2);

    if (circleHitsAnyWall(x, y, radius)) {
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
    SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)] ??
    SPAWN_POINTS[0];
  return { x: fallback.x, y: fallback.y };
};

export const bulletHitsWallOrBounds = (
  x: number,
  y: number,
  radius: number
): boolean => {
  if (
    x < radius ||
    y < radius ||
    x > ARENA_WIDTH - radius ||
    y > ARENA_HEIGHT - radius
  ) {
    return true;
  }
  return circleHitsAnyWall(x, y, radius);
};

import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  PLAYER_RADIUS,
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

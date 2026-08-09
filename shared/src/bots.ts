import { EMPTY_INPUT, PLAYER_RADIUS, type PlayerInput } from "./constants";
import type { PlayerSnapshot } from "./types";
import { getWeapon } from "./weapons";

const pickNearestEnemy = (
  bot: PlayerSnapshot,
  others: PlayerSnapshot[]
): PlayerSnapshot | null => {
  let nearest: PlayerSnapshot | null = null;
  let bestDist = Infinity;

  for (const other of others) {
    if (!other.alive || other.id === bot.id) {
      continue;
    }
    const dist = Math.hypot(other.x - bot.x, other.y - bot.y);
    if (dist < bestDist) {
      bestDist = dist;
      nearest = other;
    }
  }

  return nearest;
};

/** Simple chase / keep-range / shoot brain for host-driven bots. */
export const computeBotInput = (
  bot: PlayerSnapshot,
  others: PlayerSnapshot[],
  now: number
): PlayerInput => {
  if (!bot.alive) {
    return { ...EMPTY_INPUT };
  }

  const target = pickNearestEnemy(bot, others);
  if (!target) {
    return { ...EMPTY_INPUT, aimAngle: bot.aimAngle };
  }

  const weapon = getWeapon(bot.weapon);
  const dx = target.x - bot.x;
  const dy = target.y - bot.y;
  const dist = Math.hypot(dx, dy);
  const aimAngle = Math.atan2(dy, dx);

  const preferredRange = weapon.melee
    ? Math.max(28, weapon.meleeRange * 0.65)
    : 170;
  const tooClose = !weapon.melee && dist < preferredRange * 0.5;
  const tooFar = dist > preferredRange;

  let up = false;
  let down = false;
  let left = false;
  let right = false;

  if (tooFar) {
    if (dx > 10) right = true;
    else if (dx < -10) left = true;
    if (dy > 10) down = true;
    else if (dy < -10) up = true;
  } else if (tooClose) {
    if (dx > 10) left = true;
    else if (dx < -10) right = true;
    if (dy > 10) up = true;
    else if (dy < -10) down = true;
  } else {
    // Strafe while holding range so bots aren't stationary targets.
    const strafeSign = Math.sin(now / 380 + bot.x * 0.02) >= 0 ? 1 : -1;
    const sx = -dy * strafeSign;
    const sy = dx * strafeSign;
    if (sx > 12) right = true;
    else if (sx < -12) left = true;
    if (sy > 12) down = true;
    else if (sy < -12) up = true;
  }

  const shooting = weapon.melee
    ? dist <= weapon.meleeRange + PLAYER_RADIUS
    : dist < 460;

  const reload =
    !weapon.infiniteAmmo &&
    bot.ammo <= 0 &&
    bot.reserveAmmo > 0 &&
    bot.reloadEndsAt <= 0;

  return {
    up,
    down,
    left,
    right,
    aimAngle,
    shooting,
    reload,
  };
};

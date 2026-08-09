import { EMPTY_INPUT, PLAYER_RADIUS, type PlayerInput } from "./constants";
import type { PlayerSnapshot } from "./types";
import { getWeapon, type WeaponId } from "./weapons";

export type BotPersonalityId =
  | "aggressive"
  | "defensive"
  | "hunter"
  | "brawler"
  | "marksman";

export const BOT_PERSONALITY_IDS: BotPersonalityId[] = [
  "aggressive",
  "defensive",
  "hunter",
  "brawler",
  "marksman",
];

type BotPersonality = {
  id: BotPersonalityId;
  /** Display names used when spawning unnamed bots. */
  names: string[];
  /** Preferred weapons — first entries are more likely. */
  weapons: WeaponId[];
  /** How strongly distance pulls target choice (higher = stick to nearest). */
  distanceWeight: number;
  /** How strongly low target HP pulls choice (higher = finish wounded). */
  finishWeight: number;
  /** Multiplier on the weapon's base preferred stand-off range. */
  rangeFactor: number;
  /** Back off when closer than preferredRange * retreatRatio (ranged only). */
  retreatRatio: number;
  /** Max distance at which guns will fire. */
  shootRange: number;
  /** Reload when mag is at or below this fraction and not in a knife-fight. */
  reloadBelow: number;
  /** When own HP fraction is below this, close the preferred range (berserk). */
  panicHp: number;
  /** Preferred-range multiplier applied while panicking (lower = charge). */
  panicRangeFactor: number;
  /** Strafe amplitude while holding range (0 = stand still more). */
  strafeScale: number;
  /**
   * How erratic the approach path is while closing (0 = bee-line).
   * Mixes lateral weave + occasional feints into the chase vector.
   */
  approachChaos: number;
};

/** Each loadout (class) drives one fixed fight style. */
export const WEAPON_PERSONALITY: Record<WeaponId, BotPersonalityId> = {
  sword: "brawler",
  smg: "aggressive",
  rifle: "hunter",
  sniper: "marksman",
};

export const BOT_PERSONALITIES: Record<BotPersonalityId, BotPersonality> = {
  /** SMG — closes hard, rarely backs off, reloads only when empty. */
  aggressive: {
    id: "aggressive",
    names: ["Rush", "Blaze", "Fury", "Riot"],
    weapons: ["smg", "sword", "rifle", "sniper"],
    distanceWeight: 1.2,
    finishWeight: 0.35,
    rangeFactor: 0.65,
    retreatRatio: 0.28,
    shootRange: 520,
    reloadBelow: 0,
    panicHp: 0.45,
    panicRangeFactor: 0.55,
    strafeScale: 0.7,
    approachChaos: 0.25,
  },
  /** Spare defensive profile (kept for variety / overrides). */
  defensive: {
    id: "defensive",
    names: ["Aegis", "Bulwark", "Ward", "Haven"],
    weapons: ["rifle", "sniper", "smg", "sword"],
    distanceWeight: 1,
    finishWeight: 0.15,
    rangeFactor: 1.45,
    retreatRatio: 0.78,
    shootRange: 440,
    reloadBelow: 0.4,
    panicHp: 0.55,
    panicRangeFactor: 1.25,
    strafeScale: 1.15,
    approachChaos: 0.1,
  },
  /** Rifle — mid-range, hunts wounded targets to finish them. */
  hunter: {
    id: "hunter",
    names: ["Stalker", "Vulture", "Shade", "Prey"],
    weapons: ["rifle", "smg", "sniper", "sword"],
    distanceWeight: 0.55,
    finishWeight: 1.4,
    rangeFactor: 0.95,
    retreatRatio: 0.45,
    shootRange: 480,
    reloadBelow: 0.15,
    panicHp: 0.3,
    panicRangeFactor: 0.85,
    strafeScale: 1,
    approachChaos: 0.2,
  },
  /** Sword — aggressive melee: wild zigzag approach, charge when hurt. */
  brawler: {
    id: "brawler",
    names: ["Scrap", "Maul", "Clash", "Ruck"],
    weapons: ["sword", "smg", "rifle", "sniper"],
    distanceWeight: 1.35,
    finishWeight: 0.55,
    rangeFactor: 0.45,
    retreatRatio: 0.15,
    shootRange: 380,
    reloadBelow: 0,
    panicHp: 0.6,
    panicRangeFactor: 0.4,
    strafeScale: 0.9,
    approachChaos: 1.15,
  },
  /** Sniper — defensive: hold long range, strafe, peel when pressured. */
  marksman: {
    id: "marksman",
    names: ["Hawk", "Scope", "Drift", "Lens"],
    weapons: ["sniper", "rifle", "smg", "sword"],
    distanceWeight: 0.35,
    finishWeight: 0.45,
    rangeFactor: 1.85,
    retreatRatio: 0.7,
    shootRange: 580,
    reloadBelow: 0.25,
    panicHp: 0.4,
    panicRangeFactor: 1.15,
    strafeScale: 1.3,
    approachChaos: 0.15,
  },
};

export const personalityForWeapon = (weaponId: WeaponId): BotPersonalityId =>
  WEAPON_PERSONALITY[weaponId] ?? "aggressive";

const basePreferredRange = (weapon: ReturnType<typeof getWeapon>): number => {
  if (weapon.melee) {
    // Stand just inside swing reach — not on the target's center.
    return Math.max(PLAYER_RADIUS * 2.2, weapon.meleeRange * 0.85);
  }
  if (weapon.id === "sniper") {
    return 300;
  }
  if (weapon.id === "smg") {
    return 130;
  }
  return 170;
};

export const pickBotPersonality = (
  index = Math.floor(Math.random() * BOT_PERSONALITY_IDS.length)
): BotPersonalityId =>
  BOT_PERSONALITY_IDS[index % BOT_PERSONALITY_IDS.length] ?? "aggressive";

export const pickBotWeapon = (personalityId: BotPersonalityId): WeaponId => {
  const { weapons } = BOT_PERSONALITIES[personalityId];
  // Soft bias toward earlier (preferred) weapons.
  const roll = Math.random();
  if (roll < 0.5) return weapons[0] ?? "rifle";
  if (roll < 0.78) return weapons[1] ?? weapons[0] ?? "rifle";
  if (roll < 0.93) return weapons[2] ?? weapons[0] ?? "rifle";
  return weapons[3] ?? weapons[0] ?? "rifle";
};

export const pickBotName = (
  personalityId: BotPersonalityId,
  usedNames: Set<string>
): string => {
  const { names, id } = BOT_PERSONALITIES[personalityId];
  for (const name of names) {
    if (!usedNames.has(name)) {
      return name;
    }
  }
  let n = 2;
  while (usedNames.has(`${names[0]} ${n}`)) {
    n += 1;
  }
  return `${names[0] ?? id} ${n}`;
};

const healthFraction = (player: PlayerSnapshot): number => {
  const max = getWeapon(player.weapon).maxHealth;
  return max > 0 ? player.health / max : 1;
};

const pickTarget = (
  bot: PlayerSnapshot,
  others: PlayerSnapshot[],
  personality: BotPersonality
): PlayerSnapshot | null => {
  let best: PlayerSnapshot | null = null;
  let bestScore = Infinity;

  for (const other of others) {
    if (!other.alive || other.id === bot.id) {
      continue;
    }
    const dist = Math.hypot(other.x - bot.x, other.y - bot.y);
    const wounded = 1 - healthFraction(other);
    // Lower score wins: distance pulls up, finishing wounded pulls down.
    const score =
      dist * personality.distanceWeight - wounded * 220 * personality.finishWeight;

    if (score < bestScore) {
      bestScore = score;
      best = other;
    }
  }

  return best;
};

const setAxisFromVector = (
  vx: number,
  vy: number,
  deadzone: number
): Pick<PlayerInput, "up" | "down" | "left" | "right"> => {
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  if (vx > deadzone) right = true;
  else if (vx < -deadzone) left = true;
  if (vy > deadzone) down = true;
  else if (vy < -deadzone) up = true;
  return { up, down, left, right };
};

/** Hash a bot id into a stable phase so each swordsman weaves differently. */
const botPhase = (botId: string): number => {
  let h = 0;
  for (let i = 0; i < botId.length; i += 1) {
    h = (h * 31 + botId.charCodeAt(i)) | 0;
  }
  return (h >>> 0) % 1000;
};

/**
 * Blend a chase vector with lateral zigzags + short feints.
 * Higher chaos = wilder, less readable approach paths.
 */
const chaoticApproach = (
  dx: number,
  dy: number,
  dist: number,
  now: number,
  bot: PlayerSnapshot,
  chaos: number
): { vx: number; vy: number } => {
  if (chaos <= 0.01 || dist < 1) {
    return { vx: dx, vy: dy };
  }

  const phase = botPhase(bot.id);
  const inv = 1 / dist;
  const fx = dx * inv;
  const fy = dy * inv;
  const px = -fy;
  const py = fx;

  // Irregular multi-frequency weave — hard to track as a simple sine.
  const weave =
    Math.sin(now / 210 + phase) * 0.7 +
    Math.sin(now / 97 + phase * 0.37) * 0.45 +
    Math.sin(now / 53 + bot.y * 0.03) * 0.3;

  // Occasional hard feint: briefly commit almost fully lateral / reverse.
  const feintWave = Math.sin(now / 640 + phase * 0.11);
  const feinting = feintWave > 0.72;
  const reverseFeint = feintWave < -0.82;

  let forward = 1;
  let lateral = weave * chaos;

  if (feinting) {
    forward = 0.15;
    lateral = Math.sign(weave || 1) * (1.1 + chaos * 0.4);
  } else if (reverseFeint) {
    forward = -0.35;
    lateral = weave * chaos * 0.6;
  }

  // Near the target, damp chaos so they still commit to the swing.
  const commit = dist < 90 ? Math.max(0.2, (dist - 40) / 50) : 1;
  lateral *= commit;

  return {
    vx: fx * forward + px * lateral,
    vy: fy * forward + py * lateral,
  };
};

/** Personality-driven chase / keep-range / shoot brain for host-driven bots. */
export const computeBotInput = (
  bot: PlayerSnapshot,
  others: PlayerSnapshot[],
  now: number,
  personalityId: BotPersonalityId = "aggressive"
): PlayerInput => {
  if (!bot.alive) {
    return { ...EMPTY_INPUT };
  }

  const personality = BOT_PERSONALITIES[personalityId] ?? BOT_PERSONALITIES.aggressive;
  const target = pickTarget(bot, others, personality);
  if (!target) {
    return { ...EMPTY_INPUT, aimAngle: bot.aimAngle };
  }

  const weapon = getWeapon(bot.weapon);
  const dx = target.x - bot.x;
  const dy = target.y - bot.y;
  const dist = Math.hypot(dx, dy);
  const aimAngle = Math.atan2(dy, dx);

  const ownHp = healthFraction(bot);
  const panicking = ownHp <= personality.panicHp;
  let preferredRange = basePreferredRange(weapon) * personality.rangeFactor;
  if (panicking) {
    preferredRange *= personality.panicRangeFactor;
  }

  // Melee bots peel off if they sit on the target (point-blank used to void swings).
  const tooClose = weapon.melee
    ? dist < Math.max(PLAYER_RADIUS * 1.6, preferredRange * 0.55)
    : dist < preferredRange * personality.retreatRatio;
  const tooFar = dist > preferredRange;

  let move = { up: false, down: false, left: false, right: false };

  if (tooClose) {
    // Prefer orbiting out instead of a pure backpedal when stacked.
    if (weapon.melee && dist < PLAYER_RADIUS * 0.9) {
      const phase = botPhase(bot.id);
      const side = Math.sin(now / 180 + phase) >= 0 ? 1 : -1;
      move = setAxisFromVector(-dx + -dy * side * 1.4, -dy + dx * side * 1.4, 8);
    } else {
      move = setAxisFromVector(-dx, -dy, 10);
    }
  } else if (tooFar) {
    const approach = chaoticApproach(
      dx,
      dy,
      dist,
      now,
      bot,
      personality.approachChaos
    );
    move = setAxisFromVector(approach.vx, approach.vy, 0.15);
  } else if (personality.strafeScale > 0.05) {
    const phase = botPhase(bot.id);
    const strafeSign =
      Math.sin(now / 280 + phase * 0.05) + Math.sin(now / 110 + bot.x * 0.02) >= 0
        ? 1
        : -1;
    const scale = personality.strafeScale;
    move = setAxisFromVector(-dy * strafeSign * scale, dx * strafeSign * scale, 12);
  }

  const underPressure = dist < preferredRange * 1.15;
  const magFraction =
    weapon.infiniteAmmo || weapon.magazineSize <= 0
      ? 1
      : bot.ammo / weapon.magazineSize;

  const wantsEarlyReload =
    personality.reloadBelow > 0 &&
    magFraction <= personality.reloadBelow &&
    bot.ammo > 0 &&
    !underPressure;

  const shooting = weapon.melee
    ? dist <= weapon.meleeRange + PLAYER_RADIUS
    : dist < personality.shootRange && !wantsEarlyReload;

  const reload =
    !weapon.infiniteAmmo &&
    bot.reserveAmmo > 0 &&
    bot.reloadEndsAt <= 0 &&
    (bot.ammo <= 0 || wantsEarlyReload);

  return {
    ...move,
    aimAngle,
    shooting,
    reload,
  };
};

export type WeaponId = "rifle" | "smg" | "sniper" | "sword";

export type WeaponDef = {
  id: WeaponId;
  name: string;
  /** Rounds in magazine. Ignored when infiniteAmmo is true. */
  magazineSize: number;
  /** Spare ammo outside the magazine. Ignored when infiniteAmmo is true. */
  reserveAmmo: number;
  damage: number;
  fireCooldownMs: number;
  reloadMs: number;
  bulletSpeed: number;
  bulletLifetimeMs: number;
  bulletRadius: number;
  infiniteAmmo: boolean;
  /** Player movement speed while this weapon is equipped. */
  moveSpeed: number;
  /** Max health while this weapon is equipped. */
  maxHealth: number;
  /** Melee weapons use a swing arc instead of projectiles. */
  melee: boolean;
  swingMs: number;
  swingArc: number;
  meleeRange: number;
};

export const DEFAULT_WEAPON_ID: WeaponId = "rifle";

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  rifle: {
    id: "rifle",
    name: "Rifle",
    magazineSize: 30,
    reserveAmmo: 120,
    damage: 20,
    fireCooldownMs: 200,
    reloadMs: 1600,
    bulletSpeed: 520,
    bulletLifetimeMs: 1500,
    bulletRadius: 5,
    infiniteAmmo: false,
    moveSpeed: 220,
    maxHealth: 100,
    melee: false,
    swingMs: 0,
    swingArc: 0,
    meleeRange: 0,
  },
  smg: {
    id: "smg",
    name: "SMG",
    magazineSize: 60,
    reserveAmmo: 240,
    damage: 8,
    fireCooldownMs: 70,
    reloadMs: 1800,
    bulletSpeed: 450,
    bulletLifetimeMs: 1100,
    bulletRadius: 4,
    infiniteAmmo: false,
    moveSpeed: 280,
    maxHealth: 115,
    melee: false,
    swingMs: 0,
    swingArc: 0,
    meleeRange: 0,
  },
  sniper: {
    id: "sniper",
    name: "Sniper",
    magazineSize: 10,
    reserveAmmo: 80,
    damage: 55,
    fireCooldownMs: 850,
    reloadMs: 2200,
    bulletSpeed: 900,
    bulletLifetimeMs: 2000,
    bulletRadius: 5,
    infiniteAmmo: false,
    moveSpeed: 150,
    maxHealth: 75,
    melee: false,
    swingMs: 0,
    swingArc: 0,
    meleeRange: 0,
  },
  sword: {
    id: "sword",
    name: "Sword",
    magazineSize: 1,
    reserveAmmo: 0,
    damage: 45,
    fireCooldownMs: 380,
    reloadMs: 0,
    bulletSpeed: 0,
    bulletLifetimeMs: 0,
    bulletRadius: 0,
    infiniteAmmo: true,
    moveSpeed: 310,
    maxHealth: 140,
    melee: true,
    swingMs: 140,
    swingArc: Math.PI * 0.75,
    meleeRange: 54,
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

export const getWeapon = (id: WeaponId | string | undefined): WeaponDef => {
  if (id && id in WEAPONS) {
    return WEAPONS[id as WeaponId];
  }
  return WEAPONS[DEFAULT_WEAPON_ID];
};

export const parseWeaponId = (value: unknown): WeaponId => {
  if (typeof value === "string" && value in WEAPONS) {
    return value as WeaponId;
  }
  return DEFAULT_WEAPON_ID;
};

/** Blade angle for swing progress in [0, 1]. Cursor/aim is the midpoint of the arc. */
export const swingBladeAngle = (
  aimAngle: number,
  swingArc: number,
  progress: number
): number => {
  const t = Math.max(0, Math.min(1, progress));
  return aimAngle - swingArc / 2 + swingArc * t;
};

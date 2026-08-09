import { getWeapon, type WeaponId } from "./weapons";

export type GameMode = "v1" | "v2";

export type CharacterId = "smith" | "alex" | "mad_sam" | "shinrai";

export type AbilityId = "stealth" | "dash";

export type LoadoutSlot = "primary" | "secondary" | "utility";

export type CharacterDef = {
  id: CharacterId;
  name: string;
  blurb: string;
  /** Base movement speed (V2; independent of equipped weapon). */
  moveSpeed: number;
  /** Max health (V2). */
  maxHealth: number;
  loadout: Partial<Record<LoadoutSlot, WeaponId>>;
  ability: AbilityId | null;
  /** Short loadout summary for lobby cards. */
  loadoutSummary: string;
};

export const DEFAULT_CHARACTER_ID: CharacterId = "smith";
export const DEFAULT_GAME_MODE: GameMode = "v1";

export const STEALTH_DURATION_MS = 10_000;
export const STEALTH_COOLDOWN_MS = 10_000;
export const STEALTH_SPEED_MULT = 1.35;
/** Break stealth after taking this fraction of HP (at activation). */
export const STEALTH_BREAK_DAMAGE_FRACTION = 0.5;

export const DASH_DURATION_MS = 140;
export const DASH_COOLDOWN_MS = 4_000;
export const DASH_SPEED = 900;

export const GRENADE_FUSE_MS = 1_200;
export const GRENADE_EXPLOSION_RADIUS = 70;
export const GRENADE_AOE_DAMAGE = 55;

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  smith: {
    id: "smith",
    name: "Cpl. Smith",
    blurb: "Your average rifleman",
    moveSpeed: getWeapon("rifle").moveSpeed,
    maxHealth: getWeapon("rifle").maxHealth,
    loadout: {
      primary: "rifle",
      secondary: "pistol",
      utility: "grenade",
    },
    ability: null,
    loadoutSummary: "Rifle · Pistol · Grenade",
  },
  alex: {
    id: "alex",
    name: "Alex One-shot",
    blurb: "Deadly veteran sniper",
    moveSpeed: getWeapon("sniper").moveSpeed,
    maxHealth: getWeapon("sniper").maxHealth,
    loadout: {
      primary: "sniper",
      secondary: "knife",
    },
    ability: "stealth",
    loadoutSummary: "Rifle · Knife · Stealth",
  },
  mad_sam: {
    id: "mad_sam",
    name: "Mad Sam",
    blurb: "Crazy Runner Gunner",
    moveSpeed: getWeapon("smg").moveSpeed,
    maxHealth: getWeapon("smg").maxHealth,
    loadout: {
      primary: "smg",
    },
    ability: null,
    loadoutSummary: "SMG",
  },
  shinrai: {
    id: "shinrai",
    name: "Shinrai Kagekiya",
    blurb: "Master swordsman",
    moveSpeed: getWeapon("sword").moveSpeed,
    maxHealth: getWeapon("sword").maxHealth,
    loadout: {
      primary: "sword",
      secondary: "shuriken",
    },
    ability: "dash",
    loadoutSummary: "Sword · Shuriken · Dash",
  },
};

export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];

export const getCharacter = (
  id: CharacterId | string | undefined
): CharacterDef => {
  if (id && id in CHARACTERS) {
    return CHARACTERS[id as CharacterId];
  }
  return CHARACTERS[DEFAULT_CHARACTER_ID];
};

export const parseCharacterId = (value: unknown): CharacterId => {
  if (typeof value === "string" && value in CHARACTERS) {
    return value as CharacterId;
  }
  return DEFAULT_CHARACTER_ID;
};

export const parseGameMode = (value: unknown): GameMode => {
  if (value === "v2") {
    return "v2";
  }
  return "v1";
};

/** Editable suffix length (prefix is mode, e.g. V1-). */
export const ROOM_CODE_SUFFIX_LENGTH = 6;

export const roomModeLabel = (mode: GameMode): "V1" | "V2" =>
  mode === "v2" ? "V2" : "V1";

/** Strip a leading V1/V2 prefix and keep alphanumeric suffix only. */
export const normalizeRoomCodeSuffix = (raw: string): string => {
  const upper = raw.trim().toUpperCase();
  const stripped = upper.replace(/^(V1|V2)[-]?/, "");
  return stripped.replace(/[^A-Z0-9]/g, "").slice(0, ROOM_CODE_SUFFIX_LENGTH);
};

/** Full shareable code: `V1-ABC123` / `V2-ABC123`. */
export const formatRoomCode = (mode: GameMode, suffix: string): string =>
  `${roomModeLabel(mode)}-${normalizeRoomCodeSuffix(suffix)}`;

export const SLOT_BY_NUMBER: Record<1 | 2 | 3, LoadoutSlot> = {
  1: "primary",
  2: "secondary",
  3: "utility",
};

export const SLOT_NUMBER: Record<LoadoutSlot, 1 | 2 | 3> = {
  primary: 1,
  secondary: 2,
  utility: 3,
};

export const weaponForSlot = (
  character: CharacterDef,
  slot: LoadoutSlot
): WeaponId | null => character.loadout[slot] ?? null;

export const hasSlot = (
  character: CharacterDef,
  slot: LoadoutSlot
): boolean => Boolean(character.loadout[slot]);

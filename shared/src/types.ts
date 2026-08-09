import type { ArenaDefinition } from "./arena";
import type { CharacterId, GameMode, LoadoutSlot } from "./characters";
import type { PlayerInput, SlotAmmoMap } from "./constants";
import type { WeaponId } from "./weapons";

export type PlayerSnapshot = {
  id: string;
  name: string;
  x: number;
  y: number;
  aimAngle: number;
  health: number;
  /** Resolved active weapon (for combat + rendering). */
  weapon: WeaponId;
  ammo: number;
  reserveAmmo: number;
  reloadEndsAt: number;
  /** Host timestamp when the current sword swing began; 0 if idle. */
  swingStartedAt: number;
  /** Aim angle locked at the start of the swing. */
  swingAimAngle: number;
  kills: number;
  deaths: number;
  color: number;
  alive: boolean;
  respawnAt: number;
  /** V2 character id; undefined in V1. */
  character?: CharacterId;
  /** V2 active loadout slot. */
  activeSlot: LoadoutSlot;
  /** V2 per-slot ammo state. */
  slotAmmo: SlotAmmoMap;
  stealthed: boolean;
  stealthEndsAt: number;
  stealthHpAtStart: number;
  stealthDamageTaken: number;
  abilityReadyAt: number;
  dashEndsAt: number;
  dashVx: number;
  dashVy: number;
};

export type BulletSnapshot = {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  color: number;
};

export type GrenadeSnapshot = {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: number;
  explodesAt: number;
};

export type PickupKind = "health" | "ammo";

export type PickupSnapshot = {
  id: string;
  kind: PickupKind;
  x: number;
  y: number;
};

export type GameState = {
  roomCode: string;
  mode: GameMode;
  players: PlayerSnapshot[];
  bullets: BulletSnapshot[];
  grenades: GrenadeSnapshot[];
  pickups: PickupSnapshot[];
  serverTime: number;
};

export type NetMessage =
  | {
      type: "join";
      name: string;
      mode: GameMode;
      weapon?: WeaponId;
      character?: CharacterId;
    }
  | {
      type: "join_ok";
      playerId: string;
      state: GameState;
      arena: ArenaDefinition;
      mode: GameMode;
    }
  | { type: "join_reject"; reason: string }
  | { type: "input"; input: PlayerInput }
  | { type: "state"; state: GameState };

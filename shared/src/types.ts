import type { ArenaDefinition } from "./arena";
import type { PlayerInput } from "./constants";
import type { WeaponId } from "./weapons";

export type PlayerSnapshot = {
  id: string;
  name: string;
  x: number;
  y: number;
  aimAngle: number;
  health: number;
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

export type GameState = {
  roomCode: string;
  players: PlayerSnapshot[];
  bullets: BulletSnapshot[];
  serverTime: number;
};

export type NetMessage =
  | { type: "join"; name: string; weapon: WeaponId }
  | {
      type: "join_ok";
      playerId: string;
      state: GameState;
      arena: ArenaDefinition;
    }
  | { type: "join_reject"; reason: string }
  | { type: "input"; input: PlayerInput }
  | { type: "state"; state: GameState };

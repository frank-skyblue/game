import type { PlayerInput } from "./constants";

export type PlayerSnapshot = {
  id: string;
  name: string;
  x: number;
  y: number;
  aimAngle: number;
  health: number;
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
  color: number;
};

export type GameState = {
  roomCode: string;
  players: PlayerSnapshot[];
  bullets: BulletSnapshot[];
  serverTime: number;
};

export type NetMessage =
  | { type: "join"; name: string }
  | { type: "join_ok"; playerId: string; state: GameState }
  | { type: "join_reject"; reason: string }
  | { type: "input"; input: PlayerInput }
  | { type: "state"; state: GameState };

import {
  BULLET_DAMAGE,
  BULLET_LIFETIME_MS,
  BULLET_RADIUS,
  BULLET_SPEED,
  EMPTY_INPUT,
  FIRE_COOLDOWN_MS,
  PLAYER_COLORS,
  PLAYER_MAX_HEALTH,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  RESPAWN_MS,
  SPAWN_POINTS,
  type PlayerInput,
} from "./constants";
import {
  bulletHitsWallOrBounds,
  circlesOverlap,
  clampPlayerPosition,
} from "./collision";
import type { BulletSnapshot, GameState, PlayerSnapshot } from "./types";

type InternalBullet = BulletSnapshot & { expiresAt: number };

export class ArenaSim {
  roomCode: string;
  private players = new Map<string, PlayerSnapshot>();
  private inputs = new Map<string, PlayerInput>();
  private lastShotAt = new Map<string, number>();
  private bullets: InternalBullet[] = [];
  private nextBulletId = 1;
  private colorIndex = 0;
  private serverTime = 0;

  constructor(roomCode: string) {
    this.roomCode = roomCode;
  }

  getPlayerCount(): number {
    return this.players.size;
  }

  addPlayer(id: string, name: string): PlayerSnapshot {
    const spawn = SPAWN_POINTS[this.players.size % SPAWN_POINTS.length] ?? SPAWN_POINTS[0];
    const player: PlayerSnapshot = {
      id,
      name: name.slice(0, 16) || "Pilot",
      x: spawn.x,
      y: spawn.y,
      aimAngle: 0,
      health: PLAYER_MAX_HEALTH,
      kills: 0,
      deaths: 0,
      color: PLAYER_COLORS[this.colorIndex % PLAYER_COLORS.length],
      alive: true,
      respawnAt: 0,
    };
    this.colorIndex += 1;
    this.players.set(id, player);
    this.inputs.set(id, { ...EMPTY_INPUT });
    this.lastShotAt.set(id, 0);
    return player;
  }

  removePlayer(id: string) {
    this.players.delete(id);
    this.inputs.delete(id);
    this.lastShotAt.delete(id);
    this.bullets = this.bullets.filter((bullet) => bullet.ownerId !== id);
  }

  setInput(id: string, input: Partial<PlayerInput>) {
    const current = this.inputs.get(id) ?? { ...EMPTY_INPUT };
    this.inputs.set(id, {
      up: Boolean(input.up),
      down: Boolean(input.down),
      left: Boolean(input.left),
      right: Boolean(input.right),
      aimAngle: typeof input.aimAngle === "number" ? input.aimAngle : current.aimAngle,
      shooting: Boolean(input.shooting),
    });
  }

  tick(deltaMs: number) {
    const dt = deltaMs / 1000;
    const now = Date.now();
    this.serverTime = now;

    for (const [id, player] of this.players) {
      this.updatePlayer(player, id, dt, now);
    }
    this.updateBullets(dt, now);
  }

  getState(): GameState {
    return {
      roomCode: this.roomCode,
      players: [...this.players.values()].map((player) => ({ ...player })),
      bullets: this.bullets.map(({ expiresAt: _expiresAt, ...bullet }) => ({ ...bullet })),
      serverTime: this.serverTime,
    };
  }

  private updatePlayer(
    player: PlayerSnapshot,
    id: string,
    dt: number,
    now: number
  ) {
    if (!player.alive) {
      if (player.respawnAt > 0 && now >= player.respawnAt) {
        this.respawnPlayer(player);
      }
      return;
    }

    const input = this.inputs.get(id) ?? EMPTY_INPUT;
    player.aimAngle = input.aimAngle;

    let vx = 0;
    let vy = 0;
    if (input.left) vx -= 1;
    if (input.right) vx += 1;
    if (input.up) vy -= 1;
    if (input.down) vy += 1;

    if (vx !== 0 || vy !== 0) {
      const len = Math.hypot(vx, vy);
      vx = (vx / len) * PLAYER_SPEED;
      vy = (vy / len) * PLAYER_SPEED;
      const next = clampPlayerPosition(
        player.x,
        player.y,
        player.x + vx * dt,
        player.y + vy * dt
      );
      player.x = next.x;
      player.y = next.y;
    }

    if (input.shooting) {
      this.tryShoot(player, id, now);
    }
  }

  private tryShoot(player: PlayerSnapshot, id: string, now: number) {
    const last = this.lastShotAt.get(id) ?? 0;
    if (now - last < FIRE_COOLDOWN_MS) {
      return;
    }
    this.lastShotAt.set(id, now);

    const muzzle = PLAYER_RADIUS + BULLET_RADIUS + 2;
    this.bullets.push({
      id: String(this.nextBulletId++),
      ownerId: id,
      x: player.x + Math.cos(player.aimAngle) * muzzle,
      y: player.y + Math.sin(player.aimAngle) * muzzle,
      vx: Math.cos(player.aimAngle) * BULLET_SPEED,
      vy: Math.sin(player.aimAngle) * BULLET_SPEED,
      color: player.color,
      expiresAt: now + BULLET_LIFETIME_MS,
    });
  }

  private updateBullets(dt: number, now: number) {
    const remaining: InternalBullet[] = [];

    for (const bullet of this.bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;

      if (now >= bullet.expiresAt || bulletHitsWallOrBounds(bullet.x, bullet.y)) {
        continue;
      }

      let hit = false;
      for (const target of this.players.values()) {
        if (!target.alive || target.id === bullet.ownerId) {
          continue;
        }
        if (
          circlesOverlap(
            bullet.x,
            bullet.y,
            BULLET_RADIUS,
            target.x,
            target.y,
            PLAYER_RADIUS
          )
        ) {
          hit = true;
          this.applyDamage(target, bullet.ownerId, now);
          break;
        }
      }

      if (!hit) {
        remaining.push(bullet);
      }
    }

    this.bullets = remaining;
  }

  private applyDamage(target: PlayerSnapshot, attackerId: string, now: number) {
    target.health -= BULLET_DAMAGE;
    if (target.health > 0) {
      return;
    }

    target.health = 0;
    target.alive = false;
    target.deaths += 1;
    target.respawnAt = now + RESPAWN_MS;

    const attacker = this.players.get(attackerId);
    if (attacker) {
      attacker.kills += 1;
    }
  }

  private respawnPlayer(player: PlayerSnapshot) {
    const spawn =
      SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)] ??
      SPAWN_POINTS[0];
    player.x = spawn.x;
    player.y = spawn.y;
    player.health = PLAYER_MAX_HEALTH;
    player.alive = true;
    player.respawnAt = 0;
  }
}

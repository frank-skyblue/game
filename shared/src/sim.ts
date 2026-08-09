import {
  EMPTY_INPUT,
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
import {
  getWeapon,
  parseWeaponId,
  swingBladeAngle,
  type WeaponId,
} from "./weapons";

type InternalBullet = BulletSnapshot & { expiresAt: number };

const fillAmmo = (player: PlayerSnapshot) => {
  const weapon = getWeapon(player.weapon);
  if (weapon.infiniteAmmo) {
    player.ammo = 1;
    player.reserveAmmo = 0;
  } else {
    player.ammo = weapon.magazineSize;
    player.reserveAmmo = weapon.reserveAmmo;
  }
  player.reloadEndsAt = 0;
};

const angleDelta = (a: number, b: number): number => {
  let delta = a - b;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return Math.abs(delta);
};

export class ArenaSim {
  roomCode: string;
  private players = new Map<string, PlayerSnapshot>();
  private inputs = new Map<string, PlayerInput>();
  private lastShotAt = new Map<string, number>();
  private swingHits = new Map<string, Set<string>>();
  private wasShooting = new Map<string, boolean>();
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

  addPlayer(id: string, name: string, weaponId?: WeaponId | string): PlayerSnapshot {
    const spawn = SPAWN_POINTS[this.players.size % SPAWN_POINTS.length] ?? SPAWN_POINTS[0];
    const weapon = getWeapon(parseWeaponId(weaponId));
    const player: PlayerSnapshot = {
      id,
      name: name.slice(0, 16) || "Pilot",
      x: spawn.x,
      y: spawn.y,
      aimAngle: 0,
      health: PLAYER_MAX_HEALTH,
      weapon: weapon.id,
      ammo: weapon.infiniteAmmo ? 1 : weapon.magazineSize,
      reserveAmmo: weapon.infiniteAmmo ? 0 : weapon.reserveAmmo,
      reloadEndsAt: 0,
      swingStartedAt: 0,
      swingAimAngle: 0,
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
    this.swingHits.delete(id);
    this.wasShooting.delete(id);
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
      reload: Boolean(input.reload),
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

    const weapon = getWeapon(player.weapon);
    this.finishReloadIfReady(player, now);
    this.updateSwing(player, id, now);

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

    if (
      !weapon.infiniteAmmo &&
      (input.reload || (player.ammo <= 0 && input.shooting))
    ) {
      this.tryStartReload(player, now);
    }

    if (input.shooting) {
      this.tryShoot(player, id, now);
    }
    this.wasShooting.set(id, input.shooting);
  }

  private finishReloadIfReady(player: PlayerSnapshot, now: number) {
    const weapon = getWeapon(player.weapon);
    if (weapon.infiniteAmmo || player.reloadEndsAt <= 0 || now < player.reloadEndsAt) {
      return;
    }

    const needed = weapon.magazineSize - player.ammo;
    const loaded = Math.min(needed, player.reserveAmmo);
    player.ammo += loaded;
    player.reserveAmmo -= loaded;
    player.reloadEndsAt = 0;
  }

  private tryStartReload(player: PlayerSnapshot, now: number) {
    const weapon = getWeapon(player.weapon);
    if (weapon.infiniteAmmo || player.reloadEndsAt > 0) {
      return;
    }
    if (player.ammo >= weapon.magazineSize || player.reserveAmmo <= 0) {
      return;
    }
    player.reloadEndsAt = now + weapon.reloadMs;
  }

  private tryShoot(player: PlayerSnapshot, id: string, now: number) {
    const weapon = getWeapon(player.weapon);
    if (player.reloadEndsAt > 0) {
      return;
    }
    if (!weapon.infiniteAmmo && player.ammo <= 0) {
      return;
    }

    const last = this.lastShotAt.get(id) ?? 0;
    if (now - last < weapon.fireCooldownMs) {
      return;
    }

    if (weapon.melee) {
      // One press → one swing (ignore held click).
      if (this.wasShooting.get(id)) {
        return;
      }
      this.startSwing(player, id, now);
      return;
    }

    this.lastShotAt.set(id, now);
    player.ammo -= 1;

    const muzzle = PLAYER_RADIUS + weapon.bulletRadius + 2;
    this.bullets.push({
      id: String(this.nextBulletId++),
      ownerId: id,
      x: player.x + Math.cos(player.aimAngle) * muzzle,
      y: player.y + Math.sin(player.aimAngle) * muzzle,
      vx: Math.cos(player.aimAngle) * weapon.bulletSpeed,
      vy: Math.sin(player.aimAngle) * weapon.bulletSpeed,
      radius: weapon.bulletRadius,
      damage: weapon.damage,
      color: player.color,
      expiresAt: now + weapon.bulletLifetimeMs,
    });
  }

  private startSwing(player: PlayerSnapshot, id: string, now: number) {
    const weapon = getWeapon(player.weapon);
    if (player.swingStartedAt > 0 && now < player.swingStartedAt + weapon.swingMs) {
      return;
    }

    this.lastShotAt.set(id, now);
    player.swingStartedAt = now;
    player.swingAimAngle = player.aimAngle;
    this.swingHits.set(id, new Set());
  }

  private updateSwing(player: PlayerSnapshot, id: string, now: number) {
    if (player.swingStartedAt <= 0) {
      return;
    }

    const weapon = getWeapon(player.weapon);
    if (!weapon.melee) {
      player.swingStartedAt = 0;
      this.swingHits.delete(id);
      return;
    }

    const elapsed = now - player.swingStartedAt;
    if (elapsed >= weapon.swingMs) {
      player.swingStartedAt = 0;
      this.swingHits.delete(id);
      return;
    }

    const progress = elapsed / weapon.swingMs;
    const bladeAngle = swingBladeAngle(player.swingAimAngle, weapon.swingArc, progress);
    const hitSet = this.swingHits.get(id) ?? new Set<string>();
    this.swingHits.set(id, hitSet);

    for (const target of this.players.values()) {
      if (!target.alive || target.id === id || hitSet.has(target.id)) {
        continue;
      }

      const dx = target.x - player.x;
      const dy = target.y - player.y;
      const dist = Math.hypot(dx, dy);
      if (dist > weapon.meleeRange + PLAYER_RADIUS || dist < 0.001) {
        continue;
      }

      const toTarget = Math.atan2(dy, dx);
      // Allow a little angular slack so tick rate doesn't miss the slice.
      if (angleDelta(toTarget, bladeAngle) > 0.35) {
        continue;
      }

      hitSet.add(target.id);
      this.applyDamage(target, id, weapon.damage, now);
    }
  }

  private updateBullets(dt: number, now: number) {
    const remaining: InternalBullet[] = [];

    for (const bullet of this.bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;

      if (
        now >= bullet.expiresAt ||
        bulletHitsWallOrBounds(bullet.x, bullet.y, bullet.radius)
      ) {
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
            bullet.radius,
            target.x,
            target.y,
            PLAYER_RADIUS
          )
        ) {
          hit = true;
          this.applyDamage(target, bullet.ownerId, bullet.damage, now);
          break;
        }
      }

      if (!hit) {
        remaining.push(bullet);
      }
    }

    this.bullets = remaining;
  }

  private applyDamage(
    target: PlayerSnapshot,
    attackerId: string,
    damage: number,
    now: number
  ) {
    target.health -= damage;
    if (target.health > 0) {
      return;
    }

    target.health = 0;
    target.alive = false;
    target.deaths += 1;
    target.respawnAt = now + RESPAWN_MS;
    target.reloadEndsAt = 0;
    target.swingStartedAt = 0;

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
    fillAmmo(player);
    player.swingStartedAt = 0;
    player.alive = true;
    player.respawnAt = 0;
  }
}

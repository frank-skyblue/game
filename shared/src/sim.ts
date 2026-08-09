import {
  AMMO_PACK_MAGAZINES,
  EMPTY_INPUT,
  HEALTH_PACK_HEAL,
  INITIAL_PICKUP_COUNT,
  MAX_PICKUPS,
  PICKUP_RADIUS,
  PICKUP_SPAWN_INTERVAL_MS,
  PLAYER_COLORS,
  PLAYER_RADIUS,
  RESPAWN_MS,
  type PlayerInput,
} from "./constants";
import {
  bulletHitsWallOrBounds,
  circlesOverlap,
  clampPlayerPosition,
  findRandomFreeSpawn,
} from "./collision";
import { cloneArena, DEFAULT_ARENA, type ArenaDefinition } from "./arena";
import {
  computeBotInput,
  personalityForWeapon,
  pickBotName,
  type BotPersonalityId,
} from "./bots";
import type {
  BulletSnapshot,
  GameState,
  PickupKind,
  PickupSnapshot,
  PlayerSnapshot,
} from "./types";
import {
  getWeapon,
  parseWeaponId,
  WEAPON_IDS,
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
  readonly arena: ArenaDefinition;
  private players = new Map<string, PlayerSnapshot>();
  private inputs = new Map<string, PlayerInput>();
  private botIds = new Set<string>();
  private botPersonalities = new Map<string, BotPersonalityId>();
  private lastShotAt = new Map<string, number>();
  private swingHits = new Map<string, Set<string>>();
  private wasShooting = new Map<string, boolean>();
  private bullets: InternalBullet[] = [];
  private pickups = new Map<string, PickupSnapshot>();
  private nextBulletId = 1;
  private nextBotId = 1;
  private nextPickupId = 1;
  private nextPickupSpawnAt = 0;
  private colorIndex = 0;
  private serverTime = 0;

  constructor(roomCode: string, arena: ArenaDefinition = DEFAULT_ARENA) {
    this.roomCode = roomCode;
    this.arena = cloneArena(arena);
    for (let i = 0; i < INITIAL_PICKUP_COUNT; i += 1) {
      this.spawnPickup();
    }
    this.nextPickupSpawnAt = Date.now() + PICKUP_SPAWN_INTERVAL_MS;
  }

  getPlayerCount(): number {
    return this.players.size;
  }

  addPlayer(
    id: string,
    name: string,
    weaponId?: WeaponId | string,
    options?: { freeSpawn?: boolean }
  ): PlayerSnapshot {
    const spawns = this.arena.spawnPoints;
    const spawn = options?.freeSpawn
      ? findRandomFreeSpawn([...this.players.values()], PLAYER_RADIUS, 48, this.arena)
      : (spawns[this.players.size % spawns.length] ??
        spawns[0] ?? { x: this.arena.width / 2, y: this.arena.height / 2 });
    const weapon = getWeapon(parseWeaponId(weaponId));
    const player: PlayerSnapshot = {
      id,
      name: name.slice(0, 16) || "Pilot",
      x: spawn.x,
      y: spawn.y,
      aimAngle: 0,
      health: weapon.maxHealth,
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

  addBot(name?: string, weaponId?: WeaponId | string): PlayerSnapshot {
    const id = `bot-${this.nextBotId}`;
    this.nextBotId += 1;

    const weapon = parseWeaponId(
      weaponId ?? WEAPON_IDS[Math.floor(Math.random() * WEAPON_IDS.length)]
    );
    const personality = personalityForWeapon(weapon);
    const usedNames = new Set(
      [...this.players.values()].map((player) => player.name)
    );
    const label = name?.trim() || pickBotName(personality, usedNames);

    this.botIds.add(id);
    this.botPersonalities.set(id, personality);
    return this.addPlayer(id, label, weapon, { freeSpawn: true });
  }

  removePlayer(id: string) {
    this.players.delete(id);
    this.inputs.delete(id);
    this.botIds.delete(id);
    this.botPersonalities.delete(id);
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

    this.updateBotInputs(now);

    for (const [id, player] of this.players) {
      this.updatePlayer(player, id, dt, now);
    }
    this.updateBullets(dt, now);
    this.updatePickups(now);
  }

  private updateBotInputs(now: number) {
    if (this.botIds.size === 0) {
      return;
    }

    const snapshots = [...this.players.values()];
    for (const botId of this.botIds) {
      const bot = this.players.get(botId);
      if (!bot) {
        continue;
      }
      const personality =
        this.botPersonalities.get(botId) ?? personalityForWeapon(bot.weapon);
      this.setInput(botId, computeBotInput(bot, snapshots, now, personality));
    }
  }

  getState(): GameState {
    return {
      roomCode: this.roomCode,
      players: [...this.players.values()].map((player) => ({ ...player })),
      bullets: this.bullets.map(({ expiresAt: _expiresAt, ...bullet }) => ({ ...bullet })),
      pickups: [...this.pickups.values()].map((pickup) => ({ ...pickup })),
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
      vx = (vx / len) * weapon.moveSpeed;
      vy = (vy / len) * weapon.moveSpeed;
      const next = clampPlayerPosition(
        player.x,
        player.y,
        player.x + vx * dt,
        player.y + vy * dt,
        this.arena
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
      if (dist > weapon.meleeRange + PLAYER_RADIUS) {
        continue;
      }

      // Stacked / point-blank: always connect (atan2 is undefined at dist≈0).
      if (dist >= PLAYER_RADIUS * 0.75) {
        const toTarget = Math.atan2(dy, dx);
        // Allow a little angular slack so tick rate doesn't miss the slice.
        if (angleDelta(toTarget, bladeAngle) > 0.35) {
          continue;
        }
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
        bulletHitsWallOrBounds(bullet.x, bullet.y, bullet.radius, this.arena)
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

  private updatePickups(now: number) {
    if (this.pickups.size < MAX_PICKUPS && now >= this.nextPickupSpawnAt) {
      this.spawnPickup();
      this.nextPickupSpawnAt = now + PICKUP_SPAWN_INTERVAL_MS;
    }

    for (const [id, pickup] of this.pickups) {
      for (const player of this.players.values()) {
        if (!player.alive) {
          continue;
        }
        if (
          !circlesOverlap(
            pickup.x,
            pickup.y,
            PICKUP_RADIUS,
            player.x,
            player.y,
            PLAYER_RADIUS
          )
        ) {
          continue;
        }
        if (this.tryCollectPickup(player, pickup)) {
          this.pickups.delete(id);
          break;
        }
      }
    }
  }

  private spawnPickup(kind?: PickupKind) {
    if (this.pickups.size >= MAX_PICKUPS) {
      return;
    }

    const occupied = [
      ...[...this.players.values()].map((player) => ({
        x: player.x,
        y: player.y,
        radius: PLAYER_RADIUS,
      })),
      ...[...this.pickups.values()].map((pickup) => ({
        x: pickup.x,
        y: pickup.y,
        radius: PICKUP_RADIUS * 2,
      })),
    ];
    const pos = findRandomFreeSpawn(occupied, PICKUP_RADIUS, 64, this.arena);
    const pickupKind: PickupKind =
      kind ?? (Math.random() < 0.5 ? "health" : "ammo");
    const id = `pickup-${this.nextPickupId}`;
    this.nextPickupId += 1;
    this.pickups.set(id, {
      id,
      kind: pickupKind,
      x: pos.x,
      y: pos.y,
    });
  }

  private tryCollectPickup(
    player: PlayerSnapshot,
    pickup: PickupSnapshot
  ): boolean {
    const weapon = getWeapon(player.weapon);

    if (pickup.kind === "health") {
      if (player.health >= weapon.maxHealth) {
        return false;
      }
      player.health = Math.min(
        weapon.maxHealth,
        player.health + HEALTH_PACK_HEAL
      );
      return true;
    }

    if (weapon.infiniteAmmo || player.reserveAmmo >= weapon.reserveAmmo) {
      return false;
    }

    const grant = weapon.magazineSize * AMMO_PACK_MAGAZINES;
    player.reserveAmmo = Math.min(
      weapon.reserveAmmo,
      player.reserveAmmo + grant
    );
    return true;
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
    const others = [...this.players.values()].filter((p) => p.id !== player.id);
    const spawns = this.arena.spawnPoints;
    const spawn = this.botIds.has(player.id)
      ? findRandomFreeSpawn(others, PLAYER_RADIUS, 48, this.arena)
      : (spawns[Math.floor(Math.random() * spawns.length)] ??
        spawns[0] ?? { x: this.arena.width / 2, y: this.arena.height / 2 });
    player.x = spawn.x;
    player.y = spawn.y;
    player.health = getWeapon(player.weapon).maxHealth;
    fillAmmo(player);
    player.swingStartedAt = 0;
    player.alive = true;
    player.respawnAt = 0;
  }
}

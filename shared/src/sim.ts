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
  type SlotAmmo,
  type SlotAmmoMap,
} from "./constants";
import {
  DASH_COOLDOWN_MS,
  DASH_DURATION_MS,
  DASH_SPEED,
  getCharacter,
  GRENADE_AOE_DAMAGE,
  GRENADE_EXPLOSION_RADIUS,
  GRENADE_FUSE_MS,
  hasSlot,
  parseCharacterId,
  SLOT_BY_NUMBER,
  STEALTH_BREAK_DAMAGE_FRACTION,
  STEALTH_COOLDOWN_MS,
  STEALTH_DURATION_MS,
  STEALTH_SPEED_MULT,
  type CharacterId,
  type GameMode,
  type LoadoutSlot,
  weaponForSlot,
} from "./characters";
import {
  bulletHitsWallOrBounds,
  circlesOverlap,
  clampPlayerPosition,
  findRandomFreeSpawn,
} from "./collision";
import { cloneArena, DEFAULT_ARENA, type ArenaDefinition } from "./arena";
import {
  computeBotInput,
  personalityForCharacter,
  personalityForWeapon,
  pickBotCharacter,
  pickBotName,
  pickBotPersonality,
  pickBotWeapon,
  type BotPersonalityId,
} from "./bots";
import type {
  BulletSnapshot,
  GameState,
  GrenadeSnapshot,
  PickupKind,
  PickupSnapshot,
  PlayerSnapshot,
} from "./types";
import {
  getWeapon,
  parseWeaponId,
  swingBladeAngle,
  type WeaponId,
} from "./weapons";

type InternalBullet = BulletSnapshot & { expiresAt: number };
type InternalGrenade = GrenadeSnapshot;

const emptyV2Fields = (): Pick<
  PlayerSnapshot,
  | "character"
  | "activeSlot"
  | "slotAmmo"
  | "stealthed"
  | "stealthEndsAt"
  | "stealthHpAtStart"
  | "stealthDamageTaken"
  | "abilityReadyAt"
  | "dashEndsAt"
  | "dashVx"
  | "dashVy"
> => ({
  character: undefined,
  activeSlot: "primary",
  slotAmmo: {},
  stealthed: false,
  stealthEndsAt: 0,
  stealthHpAtStart: 0,
  stealthDamageTaken: 0,
  abilityReadyAt: 0,
  dashEndsAt: 0,
  dashVx: 0,
  dashVy: 0,
});

const makeSlotAmmo = (weaponId: WeaponId): SlotAmmo => {
  const weapon = getWeapon(weaponId);
  if (weapon.infiniteAmmo) {
    return { ammo: 1, reserveAmmo: 0, reloadEndsAt: 0 };
  }
  return {
    ammo: weapon.magazineSize,
    reserveAmmo: weapon.reserveAmmo,
    reloadEndsAt: 0,
  };
};

const buildSlotAmmo = (characterId: CharacterId): SlotAmmoMap => {
  const character = getCharacter(characterId);
  const slotAmmo: SlotAmmoMap = {};
  for (const slot of ["primary", "secondary", "utility"] as LoadoutSlot[]) {
    const weaponId = weaponForSlot(character, slot);
    if (weaponId) {
      slotAmmo[slot] = makeSlotAmmo(weaponId);
    }
  }
  return slotAmmo;
};

const syncActiveAmmoFromSlots = (player: PlayerSnapshot) => {
  const slot = player.slotAmmo[player.activeSlot];
  if (!slot) {
    player.ammo = 0;
    player.reserveAmmo = 0;
    player.reloadEndsAt = 0;
    return;
  }
  player.ammo = slot.ammo;
  player.reserveAmmo = slot.reserveAmmo;
  player.reloadEndsAt = slot.reloadEndsAt;
};

const syncSlotsFromActiveAmmo = (player: PlayerSnapshot) => {
  const slot = player.slotAmmo[player.activeSlot];
  if (!slot) {
    return;
  }
  slot.ammo = player.ammo;
  slot.reserveAmmo = player.reserveAmmo;
  slot.reloadEndsAt = player.reloadEndsAt;
};

const fillAmmo = (player: PlayerSnapshot) => {
  if (player.character) {
    player.slotAmmo = buildSlotAmmo(player.character);
    const character = getCharacter(player.character);
    const weaponId = weaponForSlot(character, player.activeSlot);
    if (weaponId) {
      player.weapon = weaponId;
    }
    syncActiveAmmoFromSlots(player);
    return;
  }

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

const maxHealthFor = (player: PlayerSnapshot): number => {
  if (player.character) {
    return getCharacter(player.character).maxHealth;
  }
  return getWeapon(player.weapon).maxHealth;
};

const moveSpeedFor = (player: PlayerSnapshot, now: number): number => {
  let speed = player.character
    ? getCharacter(player.character).moveSpeed
    : getWeapon(player.weapon).moveSpeed;
  if (player.stealthed && now < player.stealthEndsAt) {
    speed *= STEALTH_SPEED_MULT;
  }
  return speed;
};

const angleDelta = (a: number, b: number): number => {
  let delta = a - b;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return Math.abs(delta);
};

export class ArenaSim {
  roomCode: string;
  readonly mode: GameMode;
  readonly arena: ArenaDefinition;
  private players = new Map<string, PlayerSnapshot>();
  private inputs = new Map<string, PlayerInput>();
  private botIds = new Set<string>();
  private botPersonalities = new Map<string, BotPersonalityId>();
  private lastShotAt = new Map<string, number>();
  private swingHits = new Map<string, Set<string>>();
  private wasShooting = new Map<string, boolean>();
  private wasAbility = new Map<string, boolean>();
  private bullets: InternalBullet[] = [];
  private grenades: InternalGrenade[] = [];
  private pickups = new Map<string, PickupSnapshot>();
  private nextBulletId = 1;
  private nextGrenadeId = 1;
  private nextBotId = 1;
  private nextPickupId = 1;
  private nextPickupSpawnAt = 0;
  private colorIndex = 0;
  private serverTime = 0;

  constructor(
    roomCode: string,
    arena: ArenaDefinition = DEFAULT_ARENA,
    mode: GameMode = "v1"
  ) {
    this.roomCode = roomCode;
    this.arena = cloneArena(arena);
    this.mode = mode;
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
    weaponOrCharacter?: WeaponId | CharacterId | string,
    options?: { freeSpawn?: boolean }
  ): PlayerSnapshot {
    const spawns = this.arena.spawnPoints;
    const spawn = options?.freeSpawn
      ? findRandomFreeSpawn(
          [...this.players.values()],
          PLAYER_RADIUS,
          48,
          this.arena
        )
      : (spawns[this.players.size % spawns.length] ??
        spawns[0] ?? { x: this.arena.width / 2, y: this.arena.height / 2 });

    const base = emptyV2Fields();
    let weaponId: WeaponId;
    let health: number;

    if (this.mode === "v2") {
      const characterId = parseCharacterId(weaponOrCharacter);
      const character = getCharacter(characterId);
      const primary = character.loadout.primary ?? "rifle";
      weaponId = primary;
      health = character.maxHealth;
      base.character = characterId;
      base.activeSlot = "primary";
      base.slotAmmo = buildSlotAmmo(characterId);
    } else {
      weaponId = parseWeaponId(weaponOrCharacter);
      health = getWeapon(weaponId).maxHealth;
    }

    const weapon = getWeapon(weaponId);
    const player: PlayerSnapshot = {
      id,
      name: name.slice(0, 16) || "Pilot",
      x: spawn.x,
      y: spawn.y,
      aimAngle: 0,
      health,
      weapon: weaponId,
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
      ...base,
    };

    if (player.character) {
      syncActiveAmmoFromSlots(player);
    }

    this.colorIndex += 1;
    this.players.set(id, player);
    this.inputs.set(id, { ...EMPTY_INPUT });
    this.lastShotAt.set(id, 0);
    return player;
  }

  addBot(name?: string, weaponOrCharacter?: WeaponId | CharacterId | string): PlayerSnapshot {
    const id = `bot-${this.nextBotId}`;
    this.nextBotId += 1;

    let selection: string;
    let personality: BotPersonalityId;

    if (this.mode === "v2") {
      const characterId = parseCharacterId(
        weaponOrCharacter ?? pickBotCharacter()
      );
      personality = personalityForCharacter(characterId);
      selection = characterId;
    } else {
      const weapon = weaponOrCharacter
        ? parseWeaponId(weaponOrCharacter)
        : pickBotWeapon(pickBotPersonality());
      personality = personalityForWeapon(weapon);
      selection = weapon;
    }

    const usedNames = new Set(
      [...this.players.values()].map((player) => player.name)
    );
    const label = name?.trim() || pickBotName(personality, usedNames);

    this.botIds.add(id);
    this.botPersonalities.set(id, personality);
    return this.addPlayer(id, label, selection, { freeSpawn: true });
  }

  removePlayer(id: string) {
    this.players.delete(id);
    this.inputs.delete(id);
    this.botIds.delete(id);
    this.botPersonalities.delete(id);
    this.lastShotAt.delete(id);
    this.swingHits.delete(id);
    this.wasShooting.delete(id);
    this.wasAbility.delete(id);
    this.bullets = this.bullets.filter((bullet) => bullet.ownerId !== id);
    this.grenades = this.grenades.filter((grenade) => grenade.ownerId !== id);
  }

  setInput(id: string, input: Partial<PlayerInput>) {
    const current = this.inputs.get(id) ?? { ...EMPTY_INPUT };
    const slotRaw = typeof input.slot === "number" ? input.slot : current.slot;
    const slot =
      slotRaw === 1 || slotRaw === 2 || slotRaw === 3 ? slotRaw : (0 as const);

    this.inputs.set(id, {
      up: Boolean(input.up),
      down: Boolean(input.down),
      left: Boolean(input.left),
      right: Boolean(input.right),
      aimAngle: typeof input.aimAngle === "number" ? input.aimAngle : current.aimAngle,
      shooting: Boolean(input.shooting),
      reload: Boolean(input.reload),
      slot,
      ability: Boolean(input.ability),
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
    this.updateGrenades(dt, now);
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
        this.botPersonalities.get(botId) ??
        (bot.character
          ? personalityForCharacter(bot.character)
          : personalityForWeapon(bot.weapon));
      this.setInput(botId, computeBotInput(bot, snapshots, now, personality));
    }
  }

  getState(): GameState {
    return {
      roomCode: this.roomCode,
      mode: this.mode,
      players: [...this.players.values()].map((player) => ({ ...player })),
      bullets: this.bullets.map(({ expiresAt: _expiresAt, ...bullet }) => ({
        ...bullet,
      })),
      grenades: this.grenades.map((grenade) => ({ ...grenade })),
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

    const input = this.inputs.get(id) ?? EMPTY_INPUT;
    player.aimAngle = input.aimAngle;

    this.finishReloadIfReady(player, now);
    this.updateSwing(player, id, now);
    this.updateStealthTimer(player, now);
    this.trySwitchSlot(player, input);
    this.tryAbility(player, id, input, now);

    const dashing = player.dashEndsAt > now;
    if (dashing) {
      const next = clampPlayerPosition(
        player.x,
        player.y,
        player.x + player.dashVx * dt,
        player.y + player.dashVy * dt,
        this.arena
      );
      player.x = next.x;
      player.y = next.y;
    } else {
      player.dashVx = 0;
      player.dashVy = 0;

      let vx = 0;
      let vy = 0;
      if (input.left) vx -= 1;
      if (input.right) vx += 1;
      if (input.up) vy -= 1;
      if (input.down) vy += 1;

      if (vx !== 0 || vy !== 0) {
        const speed = moveSpeedFor(player, now);
        const len = Math.hypot(vx, vy);
        vx = (vx / len) * speed;
        vy = (vy / len) * speed;
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
    }

    const weapon = getWeapon(player.weapon);
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
    this.wasAbility.set(id, input.ability);
  }

  private trySwitchSlot(player: PlayerSnapshot, input: PlayerInput) {
    if (!player.character || input.slot === 0) {
      return;
    }
    const character = getCharacter(player.character);
    const slot = SLOT_BY_NUMBER[input.slot];
    if (!hasSlot(character, slot) || player.activeSlot === slot) {
      return;
    }

    syncSlotsFromActiveAmmo(player);
    player.activeSlot = slot;
    const weaponId = weaponForSlot(character, slot);
    if (weaponId) {
      player.weapon = weaponId;
    }
    player.swingStartedAt = 0;
    syncActiveAmmoFromSlots(player);
  }

  private tryAbility(
    player: PlayerSnapshot,
    id: string,
    input: PlayerInput,
    now: number
  ) {
    if (!player.character || !input.ability || this.wasAbility.get(id)) {
      return;
    }
    const character = getCharacter(player.character);
    if (!character.ability || now < player.abilityReadyAt) {
      return;
    }

    if (character.ability === "stealth") {
      if (player.stealthed) {
        return;
      }
      player.stealthed = true;
      player.stealthEndsAt = now + STEALTH_DURATION_MS;
      player.stealthHpAtStart = player.health;
      player.stealthDamageTaken = 0;
      return;
    }

    if (character.ability === "dash") {
      if (player.dashEndsAt > now) {
        return;
      }
      const angle = player.aimAngle;
      player.dashVx = Math.cos(angle) * DASH_SPEED;
      player.dashVy = Math.sin(angle) * DASH_SPEED;
      player.dashEndsAt = now + DASH_DURATION_MS;
      player.abilityReadyAt = now + DASH_COOLDOWN_MS;
    }
  }

  private updateStealthTimer(player: PlayerSnapshot, now: number) {
    if (!player.stealthed) {
      return;
    }
    if (now >= player.stealthEndsAt) {
      this.endStealth(player, now);
    }
  }

  private endStealth(player: PlayerSnapshot, now: number) {
    if (!player.stealthed) {
      return;
    }
    player.stealthed = false;
    player.stealthEndsAt = 0;
    player.stealthHpAtStart = 0;
    player.stealthDamageTaken = 0;
    player.abilityReadyAt = now + STEALTH_COOLDOWN_MS;
  }

  private breakStealthOnAttack(player: PlayerSnapshot, now: number) {
    if (player.stealthed) {
      this.endStealth(player, now);
    }
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
    syncSlotsFromActiveAmmo(player);
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
    syncSlotsFromActiveAmmo(player);
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
      if (this.wasShooting.get(id)) {
        return;
      }
      this.breakStealthOnAttack(player, now);
      this.startSwing(player, id, now);
      return;
    }

    this.breakStealthOnAttack(player, now);
    this.lastShotAt.set(id, now);
    player.ammo -= 1;
    syncSlotsFromActiveAmmo(player);

    const muzzle = PLAYER_RADIUS + weapon.bulletRadius + 2;
    const x = player.x + Math.cos(player.aimAngle) * muzzle;
    const y = player.y + Math.sin(player.aimAngle) * muzzle;
    const vx = Math.cos(player.aimAngle) * weapon.bulletSpeed;
    const vy = Math.sin(player.aimAngle) * weapon.bulletSpeed;

    if (weapon.isGrenade) {
      this.grenades.push({
        id: String(this.nextGrenadeId++),
        ownerId: id,
        x,
        y,
        vx,
        vy,
        radius: weapon.bulletRadius,
        color: player.color,
        explodesAt: now + GRENADE_FUSE_MS,
      });
      return;
    }

    this.bullets.push({
      id: String(this.nextBulletId++),
      ownerId: id,
      x,
      y,
      vx,
      vy,
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

      if (dist >= PLAYER_RADIUS * 0.75) {
        const toTarget = Math.atan2(dy, dx);
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

  private updateGrenades(dt: number, now: number) {
    const remaining: InternalGrenade[] = [];

    for (const grenade of this.grenades) {
      grenade.x += grenade.vx * dt;
      grenade.y += grenade.vy * dt;

      // Soft clamp inside arena bounds (can pass over walls).
      grenade.x = Math.max(
        grenade.radius,
        Math.min(this.arena.width - grenade.radius, grenade.x)
      );
      grenade.y = Math.max(
        grenade.radius,
        Math.min(this.arena.height - grenade.radius, grenade.y)
      );

      let explodeEarly = false;
      for (const target of this.players.values()) {
        if (!target.alive || target.id === grenade.ownerId) {
          continue;
        }
        if (
          circlesOverlap(
            grenade.x,
            grenade.y,
            grenade.radius,
            target.x,
            target.y,
            PLAYER_RADIUS
          )
        ) {
          explodeEarly = true;
          break;
        }
      }

      if (explodeEarly || now >= grenade.explodesAt) {
        this.explodeGrenade(grenade, now);
        continue;
      }

      remaining.push(grenade);
    }

    this.grenades = remaining;
  }

  private explodeGrenade(grenade: InternalGrenade, now: number) {
    for (const target of this.players.values()) {
      if (!target.alive || target.id === grenade.ownerId) {
        continue;
      }
      const dist = Math.hypot(target.x - grenade.x, target.y - grenade.y);
      if (dist <= GRENADE_EXPLOSION_RADIUS + PLAYER_RADIUS) {
        this.applyDamage(target, grenade.ownerId, GRENADE_AOE_DAMAGE, now);
      }
    }
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
    const maxHp = maxHealthFor(player);

    if (pickup.kind === "health") {
      if (player.health >= maxHp) {
        return false;
      }
      player.health = Math.min(maxHp, player.health + HEALTH_PACK_HEAL);
      return true;
    }

    // Ammo packs refill the active non-melee / non-infinite weapon.
    const weapon = getWeapon(player.weapon);
    if (weapon.infiniteAmmo || weapon.isGrenade) {
      // Prefer granting to a gun slot if V2 has one.
      if (player.character) {
        const character = getCharacter(player.character);
        for (const slot of ["primary", "secondary", "utility"] as LoadoutSlot[]) {
          const wid = weaponForSlot(character, slot);
          if (!wid) continue;
          const w = getWeapon(wid);
          if (w.infiniteAmmo || w.isGrenade) continue;
          const slotState = player.slotAmmo[slot];
          if (!slotState || slotState.reserveAmmo >= w.reserveAmmo) continue;
          const grant = w.magazineSize * AMMO_PACK_MAGAZINES;
          slotState.reserveAmmo = Math.min(
            w.reserveAmmo,
            slotState.reserveAmmo + grant
          );
          if (player.activeSlot === slot) {
            syncActiveAmmoFromSlots(player);
          }
          return true;
        }
      }
      return false;
    }

    if (player.reserveAmmo >= weapon.reserveAmmo) {
      return false;
    }

    const grant = weapon.magazineSize * AMMO_PACK_MAGAZINES;
    player.reserveAmmo = Math.min(
      weapon.reserveAmmo,
      player.reserveAmmo + grant
    );
    syncSlotsFromActiveAmmo(player);
    return true;
  }

  private applyDamage(
    target: PlayerSnapshot,
    attackerId: string,
    damage: number,
    now: number
  ) {
    if (target.stealthed) {
      target.stealthDamageTaken += damage;
      const threshold =
        target.stealthHpAtStart * STEALTH_BREAK_DAMAGE_FRACTION;
      if (target.stealthDamageTaken >= threshold) {
        this.endStealth(target, now);
      }
    }

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
    target.stealthed = false;
    target.stealthEndsAt = 0;
    target.dashEndsAt = 0;
    target.dashVx = 0;
    target.dashVy = 0;

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
    player.health = maxHealthFor(player);
    if (player.character) {
      player.activeSlot = "primary";
      const character = getCharacter(player.character);
      player.weapon = character.loadout.primary ?? "rifle";
    }
    fillAmmo(player);
    player.swingStartedAt = 0;
    player.stealthed = false;
    player.stealthEndsAt = 0;
    player.stealthHpAtStart = 0;
    player.stealthDamageTaken = 0;
    player.dashEndsAt = 0;
    player.dashVx = 0;
    player.dashVy = 0;
    player.abilityReadyAt = 0;
    player.alive = true;
    player.respawnAt = 0;
  }
}

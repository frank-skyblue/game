import Phaser from "phaser";
import {
  getWeapon,
  MAX_PLAYERS,
  PICKUP_RADIUS,
  PLAYER_RADIUS,
  swingBladeAngle,
  type ArenaDefinition,
  type GameState,
  type PickupKind,
  type PlayerInput,
  type PlayerSnapshot,
  type WeaponId,
} from "@pvp-arena/shared";
import {
  playDeathSynth,
  playHitSynth,
  playPickupSynth,
  playReloadSynth,
} from "../audio/synthSfx";
import type { PeerRoom } from "../net/peerRoom";

type PlayerView = {
  aura: Phaser.GameObjects.Arc;
  core: Phaser.GameObjects.Arc;
  wispOrbit: Phaser.GameObjects.Container;
  wisps: Phaser.GameObjects.Arc[];
  aim: Phaser.GameObjects.Rectangle;
  blade: Phaser.GameObjects.Rectangle;
  swingTrail: Phaser.GameObjects.Graphics;
  motionEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  label: Phaser.GameObjects.Text;
  lastX: number;
  lastY: number;
  pulseTween?: Phaser.Tweens.Tween;
};

type SwingAnim = {
  swingStartedAt: number;
  startedLocal: number;
  aimAngle: number;
  color: number;
};

type PrevPlayerFx = {
  health: number;
  alive: boolean;
  reloadEndsAt: number;
};

type BulletView = {
  core: Phaser.GameObjects.Arc;
  glow: Phaser.GameObjects.Arc;
};

type PickupView = {
  kind: PickupKind;
  root: Phaser.GameObjects.Container;
  glow: Phaser.GameObjects.Arc;
  bobTween?: Phaser.Tweens.Tween;
  glowTween?: Phaser.Tweens.Tween;
};

const MUSIC_KEY = "arena-bgm";
const MUSIC_MUTE_STORAGE_KEY = "pvp-arena-music-muted";
const MUSIC_VOLUME = 0.32;
const PARTICLE_KEY = "spirit-dot";
const CORE_RADIUS = 11;
const AURA_RADIUS = 22;
const HEALTH_PICKUP_COLOR = 0x34d399;
const AMMO_PICKUP_COLOR = 0xfbbf24;

const WEAPON_SFX: Record<
  WeaponId,
  { key: string; path: string; volume: number }
> = {
  smg: { key: "sfx-smg", path: "/assets/sfx/smg.wav", volume: 0.28 },
  rifle: { key: "sfx-rifle", path: "/assets/sfx/rifle.wav", volume: 0.42 },
  sniper: { key: "sfx-sniper", path: "/assets/sfx/sniper.wav", volume: 0.55 },
  sword: { key: "sfx-sword", path: "/assets/sfx/sword.wav", volume: 0.48 },
};

const lighten = (color: number, amount: number): number => {
  const r = Math.min(255, ((color >> 16) & 0xff) + amount);
  const g = Math.min(255, ((color >> 8) & 0xff) + amount);
  const b = Math.min(255, (color & 0xff) + amount);
  return (r << 16) | (g << 8) | b;
};

export class GameScene extends Phaser.Scene {
  private room!: PeerRoom;
  private arena!: ArenaDefinition;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private reloadKey!: Phaser.Input.Keyboard.Key;
  private muteKey!: Phaser.Input.Keyboard.Key;
  private music?: Phaser.Sound.BaseSound;
  private playerViews = new Map<string, PlayerView>();
  private swingAnims = new Map<string, SwingAnim>();
  private bulletViews = new Map<string, BulletView>();
  private pickupViews = new Map<string, PickupView>();
  private prevPickupIds = new Set<string>();
  private prevPlayerFx = new Map<string, PrevPlayerFx>();
  private hudRoom?: Phaser.GameObjects.Text;
  private hudHealth?: Phaser.GameObjects.Text;
  private hudAmmo?: Phaser.GameObjects.Text;
  private hudScores?: Phaser.GameObjects.Text;
  private hudMusic?: Phaser.GameObjects.Text;
  private shooting = false;
  private latestState: GameState | null = null;
  /** Skip SFX on the first state sync so mid-match joins do not blare. */
  private sfxPrimed = false;

  constructor() {
    super("game");
  }

  preload() {
    this.load.audio(MUSIC_KEY, "/assets/music/cyberpunk-moonlight-sonata.mp3");
    for (const sfx of Object.values(WEAPON_SFX)) {
      this.load.audio(sfx.key, sfx.path);
    }
  }

  create() {
    this.room = this.registry.get("room") as PeerRoom;
    this.arena = this.room.arena;
    this.cameras.main.setBackgroundColor("#060b16");
    this.cameras.main.setBounds(0, 0, this.arena.width, this.arena.height);
    this.ensureParticleTexture();
    this.drawArena();
    this.startMusic();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as typeof this.wasd;
    this.reloadKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.muteKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.M);

    this.input.on("pointerdown", () => {
      this.shooting = true;
    });
    this.input.on("pointerup", () => {
      this.shooting = false;
    });

    const hudStyle = {
      fontFamily: "Segoe UI, Trebuchet MS, sans-serif",
      fontSize: "13px",
      color: "#e2e8f0",
    } as const;

    this.hudRoom = this.add
      .text(14, 10, "", hudStyle)
      .setScrollFactor(0)
      .setDepth(10)
      .setStroke("#020617", 3)
      .setShadow(0, 1, "#020617", 2, true, true);

    this.hudHealth = this.add
      .text(14, 28, "", { ...hudStyle, color: "#6ee7b7" })
      .setScrollFactor(0)
      .setDepth(10)
      .setStroke("#020617", 3)
      .setShadow(0, 1, "#020617", 2, true, true);

    this.hudAmmo = this.add
      .text(14, 46, "", { ...hudStyle, color: "#7dd3fc" })
      .setScrollFactor(0)
      .setDepth(10)
      .setStroke("#020617", 3)
      .setShadow(0, 1, "#020617", 2, true, true);

    this.hudMusic = this.add
      .text(14, 64, "", { ...hudStyle, color: "#94a3b8", fontSize: "12px" })
      .setScrollFactor(0)
      .setDepth(10)
      .setStroke("#020617", 3)
      .setShadow(0, 1, "#020617", 2, true, true);

    this.hudScores = this.add
      .text(this.arena.width - 14, 10, "", {
        ...hudStyle,
        fontSize: "12px",
        align: "right",
        lineSpacing: 2,
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(10)
      .setStroke("#020617", 3)
      .setShadow(0, 1, "#020617", 2, true, true);

    this.add
      .text(
        this.arena.width / 2,
        this.arena.height - 18,
        "WASD move · Mouse aim · Click shoot · R reload · M mute · Esc leave",
        {
          fontFamily: "Segoe UI, Trebuchet MS, sans-serif",
          fontSize: "11px",
          color: "#94a3b8",
        }
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(10)
      .setStroke("#020617", 3)
      .setShadow(0, 1, "#020617", 2, true, true);

    this.input.keyboard?.on("keydown-ESC", () => {
      this.room.destroy();
    });

    this.muteKey.on("down", () => {
      this.toggleMusicMute();
    });

    this.updateMusicHud();

    this.room.onState((state) => {
      this.latestState = state;
      this.syncFromState(state);
    });

    this.room.onClose(() => {
      this.returnToLobby();
    });

    this.latestState = this.room.getState();
    this.syncFromState(this.latestState);
  }

  private ensureParticleTexture() {
    if (this.textures.exists(PARTICLE_KEY)) {
      return;
    }
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(4, 4, 4);
    g.generateTexture(PARTICLE_KEY, 8, 8);
    g.destroy();
  }

  private startMusic() {
    if (!this.cache.audio.exists(MUSIC_KEY)) {
      return;
    }

    this.music = this.sound.add(MUSIC_KEY, {
      loop: true,
      volume: MUSIC_VOLUME,
    });

    const muted = this.readMusicMuted();
    this.sound.mute = muted;

    const play = () => {
      if (!this.music?.isPlaying) {
        this.music?.play();
      }
    };

    if (this.sound.locked) {
      this.sound.once(Phaser.Sound.Events.UNLOCKED, play);
    } else {
      play();
    }
  }

  private toggleMusicMute() {
    this.sound.mute = !this.sound.mute;
    this.writeMusicMuted(this.sound.mute);
    this.updateMusicHud();
  }

  private updateMusicHud() {
    this.hudMusic?.setText(this.sound.mute ? "Sound muted (M)" : "Sound on (M)");
  }

  private readMusicMuted(): boolean {
    try {
      return window.localStorage.getItem(MUSIC_MUTE_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  private writeMusicMuted(muted: boolean) {
    try {
      window.localStorage.setItem(MUSIC_MUTE_STORAGE_KEY, muted ? "1" : "0");
    } catch {
      // Ignore quota / private-mode failures.
    }
  }

  private playWeaponSfx(weaponId: WeaponId | string | undefined, ownerId: string) {
    if (!this.sfxPrimed || this.sound.mute) {
      return;
    }

    const weapon = getWeapon(weaponId);
    const sfx = WEAPON_SFX[weapon.id];
    if (!this.cache.audio.exists(sfx.key)) {
      return;
    }

    const isLocal = ownerId === this.room.playerId;
    const volume = sfx.volume * (isLocal ? 1 : 0.7);
    const rate = (isLocal ? 1 : 0.98) * (0.96 + Math.random() * 0.08);
    this.sound.play(sfx.key, { volume, rate });
  }

  update(_time: number, delta: number) {
    if (!this.room) {
      return;
    }

    const pointer = this.input.activePointer;
    const me = this.latestState?.players.find((player) => player.id === this.room.playerId);
    const originX = me?.x ?? this.arena.width / 2;
    const originY = me?.y ?? this.arena.height / 2;
    const aimAngle = Math.atan2(pointer.worldY - originY, pointer.worldX - originX);

    const input: PlayerInput = {
      up: this.wasd.up.isDown || Boolean(this.cursors.up?.isDown),
      down: this.wasd.down.isDown || Boolean(this.cursors.down?.isDown),
      left: this.wasd.left.isDown || Boolean(this.cursors.left?.isDown),
      right: this.wasd.right.isDown || Boolean(this.cursors.right?.isDown),
      aimAngle,
      shooting: this.shooting || pointer.isDown,
      reload: this.reloadKey.isDown,
    };

    this.room.sendInput(input);

    if (this.room.isHost) {
      this.syncFromState(this.room.getState());
    }

    this.renderSwordVisuals();
    this.tickSpiritMotion(delta);
  }

  private returnToLobby() {
    window.location.reload();
  }

  private drawArena() {
    const { width, height, walls } = this.arena;
    const floor = this.add.graphics().setDepth(0);
    floor.fillStyle(0x070d1a, 1);
    floor.fillRect(0, 0, width, height);

    // Soft radial vignette (approximated with nested rects).
    floor.fillStyle(0x0c1a33, 0.35);
    floor.fillRect(width * 0.12, height * 0.1, width * 0.76, height * 0.8);
    floor.fillStyle(0x102445, 0.22);
    floor.fillRect(width * 0.28, height * 0.22, width * 0.44, height * 0.56);

    for (let x = 0; x <= width; x += 40) {
      const accent = x % 160 === 0;
      floor.lineStyle(1, accent ? 0x1d4ed8 : 0x132033, accent ? 0.45 : 0.35);
      floor.lineBetween(x, 0, x, height);
    }
    for (let y = 0; y <= height; y += 40) {
      const accent = y % 160 === 0;
      floor.lineStyle(1, accent ? 0x0ea5e9 : 0x132033, accent ? 0.4 : 0.35);
      floor.lineBetween(0, y, width, y);
    }

    floor.lineStyle(2, 0x38bdf8, 0.65);
    floor.strokeRect(2, 2, width - 4, height - 4);
    floor.lineStyle(1, 0x67e8f9, 0.25);
    floor.strokeRect(6, 6, width - 12, height - 12);

    const wallGfx = this.add.graphics().setDepth(2);
    for (const wall of walls) {
      wallGfx.fillStyle(0x1e293b, 0.96);
      wallGfx.fillRect(wall.x, wall.y, wall.width, wall.height);
      wallGfx.lineStyle(2, 0x38bdf8, 0.85);
      wallGfx.strokeRect(wall.x, wall.y, wall.width, wall.height);
      if (wall.width > 24 && wall.height > 24) {
        wallGfx.lineStyle(1, 0x7dd3fc, 0.35);
        wallGfx.strokeRect(wall.x + 3, wall.y + 3, wall.width - 6, wall.height - 6);
      }
      // Corner glints
      wallGfx.fillStyle(0xe0f2fe, 0.55);
      wallGfx.fillRect(wall.x, wall.y, 4, 4);
      wallGfx.fillRect(wall.x + wall.width - 4, wall.y, 4, 4);
      wallGfx.fillRect(wall.x, wall.y + wall.height - 4, 4, 4);
      wallGfx.fillRect(wall.x + wall.width - 4, wall.y + wall.height - 4, 4, 4);
    }

    // Ambient drifting motes
    this.add.particles(0, 0, PARTICLE_KEY, {
      x: { min: 0, max: width },
      y: { min: 0, max: height },
      lifespan: { min: 2800, max: 5200 },
      speed: { min: 4, max: 18 },
      scale: { start: 0.35, end: 0 },
      alpha: { start: 0.22, end: 0 },
      tint: [0x38bdf8, 0x67e8f9, 0x818cf8],
      frequency: 180,
      quantity: 1,
      blendMode: "ADD",
    }).setDepth(1);
  }

  private syncFromState(state: GameState) {
    this.latestState = state;
    const seenPlayers = new Set<string>();
    const seenBullets = new Set<string>();
    const seenPickups = new Set<string>();

    for (const player of state.players) {
      seenPlayers.add(player.id);
      this.processPlayerFx(player, state.serverTime);
      this.upsertPlayer(player);
      this.syncSwingAnim(player);
    }

    for (const [id, view] of this.playerViews) {
      if (!seenPlayers.has(id)) {
        this.destroyPlayerView(view);
        this.playerViews.delete(id);
        this.swingAnims.delete(id);
        this.prevPlayerFx.delete(id);
      }
    }

    for (const bullet of state.bullets) {
      seenBullets.add(bullet.id);
      let view = this.bulletViews.get(bullet.id);
      if (!view) {
        const glow = this.add.circle(
          bullet.x,
          bullet.y,
          bullet.radius + 4,
          bullet.color,
          0.28
        );
        glow.setDepth(5);
        const core = this.add.circle(
          bullet.x,
          bullet.y,
          Math.max(2, bullet.radius),
          lighten(bullet.color, 60),
          1
        );
        core.setStrokeStyle(1, 0xf8fafc, 0.55);
        core.setDepth(5);
        view = { core, glow };
        this.bulletViews.set(bullet.id, view);

        const owner = state.players.find((player) => player.id === bullet.ownerId);
        this.playWeaponSfx(owner?.weapon ?? "rifle", bullet.ownerId);
        this.spawnMuzzleSpark(bullet.x, bullet.y, bullet.color);
      }
      view.core.setPosition(bullet.x, bullet.y);
      view.glow.setPosition(bullet.x, bullet.y);
      view.core.setRadius(Math.max(2, bullet.radius));
      view.glow.setRadius(bullet.radius + 4);
      view.core.setFillStyle(lighten(bullet.color, 60), 1);
      view.glow.setFillStyle(bullet.color, 0.28);
    }

    for (const [id, view] of this.bulletViews) {
      if (!seenBullets.has(id)) {
        view.core.destroy();
        view.glow.destroy();
        this.bulletViews.delete(id);
      }
    }

    for (const pickup of state.pickups ?? []) {
      seenPickups.add(pickup.id);
      if (!this.pickupViews.has(pickup.id)) {
        this.pickupViews.set(
          pickup.id,
          this.createPickupView(pickup.kind, pickup.x, pickup.y)
        );
      }
    }

    for (const [id, view] of this.pickupViews) {
      if (seenPickups.has(id)) {
        continue;
      }
      if (this.prevPickupIds.has(id) && this.sfxPrimed) {
        this.handlePickupCollected(view);
      }
      this.destroyPickupView(view);
      this.pickupViews.delete(id);
    }

    this.prevPickupIds = seenPickups;
    this.updateHud(state);
    this.sfxPrimed = true;
  }

  private createPickupView(kind: PickupKind, x: number, y: number): PickupView {
    const color = kind === "health" ? HEALTH_PICKUP_COLOR : AMMO_PICKUP_COLOR;
    const root = this.add.container(x, y);
    root.setDepth(2);

    const glow = this.add.circle(0, 0, PICKUP_RADIUS + 6, color, 0.22);
    const pad = this.add.circle(0, 0, PICKUP_RADIUS, color, 0.88);
    pad.setStrokeStyle(2, 0xf8fafc, 0.75);

    root.add([glow, pad]);

    if (kind === "health") {
      const barH = this.add.rectangle(0, 0, 12, 4, 0xf8fafc, 1);
      const barV = this.add.rectangle(0, 0, 4, 12, 0xf8fafc, 1);
      root.add([barH, barV]);
    } else {
      const clip = this.add.rectangle(0, 1, 8, 11, 0xf8fafc, 1);
      clip.setStrokeStyle(1, 0x92400e, 0.55);
      const tip = this.add.rectangle(0, -7, 5, 4, 0xfde68a, 1);
      root.add([clip, tip]);
    }

    const bobTween = this.tweens.add({
      targets: root,
      y: y - 4,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
      delay: Math.floor(Math.random() * 400),
    });

    const glowTween = this.tweens.add({
      targets: glow,
      scale: 1.18,
      alpha: 0.08,
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });

    return { kind, root, glow, bobTween, glowTween };
  }

  private destroyPickupView(view: PickupView) {
    view.bobTween?.stop();
    view.glowTween?.stop();
    view.root.destroy();
  }

  private handlePickupCollected(view: PickupView) {
    const local = this.latestState?.players.find(
      (player) => player.id === this.room.playerId
    );
    if (!local?.alive) {
      return;
    }

    const dx = local.x - view.root.x;
    const dy = local.y - view.root.y;
    if (dx * dx + dy * dy > (PLAYER_RADIUS + PICKUP_RADIUS + 28) ** 2) {
      return;
    }

    const color =
      view.kind === "health" ? HEALTH_PICKUP_COLOR : AMMO_PICKUP_COLOR;
    this.spawnPickupBurst(view.root.x, view.root.y, color);
    playPickupSynth(this.sound.mute, view.kind);
  }

  private spawnPickupBurst(x: number, y: number, color: number) {
    const ring = this.add.circle(x, y, 8, color, 0.2);
    ring.setStrokeStyle(2, lighten(color, 60), 0.9);
    ring.setDepth(7);
    this.tweens.add({
      targets: ring,
      scale: 2.2,
      alpha: 0,
      duration: 260,
      ease: "Cubic.Out",
      onComplete: () => ring.destroy(),
    });

    const burst = this.add.particles(x, y, PARTICLE_KEY, {
      speed: { min: 20, max: 70 },
      lifespan: 240,
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.85, end: 0 },
      tint: [color, lighten(color, 70), 0xf8fafc],
      quantity: 8,
      emitting: false,
      blendMode: "ADD",
    });
    burst.setDepth(7);
    burst.explode(8);
    this.time.delayedCall(320, () => burst.destroy());
  }

  private processPlayerFx(player: PlayerSnapshot, serverTime: number) {
    const prev = this.prevPlayerFx.get(player.id);
    const muted = this.sound.mute;

    if (prev && this.sfxPrimed) {
      if (player.health < prev.health && player.alive) {
        const lost = prev.health - player.health;
        const severity = Math.min(1, lost / 40);
        this.spawnHitRing(player.x, player.y, player.color);
        playHitSynth(muted, severity);
      }
      if (prev.alive && !player.alive) {
        this.spawnDeathBurst(player.x, player.y, player.color);
        playDeathSynth(muted);
      }
      if (
        player.id === this.room.playerId &&
        player.reloadEndsAt > serverTime &&
        prev.reloadEndsAt <= serverTime
      ) {
        this.spawnReloadPulse(player.x, player.y, player.color);
        playReloadSynth(muted);
      }
    }

    this.prevPlayerFx.set(player.id, {
      health: player.health,
      alive: player.alive,
      reloadEndsAt: player.reloadEndsAt,
    });
  }

  private spawnHitRing(x: number, y: number, color: number) {
    const ring = this.add.circle(x, y, PLAYER_RADIUS, color, 0);
    ring.setStrokeStyle(3, lighten(color, 80), 0.9);
    ring.setDepth(7);
    this.tweens.add({
      targets: ring,
      scale: 2.4,
      alpha: 0,
      duration: 220,
      ease: "Cubic.Out",
      onComplete: () => ring.destroy(),
    });
  }

  private spawnDeathBurst(x: number, y: number, color: number) {
    const burst = this.add.particles(x, y, PARTICLE_KEY, {
      speed: { min: 40, max: 140 },
      lifespan: { min: 280, max: 520 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [color, lighten(color, 70), 0xf8fafc],
      quantity: 18,
      emitting: false,
      blendMode: "ADD",
    });
    burst.setDepth(7);
    burst.explode(18);
    this.time.delayedCall(600, () => burst.destroy());
  }

  private spawnReloadPulse(x: number, y: number, color: number) {
    const ring = this.add.circle(x, y, 10, color, 0.15);
    ring.setStrokeStyle(2, 0x7dd3fc, 0.8);
    ring.setDepth(7);
    this.tweens.add({
      targets: ring,
      scale: 2.1,
      alpha: 0,
      duration: 280,
      ease: "Sine.Out",
      onComplete: () => ring.destroy(),
    });
  }

  private spawnMuzzleSpark(x: number, y: number, color: number) {
    const spark = this.add.particles(x, y, PARTICLE_KEY, {
      speed: { min: 20, max: 70 },
      lifespan: 180,
      scale: { start: 0.45, end: 0 },
      alpha: { start: 0.85, end: 0 },
      tint: [lighten(color, 40), 0xf8fafc],
      quantity: 6,
      emitting: false,
      blendMode: "ADD",
    });
    spark.setDepth(6);
    spark.explode(6);
    this.time.delayedCall(260, () => spark.destroy());
  }

  private syncSwingAnim(player: PlayerSnapshot) {
    const weapon = getWeapon(player.weapon);
    if (!weapon.melee) {
      this.swingAnims.delete(player.id);
      return;
    }

    if (player.swingStartedAt <= 0) {
      return;
    }

    const existing = this.swingAnims.get(player.id);
    if (existing?.swingStartedAt === player.swingStartedAt) {
      return;
    }

    this.swingAnims.set(player.id, {
      swingStartedAt: player.swingStartedAt,
      startedLocal: performance.now(),
      aimAngle: player.swingAimAngle,
      color: player.color,
    });
    this.playWeaponSfx("sword", player.id);
  }

  private destroyPlayerView(view: PlayerView) {
    view.pulseTween?.stop();
    view.aura.destroy();
    view.core.destroy();
    view.wispOrbit.destroy();
    view.aim.destroy();
    view.blade.destroy();
    view.swingTrail.destroy();
    view.motionEmitter.destroy();
    view.label.destroy();
  }

  private upsertPlayer(player: PlayerSnapshot) {
    let view = this.playerViews.get(player.id);
    const isLocal = player.id === this.room.playerId;

    if (!view) {
      const aura = this.add.circle(
        player.x,
        player.y,
        isLocal ? AURA_RADIUS + 3 : AURA_RADIUS,
        player.color,
        isLocal ? 0.28 : 0.18
      );
      aura.setDepth(3);

      const core = this.add.circle(player.x, player.y, CORE_RADIUS, player.color, 1);
      core.setStrokeStyle(2, 0xf8fafc, 0.85);
      core.setDepth(4);

      const wispOrbit = this.add.container(player.x, player.y);
      wispOrbit.setDepth(4);
      const wisps: Phaser.GameObjects.Arc[] = [];
      for (let i = 0; i < 3; i += 1) {
        const angle = (Math.PI * 2 * i) / 3;
        const wisp = this.add.circle(
          Math.cos(angle) * 16,
          Math.sin(angle) * 16,
          3,
          lighten(player.color, 90),
          0.9
        );
        wisps.push(wisp);
        wispOrbit.add(wisp);
      }

      const aim = this.add.rectangle(
        player.x,
        player.y,
        PLAYER_RADIUS + 16,
        3,
        lighten(player.color, 40),
        1
      );
      aim.setOrigin(0, 0.5);
      aim.setDepth(4);

      const blade = this.add.rectangle(player.x, player.y, 54, 5, 0xe0f2fe, 1);
      blade.setOrigin(0, 0.5);
      blade.setStrokeStyle(1, 0x7dd3fc, 0.95);
      blade.setDepth(5);
      blade.setVisible(false);

      const swingTrail = this.add.graphics();
      swingTrail.setDepth(3);

      const motionEmitter = this.add.particles(0, 0, PARTICLE_KEY, {
        follow: core,
        lifespan: 280,
        speed: 8,
        scale: { start: 0.45, end: 0 },
        alpha: { start: 0.45, end: 0 },
        frequency: 40,
        quantity: 1,
        tint: player.color,
        blendMode: "ADD",
        emitting: false,
      });
      motionEmitter.setDepth(2);

      const label = this.add
        .text(player.x, player.y - AURA_RADIUS - 10, player.name, {
          fontFamily: "Segoe UI, Trebuchet MS, sans-serif",
          fontSize: "11px",
          color: "#f8fafc",
        })
        .setOrigin(0.5)
        .setDepth(6)
        .setStroke("#020617", 3)
        .setShadow(0, 1, "#020617", 2, true, true);

      const pulseTween = this.tweens.add({
        targets: aura,
        scaleX: 1.12,
        scaleY: 1.12,
        alpha: isLocal ? 0.38 : 0.26,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: "Sine.InOut",
      });

      view = {
        aura,
        core,
        wispOrbit,
        wisps,
        aim,
        blade,
        swingTrail,
        motionEmitter,
        label,
        lastX: player.x,
        lastY: player.y,
        pulseTween,
      };
      this.playerViews.set(player.id, view);
    }

    const weapon = getWeapon(player.weapon);
    const isSword = weapon.melee;
    const alive = player.alive;

    view.aura.setPosition(player.x, player.y);
    view.core.setPosition(player.x, player.y);
    view.wispOrbit.setPosition(player.x, player.y);
    view.core.setFillStyle(player.color, alive ? 1 : 0.22);
    view.aura.setFillStyle(player.color, alive ? (isLocal ? 0.28 : 0.18) : 0.06);
    view.core.setStrokeStyle(2, alive ? 0xf8fafc : 0x64748b, alive ? 0.85 : 0.4);

    for (const wisp of view.wisps) {
      wisp.setFillStyle(lighten(player.color, 90), alive ? 0.9 : 0.15);
      wisp.setVisible(alive);
    }

    view.aim.setVisible(!isSword && alive);
    view.aim.setPosition(player.x, player.y);
    view.aim.setRotation(player.aimAngle);
    view.aim.setFillStyle(lighten(player.color, 40), 1);

    view.blade.setVisible(isSword && alive);
    view.blade.setPosition(player.x, player.y);
    if (isSword) {
      view.blade.setSize(weapon.meleeRange, 5);
      view.blade.setOrigin(0, 0.5);
    }

    view.label.setPosition(player.x, player.y - AURA_RADIUS - 10);
    view.label.setText(player.name);
    view.label.setAlpha(alive ? 1 : 0.4);

    if (!isSword || !alive) {
      view.swingTrail.clear();
      view.blade.setAlpha(0);
    }

    if (!alive) {
      view.pulseTween?.pause();
      view.aura.setScale(0.7);
      view.motionEmitter.stop();
    } else if (view.pulseTween?.isPaused()) {
      view.pulseTween.resume();
    }
  }

  private tickSpiritMotion(delta: number) {
    const state = this.latestState;
    if (!state) {
      return;
    }

    for (const player of state.players) {
      const view = this.playerViews.get(player.id);
      if (!view) {
        continue;
      }

      const dx = player.x - view.lastX;
      const dy = player.y - view.lastY;
      const speed = Math.hypot(dx, dy) / Math.max(delta, 1);
      view.lastX = player.x;
      view.lastY = player.y;

      if (player.alive) {
        const spin = 0.002 + speed * 0.08;
        view.wispOrbit.rotation += spin * delta;
        if (speed > 0.08) {
          view.motionEmitter.start();
        } else {
          view.motionEmitter.stop();
        }
      }
    }
  }

  private renderSwordVisuals() {
    const state = this.latestState;
    if (!state) {
      return;
    }

    const now = performance.now();

    for (const player of state.players) {
      const view = this.playerViews.get(player.id);
      if (!view) {
        continue;
      }

      const weapon = getWeapon(player.weapon);
      if (!weapon.melee || !player.alive) {
        view.swingTrail.clear();
        continue;
      }

      const anim = this.swingAnims.get(player.id);
      const progress = anim
        ? Math.min(1, (now - anim.startedLocal) / weapon.swingMs)
        : 1;

      if (anim && progress < 1) {
        const bladeAngle = swingBladeAngle(anim.aimAngle, weapon.swingArc, progress);

        view.blade.setVisible(true);
        view.blade.setAlpha(1);
        view.blade.setRotation(bladeAngle);
        view.blade.setPosition(player.x, player.y);

        this.drawSwingTrail(
          view.swingTrail,
          player.x,
          player.y,
          anim.aimAngle,
          weapon.swingArc,
          weapon.meleeRange,
          progress,
          anim.color
        );
        continue;
      }

      view.swingTrail.clear();
      view.blade.setVisible(true);
      view.blade.setAlpha(0.85);
      view.blade.setRotation(player.aimAngle);
      view.blade.setPosition(player.x, player.y);

      if (anim && player.swingStartedAt !== anim.swingStartedAt) {
        this.swingAnims.delete(player.id);
      }
    }
  }

  private drawSwingTrail(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    aimAngle: number,
    swingArc: number,
    range: number,
    progress: number,
    color: number
  ) {
    graphics.clear();
    if (progress <= 0.02) {
      return;
    }

    const start = aimAngle - swingArc / 2;
    const end = start + swingArc * progress;
    const steps = Math.max(6, Math.floor(18 * progress));

    graphics.fillStyle(color, 0.28);
    graphics.beginPath();
    graphics.moveTo(x, y);
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const angle = start + (end - start) * t;
      graphics.lineTo(x + Math.cos(angle) * range, y + Math.sin(angle) * range);
    }
    graphics.closePath();
    graphics.fillPath();

    graphics.lineStyle(3, lighten(color, 90), 0.55);
    graphics.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const angle = start + (end - start) * t;
      const px = x + Math.cos(angle) * range;
      const py = y + Math.sin(angle) * range;
      if (i === 0) {
        graphics.moveTo(px, py);
      } else {
        graphics.lineTo(px, py);
      }
    }
    graphics.strokePath();

    graphics.lineStyle(1, 0xf8fafc, 0.65);
    graphics.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const angle = start + (end - start) * t;
      const px = x + Math.cos(angle) * (range * 0.92);
      const py = y + Math.sin(angle) * (range * 0.92);
      if (i === 0) {
        graphics.moveTo(px, py);
      } else {
        graphics.lineTo(px, py);
      }
    }
    graphics.strokePath();
  }

  private updateHud(state: GameState) {
    const me = state.players.find((player) => player.id === this.room.playerId);

    this.hudRoom?.setText(
      `Room ${state.roomCode} · ${state.players.length}/${MAX_PLAYERS}`
    );

    if (!me) {
      return;
    }

    if (me.alive) {
      const weapon = getWeapon(me.weapon);
      this.hudHealth?.setText(`HP ${Math.max(0, me.health)}/${weapon.maxHealth}`);
      this.hudHealth?.setColor("#6ee7b7");

      const reloading = me.reloadEndsAt > 0 && state.serverTime < me.reloadEndsAt;
      if (weapon.infiniteAmmo) {
        this.hudAmmo?.setText(`${weapon.name}  ·  ∞`);
        this.hudAmmo?.setColor("#7dd3fc");
      } else {
        this.hudAmmo?.setText(
          reloading
            ? `${weapon.name}  Reloading...  ${me.reserveAmmo}`
            : `${weapon.name}  ${me.ammo}/${weapon.magazineSize}  ·  ${me.reserveAmmo}`
        );
        this.hudAmmo?.setColor(me.ammo <= 0 ? "#fbbf24" : "#7dd3fc");
      }
    } else {
      this.hudHealth?.setText("Respawning...");
      this.hudHealth?.setColor("#fbbf24");
      this.hudAmmo?.setText("");
    }

    const lines = state.players
      .map((player) => `${player.name}  ${player.kills}/${player.deaths}`)
      .sort((a, b) => a.localeCompare(b));
    this.hudScores?.setText(["K / D", ...lines].join("\n"));
  }
}

import Phaser from "phaser";
import {
  getWeapon,
  MAX_PLAYERS,
  PLAYER_RADIUS,
  swingBladeAngle,
  type ArenaDefinition,
  type GameState,
  type PlayerInput,
  type PlayerSnapshot,
  type WeaponId,
} from "@pvp-arena/shared";
import type { PeerRoom } from "../net/peerRoom";

type PlayerView = {
  body: Phaser.GameObjects.Arc;
  aim: Phaser.GameObjects.Rectangle;
  blade: Phaser.GameObjects.Rectangle;
  trail: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
};

type SwingAnim = {
  swingStartedAt: number;
  startedLocal: number;
  aimAngle: number;
  color: number;
};

const MUSIC_KEY = "arena-bgm";
const MUSIC_MUTE_STORAGE_KEY = "pvp-arena-music-muted";
const MUSIC_VOLUME = 0.32;

const WEAPON_SFX: Record<
  WeaponId,
  { key: string; path: string; volume: number }
> = {
  smg: { key: "sfx-smg", path: "/assets/sfx/smg.wav", volume: 0.28 },
  rifle: { key: "sfx-rifle", path: "/assets/sfx/rifle.wav", volume: 0.42 },
  sniper: { key: "sfx-sniper", path: "/assets/sfx/sniper.wav", volume: 0.55 },
  sword: { key: "sfx-sword", path: "/assets/sfx/sword.wav", volume: 0.48 },
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
  private bulletViews = new Map<string, Phaser.GameObjects.Arc>();
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
    this.cameras.main.setBackgroundColor("#0b1220");
    this.cameras.main.setBounds(0, 0, this.arena.width, this.arena.height);
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
      color: "#f1f5f9",
    } as const;

    this.hudRoom = this.add
      .text(14, 10, "", hudStyle)
      .setScrollFactor(0)
      .setDepth(10)
      .setStroke("#020617", 3)
      .setShadow(0, 1, "#020617", 2, true, true);

    this.hudHealth = this.add
      .text(14, 28, "", { ...hudStyle, color: "#86efac" })
      .setScrollFactor(0)
      .setDepth(10)
      .setStroke("#020617", 3)
      .setShadow(0, 1, "#020617", 2, true, true);

    this.hudAmmo = this.add
      .text(14, 46, "", { ...hudStyle, color: "#93c5fd" })
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
          color: "#cbd5e1",
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
    this.sound.play(sfx.key, { volume, rate: isLocal ? 1 : 0.98 });
  }

  update(_time: number, _delta: number) {
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
  }

  private returnToLobby() {
    window.location.reload();
  }

  private drawArena() {
    const { width, height, walls } = this.arena;
    const floor = this.add.graphics();
    floor.fillStyle(0x111827, 1);
    floor.fillRect(0, 0, width, height);
    floor.lineStyle(2, 0x334155, 1);
    floor.strokeRect(1, 1, width - 2, height - 2);

    for (let x = 0; x < width; x += 40) {
      floor.lineStyle(1, 0x1f2937, 0.7);
      floor.lineBetween(x, 0, x, height);
    }
    for (let y = 0; y < height; y += 40) {
      floor.lineStyle(1, 0x1f2937, 0.7);
      floor.lineBetween(0, y, width, y);
    }

    const wallGfx = this.add.graphics();
    wallGfx.fillStyle(0x475569, 1);
    for (const wall of walls) {
      wallGfx.fillRect(wall.x, wall.y, wall.width, wall.height);
      wallGfx.lineStyle(2, 0x94a3b8, 1);
      wallGfx.strokeRect(wall.x, wall.y, wall.width, wall.height);
    }
  }

  private syncFromState(state: GameState) {
    this.latestState = state;
    const seenPlayers = new Set<string>();
    const seenBullets = new Set<string>();

    for (const player of state.players) {
      seenPlayers.add(player.id);
      this.upsertPlayer(player);
      this.syncSwingAnim(player);
    }

    for (const [id, view] of this.playerViews) {
      if (!seenPlayers.has(id)) {
        view.body.destroy();
        view.aim.destroy();
        view.blade.destroy();
        view.trail.destroy();
        view.label.destroy();
        this.playerViews.delete(id);
        this.swingAnims.delete(id);
      }
    }

    for (const bullet of state.bullets) {
      seenBullets.add(bullet.id);
      let view = this.bulletViews.get(bullet.id);
      if (!view) {
        view = this.add.circle(bullet.x, bullet.y, bullet.radius, bullet.color, 1);
        view.setDepth(5);
        this.bulletViews.set(bullet.id, view);

        const owner = state.players.find((player) => player.id === bullet.ownerId);
        this.playWeaponSfx(owner?.weapon ?? "rifle", bullet.ownerId);
      }
      view.setPosition(bullet.x, bullet.y);
      view.setRadius(bullet.radius);
      view.setFillStyle(bullet.color, 1);
    }

    for (const [id, view] of this.bulletViews) {
      if (!seenBullets.has(id)) {
        view.destroy();
        this.bulletViews.delete(id);
      }
    }

    this.updateHud(state);
    this.sfxPrimed = true;
  }

  private syncSwingAnim(player: PlayerSnapshot) {
    const weapon = getWeapon(player.weapon);
    if (!weapon.melee) {
      this.swingAnims.delete(player.id);
      return;
    }

    // Only start an anim when the host begins a new swing. Never restart the
    // same swingStartedAt (that caused a second visual sweep).
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

  private upsertPlayer(player: PlayerSnapshot) {
    let view = this.playerViews.get(player.id);
    if (!view) {
      const body = this.add.circle(player.x, player.y, PLAYER_RADIUS, player.color, 1);
      body.setStrokeStyle(2, 0xf8fafc, 0.9);
      body.setDepth(4);

      const aim = this.add.rectangle(
        player.x,
        player.y,
        PLAYER_RADIUS + 14,
        4,
        player.color,
        1
      );
      aim.setOrigin(0, 0.5);
      aim.setDepth(4);

      const blade = this.add.rectangle(player.x, player.y, 54, 7, 0xe2e8f0, 1);
      blade.setOrigin(0, 0.5);
      blade.setStrokeStyle(1, 0x94a3b8, 0.9);
      blade.setDepth(5);
      blade.setVisible(false);

      const trail = this.add.graphics();
      trail.setDepth(3);

      const label = this.add
        .text(player.x, player.y - PLAYER_RADIUS - 12, player.name, {
          fontFamily: "Segoe UI, Trebuchet MS, sans-serif",
          fontSize: "10px",
          color: "#f8fafc",
        })
        .setOrigin(0.5)
        .setDepth(6)
        .setStroke("#020617", 3)
        .setShadow(0, 1, "#020617", 2, true, true);

      view = { body, aim, blade, trail, label };
      this.playerViews.set(player.id, view);
    }

    const weapon = getWeapon(player.weapon);
    const isSword = weapon.melee;

    view.body.setPosition(player.x, player.y);
    view.body.setFillStyle(player.color, player.alive ? 1 : 0.25);

    view.aim.setVisible(!isSword && player.alive);
    view.aim.setPosition(player.x, player.y);
    view.aim.setRotation(player.aimAngle);
    view.aim.setAlpha(player.alive ? 1 : 0.2);

    view.blade.setVisible(isSword && player.alive);
    view.blade.setPosition(player.x, player.y);
    if (isSword) {
      view.blade.setSize(weapon.meleeRange, 7);
      view.blade.setOrigin(0, 0.5);
    }

    view.label.setPosition(player.x, player.y - PLAYER_RADIUS - 12);
    view.label.setText(player.name);
    view.label.setAlpha(player.alive ? 1 : 0.45);

    if (!isSword || !player.alive) {
      view.trail.clear();
      view.blade.setAlpha(0);
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
        view.trail.clear();
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
          view.trail,
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

      view.trail.clear();
      view.blade.setVisible(true);
      view.blade.setAlpha(0.85);
      view.blade.setRotation(player.aimAngle);
      view.blade.setPosition(player.x, player.y);

      // Drop finished anims only after the host clears that swing, so sync
      // cannot restart the same swingStartedAt.
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

    graphics.fillStyle(color, 0.22);
    graphics.beginPath();
    graphics.moveTo(x, y);
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const angle = start + (end - start) * t;
      graphics.lineTo(x + Math.cos(angle) * range, y + Math.sin(angle) * range);
    }
    graphics.closePath();
    graphics.fillPath();

    graphics.lineStyle(2, 0xf8fafc, 0.45);
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
      this.hudHealth?.setColor("#86efac");

      const reloading = me.reloadEndsAt > 0 && state.serverTime < me.reloadEndsAt;
      if (weapon.infiniteAmmo) {
        this.hudAmmo?.setText(`${weapon.name}  ·  ∞`);
        this.hudAmmo?.setColor("#93c5fd");
      } else {
        this.hudAmmo?.setText(
          reloading
            ? `${weapon.name}  Reloading...  ${me.reserveAmmo}`
            : `${weapon.name}  ${me.ammo}/${weapon.magazineSize}  ·  ${me.reserveAmmo}`
        );
        this.hudAmmo?.setColor(me.ammo <= 0 ? "#fbbf24" : "#93c5fd");
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

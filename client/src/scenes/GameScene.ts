import Phaser from "phaser";
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  BULLET_RADIUS,
  MAX_PLAYERS,
  PLAYER_MAX_HEALTH,
  PLAYER_RADIUS,
  WALLS,
  type GameState,
  type PlayerInput,
  type PlayerSnapshot,
} from "@pvp-arena/shared";
import type { PeerRoom } from "../net/peerRoom";

type PlayerView = {
  body: Phaser.GameObjects.Arc;
  aim: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
};

export class GameScene extends Phaser.Scene {
  private room!: PeerRoom;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private playerViews = new Map<string, PlayerView>();
  private bulletViews = new Map<string, Phaser.GameObjects.Arc>();
  private hudRoom?: Phaser.GameObjects.Text;
  private hudHealth?: Phaser.GameObjects.Text;
  private hudScores?: Phaser.GameObjects.Text;
  private shooting = false;
  private latestState: GameState | null = null;

  constructor() {
    super("game");
  }

  create() {
    this.room = this.registry.get("room") as PeerRoom;
    this.cameras.main.setBackgroundColor("#0b1220");
    this.drawArena();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as typeof this.wasd;

    this.input.on("pointerdown", () => {
      this.shooting = true;
    });
    this.input.on("pointerup", () => {
      this.shooting = false;
    });

    this.hudRoom = this.add
      .text(16, 12, "", {
        fontFamily: "Trebuchet MS, sans-serif",
        fontSize: "18px",
        color: "#e2e8f0",
      })
      .setScrollFactor(0)
      .setDepth(10);

    this.hudHealth = this.add
      .text(16, 40, "", {
        fontFamily: "Trebuchet MS, sans-serif",
        fontSize: "18px",
        color: "#86efac",
      })
      .setScrollFactor(0)
      .setDepth(10);

    this.hudScores = this.add
      .text(ARENA_WIDTH - 16, 12, "", {
        fontFamily: "Trebuchet MS, sans-serif",
        fontSize: "16px",
        color: "#e2e8f0",
        align: "right",
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(10);

    this.add
      .text(
        ARENA_WIDTH / 2,
        ARENA_HEIGHT - 24,
        "WASD move · Mouse aim · Click shoot · Esc leave",
        {
          fontFamily: "Trebuchet MS, sans-serif",
          fontSize: "14px",
          color: "#94a3b8",
        }
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(10);

    this.input.keyboard?.on("keydown-ESC", () => {
      this.room.destroy();
    });

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

  update() {
    if (!this.room) {
      return;
    }

    const pointer = this.input.activePointer;
    const me = this.latestState?.players.find((player) => player.id === this.room.playerId);
    const originX = me?.x ?? ARENA_WIDTH / 2;
    const originY = me?.y ?? ARENA_HEIGHT / 2;
    const aimAngle = Math.atan2(pointer.worldY - originY, pointer.worldX - originX);

    const input: PlayerInput = {
      up: this.wasd.up.isDown || Boolean(this.cursors.up?.isDown),
      down: this.wasd.down.isDown || Boolean(this.cursors.down?.isDown),
      left: this.wasd.left.isDown || Boolean(this.cursors.left?.isDown),
      right: this.wasd.right.isDown || Boolean(this.cursors.right?.isDown),
      aimAngle,
      shooting: this.shooting || pointer.isDown,
    };

    this.room.sendInput(input);

    if (this.room.isHost) {
      this.syncFromState(this.room.getState());
    }
  }

  private returnToLobby() {
    window.location.reload();
  }

  private drawArena() {
    const floor = this.add.graphics();
    floor.fillStyle(0x111827, 1);
    floor.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
    floor.lineStyle(2, 0x334155, 1);
    floor.strokeRect(1, 1, ARENA_WIDTH - 2, ARENA_HEIGHT - 2);

    for (let x = 0; x < ARENA_WIDTH; x += 40) {
      floor.lineStyle(1, 0x1f2937, 0.7);
      floor.lineBetween(x, 0, x, ARENA_HEIGHT);
    }
    for (let y = 0; y < ARENA_HEIGHT; y += 40) {
      floor.lineStyle(1, 0x1f2937, 0.7);
      floor.lineBetween(0, y, ARENA_WIDTH, y);
    }

    const walls = this.add.graphics();
    walls.fillStyle(0x475569, 1);
    for (const wall of WALLS) {
      walls.fillRect(wall.x, wall.y, wall.width, wall.height);
      walls.lineStyle(2, 0x94a3b8, 1);
      walls.strokeRect(wall.x, wall.y, wall.width, wall.height);
    }
  }

  private syncFromState(state: GameState) {
    this.latestState = state;
    const seenPlayers = new Set<string>();
    const seenBullets = new Set<string>();

    for (const player of state.players) {
      seenPlayers.add(player.id);
      this.upsertPlayer(player);
    }

    for (const [id, view] of this.playerViews) {
      if (!seenPlayers.has(id)) {
        view.body.destroy();
        view.aim.destroy();
        view.label.destroy();
        this.playerViews.delete(id);
      }
    }

    for (const bullet of state.bullets) {
      seenBullets.add(bullet.id);
      let view = this.bulletViews.get(bullet.id);
      if (!view) {
        view = this.add.circle(bullet.x, bullet.y, BULLET_RADIUS, bullet.color, 1);
        view.setDepth(5);
        this.bulletViews.set(bullet.id, view);
      }
      view.setPosition(bullet.x, bullet.y);
      view.setFillStyle(bullet.color, 1);
    }

    for (const [id, view] of this.bulletViews) {
      if (!seenBullets.has(id)) {
        view.destroy();
        this.bulletViews.delete(id);
      }
    }

    this.updateHud(state);
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

      const label = this.add
        .text(player.x, player.y - PLAYER_RADIUS - 14, player.name, {
          fontFamily: "Trebuchet MS, sans-serif",
          fontSize: "12px",
          color: "#f8fafc",
        })
        .setOrigin(0.5)
        .setDepth(6);

      view = { body, aim, label };
      this.playerViews.set(player.id, view);
    }

    view.body.setPosition(player.x, player.y);
    view.body.setFillStyle(player.color, player.alive ? 1 : 0.25);
    view.aim.setPosition(player.x, player.y);
    view.aim.setRotation(player.aimAngle);
    view.aim.setAlpha(player.alive ? 1 : 0.2);
    view.label.setPosition(player.x, player.y - PLAYER_RADIUS - 14);
    view.label.setText(player.name);
    view.label.setAlpha(player.alive ? 1 : 0.45);
  }

  private updateHud(state: GameState) {
    const me = state.players.find((player) => player.id === this.room.playerId);

    this.hudRoom?.setText(
      `Room ${state.roomCode} · ${state.players.length}/${MAX_PLAYERS}`
    );

    if (me) {
      this.hudHealth?.setText(
        me.alive ? `HP ${Math.max(0, me.health)}/${PLAYER_MAX_HEALTH}` : "Respawning..."
      );
      this.hudHealth?.setColor(me.alive ? "#86efac" : "#fbbf24");
    }

    const lines = state.players
      .map((player) => `${player.name}  ${player.kills}/${player.deaths}`)
      .sort((a, b) => a.localeCompare(b));
    this.hudScores?.setText(["K / D", ...lines].join("\n"));
  }
}

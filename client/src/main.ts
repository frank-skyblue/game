import Phaser from "phaser";
import { GameScene } from "./scenes/GameScene";
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  DEFAULT_BOT_COUNT,
  DEFAULT_WEAPON_ID,
  MAX_PLAYERS,
  parseWeaponId,
  type WeaponId,
} from "@pvp-arena/shared";
import { createHostRoom, joinGuestRoom, type PeerRoom } from "./net/peerRoom";

const lobbyEl = document.getElementById("lobby");
const gameEl = document.getElementById("game");
const nameInput = document.getElementById("playerName") as HTMLInputElement;
const codeInput = document.getElementById("roomCode") as HTMLInputElement;
const botCountInput = document.getElementById("botCount") as HTMLInputElement;
const createBtn = document.getElementById("createBtn") as HTMLButtonElement;
const joinBtn = document.getElementById("joinBtn") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLParagraphElement;
const weaponButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-weapon]")
);

nameInput.value = `Pilot${Math.floor(Math.random() * 90 + 10)}`;
botCountInput.value = String(DEFAULT_BOT_COUNT);

let selectedWeapon: WeaponId = DEFAULT_WEAPON_ID;

const setStatus = (message: string) => {
  statusEl.textContent = message;
};

const setSelectedWeapon = (weapon: WeaponId) => {
  selectedWeapon = weapon;
  for (const button of weaponButtons) {
    const isSelected = button.dataset.weapon === weapon;
    button.setAttribute("aria-pressed", isSelected ? "true" : "false");
  }
};

for (const button of weaponButtons) {
  button.addEventListener("click", () => {
    setSelectedWeapon(parseWeaponId(button.dataset.weapon));
  });
}

const randomCode = (): string => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
};

const getName = (): string => nameInput.value.trim().slice(0, 16) || "Pilot";

const getBotCount = (): number => {
  const parsed = Number.parseInt(botCountInput.value, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_BOT_COUNT;
  }
  return Math.max(0, Math.min(MAX_PLAYERS - 1, Math.floor(parsed)));
};

let game: Phaser.Game | null = null;

const startGame = (room: PeerRoom) => {
  lobbyEl?.classList.add("hidden");
  gameEl?.classList.remove("hidden");

  if (game) {
    game.destroy(true);
  }

  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: ARENA_WIDTH,
    height: ARENA_HEIGHT,
    backgroundColor: "#0b1220",
    scene: [GameScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    callbacks: {
      preBoot: (bootGame) => {
        bootGame.registry.set("room", room);
      },
    },
  });
};

const handleCreate = async () => {
  const name = getName();
  const roomCode = randomCode();
  setStatus(`Creating room ${roomCode}...`);
  createBtn.disabled = true;
  joinBtn.disabled = true;

  try {
    const room = await createHostRoom(roomCode, name, selectedWeapon, getBotCount());
    codeInput.value = roomCode;
    setStatus("");
    startGame(room);
  } catch (error) {
    console.error(error);
    setStatus("Could not create room. Try again in a moment.");
  } finally {
    createBtn.disabled = false;
    joinBtn.disabled = false;
  }
};

const handleJoin = async () => {
  const name = getName();
  const roomCode = codeInput.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  codeInput.value = roomCode;

  if (roomCode.length < 4) {
    setStatus("Enter a room code to join.");
    return;
  }

  setStatus(`Joining ${roomCode}...`);
  createBtn.disabled = true;
  joinBtn.disabled = true;

  try {
    const room = await joinGuestRoom(roomCode, name, selectedWeapon);
    setStatus("");
    startGame(room);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "";
    setStatus(
      message.includes("full")
        ? message
        : "Room not found. Check the code — the host must keep their tab open."
    );
  } finally {
    createBtn.disabled = false;
    joinBtn.disabled = false;
  }
};

createBtn.addEventListener("click", () => {
  void handleCreate();
});
joinBtn.addEventListener("click", () => {
  void handleJoin();
});

codeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    void handleJoin();
  }
});

nameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    if (codeInput.value.trim().length >= 4) {
      void handleJoin();
    } else {
      void handleCreate();
    }
  }
});

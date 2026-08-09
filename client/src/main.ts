import Phaser from "phaser";
import { GameScene } from "./scenes/GameScene";
import { ARENA_HEIGHT, ARENA_WIDTH } from "@pvp-arena/shared";
import { createHostRoom, joinGuestRoom, type PeerRoom } from "./net/peerRoom";

const lobbyEl = document.getElementById("lobby");
const gameEl = document.getElementById("game");
const nameInput = document.getElementById("playerName") as HTMLInputElement;
const codeInput = document.getElementById("roomCode") as HTMLInputElement;
const createBtn = document.getElementById("createBtn") as HTMLButtonElement;
const joinBtn = document.getElementById("joinBtn") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLParagraphElement;

nameInput.value = `Pilot${Math.floor(Math.random() * 90 + 10)}`;

const setStatus = (message: string) => {
  statusEl.textContent = message;
};

const randomCode = (): string => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
};

const getName = (): string => nameInput.value.trim().slice(0, 16) || "Pilot";

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
    const room = await createHostRoom(roomCode, name);
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
    const room = await joinGuestRoom(roomCode, name);
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

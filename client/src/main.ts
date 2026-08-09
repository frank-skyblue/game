import Phaser from "phaser";
import { GameScene } from "./scenes/GameScene";
import { mountEditor } from "./editor/editorApp";
import { getMap, listMaps } from "./mapsApi";
import {
  DEFAULT_ARENA,
  DEFAULT_BOT_COUNT,
  DEFAULT_WEAPON_ID,
  MAX_PLAYERS,
  parseWeaponId,
  type ArenaDefinition,
  type WeaponId,
} from "@pvp-arena/shared";
import { createHostRoom, joinGuestRoom, type PeerRoom } from "./net/peerRoom";

const isEditorRoute = (): boolean =>
  window.location.pathname.replace(/\/+$/, "") === "/editor";

const lobbyEl = document.getElementById("lobby");
const editorEl = document.getElementById("editor");
const gameEl = document.getElementById("game");

if (isEditorRoute()) {
  document.body.style.overflow = "auto";
  lobbyEl?.classList.add("hidden");
  gameEl?.classList.add("hidden");
  editorEl?.classList.remove("hidden");
  if (editorEl) {
    mountEditor(editorEl);
  }
} else {
  const nameInput = document.getElementById("playerName") as HTMLInputElement;
  const codeInput = document.getElementById("roomCode") as HTMLInputElement;
  const botCountInput = document.getElementById("botCount") as HTMLInputElement;
  const mapSelect = document.getElementById("mapSelect") as HTMLSelectElement;
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

  const loadMapOptions = async () => {
    try {
      const maps = await listMaps();
      const builtin = `<option value="builtin">Classic (built-in)</option>`;
      const options = maps
        .map(
          (map) =>
            `<option value="${map.id}">${map.name}${
              map.author ? ` — ${map.author}` : ""
            }</option>`
        )
        .join("");
      mapSelect.innerHTML = builtin + options;
    } catch (error) {
      console.warn("Maps API unavailable; using built-in arena only.", error);
      mapSelect.innerHTML = `<option value="builtin">Classic (built-in)</option>`;
    }
  };

  const resolveHostArena = async (): Promise<ArenaDefinition> => {
    const selected = mapSelect.value;
    if (!selected || selected === "builtin") {
      return DEFAULT_ARENA;
    }
    const detail = await getMap(selected);
    return detail.arena;
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
      width: room.arena.width,
      height: room.arena.height,
      backgroundColor: "#060b16",
      scene: [GameScene],
      render: {
        antialias: true,
        roundPixels: true,
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        expandParent: true,
      },
      callbacks: {
        preBoot: (bootGame) => {
          bootGame.registry.set("room", room);
        },
        postBoot: (bootGame) => {
          // Parent was just un-hidden; refresh once layout has a real size.
          requestAnimationFrame(() => {
            bootGame.scale.refresh();
          });
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
      const arena = await resolveHostArena();
      const room = await createHostRoom(
        roomCode,
        name,
        selectedWeapon,
        getBotCount(),
        arena
      );
      codeInput.value = roomCode;
      setStatus("");
      startGame(room);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "";
      setStatus(
        message.includes("not found") || message.includes("Maps database")
          ? message
          : "Could not create room. Try again in a moment."
      );
    } finally {
      createBtn.disabled = false;
      joinBtn.disabled = false;
    }
  };

  const handleJoin = async () => {
    const name = getName();
    const roomCode = codeInput.value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
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

  void loadMapOptions();
}

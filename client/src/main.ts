import Phaser from "phaser";
import { GameScene } from "./scenes/GameScene";
import { mountEditor } from "./editor/editorApp";
import { getMap, listMaps } from "./mapsApi";
import {
  DEFAULT_ARENA,
  DEFAULT_BOT_COUNT,
  DEFAULT_CHARACTER_ID,
  DEFAULT_GAME_MODE,
  DEFAULT_WEAPON_ID,
  formatRoomCode,
  MAX_PLAYERS,
  normalizeRoomCodeSuffix,
  parseCharacterId,
  parseGameMode,
  parseWeaponId,
  ROOM_CODE_SUFFIX_LENGTH,
  roomModeLabel,
  type ArenaDefinition,
  type CharacterId,
  type GameMode,
  type WeaponId,
} from "@pvp-arena/shared";
import { createHostRoom, joinGuestRoom, type PeerRoom } from "./net/peerRoom";

const LOBBY_PREFS_KEY = "pvp-arena-lobby";

type LobbyPrefs = {
  name?: string;
  mode?: GameMode;
  weapon?: WeaponId;
  character?: CharacterId;
  botCount?: number;
  mapId?: string;
  roomCodeSuffix?: string;
};

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
  const codePrefixEl = document.getElementById("roomCodePrefix") as HTMLElement;
  const botCountInput = document.getElementById("botCount") as HTMLInputElement;
  const mapSelect = document.getElementById("mapSelect") as HTMLSelectElement;
  const createBtn = document.getElementById("createBtn") as HTMLButtonElement;
  const joinBtn = document.getElementById("joinBtn") as HTMLButtonElement;
  const statusEl = document.getElementById("status") as HTMLParagraphElement;
  const panelV1 = document.getElementById("panelV1") as HTMLElement;
  const panelV2 = document.getElementById("panelV2") as HTMLElement;
  const modeTabs = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-mode]")
  );
  const weaponButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-weapon]")
  );
  const characterButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-character]")
  );

  const readLobbyPrefs = (): LobbyPrefs => {
    try {
      const raw = localStorage.getItem(LOBBY_PREFS_KEY);
      if (!raw) {
        return {};
      }
      return JSON.parse(raw) as LobbyPrefs;
    } catch {
      return {};
    }
  };

  const savedPrefs = readLobbyPrefs();

  nameInput.value =
    savedPrefs.name?.trim().slice(0, 16) ||
    `Pilot${Math.floor(Math.random() * 90 + 10)}`;
  botCountInput.value = String(
    Number.isFinite(savedPrefs.botCount)
      ? Math.max(0, Math.min(MAX_PLAYERS - 1, Math.floor(savedPrefs.botCount!)))
      : DEFAULT_BOT_COUNT
  );
  codeInput.maxLength = ROOM_CODE_SUFFIX_LENGTH;
  if (savedPrefs.roomCodeSuffix) {
    codeInput.value = normalizeRoomCodeSuffix(savedPrefs.roomCodeSuffix);
  }

  let selectedMode: GameMode = parseGameMode(savedPrefs.mode ?? DEFAULT_GAME_MODE);
  let selectedWeapon: WeaponId = parseWeaponId(
    savedPrefs.weapon ?? DEFAULT_WEAPON_ID
  );
  let selectedCharacter: CharacterId = parseCharacterId(
    savedPrefs.character ?? DEFAULT_CHARACTER_ID
  );
  let preferredMapId = savedPrefs.mapId ?? "builtin";

  const setStatus = (message: string) => {
    statusEl.textContent = message;
  };

  const persistLobbyPrefs = () => {
    const prefs: LobbyPrefs = {
      name: nameInput.value.trim().slice(0, 16),
      mode: selectedMode,
      weapon: selectedWeapon,
      character: selectedCharacter,
      botCount: getBotCount(),
      mapId: mapSelect.value || preferredMapId,
      roomCodeSuffix: getRoomCodeSuffix(),
    };
    try {
      localStorage.setItem(LOBBY_PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore quota / private-mode failures.
    }
  };

  const syncRoomCodePrefix = (mode: GameMode) => {
    codePrefixEl.textContent = `${roomModeLabel(mode)}-`;
  };

  const getRoomCodeSuffix = (): string =>
    normalizeRoomCodeSuffix(codeInput.value);

  const getFullRoomCode = (): string =>
    formatRoomCode(selectedMode, getRoomCodeSuffix());

  const setSelectedMode = (mode: GameMode) => {
    selectedMode = mode;
    for (const tab of modeTabs) {
      const isSelected = tab.dataset.mode === mode;
      tab.setAttribute("aria-selected", isSelected ? "true" : "false");
      tab.tabIndex = isSelected ? 0 : -1;
    }
    const isV2 = mode === "v2";
    panelV1.hidden = isV2;
    panelV2.hidden = !isV2;
    syncRoomCodePrefix(mode);
    codeInput.value = getRoomCodeSuffix();
    persistLobbyPrefs();
  };

  const setSelectedWeapon = (weapon: WeaponId) => {
    selectedWeapon = weapon;
    for (const button of weaponButtons) {
      const isSelected = button.dataset.weapon === weapon;
      button.setAttribute("aria-pressed", isSelected ? "true" : "false");
    }
    persistLobbyPrefs();
  };

  const setSelectedCharacter = (character: CharacterId) => {
    selectedCharacter = character;
    for (const button of characterButtons) {
      const isSelected = button.dataset.character === character;
      button.setAttribute("aria-pressed", isSelected ? "true" : "false");
    }
    persistLobbyPrefs();
  };

  for (const tab of modeTabs) {
    tab.addEventListener("click", () => {
      setSelectedMode(parseGameMode(tab.dataset.mode));
      tab.focus();
    });

    tab.addEventListener("keydown", (event) => {
      const currentIndex = modeTabs.indexOf(tab);
      if (currentIndex < 0) {
        return;
      }
      let nextIndex = currentIndex;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        nextIndex = (currentIndex + 1) % modeTabs.length;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        nextIndex = (currentIndex - 1 + modeTabs.length) % modeTabs.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = modeTabs.length - 1;
      } else {
        return;
      }
      event.preventDefault();
      const nextTab = modeTabs[nextIndex];
      if (!nextTab) {
        return;
      }
      setSelectedMode(parseGameMode(nextTab.dataset.mode));
      nextTab.focus();
    });
  }

  for (const button of weaponButtons) {
    button.addEventListener("click", () => {
      setSelectedWeapon(parseWeaponId(button.dataset.weapon));
    });
  }

  for (const button of characterButtons) {
    button.addEventListener("click", () => {
      setSelectedCharacter(parseCharacterId(button.dataset.character));
    });
  }

  const randomCodeSuffix = (): string => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < ROOM_CODE_SUFFIX_LENGTH; i += 1) {
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

    const hasPreferred = Array.from(mapSelect.options).some(
      (option) => option.value === preferredMapId
    );
    mapSelect.value = hasPreferred ? preferredMapId : "builtin";
    preferredMapId = mapSelect.value;
    persistLobbyPrefs();
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

  const returnToLobby = () => {
    persistLobbyPrefs();
    if (game) {
      const active = game;
      game = null;
      active.destroy(true);
    }
    gameEl?.classList.add("hidden");
    lobbyEl?.classList.remove("hidden");
    setStatus("");
  };

  const startGame = (room: PeerRoom) => {
    persistLobbyPrefs();
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
          bootGame.registry.set("onLeaveGame", returnToLobby);
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
    const suffix = randomCodeSuffix();
    const roomCode = formatRoomCode(selectedMode, suffix);
    setStatus(`Creating room ${roomCode}...`);
    createBtn.disabled = true;
    joinBtn.disabled = true;

    try {
      const arena = await resolveHostArena();
      const room = await createHostRoom(roomCode, name, {
        mode: selectedMode,
        weapon: selectedWeapon,
        character: selectedCharacter,
        botCount: getBotCount(),
        arena,
      });
      codeInput.value = suffix;
      syncRoomCodePrefix(selectedMode);
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
    const suffix = getRoomCodeSuffix();
    codeInput.value = suffix;

    if (suffix.length < 4) {
      setStatus("Enter a room code to join.");
      return;
    }

    const roomCode = getFullRoomCode();
    setStatus(`Joining ${roomCode}...`);
    createBtn.disabled = true;
    joinBtn.disabled = true;

    try {
      const room = await joinGuestRoom(roomCode, name, {
        mode: selectedMode,
        weapon: selectedWeapon,
        character: selectedCharacter,
      });
      setStatus("");
      startGame(room);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "";
      if (message.includes("full") || message.includes("V1") || message.includes("V2")) {
        setStatus(message);
      } else {
        setStatus(
          "Room not found. Check the code and mode — the host must keep their tab open."
        );
      }
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

  nameInput.addEventListener("change", () => {
    persistLobbyPrefs();
  });
  nameInput.addEventListener("blur", () => {
    persistLobbyPrefs();
  });

  botCountInput.addEventListener("change", () => {
    botCountInput.value = String(getBotCount());
    persistLobbyPrefs();
  });

  mapSelect.addEventListener("change", () => {
    preferredMapId = mapSelect.value;
    persistLobbyPrefs();
  });

  codeInput.addEventListener("input", () => {
    codeInput.value = getRoomCodeSuffix();
    persistLobbyPrefs();
  });

  codeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      void handleJoin();
    }
  });

  nameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      if (getRoomCodeSuffix().length >= 4) {
        void handleJoin();
      } else {
        void handleCreate();
      }
    }
  });

  setSelectedMode(selectedMode);
  setSelectedWeapon(selectedWeapon);
  setSelectedCharacter(selectedCharacter);
  void loadMapOptions();
}

import Peer, { type DataConnection } from "peerjs";
import {
  ArenaSim,
  cloneArena,
  DEFAULT_ARENA,
  EMPTY_INPUT,
  MAX_PLAYERS,
  formatRoomCode,
  normalizeRoomCodeSuffix,
  parseCharacterId,
  parseGameMode,
  parseWeaponId,
  roomModeLabel,
  TICK_MS,
  type ArenaDefinition,
  type CharacterId,
  type GameMode,
  type GameState,
  type NetMessage,
  type PlayerInput,
  type WeaponId,
} from "@pvp-arena/shared";

const peerIdForRoom = (roomCode: string): string =>
  `pvparena${roomCode.toLowerCase().replace(/[^a-z0-9]/g, "")}`;

const resolveRoomCode = (roomCode: string, mode: GameMode): string => {
  const suffix = normalizeRoomCodeSuffix(roomCode);
  const expected = formatRoomCode(mode, suffix);
  const upper = roomCode.trim().toUpperCase();
  // Reject cross-mode codes (e.g. joining V1-ABC while on V2).
  if (/^V[12]-/.test(upper) && upper !== expected) {
    const codeMode = upper.startsWith("V2") ? "v2" : "v1";
    throw new Error(
      `This code is for ${roomModeLabel(codeMode)}. Switch to ${roomModeLabel(codeMode)} to join.`
    );
  }
  return expected;
};

export type PeerRoom = {
  roomCode: string;
  playerId: string;
  isHost: boolean;
  mode: GameMode;
  arena: ArenaDefinition;
  getState: () => GameState;
  sendInput: (input: PlayerInput) => void;
  onState: (handler: (state: GameState) => void) => void;
  onClose: (handler: () => void) => void;
  destroy: () => void;
};

export type HostJoinOptions = {
  mode: GameMode;
  weapon?: WeaponId;
  character?: CharacterId;
  botCount?: number;
  arena?: ArenaDefinition;
};

export type GuestJoinOptions = {
  mode: GameMode;
  weapon?: WeaponId;
  character?: CharacterId;
};

const openPeer = (id?: string): Promise<Peer> =>
  new Promise((resolve, reject) => {
    const peer = id
      ? new Peer(id, { debug: 0 })
      : new Peer({ debug: 0 });

    const handleError = (error: Error) => {
      peer.destroy();
      reject(error);
    };

    peer.once("open", () => {
      peer.off("error", handleError);
      resolve(peer);
    });
    peer.once("error", handleError);
  });

const send = (conn: DataConnection, message: NetMessage) => {
  if (conn.open) {
    conn.send(message);
  }
};

const emptyState = (roomCode: string, mode: GameMode): GameState => ({
  roomCode,
  mode,
  players: [],
  bullets: [],
  grenades: [],
  pickups: [],
  serverTime: 0,
});

export const createHostRoom = async (
  roomCode: string,
  name: string,
  options: HostJoinOptions
): Promise<PeerRoom> => {
  const mode = parseGameMode(options.mode);
  const code = resolveRoomCode(roomCode, mode);
  const peer = await openPeer(peerIdForRoom(code));
  const arenaCopy = cloneArena(options.arena ?? DEFAULT_ARENA);
  const sim = new ArenaSim(code, arenaCopy, mode);
  const hostId = peer.id;

  if (mode === "v2") {
    sim.addPlayer(hostId, name, parseCharacterId(options.character));
  } else {
    sim.addPlayer(hostId, name, parseWeaponId(options.weapon));
  }

  const botsToAdd = Math.max(
    0,
    Math.min(options.botCount ?? 0, MAX_PLAYERS - sim.getPlayerCount())
  );
  for (let i = 0; i < botsToAdd; i += 1) {
    sim.addBot();
  }

  const connections = new Map<string, DataConnection>();
  let stateHandler: ((state: GameState) => void) | null = null;
  let closeHandler: (() => void) | null = null;
  let closed = false;

  const broadcastState = () => {
    const state = sim.getState();
    stateHandler?.(state);
    const message: NetMessage = { type: "state", state };
    for (const conn of connections.values()) {
      send(conn, message);
    }
  };

  const tickId = window.setInterval(() => {
    sim.tick(TICK_MS);
    broadcastState();
  }, TICK_MS);

  peer.on("connection", (conn) => {
    conn.on("data", (raw) => {
      const message = raw as NetMessage;
      if (message.type === "join") {
        if (sim.getPlayerCount() >= MAX_PLAYERS) {
          send(conn, { type: "join_reject", reason: "Room is full." });
          conn.close();
          return;
        }
        const joinMode = parseGameMode(message.mode);
        if (joinMode !== mode) {
          send(conn, {
            type: "join_reject",
            reason:
              mode === "v2"
                ? "This room is V2 (characters). Switch to V2 and pick a character."
                : "This room is V1 (weapons). Switch to V1 and pick a weapon.",
          });
          conn.close();
          return;
        }

        connections.set(conn.peer, conn);
        if (mode === "v2") {
          sim.addPlayer(conn.peer, message.name, parseCharacterId(message.character));
        } else {
          sim.addPlayer(conn.peer, message.name, parseWeaponId(message.weapon));
        }
        send(conn, {
          type: "join_ok",
          playerId: conn.peer,
          state: sim.getState(),
          arena: arenaCopy,
          mode,
        });
        broadcastState();
        return;
      }

      if (message.type === "input") {
        sim.setInput(conn.peer, message.input);
      }
    });

    conn.on("close", () => {
      connections.delete(conn.peer);
      sim.removePlayer(conn.peer);
      broadcastState();
    });
  });

  const destroy = () => {
    if (closed) {
      return;
    }
    closed = true;
    window.clearInterval(tickId);
    for (const conn of connections.values()) {
      conn.close();
    }
    peer.destroy();
    closeHandler?.();
  };

  peer.on("disconnected", () => {
    destroy();
  });
  peer.on("close", () => {
    destroy();
  });

  return {
    roomCode: code,
    playerId: hostId,
    isHost: true,
    mode,
    arena: arenaCopy,
    getState: () => sim.getState(),
    sendInput: (input) => {
      sim.setInput(hostId, input);
    },
    onState: (handler) => {
      stateHandler = handler;
      handler(sim.getState());
    },
    onClose: (handler) => {
      closeHandler = handler;
    },
    destroy,
  };
};

export const joinGuestRoom = async (
  roomCode: string,
  name: string,
  options: GuestJoinOptions
): Promise<PeerRoom> => {
  const mode = parseGameMode(options.mode);
  const code = resolveRoomCode(roomCode, mode);
  const peer = await openPeer();
  const hostId = peerIdForRoom(code);

  let state: GameState = emptyState(code, mode);
  let arena: ArenaDefinition = cloneArena(DEFAULT_ARENA);
  let playerId = peer.id;
  let joinedMode = mode;
  let stateHandler: ((next: GameState) => void) | null = null;
  let closeHandler: (() => void) | null = null;
  let closed = false;
  let latestInput: PlayerInput = { ...EMPTY_INPUT };

  const conn = peer.connect(hostId, { reliable: true });

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error("Timed out connecting to room."));
      }, 8000);

      conn.once("open", () => {
        send(conn, {
          type: "join",
          name,
          mode,
          weapon: options.weapon,
          character: options.character,
        });
      });

      conn.once("error", (error) => {
        window.clearTimeout(timeout);
        reject(error);
      });

      const onData = (raw: unknown) => {
        const message = raw as NetMessage;
        if (message.type === "join_ok") {
          playerId = message.playerId;
          state = message.state;
          arena = cloneArena(message.arena ?? DEFAULT_ARENA);
          joinedMode = parseGameMode(message.mode ?? message.state.mode);
          conn.off("data", onData);
          window.clearTimeout(timeout);
          resolve();
          return;
        }
        if (message.type === "join_reject") {
          conn.off("data", onData);
          window.clearTimeout(timeout);
          reject(new Error(message.reason));
        }
      };
      conn.on("data", onData);
    });
  } catch (error) {
    conn.close();
    peer.destroy();
    throw error;
  }

  conn.on("data", (raw) => {
    const message = raw as NetMessage;
    if (message.type === "state") {
      state = message.state;
      stateHandler?.(state);
    }
  });

  const inputTick = window.setInterval(() => {
    if (conn.open) {
      send(conn, { type: "input", input: latestInput });
    }
  }, TICK_MS);

  const destroy = () => {
    if (closed) {
      return;
    }
    closed = true;
    window.clearInterval(inputTick);
    conn.close();
    peer.destroy();
    closeHandler?.();
  };

  conn.on("close", () => {
    destroy();
  });
  peer.on("disconnected", () => {
    destroy();
  });
  peer.on("close", () => {
    destroy();
  });

  return {
    roomCode: code,
    playerId,
    isHost: false,
    mode: joinedMode,
    arena,
    getState: () => state,
    sendInput: (input) => {
      latestInput = input;
    },
    onState: (handler) => {
      stateHandler = handler;
      handler(state);
    },
    onClose: (handler) => {
      closeHandler = handler;
    },
    destroy,
  };
};

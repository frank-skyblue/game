import Peer, { type DataConnection } from "peerjs";
import {
  ArenaSim,
  EMPTY_INPUT,
  MAX_PLAYERS,
  TICK_MS,
  type GameState,
  type NetMessage,
  type PlayerInput,
} from "@pvp-arena/shared";

const peerIdForRoom = (roomCode: string): string =>
  `pvparena${roomCode.toLowerCase()}`;

export type PeerRoom = {
  roomCode: string;
  playerId: string;
  isHost: boolean;
  getState: () => GameState;
  sendInput: (input: PlayerInput) => void;
  onState: (handler: (state: GameState) => void) => void;
  onClose: (handler: () => void) => void;
  destroy: () => void;
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

export const createHostRoom = async (
  roomCode: string,
  name: string
): Promise<PeerRoom> => {
  const code = roomCode.toUpperCase();
  const peer = await openPeer(peerIdForRoom(code));
  const sim = new ArenaSim(code);
  const hostId = peer.id;
  sim.addPlayer(hostId, name);

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
        connections.set(conn.peer, conn);
        sim.addPlayer(conn.peer, message.name);
        send(conn, {
          type: "join_ok",
          playerId: conn.peer,
          state: sim.getState(),
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
  name: string
): Promise<PeerRoom> => {
  const code = roomCode.toUpperCase();
  const peer = await openPeer();
  const hostId = peerIdForRoom(code);

  let state: GameState = {
    roomCode: code,
    players: [],
    bullets: [],
    serverTime: 0,
  };
  let playerId = peer.id;
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
        send(conn, { type: "join", name });
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

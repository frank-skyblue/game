import type { ArenaDefinition, Wall, SpawnPoint } from "../../shared/src/arena";

export type MapRow = {
  id: string;
  name: string;
  author: string | null;
  width: number;
  height: number;
  walls: Wall[] | string;
  spawn_points: SpawnPoint[] | string;
  edit_token_hash: string;
  created_at: string | Date;
  updated_at: string | Date;
};

const parseJsonField = <T>(value: T | string): T => {
  if (typeof value === "string") {
    return JSON.parse(value) as T;
  }
  return value;
};

export const rowToArena = (row: MapRow): ArenaDefinition => ({
  width: row.width,
  height: row.height,
  walls: parseJsonField(row.walls),
  spawnPoints: parseJsonField(row.spawn_points),
});

export const rowToListItem = (row: MapRow) => ({
  id: row.id,
  name: row.name,
  author: row.author,
  createdAt:
    row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at),
});

export const rowToDetail = (row: MapRow) => ({
  ...rowToListItem(row),
  updatedAt:
    row.updated_at instanceof Date
      ? row.updated_at.toISOString()
      : String(row.updated_at),
  arena: rowToArena(row),
});

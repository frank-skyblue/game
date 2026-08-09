import type { VercelRequest, VercelResponse } from "@vercel/node";
import { validateArena } from "../../shared/src/arena";
import { getSql } from "../_lib/db";
import { json, readJsonBody } from "../_lib/http";
import { rowToDetail, type MapRow } from "../_lib/maps";
import { tokensMatch } from "../_lib/tokens";

type UpdateBody = {
  name?: unknown;
  author?: unknown;
  arena?: unknown;
  editToken?: unknown;
};

type DeleteBody = {
  editToken?: unknown;
};

const getId = (req: VercelRequest): string => {
  const raw = req.query.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  return typeof id === "string" ? id.trim() : "";
};

const getEditToken = (req: VercelRequest, bodyToken: unknown): string => {
  if (typeof bodyToken === "string" && bodyToken.length > 0) {
    return bodyToken;
  }
  const header = req.headers["x-edit-token"];
  if (typeof header === "string" && header.length > 0) {
    return header;
  }
  return "";
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const id = getId(req);
    if (!id) {
      return json(res, 400, { error: "Map id is required." });
    }

    const sql = getSql();

    if (req.method === "GET") {
      const rows = (await sql`
        SELECT id, name, author, width, height, walls, spawn_points,
               edit_token_hash, created_at, updated_at
        FROM maps
        WHERE id = ${id}
        LIMIT 1
      `) as MapRow[];
      const row = rows[0];
      if (!row) {
        return json(res, 404, { error: "Map not found." });
      }
      return json(res, 200, rowToDetail(row));
    }

    if (req.method === "PUT") {
      const body = await readJsonBody<UpdateBody>(req);
      if (!body) {
        return json(res, 400, { error: "Invalid JSON body." });
      }

      const editToken = getEditToken(req, body.editToken);
      if (!editToken) {
        return json(res, 401, { error: "editToken is required." });
      }

      const rows = (await sql`
        SELECT id, name, author, width, height, walls, spawn_points,
               edit_token_hash, created_at, updated_at
        FROM maps
        WHERE id = ${id}
        LIMIT 1
      `) as MapRow[];
      const row = rows[0];
      if (!row) {
        return json(res, 404, { error: "Map not found." });
      }
      if (!tokensMatch(editToken, row.edit_token_hash)) {
        return json(res, 403, { error: "Invalid edit token." });
      }

      const name =
        typeof body.name === "string"
          ? body.name.trim().slice(0, 48)
          : row.name;
      if (!name) {
        return json(res, 400, { error: "Map name is required." });
      }

      const author =
        typeof body.author === "string"
          ? body.author.trim().slice(0, 32) || null
          : row.author;

      let arenaWidth = row.width;
      let arenaHeight = row.height;
      let arenaWalls =
        typeof row.walls === "string" ? JSON.parse(row.walls) : row.walls;
      let arenaSpawns =
        typeof row.spawn_points === "string"
          ? JSON.parse(row.spawn_points)
          : row.spawn_points;

      if (body.arena !== undefined) {
        const validated = validateArena(body.arena);
        if (!validated.ok) {
          return json(res, 400, { error: validated.error });
        }
        arenaWidth = validated.arena.width;
        arenaHeight = validated.arena.height;
        arenaWalls = validated.arena.walls;
        arenaSpawns = validated.arena.spawnPoints;
      }

      await sql`
        UPDATE maps
        SET
          name = ${name},
          author = ${author},
          width = ${arenaWidth},
          height = ${arenaHeight},
          walls = ${arenaWalls as unknown as string},
          spawn_points = ${arenaSpawns as unknown as string},
          updated_at = now()
        WHERE id = ${id}
      `;

      const updated = (await sql`
        SELECT id, name, author, width, height, walls, spawn_points,
               edit_token_hash, created_at, updated_at
        FROM maps
        WHERE id = ${id}
        LIMIT 1
      `) as MapRow[];

      return json(res, 200, rowToDetail(updated[0]!));
    }

    if (req.method === "DELETE") {
      const body = (await readJsonBody<DeleteBody>(req)) ?? {};
      const editToken = getEditToken(req, body.editToken);
      if (!editToken) {
        return json(res, 401, { error: "editToken is required." });
      }

      const rows = (await sql`
        SELECT edit_token_hash
        FROM maps
        WHERE id = ${id}
        LIMIT 1
      `) as Array<{ edit_token_hash: string }>;
      const row = rows[0];
      if (!row) {
        return json(res, 404, { error: "Map not found." });
      }
      if (!tokensMatch(editToken, row.edit_token_hash)) {
        return json(res, 403, { error: "Invalid edit token." });
      }

      await sql`DELETE FROM maps WHERE id = ${id}`;
      return json(res, 200, { ok: true });
    }

    res.setHeader("Allow", "GET, PUT, DELETE");
    return json(res, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error(error);
    const message =
      error instanceof Error && error.message.includes("DATABASE_URL")
        ? "Maps database is not configured."
        : "Internal server error.";
    return json(res, 500, { error: message });
  }
}

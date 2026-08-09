import type { VercelRequest, VercelResponse } from "@vercel/node";
import { validateArena } from "../../shared/src/arena";
import { getSql } from "../_lib/db";
import { json, readJsonBody } from "../_lib/http";
import { rowToListItem, type MapRow } from "../_lib/maps";
import { createEditToken, createMapId, hashEditToken } from "../_lib/tokens";

type CreateBody = {
  name?: unknown;
  author?: unknown;
  arena?: unknown;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "GET") {
      const sql = getSql();
      const rows = (await sql`
        SELECT id, name, author, width, height, walls, spawn_points,
               edit_token_hash, created_at, updated_at
        FROM maps
        ORDER BY created_at DESC
        LIMIT 100
      `) as MapRow[];
      return json(res, 200, { maps: rows.map(rowToListItem) });
    }

    if (req.method === "POST") {
      const body = await readJsonBody<CreateBody>(req);
      if (!body) {
        return json(res, 400, { error: "Invalid JSON body." });
      }

      const name =
        typeof body.name === "string" ? body.name.trim().slice(0, 48) : "";
      if (!name) {
        return json(res, 400, { error: "Map name is required." });
      }

      const author =
        typeof body.author === "string"
          ? body.author.trim().slice(0, 32) || null
          : null;

      const validated = validateArena(body.arena);
      if (!validated.ok) {
        return json(res, 400, { error: validated.error });
      }

      const { arena } = validated;
      const id = createMapId();
      const editToken = createEditToken();
      const editTokenHash = hashEditToken(editToken);
      const sql = getSql();

      await sql`
        INSERT INTO maps (
          id, name, author, width, height, walls, spawn_points, edit_token_hash
        ) VALUES (
          ${id},
          ${name},
          ${author},
          ${arena.width},
          ${arena.height},
          ${arena.walls as unknown as string},
          ${arena.spawnPoints as unknown as string},
          ${editTokenHash}
        )
      `;

      return json(res, 201, { id, editToken, name });
    }

    res.setHeader("Allow", "GET, POST");
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

# PvP Arena

Top-down browser deathmatch for friends. Create a room, share the code, shoot each other.

**Free hosting:** static client on Vercel + PeerJS (WebRTC) for matches, plus optional Neon Postgres maps API for the level editor.

## Stack

- **Client:** Vite + TypeScript + Phaser 3
- **Multiplayer:** PeerJS (host-authoritative simulation)
- **Shared:** constants + arena sim + map validation
- **Maps API:** Vercel serverless routes (`/api/maps`) + Neon Postgres

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:5173 in two windows. Create a room in one, join with the code in the other. **Keep the host tab open.**

### Maps API locally

1. Create a Neon database and run [`sql/schema.sql`](sql/schema.sql) (optionally [`sql/seed.sql`](sql/seed.sql)).
2. Set `DATABASE_URL` in `.env` at the repo root (Vercel / `vercel dev` read this).
3. In one terminal: `npm run dev:full` (`vercel dev` — serves API + client).
4. Or keep `npm run dev` for the Vite client and run `vercel dev` so `/api` proxies to port 3000 (see `client/vite.config.ts`).

Without `DATABASE_URL`, the lobby still works with the built-in Classic arena; save/list in the editor will fail until the DB is configured.

Level editor: http://localhost:5173/editor

## Controls

- **WASD** / arrows — move
- **Mouse** — aim
- **Click** — shoot
- **R** — reload
- **M** — mute / unmute sound
- **Esc** — leave

## Deploy to Vercel (free)

1. Push this repo to GitHub.
2. Import the project in [Vercel](https://vercel.com) with **Root Directory** at the repo root (so `/api` and `client/dist` both deploy).
3. Add a [Neon](https://neon.tech) integration or set `DATABASE_URL` in Project → Settings → Environment Variables.
4. Run `sql/schema.sql` (and optionally `sql/seed.sql`) against the database.
5. Deploy.

Root [`vercel.json`](vercel.json) builds the client to `client/dist` and keeps SPA rewrites off `/api/*`.

Or with the CLI:

```bash
npm i -g vercel
npm run build
vercel --prod
```

PeerJS still uses the public PeerJS cloud broker for signaling. No PeerJS env vars are required.

## Maps

- Anyone can create a public map from **/editor**.
- Create returns an `editToken` stored in `localStorage` on that browser; only that token can update/delete the map.
- Hosts pick a map in the lobby (or Classic built-in). Guests receive the arena definition on `join_ok` over PeerJS.

## Notes

- The player who clicks **Create room** is the host and runs the game simulation.
- If the host closes their tab, the room ends.
- Max 8 players per room.
- Arena music: [Cyberpunk Moonlight Sonata](https://opengameart.org/content/cyberpunk-moonlight-sonata) by Joth (CC0).
- Weapon SFX derived from [Gunshots](https://opengameart.org/content/gunshots) and [Swishes Sound Pack](https://opengameart.org/content/swishes-sound-pack) (CC0).

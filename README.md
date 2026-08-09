# PvP Arena

Top-down browser deathmatch for friends. Create a room, share the code, shoot each other.

**Free hosting:** static site on Vercel + PeerJS (WebRTC). One player hosts the match in their browser — no game server to pay for.

## Stack

- **Client:** Vite + TypeScript + Phaser 3
- **Multiplayer:** PeerJS (host-authoritative simulation)
- **Shared:** constants + arena sim

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:5173 in two windows. Create a room in one, join with the code in the other. **Keep the host tab open.**

## Controls

- **WASD** / arrows — move
- **Mouse** — aim
- **Click** — shoot
- **Esc** — leave

## Deploy to Vercel (free)

1. Push this repo to GitHub.
2. Import the project in [Vercel](https://vercel.com).
3. In Project Settings → General:
   - **Root Directory:** `client`
   - **Build Command:** `npm run build` (default from `client/vercel.json`)
   - **Output Directory:** `dist`
   - **Install Command:** `cd .. && npm install`
4. Deploy. Share the URL with friends.

Or with the CLI:

```bash
npm i -g vercel
npm run build
vercel --prod
```

No environment variables required. PeerJS uses the public PeerJS cloud broker for signaling.

## Notes

- The player who clicks **Create room** is the host and runs the game simulation.
- If the host closes their tab, the room ends.
- Max 4 players per room.

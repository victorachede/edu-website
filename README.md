# Benue Life

Walk through Makurdi in 3D, in the browser. Built with Three.js and Vite.

**Places so far**
- **Wurukum Market**: zinc-roofed stalls on red laterite, with produce, vendors and a walking crowd.
- **Old Bridge**: the 1932 rail and road bridge over the River Benue (about 790 m of steel truss on concrete piers).

Both are modelled from reference photographs. See `docs/REFERENCES.md`.

## Multiplayer

Players see each other live, with names and their own characters. The game server is in `party/benuelife.ts` (PartyKit, one room per place, 60 players per place).

```
npm run party:dev        # local server on :1999, in a second terminal
```

For local play, `npm run dev` connects to it automatically.

To go live: `npm run party:deploy`, then set `VITE_PARTYKIT_HOST` (see `.env.example`) in Vercel and redeploy. Without it the game runs solo.

## Characters

Pick your build, height, skin, hair, outfit and colours. Your look is saved in your browser and shared with other players. Open it again any time with the Character button.

## Run it

```
npm install
npm run dev
```

Open `http://localhost:5173`. Use `?zone=bridge` to start on the bridge.

## Controls

WASD or arrows to move, Shift to run, drag to look, scroll to zoom. On a phone, use the on-screen stick.

## Next

Live players (PartyKit), more Makurdi places, and real photographic textures.

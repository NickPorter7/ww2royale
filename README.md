# WW2 Royale — Version 1.14

Real-time multiplayer WWII-inspired browser strategy game with a 107-province Europe map, eight playable countries, nine additional non-playable countries, a 1939 campaign clock, diplomacy, purchases, reconnaissance balloons and seasonal visuals.

## Launch on Windows

1. Extract `WW2-Royale-1.14.zip` using **Extract All**.
2. Open the **inner** `ww2-royale-1.14` folder until you can see `package.json`.
3. In that folder, click the File Explorer address bar, type `cmd`, and press Enter.
4. Run `npm run dev` (requires Node.js **22 or newer**). No `npm install` is necessary: the game has no third-party production dependencies.
5. Visit `http://localhost:3000`.

If npm says `ENOENT` for `package.json`, you are in the wrong folder. The folder shown in your terminal must contain `package.json`.

To run in production, use `npm start`. The server automatically reads Render's `PORT` environment variable and listens on `0.0.0.0`.

## 1.14: publish polish and presentation update

### Visual map improvements

- Province borders are now drawn from **smoothed display paths** instead of the old angular linework, making the map look less blocky and more professional.
- The Iberian border presentation was softened with extra smoothing so **Spain and Portugal** read more naturally on the live map.
- The province ID mask was cleaned at blue coastal fringes to reduce cases where national colour spilled into the sea, including the problem area around the **Soviet Donbas / Black Sea coast**.
- The old bottom-left instructional sentence has been removed.

### Music and sound

- Added an original local **copyright-free background music loop** stored in `client/assets/audio/music-loop.wav`.
- Added local sound effects for:
  - menu/button clicks
  - building construction
  - chat/message sending and arrival
  - buying infantry
  - buying tanks
  - plane movement / air actions
  - ground movement
  - attack confirmation / dispatch
- All audio is bundled locally; there are no external streaming dependencies.

### More professional moving-unit icons

- Moving armies now use dedicated transparent-background art in `client/assets/units/`.
- The priority remains:
  1. infantry icon for lowest tier
  2. tank icon for mid tier
  3. bomber icon for highest tier
- The infantry icon now appears as a more realistic **soldier with a rifle** instead of a default-looking generic marker.

### Multiplayer wording refresh

- Visible uses of **campaign** in the main interface were changed to terms that better fit a live online multiplayer war/match.
- The top bar, lobby, overview and victory UI now use **war**, **match**, or **theatre** language instead of presenting the game like a single-player campaign.

## Existing systems retained

- Realtime eight-player public Quick Match and private six-digit room codes.
- Historical city names, flags, nation selections and map terrain.
- Alliances, break alliances, peace requests, war declarations, chat.
- Mixed-unit armies, explicit staged order confirmation, timed travel, mid-route changes and recalls.
- Combat resolution, ranking and victory conditions.

## Game code

- `server/game.js` — authoritative building/army economy, movement, diplomacy, sight rules.
- `server/index.js` — Node HTTP + native WebSocket multiplayer, input validation, room isolation.
- `client/main.js` — Canvas map, overlays, information strip and controls.
- `client/style.css`, `client/index.html` — desktop and mobile interfaces.
- `client/assets/season-*.png` — four seasonal overlays.
- `tools/make_seasons.py` — regenerate overlays (requires Python, Pillow and NumPy, but **not** for gameplay).
- `shared/map.json` — 107 named interactive provinces and national borders.

## Development verification

Run:

```bash
npm run check
npm test
```

The test suite covers game-rule restrictions, economy, espionage, treaty rules, province counts, client structure and the multiplayer protocol. An additional optional offline browser smoke script at `tools/offline_browser_113.py` uses Python Playwright and locally installed Chromium; it does not make network requests.

## Deploy to ww2royale.com

Upload the **contents** of this folder to the existing GitHub repository (in the same directory as its current `package.json`), commit, and deploy the latest commit to Render. Start command: `npm start`. Keep your already-configured GoDaddy/Render custom domain DNS records unchanged.

**Important:** This game stores rooms and matches in **server memory**. A Render restart/redeploy resets active campaigns. Persistence and reconnection need a later backend milestone before a serious public launch. Existing in-memory sessions from version 1.13 are reset on redeploy; audio and map-presentation changes do not migrate an active live room.

This is still a tested development build, not a production security/performance audit. A live iPhone-to-public-Render end-to-end playthrough has not been completed here.
